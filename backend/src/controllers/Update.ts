import Team, {ITeam} from '../models/Team';
import Participant from '../models/Participant';
import TournamentState, {IMatchSummary} from '../models/TournamentState';
import Match from '../models/Match';
import {FDCompetition, FDMatch, FDStandingGroup, FootballDataClient, Stage} from '../services/footballData';

const STAGE_ORDER: Stage[] = [
  'GROUP_STAGE',
  'LAST_32',
  'LAST_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL'
];

const QUALIFICATION_RANK: Record<Stage, number> = {
  GROUP_STAGE: 0,
  LAST_32: 1,
  LAST_16: 2,
  QUARTER_FINALS: 3,
  SEMI_FINALS: 4,
  THIRD_PLACE: 4,
  FINAL: 5
};

const QUALIFICATION_BONUS: Record<number, number> = {
  0: 0,
  1: 3,
  2: 8,
  3: 13,
  4: 18,
  5: 23,
  6: 33
};

const WINNER_BONUS = 10;

const groupLetterFromStanding = (group: string): string => {
  const match = group.match(/Group\s+([A-Z])/i);
  return match ? match[1].toUpperCase() : group;
};

interface TeamAggregate {
  api_id: number;
  name: string;
  logo: string;
  group: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  qualifications: number;
  eliminated: boolean;
  isChampion: boolean;
}

const computeStageByTeam = (matches: FDMatch[]): Map<number, Stage> => {
  const best = new Map<number, Stage>();
  for (const m of matches) {
    for (const t of [m.homeTeam, m.awayTeam]) {
      if (!t.id) continue;
      const current = best.get(t.id);
      if (!current || STAGE_ORDER.indexOf(m.stage) > STAGE_ORDER.indexOf(current)) {
        best.set(t.id, m.stage);
      }
    }
  }
  return best;
};

const findChampionId = (matches: FDMatch[]): number | null => {
  const final = matches.find((m) => m.stage === 'FINAL' && m.status === 'FINISHED');
  if (!final || !final.score.winner) return null;
  if (final.score.winner === 'HOME_TEAM' && final.homeTeam.id) return final.homeTeam.id;
  if (final.score.winner === 'AWAY_TEAM' && final.awayTeam.id) return final.awayTeam.id;
  return null;
};

const hasUpcomingMatch = (apiId: number, matches: FDMatch[]): boolean =>
  matches.some(
    (m) =>
      m.status !== 'FINISHED' &&
      m.status !== 'CANCELLED' &&
      (m.homeTeam.id === apiId || m.awayTeam.id === apiId)
  );

const buildQualifications = (highestStage: Stage, isChampion: boolean): number => {
  const rank = QUALIFICATION_RANK[highestStage] ?? 0;
  return isChampion ? rank + 1 : rank;
};

const computePoints = (agg: TeamAggregate): number => {
  const base = agg.wins * 3 + agg.draws;
  const bonus = QUALIFICATION_BONUS[agg.qualifications] ?? 0;
  const winner = agg.isChampion ? WINNER_BONUS : 0;
  return base + bonus + winner;
};

const aggregateTeams = (standings: FDStandingGroup[], matches: FDMatch[]): TeamAggregate[] => {
  const stageByTeam = computeStageByTeam(matches);
  const championId = findChampionId(matches);

  const aggregates: TeamAggregate[] = [];
  for (const group of standings) {
    const letter = groupLetterFromStanding(group.group);
    for (const row of group.table) {
      const highest = stageByTeam.get(row.team.id) ?? 'GROUP_STAGE';
      const isChampion = row.team.id === championId;
      const qualifications = buildQualifications(highest, isChampion);
      const eliminated =
        !isChampion &&
        !hasUpcomingMatch(row.team.id, matches) &&
        row.playedGames > 0;
      aggregates.push({
        api_id: row.team.id,
        name: row.team.name,
        logo: row.team.crest,
        group: letter,
        games: row.playedGames,
        wins: row.won,
        draws: row.draw,
        losses: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
        qualifications,
        eliminated,
        isChampion
      });
    }
  }
  return aggregates;
};

const upsertTeams = async (aggregates: TeamAggregate[]): Promise<number> => {
  let upserted = 0;
  for (const agg of aggregates) {
    const points = computePoints(agg);
    await Team.updateOne(
      {api_id: agg.api_id},
      {
        $set: {
          name: agg.name,
          logo: agg.logo,
          group: agg.group,
          games: agg.games,
          wins: agg.wins,
          draws: agg.draws,
          losses: agg.losses,
          goalsFor: agg.goalsFor,
          goalsAgainst: agg.goalsAgainst,
          goalDifference: agg.goalDifference,
          qualifications: agg.qualifications,
          eliminated: agg.eliminated,
          points
        }
      },
      {upsert: true}
    );
    upserted += 1;
  }
  return upserted;
};

const recomputeParticipantPoints = async (): Promise<number> => {
  let updated = 0;
  for await (const participant of Participant.find().populate('teams')) {
    const teams = (participant.teams as unknown) as ITeam[];
    const sum = teams.reduce((acc, team) => acc + (team?.points ?? 0), 0);
    participant.set({points: sum});
    await participant.save();
    updated += 1;
  }
  return updated;
};

const toMatchSummary = (m: FDMatch): IMatchSummary => ({
  home: m.homeTeam.name ?? 'TBD',
  away: m.awayTeam.name ?? 'TBD',
  homeLogo: m.homeTeam.crest,
  awayLogo: m.awayTeam.crest,
  utcDate: m.utcDate,
  group: m.group,
  stage: m.stage,
  status: m.status,
  scoreHome: m.score.fullTime.home,
  scoreAway: m.score.fullTime.away
});

const deriveTournamentStage = (matches: FDMatch[]): string => {
  const live = matches.find((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED');
  if (live) return live.stage;

  const upcoming = matches
    .filter((m) => m.status === 'TIMED' || m.status === 'SCHEDULED')
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  if (upcoming.length === matches.length) return 'NOT_STARTED';
  if (upcoming.length === 0) return 'COMPLETED';
  return upcoming[0].stage;
};

const buildTournamentState = (
  competition: FDCompetition,
  matches: FDMatch[]
): {
  stage: string;
  currentMatchday: number | null;
  nextMatch: IMatchSummary | null;
  liveMatch: IMatchSummary | null;
  seasonStart: string;
  seasonEnd: string;
} => {
  const stage = deriveTournamentStage(matches);

  const live = matches.find((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED');

  const nextCandidate = matches
    .filter(
      (m) =>
        (m.status === 'TIMED' || m.status === 'SCHEDULED') &&
        m.homeTeam.name &&
        m.awayTeam.name
    )
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate))[0];

  return {
    stage,
    currentMatchday: competition.currentSeason?.currentMatchday ?? null,
    nextMatch: nextCandidate ? toMatchSummary(nextCandidate) : null,
    liveMatch: live ? toMatchSummary(live) : null,
    seasonStart: competition.currentSeason?.startDate ?? '',
    seasonEnd: competition.currentSeason?.endDate ?? ''
  };
};

const upsertTournamentState = async (
  competition: FDCompetition,
  matches: FDMatch[]
): Promise<void> => {
  const state = buildTournamentState(competition, matches);
  await TournamentState.updateOne(
    {},
    {$set: {...state, updatedAt: new Date()}},
    {upsert: true}
  );
};

const upsertMatches = async (matches: FDMatch[]): Promise<number> => {
  let upserted = 0;
  for (const m of matches) {
    await Match.updateOne(
      {api_id: m.id},
      {
        $set: {
          stage: m.stage,
          group: m.group,
          matchday: m.matchday ?? null,
          status: m.status,
          utcDate: m.utcDate,
          homeTeam: {
            api_id: m.homeTeam.id ?? null,
            name: m.homeTeam.name ?? null,
            logo: m.homeTeam.crest ?? null
          },
          awayTeam: {
            api_id: m.awayTeam.id ?? null,
            name: m.awayTeam.name ?? null,
            logo: m.awayTeam.crest ?? null
          },
          scoreHome: m.score.fullTime.home,
          scoreAway: m.score.fullTime.away,
          winner: m.score.winner,
          duration: m.score.duration
        }
      },
      {upsert: true}
    );
    upserted += 1;
  }
  return upserted;
};

interface TotalStats {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

const aggregateTotalsFromMatches = (matches: FDMatch[]): Map<number, TotalStats> => {
  const totals = new Map<number, TotalStats>();
  const ensure = (id: number): TotalStats => {
    if (!totals.has(id)) {
      totals.set(id, {games: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0});
    }
    return totals.get(id)!;
  };
  for (const m of matches) {
    if (m.status !== 'FINISHED') continue;
    const homeId = m.homeTeam.id;
    const awayId = m.awayTeam.id;
    const gh = m.score.fullTime.home;
    const ga = m.score.fullTime.away;
    if (!homeId || !awayId || gh == null || ga == null) continue;
    const h = ensure(homeId);
    const a = ensure(awayId);
    h.games += 1;
    a.games += 1;
    h.goalsFor += gh;
    h.goalsAgainst += ga;
    a.goalsFor += ga;
    a.goalsAgainst += gh;
    // Knockout matches that went to extra time or penalties were tied after
    // 90 minutes — count as a draw for both teams. The actual advancement
    // (and its bonus) is handled separately via the qualifications column.
    const wentToEt = m.score.duration && m.score.duration !== 'REGULAR';
    if (wentToEt) {
      h.draws += 1;
      a.draws += 1;
    } else if (gh > ga) {
      h.wins += 1;
      a.losses += 1;
    } else if (gh < ga) {
      a.wins += 1;
      h.losses += 1;
    } else {
      h.draws += 1;
      a.draws += 1;
    }
  }
  return totals;
};

const writeTotalStats = async (totals: Map<number, TotalStats>): Promise<void> => {
  for (const [api_id, t] of totals.entries()) {
    await Team.updateOne(
      {api_id},
      {
        $set: {
          totalGames: t.games,
          totalWins: t.wins,
          totalDraws: t.draws,
          totalLosses: t.losses,
          totalGoalsFor: t.goalsFor,
          totalGoalsAgainst: t.goalsAgainst
        }
      }
    );
  }
};

export interface UpdateReport {
  teamsUpserted: number;
  matchesUpserted: number;
  participantsUpdated: number;
  championId: number | null;
  matchesProcessed: number;
  tournamentStage: string;
}

export const runUpdate = async (): Promise<UpdateReport> => {
  const client = new FootballDataClient();
  const [competition, standings, matches] = await Promise.all([
    client.getCompetition(),
    client.getStandings(),
    client.getMatches()
  ]);

  const aggregates = aggregateTeams(standings, matches);
  const teamsUpserted = await upsertTeams(aggregates);
  const matchesUpserted = await upsertMatches(matches);
  await writeTotalStats(aggregateTotalsFromMatches(matches));
  const participantsUpdated = await recomputeParticipantPoints();
  await upsertTournamentState(competition, matches);
  const championId = findChampionId(matches);

  return {
    teamsUpserted,
    matchesUpserted,
    participantsUpdated,
    championId,
    matchesProcessed: matches.length,
    tournamentStage: deriveTournamentStage(matches)
  };
};

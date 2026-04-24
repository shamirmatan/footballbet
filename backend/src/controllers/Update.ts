import Team, {ITeam} from '../models/Team';
import Participant from '../models/Participant';
import {FDMatch, FDStandingGroup, FootballDataClient, Stage} from '../services/footballData';

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

export interface UpdateReport {
  teamsUpserted: number;
  participantsUpdated: number;
  championId: number | null;
  matchesProcessed: number;
}

export const runUpdate = async (): Promise<UpdateReport> => {
  const client = new FootballDataClient();
  const [standings, matches] = await Promise.all([client.getStandings(), client.getMatches()]);

  const aggregates = aggregateTeams(standings, matches);
  const teamsUpserted = await upsertTeams(aggregates);
  const participantsUpdated = await recomputeParticipantPoints();
  const championId = findChampionId(matches);

  return {
    teamsUpserted,
    participantsUpdated,
    championId,
    matchesProcessed: matches.length
  };
};

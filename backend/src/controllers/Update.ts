import Team, {ITeam} from '../models/Team';
import Participant from '../models/Participant';
import TournamentState, {IMatchSummary} from '../models/TournamentState';
import Match from '../models/Match';
import {FDCompetition, FDMatch, FDStandingGroup, FDStandingRow, FootballDataClient, Stage} from '../services/footballData';

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

const groupLetterFromStanding = (group: string): string => {
  const match = group.match(/Group\s+([A-Z])/i);
  return match ? match[1].toUpperCase() : group;
};

// 2026 format: 12 groups of 4. The top two of every group plus the 8 best
// third-placed teams reach the round of 32; 4th place is always out.
const THIRD_PLACE_SLOTS = 8;

export interface GroupOutcome {
  qualified: Set<number>; // clinched a round-of-32 spot (definite)
  eliminated: Set<number>; // out at the group stage (definite)
}

const isGroupComplete = (g: FDStandingGroup): boolean =>
  g.table.length > 0 && g.table.every((r) => r.playedGames >= g.table.length - 1);

const compareThirds = (a: FDStandingRow, b: FDStandingRow): number =>
  b.points - a.points ||
  b.goalDifference - a.goalDifference ||
  b.goalsFor - a.goalsFor ||
  a.team.id - b.team.id;

// Decide group-stage advancement from the standings rather than from knockout
// fixtures: the round-of-32 matches carry no team ids until the whole group
// stage finishes and the bracket is drawn, so a clinched team would otherwise
// look like it has "no upcoming match" and be flagged eliminated.
export const computeGroupOutcomes = (standings: FDStandingGroup[]): GroupOutcome => {
  const qualified = new Set<number>();
  const eliminated = new Set<number>();

  const completeGroups = standings.filter(isGroupComplete);
  const allComplete = standings.length > 0 && completeGroups.length === standings.length;

  const thirds: FDStandingRow[] = [];
  for (const g of completeGroups) {
    for (const r of g.table) {
      if (r.position <= 2) qualified.add(r.team.id);
      else if (r.position >= 4) eliminated.add(r.team.id);
      else thirds.push(r); // 3rd place — resolved below once every group is done
    }
  }

  // Third place is only decidable when all groups have finished, since it ranks
  // thirds across the whole tournament for the 8 wildcard slots.
  if (allComplete) {
    const ranked = [...thirds].sort(compareThirds);
    ranked.forEach((r, i) => {
      if (i < THIRD_PLACE_SLOTS) qualified.add(r.team.id);
      else eliminated.add(r.team.id);
    });
  }

  return {qualified, eliminated};
};

interface TeamAggregate {
  api_id: number;
  name: string;
  logo: string;
  group: string;
  position: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  // Knockout match points: a win decided in regulation scores like a 3-point
  // win, a tie at 90' (settled in extra time or on penalties) scores like a
  // 1-point draw for BOTH sides. These are kept separate from the group-stage
  // wins/draws/losses columns, which mirror the standings table.
  koWins: number;
  koDraws: number;
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
  const final = matches.find((m) => m.stage === 'FINAL' && (m.status === 'FINISHED' || m.status === 'AWARDED'));
  if (!final || !final.score.winner) return null;
  if (final.score.winner === 'HOME_TEAM' && final.homeTeam.id) return final.homeTeam.id;
  if (final.score.winner === 'AWAY_TEAM' && final.awayTeam.id) return final.awayTeam.id;
  return null;
};

const hasUpcomingMatch = (apiId: number, matches: FDMatch[]): boolean =>
  matches.some(
    (m) =>
      m.status !== 'FINISHED' &&
      m.status !== 'AWARDED' &&
      m.status !== 'CANCELLED' &&
      // A decided tie the feed still flags as scheduled is not an upcoming match.
      !(KNOCKOUT_STAGES.includes(m.stage) && isKnockoutDecided(m)) &&
      (m.homeTeam.id === apiId || m.awayTeam.id === apiId)
  );

const buildQualifications = (highestStage: Stage, isChampion: boolean): number => {
  const rank = QUALIFICATION_RANK[highestStage] ?? 0;
  return isChampion ? rank + 1 : rank;
};

const KNOCKOUT_STAGES: Stage[] = [
  'LAST_32',
  'LAST_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL'
];

// Qualification rank banked by the WINNER of a finished match at each stage —
// i.e. the round they have just advanced INTO. Credited on the win so points
// and "still alive" status never wait on the next fixture being drawn. A
// THIRD_PLACE win is terminal and adds nothing over reaching the semis.
const REACHED_ON_WIN: Record<Stage, number> = {
  GROUP_STAGE: 0,
  LAST_32: 2,
  LAST_16: 3,
  QUARTER_FINALS: 4,
  SEMI_FINALS: 5,
  THIRD_PLACE: 4,
  FINAL: 6
};

export interface KnockoutOutcome {
  reachedRank: number; // highest qualification rank reached (1..6)
  eliminated: boolean; // knocked out of the tournament
}

// Resolve which side actually advanced from a knockout result. The feed's
// `winner` is authoritative when it names a side, but for a tie settled on
// penalties it often reports the 90'/120' result as a DRAW (or leaves winner
// null) and only records the shootout in `score.penalties`. Fall back to the
// shootout score, then to the on-pitch scoreline, so a penalty/extra-time
// winner is still credited the advancement (and its qualification bonus).
export const resolveKnockoutWinner = (
  score: FDMatch['score']
): 'HOME_TEAM' | 'AWAY_TEAM' | null => {
  if (score.winner === 'HOME_TEAM' || score.winner === 'AWAY_TEAM') return score.winner;
  const pens = penaltyScore(score);
  if (pens && pens.home != null && pens.away != null && pens.home !== pens.away) {
    return pens.home > pens.away ? 'HOME_TEAM' : 'AWAY_TEAM';
  }
  const ft = score.fullTime;
  if (ft && ft.home != null && ft.away != null && ft.home !== ft.away) {
    return ft.home > ft.away ? 'HOME_TEAM' : 'AWAY_TEAM';
  }
  return null;
};

type ScoreLine = {home: number | null; away: number | null};

const addScores = (a?: ScoreLine | null, b?: ScoreLine | null): ScoreLine | null => {
  if (!a && !b) return null;
  return {home: (a?.home ?? 0) + (b?.home ?? 0), away: (a?.away ?? 0) + (b?.away ?? 0)};
};

// The on-pitch score at the end of play, EXCLUDING any shootout. For a
// PENALTY_SHOOTOUT match football-data reports the shootout in `fullTime`, while
// `regularTime` and `extraTime` hold the goals scored in each period (extraTime
// is the 30' of ET only, NOT cumulative) — so the 120' score is their sum. For
// REGULAR/EXTRA_TIME matches `fullTime` is already the on-pitch result.
export const onPitchScore = (score: FDMatch['score']): ScoreLine => {
  if (score.duration === 'PENALTY_SHOOTOUT') {
    return addScores(score.regularTime, score.extraTime) ?? score.fullTime;
  }
  return score.fullTime;
};

// The penalty-shootout tally, or null when the tie was not settled on penalties.
// Prefer the explicit `penalties` field; if it is absent on a shootout the feed
// has folded the shootout into `fullTime`, so use that.
export const penaltyScore = (score: FDMatch['score']): ScoreLine | null => {
  const pens = score.penalties;
  if (pens && (pens.home != null || pens.away != null)) return pens;
  if (score.duration === 'PENALTY_SHOOTOUT') return score.fullTime;
  return null;
};

// A knockout tie is "decided" once it is finished — or, guarding against a feed
// that lags (still flags a played match as scheduled), once it carries a
// full-time score and a resolvable winner and is not currently in play.
export const isKnockoutDecided = (m: FDMatch): boolean => {
  if (m.status === 'FINISHED' || m.status === 'AWARDED') return true;
  if (m.status === 'IN_PLAY' || m.status === 'PAUSED') return false;
  const ft = m.score.fullTime;
  const played = ft && ft.home != null && ft.away != null;
  return !!played && resolveKnockoutWinner(m.score) != null;
};

// Derive knockout standing purely from decided match RESULTS, never from
// whether the next round's fixtures carry team ids yet (they stay TBD until the
// bracket is drawn). In single elimination one loss is out; the only twists are
// the semi-final (loser drops to the third-place match) and the third-place
// match itself (both sides are done afterwards).
export const computeKnockoutOutcomes = (matches: FDMatch[]): Map<number, KnockoutOutcome> => {
  const order = (s: Stage) => STAGE_ORDER.indexOf(s);
  const deepest = new Map<number, {stage: Stage; won: boolean}>();

  for (const m of matches) {
    if (!KNOCKOUT_STAGES.includes(m.stage)) continue;
    if (m.stage === 'THIRD_PLACE') continue; // not part of this pool
    if (!isKnockoutDecided(m)) continue;
    const winner = resolveKnockoutWinner(m.score); // honours pens/ET shootouts
    if (winner !== 'HOME_TEAM' && winner !== 'AWAY_TEAM') continue;
    for (const side of ['HOME_TEAM', 'AWAY_TEAM'] as const) {
      const team = side === 'HOME_TEAM' ? m.homeTeam : m.awayTeam;
      if (!team.id) continue;
      const current = deepest.get(team.id);
      if (!current || order(m.stage) > order(current.stage)) {
        deepest.set(team.id, {stage: m.stage, won: winner === side});
      }
    }
  }

  const outcomes = new Map<number, KnockoutOutcome>();
  for (const [id, {stage, won}] of deepest) {
    const reachedRank = won ? REACHED_ON_WIN[stage] : QUALIFICATION_RANK[stage];
    let eliminated: boolean;
    if (stage === 'FINAL') eliminated = !won; // runner-up out, champion stays
    else if (stage === 'THIRD_PLACE') eliminated = true; // (unused: 3rd place is skipped)
    // No third-place match in this pool, so a semi-final loss ends the run too.
    else eliminated = !won; // R32/R16/QF/SF: a single loss is out
    outcomes.set(id, {reachedRank, eliminated});
  }
  return outcomes;
};

export interface KnockoutMatchPoints {
  koWins: number; // knockout ties won in regulation (worth 3 each)
  koDraws: number; // knockout ties level at 90' (worth 1 each, both sides)
}

// Match points earned in the knockout rounds, mirroring the group-stage scoring:
// a regulation win is worth 3, while a tie at 90' that is settled in extra time
// or on penalties is a 1-point draw for BOTH teams (the winner is still rewarded
// for advancing through the qualification bonus). Penalty/extra-time deciders are
// detected via score.duration so the visible final score is irrelevant.
export const computeKnockoutMatchPoints = (
  matches: FDMatch[]
): Map<number, KnockoutMatchPoints> => {
  const points = new Map<number, KnockoutMatchPoints>();
  const ensure = (id: number) => {
    if (!points.has(id)) points.set(id, {koWins: 0, koDraws: 0});
    return points.get(id)!;
  };
  for (const m of matches) {
    if (!KNOCKOUT_STAGES.includes(m.stage)) continue;
    if (m.stage === 'THIRD_PLACE') continue; // no points for the 3rd-place match
    if (!isKnockoutDecided(m)) continue;
    const homeId = m.homeTeam.id;
    const awayId = m.awayTeam.id;
    const tiedAt90 = m.score.duration === 'EXTRA_TIME' || m.score.duration === 'PENALTY_SHOOTOUT';
    if (tiedAt90) {
      if (homeId) ensure(homeId).koDraws += 1;
      if (awayId) ensure(awayId).koDraws += 1;
      continue;
    }
    // Decided in regulation: the winner banks a 3-point win, the loser nothing.
    const winner = resolveKnockoutWinner(m.score);
    if (winner === 'HOME_TEAM' && homeId) ensure(homeId).koWins += 1;
    else if (winner === 'AWAY_TEAM' && awayId) ensure(awayId).koWins += 1;
  }
  return points;
};

const computePoints = (agg: TeamAggregate): number => {
  // base = group-stage match points (W*3 + D). ko = knockout match points
  // (regulation win = 3, tie at 90' = 1 for both sides). bonus covers every
  // advancement tier including the +10 for winning the final
  // (QUALIFICATION_BONUS[6]=33 already folds that in via buildQualifications
  // returning rank+1 for the champion). Do NOT add an extra WINNER_BONUS — that
  // would double-count.
  const base = agg.wins * 3 + agg.draws;
  const ko = agg.koWins * 3 + agg.koDraws;
  const bonus = QUALIFICATION_BONUS[agg.qualifications] ?? 0;
  return base + ko + bonus;
};

const computeGroupStatsFromMatches = (
  matches: FDMatch[]
): Map<number, {games: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; goalDifference: number}> => {
  const stats = new Map<number, {games: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; goalDifference: number}>();
  const ensure = (id: number) => {
    if (!stats.has(id))
      stats.set(id, {games: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0});
    return stats.get(id)!;
  };
  for (const m of matches) {
    if (m.stage !== 'GROUP_STAGE') continue;
    if (m.status !== 'FINISHED' && m.status !== 'AWARDED' && m.status !== 'IN_PLAY' && m.status !== 'PAUSED') continue;
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
    h.goalDifference = h.goalsFor - h.goalsAgainst;
    a.goalDifference = a.goalsFor - a.goalsAgainst;
    if (gh > ga) {
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
  return stats;
};

export const aggregateTeams = (standings: FDStandingGroup[], matches: FDMatch[]): TeamAggregate[] => {
  const stageByTeam = computeStageByTeam(matches);
  const championId = findChampionId(matches);
  // Compute W/D/L from match data so live scores are reflected immediately,
  // rather than waiting for the standings API to update at full-time.
  const groupStats = computeGroupStatsFromMatches(matches);
  // Advancement/elimination come from the standings (group stage) and finished
  // match results (knockout), never from not-yet-drawn next-round fixtures.
  const groupOutcomes = computeGroupOutcomes(standings);
  const knockoutOutcomes = computeKnockoutOutcomes(matches);
  const knockoutMatchPoints = computeKnockoutMatchPoints(matches);

  const aggregates: TeamAggregate[] = [];
  for (const group of standings) {
    const letter = groupLetterFromStanding(group.group);
    for (const row of group.table) {
      const id = row.team.id;
      const highest = stageByTeam.get(id) ?? 'GROUP_STAGE';
      const isChampion = id === championId;
      const knockout = knockoutOutcomes.get(id);
      // A team drawn into a knockout fixture that has not been played yet still
      // relies on the upcoming-match fallback for its elimination check.
      const assignedToKnockout = highest !== 'GROUP_STAGE';
      // Qualifications bank on the event that earns them — clinching a R32 spot
      // (group) or winning a knockout tie — so neither points nor "alive" status
      // waits on the next round's fixtures being drawn.
      const qualifications = Math.max(
        buildQualifications(highest, isChampion),
        knockout?.reachedRank ?? 0,
        groupOutcomes.qualified.has(id) ? 1 : 0
      );
      const s = groupStats.get(id);
      const games = s?.games ?? row.playedGames;
      const wins = s?.wins ?? row.won;
      const draws = s?.draws ?? row.draw;
      const losses = s?.losses ?? row.lost;
      const goalsFor = s?.goalsFor ?? row.goalsFor;
      const goalsAgainst = s?.goalsAgainst ?? row.goalsAgainst;
      const goalDifference = s?.goalDifference ?? row.goalDifference;
      const ko = knockoutMatchPoints.get(id);
      // Prefer the result-based knockout verdict; fall back to upcoming-match
      // presence only while a drawn tie is unplayed, then the standings-based
      // group outcome before any knockout.
      const eliminated =
        !isChampion &&
        (knockout
          ? knockout.eliminated
          : assignedToKnockout
            ? !hasUpcomingMatch(id, matches) && games > 0
            : groupOutcomes.eliminated.has(id));
      aggregates.push({
        api_id: row.team.id,
        name: row.team.name,
        logo: row.team.crest,
        group: letter,
        position: row.position,
        games,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        goalDifference,
        koWins: ko?.koWins ?? 0,
        koDraws: ko?.koDraws ?? 0,
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
          position: agg.position,
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
          scoreHome: onPitchScore(m.score).home,
          scoreAway: onPitchScore(m.score).away,
          penaltyHome: penaltyScore(m.score)?.home ?? null,
          penaltyAway: penaltyScore(m.score)?.away ?? null,
          // For a finished knockout tie settled on penalties/extra time the feed
          // may report winner as DRAW/null; store the resolved advancing side so
          // the bracket carries the winner forward instead of stalling on TBD.
          winner:
            KNOCKOUT_STAGES.includes(m.stage) && isKnockoutDecided(m)
              ? resolveKnockoutWinner(m.score) ?? m.score.winner
              : m.score.winner,
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
    if (m.stage === 'THIRD_PLACE') continue; // not part of this pool
    const decided =
      m.status === 'FINISHED' ||
      m.status === 'AWARDED' ||
      (KNOCKOUT_STAGES.includes(m.stage) && isKnockoutDecided(m));
    if (!decided) continue;
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

// Pure Monte Carlo simulation of a tournament's remainder, used to estimate
// each participant's probability of finishing the pool in 1st place.
// No I/O, no Date.now — deterministic given a seeded RNG so it is unit-testable.

import {BracketSlotDef, SideDef, Stage, WC26_BRACKET} from './bracketDefinitions';
import {qualificationRank} from './qualificationRank';

// Defaults reproduce the exact WC26 behaviour this module originally shipped
// with, so every existing call site/test keeps working unchanged; a caller
// simulating a different tournament format passes its own values instead.
const WC26_KNOCKOUT_STAGES: Stage[] = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'];
const WC26_THIRD_PLACE_SLOTS = 8;

export type Rng = () => number; // returns a float in [0, 1)

/** mulberry32 — small, fast, seedable PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- strength model -------------------------------------------------------

export const RATING_BASE = 1900; // tier 1
export const RATING_STEP = 70; // per tier drop

/** Fixed strength rating from draft tier (1 = strongest .. 6 = weakest). */
export function rating(tier: number): number {
  const t = tier >= 1 && tier <= 6 ? tier : 6;
  return RATING_BASE - (t - 1) * RATING_STEP;
}

// --- scoring ladder (mirrors QUALIFICATION_BONUS in Update.ts) -------------

const BONUS = [0, 3, 8, 13, 18, 23, 33];

/** Advancement bonus for a given qualifications count (0..6). */
export function bonusForQual(qual: number): number {
  return BONUS[Math.max(0, Math.min(6, qual))];
}

// --- match outcome model --------------------------------------------------

const GOAL_BASELINE = 1.35;
const GOAL_SCALE = 400; // larger = rating gaps matter less
const GOAL_FLOOR = 0.25;

/** Expected goals for `ratingFor` against `ratingAgainst`. */
export function expectedGoals(ratingFor: number, ratingAgainst: number): number {
  const lambda = GOAL_BASELINE * Math.exp((ratingFor - ratingAgainst) / GOAL_SCALE);
  return Math.max(GOAL_FLOOR, lambda);
}

/** Knuth Poisson sampler. */
function poisson(rng: Rng, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

export interface Scoreline {
  home: number;
  away: number;
}

/** Roll a single match's goals from the two ratings. */
export function rollMatch(rng: Rng, ratingHome: number, ratingAway: number): Scoreline {
  return {
    home: poisson(rng, expectedGoals(ratingHome, ratingAway)),
    away: poisson(rng, expectedGoals(ratingAway, ratingHome)),
  };
}

/** Probability the home side wins a coin-flip (used for KO ties). */
export function homeEdge(ratingHome: number, ratingAway: number): number {
  return 1 / (1 + Math.pow(10, (ratingAway - ratingHome) / 400));
}

// --- input shapes (decoupled from mongoose docs) --------------------------

export interface SimTeam {
  api_id: number;
  group: string; // group letter 'A'..'L'
  tier: number; // 1..6
  achievedQual: number; // Team.qualifications already banked (0..6) — a floor
  eliminated: boolean; // already knocked out in reality
}

export interface SimMatch {
  group: string; // group letter 'A'..'L'
  status: string; // 'FINISHED' freezes the real score; otherwise rolled
  homeId: number;
  awayId: number;
  scoreHome: number | null;
  scoreAway: number | null;
}

export interface GroupRow {
  teamId: number;
  group: string;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  pos: number;
}

export interface Qualifier {
  teamId: number;
  group: string;
  finishPos: 1 | 2 | 3;
}

function ratingByTeam(teams: SimTeam[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const t of teams) m.set(t.api_id, rating(t.tier));
  return m;
}

/** Roll/freeze every group match and return final standings per group. */
export function simulateGroupStage(
  teams: SimTeam[],
  matches: SimMatch[],
  rng: Rng
): Map<string, GroupRow[]> {
  const ratings = ratingByTeam(teams);
  const rows = new Map<number, GroupRow>();
  for (const t of teams) {
    rows.set(t.api_id, {
      teamId: t.api_id, group: t.group,
      w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, pos: 0,
    });
  }

  for (const m of matches) {
    let gh: number;
    let ga: number;
    if (m.status === 'FINISHED' && m.scoreHome != null && m.scoreAway != null) {
      gh = m.scoreHome;
      ga = m.scoreAway;
    } else {
      const s = rollMatch(rng, ratings.get(m.homeId)!, ratings.get(m.awayId)!);
      gh = s.home;
      ga = s.away;
    }
    const h = rows.get(m.homeId)!;
    const a = rows.get(m.awayId)!;
    h.gf += gh; h.ga += ga; a.gf += ga; a.ga += gh;
    if (gh > ga) { h.w++; a.l++; h.pts += 3; }
    else if (ga > gh) { a.w++; h.l++; a.pts += 3; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  }

  const byGroup = new Map<string, GroupRow[]>();
  for (const r of rows.values()) {
    r.gd = r.gf - r.ga;
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group)!.push(r);
  }
  for (const [, list] of byGroup) {
    list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.teamId - y.teamId);
    list.forEach((r, i) => (r.pos = i + 1));
  }
  return byGroup;
}

/** Top 2 of each group + the best third-placed teams. */
export function selectQualifiers(
  tables: Map<string, GroupRow[]>,
  thirdPlaceSlots: number = WC26_THIRD_PLACE_SLOTS
): Qualifier[] {
  const q: Qualifier[] = [];
  const thirds: GroupRow[] = [];
  for (const [, list] of tables) {
    q.push({teamId: list[0].teamId, group: list[0].group, finishPos: 1});
    q.push({teamId: list[1].teamId, group: list[1].group, finishPos: 2});
    if (list[2]) thirds.push(list[2]);
  }
  thirds.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.teamId - y.teamId);
  for (const r of thirds.slice(0, thirdPlaceSlots)) {
    q.push({teamId: r.teamId, group: r.group, finishPos: 3});
  }
  return q;
}

// --- knockout simulation (Option A: approximate seeded bracket) -----------

export interface KnockoutResult {
  koWins: number; // regulation KO wins (3 pts each)
  koDraws: number; // KO ties decided on pens (1 pt each)
  qual: number; // highest qualifications reached (1..6)
}

/** Standard 1-based seed order for a bracket of size n (power of two). */
function seedOrder(n: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < n) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

type QualLite = {teamId: number; finishPos: 1 | 2 | 3};

/** Simulate the 32-team knockout; return per-team KO points + stage reached. */
export function simulateKnockout(
  qualifiers: QualLite[],
  ratings: Map<number, number>,
  rng: Rng
): Map<number, KnockoutResult> {
  const result = new Map<number, KnockoutResult>();
  for (const q of qualifiers) result.set(q.teamId, {koWins: 0, koDraws: 0, qual: 1});

  // Seed strongest-first: group winners before runners-up before thirds, then
  // by rating. seed[0] is the #1 seed.
  const seeded = [...qualifiers].sort(
    (a, b) => a.finishPos - b.finishPos || ratings.get(b.teamId)! - ratings.get(a.teamId)!
  );
  const order = seedOrder(seeded.length); // 1-based seeds in bracket order
  let bracket = order.map((seed) => seeded[seed - 1].teamId);

  // qual reached by losing in a round of `size` teams: size 32 -> 1, 16 -> 2,
  // 8 -> 3, 4 -> 4, 2 -> 5; the survivor of the size-2 round is champion (6).
  const qualForRoundSize: Record<number, number> = {32: 1, 16: 2, 8: 3, 4: 4, 2: 5};

  while (bracket.length > 1) {
    const loserQual = qualForRoundSize[bracket.length];
    const next: number[] = [];
    for (let i = 0; i < bracket.length; i += 2) {
      const home = bracket[i];
      const away = bracket[i + 1];
      const rh = ratings.get(home)!;
      const ra = ratings.get(away)!;
      const s = rollMatch(rng, rh, ra);
      let winner: number;
      let loser: number;
      if (s.home > s.away) {
        winner = home; loser = away;
        result.get(home)!.koWins++;
      } else if (s.away > s.home) {
        winner = away; loser = home;
        result.get(away)!.koWins++;
      } else {
        // tie after 90' -> penalties; a draw for match points for both.
        result.get(home)!.koDraws++;
        result.get(away)!.koDraws++;
        if (rng() < homeEdge(rh, ra)) { winner = home; loser = away; }
        else { winner = away; loser = home; }
      }
      result.get(loser)!.qual = loserQual;
      result.get(winner)!.qual = loserQual + 1; // provisional; overwritten if advances
      next.push(winner);
    }
    bracket = next;
  }
  // The last surviving team is champion.
  result.get(bracket[0])!.qual = 6;
  return result;
}

// --- participant scoring & top-level Monte Carlo --------------------------

export interface SimParticipant {
  lastName: string;
  teamIds: number[];
}

export interface ChancesOptions {
  runs?: number;
  seed?: number;
  // Real knockout state (finished results + drawn pairings), keyed by FIFA match
  // number, so the sim continues from the actual bracket instead of re-seeding.
  actualKo?: Map<number, ActualKoResult>;
  // Tournament format — defaults to WC26's (48 teams, 8 qualifying thirds,
  // Round of 32 to Final) so existing callers are unaffected. A tournament
  // with no known draw sheet yet has no bracketDefinition to pass; the
  // caller must not invoke this simulation for it (see updateChances.ts).
  bracketDefinition?: BracketSlotDef[];
  knockoutStages?: Stage[];
  thirdPlaceSlots?: number;
}

const DEFAULT_RUNS = 20000;

/** Outcome of one simulated tournament. */
export interface SimOutcome {
  points: Map<number, number>; // total points per team (match points + bonus)
  stage: Map<number, number>; // final stage/qualification reached per team (0..6)
  championId: number | null; // the team that won the whole thing in this run
}

// --- real-bracket knockout ------------------------------------------------
// Continues the simulation along a tournament's ACTUAL, already-known draw
// sheet (bracketDefinition — see bracketDefinitions.ts). Only defined for
// tournaments whose draw has been published (WC26 today); a tournament with
// no known draw (e.g. Euro 2028, until UEFA's 2027 draw) has no bracket
// definition to continue from, and callers must not invoke this path for it.

/** Actual (real-world) state of one bracket fixture, keyed by FIFA match no. */
export interface ActualKoResult {
  finished: boolean;
  homeId: number | null; // resolved real teams, if the tie has been drawn
  awayId: number | null;
  winnerId: number | null; // real winner, if finished
  drawAt90: boolean; // finished level at 90'/120' (ET/pens) — a 1-pt draw each
}

/** The best third-placed teams, used only to fill undrawn third slots. */
function bestThirds(tables: Map<string, GroupRow[]>, thirdPlaceSlots: number): number[] {
  const thirds: GroupRow[] = [];
  for (const [, list] of tables) if (list[2]) thirds.push(list[2]);
  thirds.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.teamId - y.teamId);
  return thirds.slice(0, thirdPlaceSlots).map((row) => row.teamId);
}

/**
 * Play out the knockout along the REAL bracket: finished ties are frozen to
 * their actual result, drawn-but-unplayed ties use their real pairing, and
 * everything else is resolved from the tree and rolled. Returns per-team KO
 * match points + deepest stage, plus the champion.
 *
 * Requires a known, published draw sheet (bracketDefinition) — there is
 * nothing to "continue from" for a tournament whose draw hasn't happened yet.
 */
function simulateBracketKnockout(
  tables: Map<string, GroupRow[]>,
  ratings: Map<number, number>,
  actual: Map<number, ActualKoResult>,
  rng: Rng,
  bracketDefinition: BracketSlotDef[],
  knockoutStages: Stage[],
  thirdPlaceSlots: number
): {ko: Map<number, KnockoutResult>; championId: number | null} {
  const ko = new Map<number, KnockoutResult>();
  const ensure = (id: number) => {
    if (!ko.has(id)) ko.set(id, {koWins: 0, koDraws: 0, qual: 0});
    return ko.get(id)!;
  };
  const winnerOf = new Map<number, number>();
  const loserOf = new Map<number, number>();
  const thirdsPool = bestThirds(tables, thirdPlaceSlots);
  let thirdIdx = 0;
  let championId: number | null = null;

  const resolveSide = (side: SideDef, actualId: number | null): number | null => {
    if (actualId != null) return actualId;
    switch (side.type) {
      case 'winner': return tables.get(side.group!)?.[0]?.teamId ?? null;
      case 'runnerUp': return tables.get(side.group!)?.[1]?.teamId ?? null;
      case 'third': return thirdsPool[thirdIdx++] ?? null;
      case 'matchWinner': return winnerOf.get(side.match!) ?? null;
      case 'matchLoser': return loserOf.get(side.match!) ?? null;
    }
  };

  const bump = (id: number, stage: Stage, won: boolean) => {
    const rank = qualificationRank(stage, knockoutStages, won);
    const e = ensure(id);
    if (rank > e.qual) e.qual = rank;
  };

  for (const slot of bracketDefinition) {
    if (slot.stage === 'THIRD_PLACE') continue; // not part of this pool — no points
    const act = actual.get(slot.fifaMatch);
    const homeId = resolveSide(slot.home, act?.homeId ?? null);
    const awayId = resolveSide(slot.away, act?.awayId ?? null);
    if (homeId == null || awayId == null) continue; // not reachable this run

    let winnerId: number;
    let loserId: number;
    let drawAt90 = false;

    if (act?.finished && act.winnerId != null) {
      winnerId = act.winnerId;
      loserId = act.winnerId === homeId ? awayId : homeId;
      drawAt90 = act.drawAt90;
    } else {
      const s = rollMatch(rng, ratings.get(homeId)!, ratings.get(awayId)!);
      if (s.home > s.away) {
        winnerId = homeId; loserId = awayId;
      } else if (s.away > s.home) {
        winnerId = awayId; loserId = homeId;
      } else {
        drawAt90 = true;
        if (rng() < homeEdge(ratings.get(homeId)!, ratings.get(awayId)!)) {
          winnerId = homeId; loserId = awayId;
        } else {
          winnerId = awayId; loserId = homeId;
        }
      }
    }

    if (drawAt90) {
      ensure(homeId).koDraws++;
      ensure(awayId).koDraws++;
    } else {
      ensure(winnerId).koWins++;
    }
    bump(winnerId, slot.stage, true);
    bump(loserId, slot.stage, false);
    winnerOf.set(slot.fifaMatch, winnerId);
    loserOf.set(slot.fifaMatch, loserId);
    if (slot.stage === 'FINAL') championId = winnerId;
  }

  return {ko, championId};
}

/** One simulated tournament -> per-team points, stage reached, and champion. */
function simulateOnce(
  teams: SimTeam[],
  groupMatches: SimMatch[],
  actualKo: Map<number, ActualKoResult>,
  rng: Rng,
  bracketDefinition: BracketSlotDef[],
  knockoutStages: Stage[],
  thirdPlaceSlots: number
): SimOutcome {
  const ratings = ratingByTeam(teams);
  const tables = simulateGroupStage(teams, groupMatches, rng);

  // group match points per team
  const matchPts = new Map<number, number>();
  const groupQual = new Map<number, number>(); // 0 = out, 1 = reached first knockout round
  for (const [, list] of tables) {
    for (const row of list) {
      matchPts.set(row.teamId, row.w * 3 + row.d);
      groupQual.set(row.teamId, 0);
    }
  }
  for (const q of selectQualifiers(tables, thirdPlaceSlots)) groupQual.set(q.teamId, 1);

  const {ko, championId} = simulateBracketKnockout(
    tables,
    ratings,
    actualKo,
    rng,
    bracketDefinition,
    knockoutStages,
    thirdPlaceSlots
  );
  for (const [teamId, res] of ko) {
    matchPts.set(teamId, (matchPts.get(teamId) ?? 0) + res.koWins * 3 + res.koDraws);
  }

  // final points = group+KO match points + advancement bonus, with the real
  // already-banked qualifications as a floor (and eliminated teams capped).
  const points = new Map<number, number>();
  const stage = new Map<number, number>();
  for (const team of teams) {
    const simQual = ko.get(team.api_id)?.qual ?? groupQual.get(team.api_id) ?? 0;
    const floored = Math.max(simQual, team.achievedQual);
    const qual = team.eliminated ? team.achievedQual : floored;
    points.set(team.api_id, (matchPts.get(team.api_id) ?? 0) + bonusForQual(qual));
    stage.set(team.api_id, qual);
  }
  return {points, stage, championId};
}

/** A team's result within a participant's sample winning tournament. */
export interface TeamPathResult {
  teamId: number;
  stageReached: number; // 0=group .. 6=champion
  points: number;
}

/** An example simulated tournament in which a participant finishes first. */
export interface WinningPath {
  lastName: string;
  points: number; // the participant's winning total
  margin: number; // points ahead of the runner-up
  championId: number | null; // the tournament champion in that scenario
  teams: TeamPathResult[]; // the participant's teams, best first
}

export interface ChancesResult {
  chances: Record<string, number>; // win % (0..100) per participant
  paths: Record<string, WinningPath>; // one sample winning scenario per participant
}

/** Score a participant in a given simulated outcome. */
function scoreParticipant(p: SimParticipant, outcome: SimOutcome): number {
  return p.teamIds.reduce((acc, id) => acc + (outcome.points.get(id) ?? 0), 0);
}

/**
 * Run the Monte Carlo, returning both each participant's win % and — captured
 * from the same runs — one example tournament path in which they win outright.
 */
export function computeChancesAndPaths(
  teams: SimTeam[],
  participants: SimParticipant[],
  groupMatches: SimMatch[],
  opts: ChancesOptions = {}
): ChancesResult {
  const runs = opts.runs ?? DEFAULT_RUNS;
  const rng = mulberry32(opts.seed ?? 1);
  const actualKo = opts.actualKo ?? new Map<number, ActualKoResult>();
  const bracketDefinition = opts.bracketDefinition ?? WC26_BRACKET;
  const knockoutStages = opts.knockoutStages ?? WC26_KNOCKOUT_STAGES;
  const thirdPlaceSlots = opts.thirdPlaceSlots ?? WC26_THIRD_PLACE_SLOTS;
  const wins = new Map<string, number>();
  for (const p of participants) wins.set(p.lastName, 0);

  const paths: Record<string, WinningPath> = {};
  let pathsRemaining = participants.length;

  for (let i = 0; i < runs; i++) {
    const outcome = simulateOnce(
      teams,
      groupMatches,
      actualKo,
      rng,
      bracketDefinition,
      knockoutStages,
      thirdPlaceSlots
    );
    let best = -Infinity;
    let leaders: string[] = [];
    for (const p of participants) {
      const score = scoreParticipant(p, outcome);
      if (score > best) {
        best = score;
        leaders = [p.lastName];
      } else if (score === best) {
        leaders.push(p.lastName);
      }
    }
    const share = 1 / leaders.length;
    for (const name of leaders) wins.set(name, wins.get(name)! + share);

    // Capture one sample scenario per participant where they win outright.
    if (pathsRemaining > 0 && leaders.length === 1 && !paths[leaders[0]]) {
      const winner = participants.find((p) => p.lastName === leaders[0])!;
      let runnerUp = -Infinity;
      for (const p of participants) {
        if (p.lastName === winner.lastName) continue;
        runnerUp = Math.max(runnerUp, scoreParticipant(p, outcome));
      }
      paths[winner.lastName] = {
        lastName: winner.lastName,
        points: best,
        margin: runnerUp === -Infinity ? best : best - runnerUp,
        championId: outcome.championId,
        teams: winner.teamIds
          .map((id) => ({
            teamId: id,
            stageReached: outcome.stage.get(id) ?? 0,
            points: outcome.points.get(id) ?? 0
          }))
          .sort((a, b) => b.points - a.points)
      };
      pathsRemaining--;
    }
  }

  const chances: Record<string, number> = {};
  for (const p of participants) {
    chances[p.lastName] = Math.round((wins.get(p.lastName)! / runs) * 100);
  }
  return {chances, paths};
}

/** Run the Monte Carlo and return each participant's win % (0..100). */
export function computeChances(
  teams: SimTeam[],
  participants: SimParticipant[],
  groupMatches: SimMatch[],
  opts: ChancesOptions = {}
): Record<string, number> {
  return computeChancesAndPaths(teams, participants, groupMatches, opts).chances;
}

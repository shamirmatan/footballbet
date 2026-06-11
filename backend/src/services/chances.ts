// Pure Monte Carlo simulation of the remaining World Cup, used to estimate
// each participant's probability of finishing the pool in 1st place.
// No I/O, no Date.now — deterministic given a seeded RNG so it is unit-testable.

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

const RATING_BASE = 1900; // tier 1
const RATING_STEP = 70; // per tier drop

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

/** Top 2 of each group + the 8 best third-placed teams (2026 format). */
export function selectQualifiers(tables: Map<string, GroupRow[]>): Qualifier[] {
  const q: Qualifier[] = [];
  const thirds: GroupRow[] = [];
  for (const [, list] of tables) {
    q.push({teamId: list[0].teamId, group: list[0].group, finishPos: 1});
    q.push({teamId: list[1].teamId, group: list[1].group, finishPos: 2});
    if (list[2]) thirds.push(list[2]);
  }
  thirds.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.teamId - y.teamId);
  for (const r of thirds.slice(0, 8)) {
    q.push({teamId: r.teamId, group: r.group, finishPos: 3});
  }
  return q;
}

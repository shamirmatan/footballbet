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

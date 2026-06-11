# Winning Chances (Monte Carlo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute each participant's daily probability (0–100%) of finishing the pool in 1st place via a Monte Carlo simulation of the remaining tournament, and show it in the Standings tab.

**Architecture:** A pure, deterministic simulation module (`backend/src/services/chances.ts`) rolls every unplayed match on top of frozen real results, scores each run with the existing point rules, and reports win frequencies. A thin cron entry (`backend/src/cron/updateChances.ts`) loads Mongo data, runs the sims, and writes `Participant.chances`. A daily GitHub Actions workflow runs it at 04:00 UTC. The Angular Standings tab renders a small chance chip.

**Tech Stack:** TypeScript, Node 20, Mongoose 6, Jest + ts-jest (new), Angular 18, GitHub Actions.

**Design reference:** `docs/superpowers/specs/2026-06-10-winning-chances-monte-carlo-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/jest.config.js` (create) | Jest + ts-jest config |
| `backend/package.json` (modify) | add `test` and `cron:chances` scripts, jest devDeps |
| `backend/src/services/chances.ts` (create) | Pure simulation: RNG, ratings, match model, group sim, knockout sim, scoring, `computeChances` |
| `backend/src/services/chances.test.ts` (create) | Unit tests for the above |
| `backend/src/models/Participant.ts` (modify) | add `chances` field |
| `backend/src/cron/updateChances.ts` (create) | I/O shell: load → simulate → persist |
| `.github/workflows/chances-daily.yml` (create) | daily 04:00 UTC trigger |
| `src/app/participants/participant.model.ts` (modify) | add `chances` |
| `src/app/participants/participant-list/participant-list.component.html` (modify) | render chance chip |
| `src/app/participants/participant-list/participant-list.component.css` (modify) | chip styles |

All work happens in `backend/` for tasks 1–8 unless a path says otherwise. Run backend commands from `backend/`.

---

## Task 1: Add Jest test runner to the backend

**Files:**
- Create: `backend/jest.config.js`
- Modify: `backend/package.json`

- [ ] **Step 1: Install dev dependencies**

Run (from `backend/`):
```bash
npm install -D jest@29 ts-jest@29 @types/jest@29
```
Expected: packages added under `devDependencies`, no errors.

- [ ] **Step 2: Create `backend/jest.config.js`**

```js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  // The simulation module is pure; no DB/network. Keep tests fast.
  clearMocks: true,
};
```

- [ ] **Step 3: Add the `test` script**

In `backend/package.json`, add to `scripts` (keep existing entries):
```json
"test": "jest"
```

- [ ] **Step 4: Add a smoke test to verify the runner works**

Create `backend/src/services/_smoke.test.ts`:
```ts
test('jest runs', () => {
  expect(1 + 1).toBe(2);
});
```

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 5: Remove the smoke test**

```bash
rm src/services/_smoke.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/jest.config.js
git commit -m "chore(backend): add jest + ts-jest test runner"
```

---

## Task 2: RNG, ratings, bonus ladder, and match model

**Files:**
- Create: `backend/src/services/chances.ts`
- Test: `backend/src/services/chances.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/services/chances.test.ts`:
```ts
import {
  mulberry32,
  rating,
  bonusForQual,
  expectedGoals,
  rollMatch,
} from './chances';

describe('rating', () => {
  it('decreases by a fixed step per tier', () => {
    expect(rating(1)).toBe(1900);
    expect(rating(2)).toBe(1830);
    expect(rating(6)).toBe(1550);
  });
});

describe('bonusForQual', () => {
  it('maps advancement count to the Update.ts bonus ladder', () => {
    expect(bonusForQual(0)).toBe(0);
    expect(bonusForQual(1)).toBe(3);
    expect(bonusForQual(2)).toBe(8);
    expect(bonusForQual(3)).toBe(13);
    expect(bonusForQual(4)).toBe(18);
    expect(bonusForQual(5)).toBe(23);
    expect(bonusForQual(6)).toBe(33);
  });
});

describe('expectedGoals', () => {
  it('gives more goals to the stronger side and stays positive', () => {
    const strong = expectedGoals(1900, 1550);
    const weak = expectedGoals(1550, 1900);
    expect(strong).toBeGreaterThan(weak);
    expect(weak).toBeGreaterThan(0);
  });
});

describe('rollMatch', () => {
  it('is deterministic for a given seed', () => {
    const a = rollMatch(mulberry32(42), 1900, 1700);
    const b = rollMatch(mulberry32(42), 1900, 1700);
    expect(a).toEqual(b);
  });

  it('lets the stronger team win more often over many rolls', () => {
    const rng = mulberry32(7);
    let strongWins = 0;
    let weakWins = 0;
    for (let i = 0; i < 2000; i++) {
      const g = rollMatch(rng, 1900, 1550);
      if (g.home > g.away) strongWins++;
      else if (g.away > g.home) weakWins++;
    }
    expect(strongWins).toBeGreaterThan(weakWins);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './chances'`.

- [ ] **Step 3: Create `backend/src/services/chances.ts` with the primitives**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/chances.ts backend/src/services/chances.test.ts
git commit -m "feat(chances): rng, ratings, bonus ladder, match model"
```

---

## Task 3: Group-stage simulation and qualifier selection

**Files:**
- Modify: `backend/src/services/chances.ts`
- Test: `backend/src/services/chances.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/services/chances.test.ts`:
```ts
import {
  SimTeam,
  SimMatch,
  simulateGroupStage,
  selectQualifiers,
} from './chances';

function team(api_id: number, group: string, tier: number): SimTeam {
  return {api_id, group, tier, achievedQual: 0, eliminated: false};
}

// One finished group A: team 1 wins all, team 2 second, team 3 third, team 4 last.
const groupA: SimTeam[] = [team(1, 'A', 1), team(2, 'A', 3), team(3, 'A', 4), team(4, 'A', 6)];
function fin(group: string, h: number, a: number, sh: number, sa: number): SimMatch {
  return {group, status: 'FINISHED', homeId: h, awayId: a, scoreHome: sh, scoreAway: sa};
}
const groupAMatches: SimMatch[] = [
  fin('A', 1, 2, 2, 0), fin('A', 3, 4, 1, 0),
  fin('A', 1, 3, 3, 0), fin('A', 2, 4, 2, 1),
  fin('A', 1, 4, 4, 0), fin('A', 2, 3, 1, 0),
];

describe('simulateGroupStage', () => {
  it('reproduces a finished group exactly (frozen results)', () => {
    const tables = simulateGroupStage(groupA, groupAMatches, mulberry32(1));
    const a = tables.get('A')!;
    expect(a.map((r) => r.teamId)).toEqual([1, 2, 3, 4]);
    expect(a[0].pts).toBe(9); // 3 wins
    expect(a[0].pos).toBe(1);
    expect(a[3].pos).toBe(4);
  });
});

describe('selectQualifiers', () => {
  it('takes top 2 of every group plus the 8 best thirds', () => {
    // Build 12 groups, all teams tier-equal, with deterministic finished results
    // so positions are stable. Reuse groupA layout shifted per group.
    const letters = 'ABCDEFGHIJKL'.split('');
    const teams: SimTeam[] = [];
    const matches: SimMatch[] = [];
    let id = 1;
    for (const g of letters) {
      const ids = [id, id + 1, id + 2, id + 3];
      teams.push(team(ids[0], g, 1), team(ids[1], g, 3), team(ids[2], g, 4), team(ids[3], g, 6));
      matches.push(
        fin(g, ids[0], ids[1], 2, 0), fin(g, ids[2], ids[3], 1, 0),
        fin(g, ids[0], ids[2], 3, 0), fin(g, ids[1], ids[3], 2, 1),
        fin(g, ids[0], ids[3], 4, 0), fin(g, ids[1], ids[2], 1, 0),
      );
      id += 4;
    }
    const tables = simulateGroupStage(teams, matches, mulberry32(1));
    const q = selectQualifiers(tables);
    expect(q.length).toBe(32);
    const firsts = q.filter((x) => x.finishPos === 1).length;
    const seconds = q.filter((x) => x.finishPos === 2).length;
    const thirds = q.filter((x) => x.finishPos === 3).length;
    expect(firsts).toBe(12);
    expect(seconds).toBe(12);
    expect(thirds).toBe(8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `simulateGroupStage`/`selectQualifiers`/`SimTeam`/`SimMatch` not exported.

- [ ] **Step 3: Add the types and functions to `chances.ts`**

Append to `backend/src/services/chances.ts`:
```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (group + qualifier tests green).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/chances.ts backend/src/services/chances.test.ts
git commit -m "feat(chances): group-stage simulation and qualifier selection"
```

---

## Task 4: Knockout simulation

**Files:**
- Modify: `backend/src/services/chances.ts`
- Test: `backend/src/services/chances.test.ts`

The knockout is an approximate single-elimination bracket (Option A): the 32
qualifiers are seeded by `(finishPos asc, rating desc)` and placed into a
standard seeded bracket so the strongest are kept apart. Each round is rolled
with `rollMatch`; a 90-minute tie advances by a rating coin-flip and counts as a
draw for both teams' match points (mirrors `Update.ts`). The third-place match
is skipped — its bonus is identical to a semifinal loss, so it does not affect
scoring.

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/services/chances.test.ts`:
```ts
import {simulateKnockout, KnockoutResult} from './chances';

describe('simulateKnockout', () => {
  function qualifiersFor(teams: SimTeam[]): {teamId: number; finishPos: 1 | 2 | 3}[] {
    return teams.map((t, i) => ({teamId: t.api_id, finishPos: ((i % 3) + 1) as 1 | 2 | 3}));
  }

  it('produces exactly one champion and consistent stage counts', () => {
    const teams: SimTeam[] = [];
    for (let i = 1; i <= 32; i++) teams.push(team(i, 'A', ((i % 6) + 1)));
    const ratings = new Map(teams.map((t) => [t.api_id, rating(t.tier)]));
    const q = qualifiersFor(teams);
    const res = simulateKnockout(q, ratings, mulberry32(3));

    const champions = [...res.values()].filter((r) => r.qual === 6);
    expect(champions.length).toBe(1);
    // Every qualifier reaches at least R32 (qual >= 1).
    expect([...res.values()].every((r) => r.qual >= 1)).toBe(true);
    // Stage distribution: 16 reach exactly R32(1), 8 R16(2), 4 QF(3), 2 SF(4),
    // 1 Final-loser(5), 1 Champion(6).
    const count = (qv: number) => [...res.values()].filter((r) => r.qual === qv).length;
    expect(count(1)).toBe(16);
    expect(count(2)).toBe(8);
    expect(count(3)).toBe(4);
    expect(count(4)).toBe(2);
    expect(count(5)).toBe(1);
    expect(count(6)).toBe(1);
  });

  it('is deterministic for a given seed', () => {
    const teams: SimTeam[] = [];
    for (let i = 1; i <= 32; i++) teams.push(team(i, 'A', ((i % 6) + 1)));
    const ratings = new Map(teams.map((t) => [t.api_id, rating(t.tier)]));
    const q = qualifiersFor(teams);
    const a = simulateKnockout(q, ratings, mulberry32(9));
    const b = simulateKnockout(q, ratings, mulberry32(9));
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `simulateKnockout`/`KnockoutResult` not exported.

- [ ] **Step 3: Add the knockout simulation to `chances.ts`**

Append to `backend/src/services/chances.ts`:
```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (champion unique, stage counts exact, deterministic).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/chances.ts backend/src/services/chances.test.ts
git commit -m "feat(chances): approximate seeded knockout simulation"
```

---

## Task 5: Scoring and the top-level `computeChances`

**Files:**
- Modify: `backend/src/services/chances.ts`
- Test: `backend/src/services/chances.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/services/chances.test.ts`:
```ts
import {SimParticipant, computeChances} from './chances';

describe('computeChances', () => {
  // Build a full 48-team tournament (12 groups of 4) with tiered strengths.
  function fullTournament() {
    const letters = 'ABCDEFGHIJKL'.split('');
    const teams: SimTeam[] = [];
    const matches: SimMatch[] = [];
    let id = 1;
    for (const g of letters) {
      const ids = [id, id + 1, id + 2, id + 3];
      // tiers 1..4 within each group so positions are strength-ordered
      teams.push(team(ids[0], g, 1), team(ids[1], g, 2), team(ids[2], g, 4), team(ids[3], g, 6));
      // all matches unplayed (status TIMED)
      const pair = (h: number, a: number): SimMatch => ({
        group: g, status: 'TIMED', homeId: h, awayId: a, scoreHome: null, scoreAway: null,
      });
      matches.push(
        pair(ids[0], ids[1]), pair(ids[2], ids[3]),
        pair(ids[0], ids[2]), pair(ids[1], ids[3]),
        pair(ids[0], ids[3]), pair(ids[1], ids[2]),
      );
      id += 4;
    }
    return {teams, matches};
  }

  it('returns percentages that sum to ~100 across participants', () => {
    const {teams, matches} = fullTournament();
    // 4 participants, each owns 12 teams, one from every (group? no) — just split 48.
    const participants: SimParticipant[] = [0, 1, 2, 3].map((p) => ({
      lastName: `P${p}`,
      teamIds: teams.filter((_, i) => i % 4 === p).map((t) => t.api_id),
    }));
    const chances = computeChances(teams, participants, matches, {runs: 2000, seed: 5});
    const sum = Object.values(chances).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(98);
    expect(sum).toBeLessThan(102);
  });

  it('gives the participant holding all strongest teams the highest chance', () => {
    const {teams, matches} = fullTournament();
    // P0 owns every tier-1 team (index 0 of each group); spread the rest.
    const tier1 = teams.filter((t) => t.tier === 1).map((t) => t.api_id);
    const rest = teams.filter((t) => t.tier !== 1).map((t) => t.api_id);
    const participants: SimParticipant[] = [
      {lastName: 'Strong', teamIds: [...tier1, ...rest.slice(0, 0)]},
      {lastName: 'A', teamIds: rest.slice(0, 12)},
      {lastName: 'B', teamIds: rest.slice(12, 24)},
      {lastName: 'C', teamIds: rest.slice(24, 36)},
    ];
    const chances = computeChances(teams, participants, matches, {runs: 2000, seed: 5});
    expect(chances['Strong']).toBeGreaterThan(chances['A']);
    expect(chances['Strong']).toBeGreaterThan(chances['B']);
    expect(chances['Strong']).toBeGreaterThan(chances['C']);
  });
});
```

Note: the first test's `teamIds` split (`i % 4`) gives each participant 12 teams.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `computeChances`/`SimParticipant` not exported.

- [ ] **Step 3: Add scoring + `computeChances` to `chances.ts`**

Append to `backend/src/services/chances.ts`:
```ts
// --- participant scoring & top-level Monte Carlo --------------------------

export interface SimParticipant {
  lastName: string;
  teamIds: number[];
}

export interface ChancesOptions {
  runs?: number;
  seed?: number;
}

const DEFAULT_RUNS = 20000;

/** One simulated tournament -> total points per team id. */
function simulateOnce(
  teams: SimTeam[],
  groupMatches: SimMatch[],
  rng: Rng
): Map<number, number> {
  const ratings = ratingByTeam(teams);
  const tables = simulateGroupStage(teams, groupMatches, rng);

  // group match points per team
  const points = new Map<number, number>();
  const groupQual = new Map<number, number>(); // 0 = out, 1 = reached R32
  for (const [, list] of tables) {
    for (const r of list) {
      points.set(r.teamId, r.w * 3 + r.d);
      groupQual.set(r.teamId, 0);
    }
  }

  const qualifiers = selectQualifiers(tables);
  for (const q of qualifiers) groupQual.set(q.teamId, 1);

  const ko = simulateKnockout(qualifiers, ratings, rng);
  for (const [teamId, res] of ko) {
    points.set(teamId, (points.get(teamId) ?? 0) + res.koWins * 3 + res.koDraws);
  }

  // final points = group+KO match points + advancement bonus, with the real
  // already-banked qualifications as a floor (and eliminated teams capped).
  const byId = new Map<number, SimTeam>();
  for (const t of teams) byId.set(t.api_id, t);
  const totals = new Map<number, number>();
  for (const t of teams) {
    const simQual = ko.get(t.api_id)?.qual ?? groupQual.get(t.api_id) ?? 0;
    const floored = Math.max(simQual, t.achievedQual);
    const qual = t.eliminated ? t.achievedQual : floored;
    totals.set(t.api_id, (points.get(t.api_id) ?? 0) + bonusForQual(qual));
  }
  return totals;
}

/** Run the Monte Carlo and return each participant's win % (0..100). */
export function computeChances(
  teams: SimTeam[],
  participants: SimParticipant[],
  groupMatches: SimMatch[],
  opts: ChancesOptions = {}
): Record<string, number> {
  const runs = opts.runs ?? DEFAULT_RUNS;
  const rng = mulberry32(opts.seed ?? 1);
  const wins = new Map<string, number>();
  for (const p of participants) wins.set(p.lastName, 0);

  for (let i = 0; i < runs; i++) {
    const totals = simulateOnce(teams, groupMatches, rng);
    let best = -Infinity;
    let leaders: string[] = [];
    for (const p of participants) {
      const score = p.teamIds.reduce((acc, id) => acc + (totals.get(id) ?? 0), 0);
      if (score > best) {
        best = score;
        leaders = [p.lastName];
      } else if (score === best) {
        leaders.push(p.lastName);
      }
    }
    const share = 1 / leaders.length;
    for (const name of leaders) wins.set(name, wins.get(name)! + share);
  }

  const out: Record<string, number> = {};
  for (const p of participants) {
    out[p.lastName] = Math.round((wins.get(p.lastName)! / runs) * 100);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (sum ~100; strongest participant ranked highest).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/chances.ts backend/src/services/chances.test.ts
git commit -m "feat(chances): scoring and top-level computeChances Monte Carlo"
```

---

## Task 6: Add `chances` to the Participant model

**Files:**
- Modify: `backend/src/models/Participant.ts`

- [ ] **Step 1: Add the field to the interface and schema**

In `backend/src/models/Participant.ts`:

Change the interface:
```ts
export interface IParticipant {
  firstName: string;
  lastName: string;
  teams: [ITeam];
  points: number;
  chances: number;
}
```

Add to the schema (after the `points` field):
```ts
    points: {type: Number, required: true},
    chances: {type: Number, required: false, default: 0},
    teams: [{type: Schema.Types.ObjectId, required: true, ref: 'Team'}]
```

- [ ] **Step 2: Verify it compiles**

Run (from `backend/`): `npm run build`
Expected: exit 0, no type errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/Participant.ts
git commit -m "feat(chances): add chances field to Participant model"
```

---

## Task 7: Cron entry that loads data, simulates, and persists

**Files:**
- Create: `backend/src/cron/updateChances.ts`
- Modify: `backend/package.json`

The `Match` documents store `group` as `GROUP_A` and `stage` as `GROUP_STAGE`
(see `Update.ts` `upsertMatches`). Convert `GROUP_A` -> `A` and pass only
group-stage matches to the simulator.

- [ ] **Step 1: Create `backend/src/cron/updateChances.ts`**

```ts
import mongoose from 'mongoose';
import {config} from '../config/config';
import Logging from '../library/Logging';
import Team from '../models/Team';
import Participant from '../models/Participant';
import Match from '../models/Match';
import {
  SimTeam,
  SimMatch,
  SimParticipant,
  computeChances,
} from '../services/chances';

const RUNS = Number(process.env.CHANCES_RUNS || 20000);

function groupLetter(g: string | null | undefined): string {
  if (!g) return '?';
  const m = g.match(/([A-Z])$/i);
  return m ? m[1].toUpperCase() : g.toUpperCase();
}

async function main() {
  await mongoose.connect(config.mongo.url, {retryWrites: true, w: 'majority'});
  Logging.info('Chances: connected to Mongo.');

  const teamDocs = await Team.find().lean();
  const participantDocs = await Participant.find().lean();
  const matchDocs = await Match.find({stage: 'GROUP_STAGE'}).lean();

  const teams: SimTeam[] = teamDocs.map((t: any) => ({
    api_id: t.api_id,
    group: groupLetter(t.group),
    tier: t.tier || 6,
    achievedQual: t.qualifications || 0,
    eliminated: !!t.eliminated,
  }));

  const matches: SimMatch[] = matchDocs
    .filter((m: any) => m.homeTeam?.api_id && m.awayTeam?.api_id)
    .map((m: any) => ({
      group: groupLetter(m.group),
      status: m.status,
      homeId: m.homeTeam.api_id,
      awayId: m.awayTeam.api_id,
      scoreHome: m.scoreHome ?? null,
      scoreAway: m.scoreAway ?? null,
    }));

  // map team ObjectId -> api_id so participant.teams (ObjectIds) become api_ids
  const apiIdByObjId = new Map<string, number>();
  for (const t of teamDocs as any[]) apiIdByObjId.set(String(t._id), t.api_id);

  const participants: SimParticipant[] = participantDocs.map((p: any) => ({
    lastName: p.lastName,
    teamIds: (p.teams || [])
      .map((id: any) => apiIdByObjId.get(String(id)))
      .filter((x: any): x is number => typeof x === 'number'),
  }));

  const chances = computeChances(teams, participants, matches, {
    runs: RUNS,
    seed: Date.now(),
  });

  for (const p of participantDocs as any[]) {
    const pct = chances[p.lastName] ?? 0;
    await Participant.updateOne({_id: p._id}, {$set: {chances: pct}});
    Logging.info(`Chances: ${p.lastName} = ${pct}%`);
  }

  Logging.info(`Chances: done (${RUNS} runs).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  Logging.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
```

- [ ] **Step 2: Add npm scripts**

In `backend/package.json` `scripts`, add:
```json
"cron:chances": "node ./build/cron/updateChances.js",
"cron:chances:dev": "ts-node src/cron/updateChances.ts"
```

- [ ] **Step 3: Verify build**

Run (from `backend/`): `npm run build`
Expected: exit 0, produces `build/cron/updateChances.js`.

- [ ] **Step 4: Manual smoke run against the live DB (low run count)**

Run (from `backend/`):
```bash
CHANCES_RUNS=500 MONGO_USERNAME='<user>' MONGO_PASSWORD='<pass>' npm run cron:chances:dev
```
Expected: connects, logs a percentage per participant (four values summing to ~100), exits cleanly. Pre-tournament the four values are roughly balanced.

- [ ] **Step 5: Commit**

```bash
git add backend/src/cron/updateChances.ts backend/package.json
git commit -m "feat(chances): cron entry to compute and persist participant chances"
```

---

## Task 8: Daily GitHub Actions workflow

**Files:**
- Create: `.github/workflows/chances-daily.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Cron — daily winning chances

on:
  schedule:
    # 04:00 UTC = 07:00 Israel (IDT, UTC+3) during the tournament.
    - cron: '0 4 * * *'
  workflow_dispatch:

jobs:
  chances:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - run: npm ci

      - run: npm run build

      - run: npm run cron:chances
        env:
          MONGO_USERNAME: ${{ secrets.MONGO_USERNAME }}
          MONGO_PASSWORD: ${{ secrets.MONGO_PASSWORD }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/chances-daily.yml
git commit -m "ci(chances): daily 04:00 UTC workflow to recompute chances"
```

- [ ] **Step 3: (Manual, after merge) trigger once via workflow_dispatch**

In GitHub → Actions → "Cron — daily winning chances" → Run workflow. Confirm it
succeeds and the Standings tab shows percentages. (Not an automated step.)

---

## Task 9: Show the chance chip in the Standings tab

**Files:**
- Modify: `src/app/participants/participant.model.ts`
- Modify: `src/app/participants/participant-list/participant-list.component.html`
- Modify: `src/app/participants/participant-list/participant-list.component.css`

Frontend commands run from the repo root.

- [ ] **Step 1: Add `chances` to the participant model**

In `src/app/participants/participant.model.ts`:
```ts
interface Participant {
  firstName: string;
  lastName: string;
  teams: Team[];
  position: number;
  points: number;
  chances: number;
  logo: string;
}
```

- [ ] **Step 2: Render the chip in the card header**

In `src/app/participants/participant-list/participant-list.component.html`,
replace the `<mat-panel-description>` block with:
```html
      <mat-panel-description class="participant-card__points">
        <span class="chance-chip" *ngIf="participant.chances > 0">
          <span class="chance-chip__value">{{ participant.chances }}%</span>
          <span class="chance-chip__label">win</span>
        </span>
        <span class="points-chip">
          <span class="points-chip__value">{{ participant.points }}</span>
          <span class="points-chip__label">pts</span>
        </span>
      </mat-panel-description>
```

- [ ] **Step 3: Style the chip (kept lighter than points)**

Append to `src/app/participants/participant-list/participant-list.component.css`:
```css
.chance-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  margin-right: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.04);
  color: var(--color-ink-500, #607d8b);
}

.chance-chip__value {
  font-size: 15px;
  font-weight: 600;
}

.chance-chip__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  opacity: 0.8;
}
```

- [ ] **Step 4: Verify the frontend builds**

Run (from repo root): `npx tsc -p tsconfig.app.json --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/participants/participant.model.ts \
        src/app/participants/participant-list/participant-list.component.html \
        src/app/participants/participant-list/participant-list.component.css
git commit -m "feat(chances): show winning-chance chip in Standings tab"
```

---

## Final verification

- [ ] **Backend tests pass:** `cd backend && npm test` → all green.
- [ ] **Backend builds:** `cd backend && npm run build` → exit 0.
- [ ] **Frontend type-checks:** `npx tsc -p tsconfig.app.json --noEmit` → exit 0.
- [ ] **Manual:** `cron:chances:dev` writes four percentages summing to ~100; Standings tab renders the chip.

---

## Notes / known limitations (from the spec)

- **Approximate KO bracket** (seeded, not FIFA's exact slot table) and a
  **simplified group tiebreaker** (pts → GD → GF) are intentional simplicity
  trade-offs.
- **Mid-knockout fidelity:** the bracket is re-simulated forward each run. Real
  KO progress is honored for the *bonus* via the `achievedQual` floor and the
  `eliminated` cap, but exact KO matchups already played are not pinned. The
  feature's primary window (group stage) is simulated exactly.
- **Strength constants** (`RATING_BASE`, `RATING_STEP`, `GOAL_*`) are named
  constants in `chances.ts`; tune if pre-tournament spreads look off.
```

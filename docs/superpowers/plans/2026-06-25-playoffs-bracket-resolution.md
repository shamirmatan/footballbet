# Playoffs Bracket Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the Playoffs tab with the teams that have advanced — placed into their real predefined 2026 bracket slots — as each group finishes, instead of showing all-null fixtures.

**Architecture:** A pure backend resolver (`backend/src/services/bracket.ts`) encodes the official 2026 bracket structure (FIFA matches 73–104) as data and resolves each slot from persisted `Team` standings + `Match` results. A new `GET /api/bracket` endpoint serves the resolved bracket. The Angular bracket component renders it, showing placeholders for slots not yet decided plus a "qualified 3rd-place teams" strip.

**Tech Stack:** TypeScript, Express, Mongoose (backend, jest tests); Angular 18 + Angular Material (frontend).

## Global Constraints

- Backend resolver MUST be a pure function `buildBracket(teams, matches)` — no DB access inside it (DB access lives in the controller). Mirrors `Update.ts` / `Update.test.ts`.
- `Team.group` is stored as a bare group letter (e.g. `"A"`); normalize defensively by stripping a leading `"Group "`.
- A group is **complete** only when every team in it has `games >= 3`; Winner/Runner-up slots stay placeholders until then.
- Third-place slots stay placeholders (`"Best 3rd (C/E/F/H/I)"`) until football-data's drawn fixture supplies the real team. Do NOT encode Annex C.
- Stage display order and labels match the existing component: `FINAL, THIRD_PLACE, SEMI_FINALS, QUARTER_FINALS, LAST_16, LAST_32`.
- Backend tests run with `cd backend && npx jest <pattern>`. Frontend has no unit-test suite in this repo — verify frontend tasks with `npm run build`.
- End every commit message with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

### Task 1: Bracket types + static structure table

**Files:**
- Create: `backend/src/services/bracket.ts`
- Test: `backend/src/services/bracket.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SideType = 'winner'|'runnerUp'|'third'|'matchWinner'|'matchLoser'`
  - `interface SideDef { type: SideType; group?: string; candidates?: string[]; match?: number }`
  - `interface BracketSlotDef { fifaMatch: number; stage: Stage; home: SideDef; away: SideDef }`
  - `Stage = 'LAST_32'|'LAST_16'|'QUARTER_FINALS'|'SEMI_FINALS'|'THIRD_PLACE'|'FINAL'`
  - `const BRACKET: BracketSlotDef[]` (32 entries, matches 73–104)
  - `ResolvedSide`, `BracketMatch`, `BracketStage`, `QualifiedThird`, `Bracket` interfaces (used by later tasks)

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/bracket.test.ts
import {BRACKET, BracketSlotDef} from './bracket';

describe('BRACKET structure', () => {
  it('defines all 32 knockout matches, numbered 73..104', () => {
    expect(BRACKET).toHaveLength(32);
    const numbers = BRACKET.map((s) => s.fifaMatch).sort((a, b) => a - b);
    expect(numbers[0]).toBe(73);
    expect(numbers[numbers.length - 1]).toBe(104);
    expect(new Set(numbers).size).toBe(32);
  });

  it('only references feeder matches with a lower number that exist', () => {
    const known = new Set(BRACKET.map((s) => s.fifaMatch));
    for (const slot of BRACKET) {
      for (const side of [slot.home, slot.away]) {
        if (side.type === 'matchWinner' || side.type === 'matchLoser') {
          expect(known.has(side.match!)).toBe(true);
          expect(side.match!).toBeLessThan(slot.fifaMatch);
        }
      }
    }
  });

  it('gives every Round-of-32 match at least one deterministic side', () => {
    const r32 = BRACKET.filter((s) => s.stage === 'LAST_32');
    expect(r32).toHaveLength(16);
    for (const slot of r32) {
      const deterministic = [slot.home, slot.away].some(
        (s) => s.type === 'winner' || s.type === 'runnerUp'
      );
      expect(deterministic).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest bracket`
Expected: FAIL — cannot find module `./bracket`.

- [ ] **Step 3: Write the types and static table**

```ts
// backend/src/services/bracket.ts
export type Stage =
  | 'LAST_32'
  | 'LAST_16'
  | 'QUARTER_FINALS'
  | 'SEMI_FINALS'
  | 'THIRD_PLACE'
  | 'FINAL';

export type SideType = 'winner' | 'runnerUp' | 'third' | 'matchWinner' | 'matchLoser';

export interface SideDef {
  type: SideType;
  group?: string; // winner | runnerUp
  candidates?: string[]; // third
  match?: number; // matchWinner | matchLoser
}

export interface BracketSlotDef {
  fifaMatch: number;
  stage: Stage;
  home: SideDef;
  away: SideDef;
}

export interface ResolvedSide {
  api_id: number | null;
  name: string | null;
  logo: string | null;
  resolved: boolean;
}

export interface BracketMatch {
  fifaMatch: number;
  stage: Stage;
  home: ResolvedSide;
  away: ResolvedSide;
  status: string;
  utcDate: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
}

export interface BracketStage {
  stage: Stage;
  label: string;
  matches: BracketMatch[];
}

export interface QualifiedThird {
  api_id: number;
  name: string;
  logo: string | null;
  group: string;
  in: boolean;
}

export interface Bracket {
  stages: BracketStage[];
  qualifiedThirds: QualifiedThird[];
}

const w = (group: string): SideDef => ({type: 'winner', group});
const r = (group: string): SideDef => ({type: 'runnerUp', group});
const t = (candidates: string[]): SideDef => ({type: 'third', candidates});
const mw = (match: number): SideDef => ({type: 'matchWinner', match});
const ml = (match: number): SideDef => ({type: 'matchLoser', match});

// Official 2026 knockout structure (Wikipedia "2026 FIFA World Cup knockout
// stage", match numbers 73–104). Every R32 match has at least one
// deterministic (Winner/Runner-up) side, which is how we join to football-data
// fixtures by team id instead of guessing match identity.
export const BRACKET: BracketSlotDef[] = [
  {fifaMatch: 73, stage: 'LAST_32', home: r('A'), away: r('B')},
  {fifaMatch: 74, stage: 'LAST_32', home: w('E'), away: t(['A', 'B', 'C', 'D', 'F'])},
  {fifaMatch: 75, stage: 'LAST_32', home: w('F'), away: r('C')},
  {fifaMatch: 76, stage: 'LAST_32', home: w('C'), away: r('F')},
  {fifaMatch: 77, stage: 'LAST_32', home: w('I'), away: t(['C', 'D', 'F', 'G', 'H'])},
  {fifaMatch: 78, stage: 'LAST_32', home: r('E'), away: r('I')},
  {fifaMatch: 79, stage: 'LAST_32', home: w('A'), away: t(['C', 'E', 'F', 'H', 'I'])},
  {fifaMatch: 80, stage: 'LAST_32', home: w('L'), away: t(['E', 'H', 'I', 'J', 'K'])},
  {fifaMatch: 81, stage: 'LAST_32', home: w('D'), away: t(['B', 'E', 'F', 'I', 'J'])},
  {fifaMatch: 82, stage: 'LAST_32', home: w('G'), away: t(['A', 'E', 'H', 'I', 'J'])},
  {fifaMatch: 83, stage: 'LAST_32', home: r('K'), away: r('L')},
  {fifaMatch: 84, stage: 'LAST_32', home: w('H'), away: r('J')},
  {fifaMatch: 85, stage: 'LAST_32', home: w('B'), away: t(['E', 'F', 'G', 'I', 'J'])},
  {fifaMatch: 86, stage: 'LAST_32', home: w('J'), away: r('H')},
  {fifaMatch: 87, stage: 'LAST_32', home: w('K'), away: t(['D', 'E', 'I', 'J', 'L'])},
  {fifaMatch: 88, stage: 'LAST_32', home: r('D'), away: r('G')},

  {fifaMatch: 89, stage: 'LAST_16', home: mw(74), away: mw(77)},
  {fifaMatch: 90, stage: 'LAST_16', home: mw(73), away: mw(75)},
  {fifaMatch: 91, stage: 'LAST_16', home: mw(76), away: mw(78)},
  {fifaMatch: 92, stage: 'LAST_16', home: mw(79), away: mw(80)},
  {fifaMatch: 93, stage: 'LAST_16', home: mw(83), away: mw(84)},
  {fifaMatch: 94, stage: 'LAST_16', home: mw(81), away: mw(82)},
  {fifaMatch: 95, stage: 'LAST_16', home: mw(86), away: mw(88)},
  {fifaMatch: 96, stage: 'LAST_16', home: mw(85), away: mw(87)},

  {fifaMatch: 97, stage: 'QUARTER_FINALS', home: mw(89), away: mw(90)},
  {fifaMatch: 98, stage: 'QUARTER_FINALS', home: mw(93), away: mw(94)},
  {fifaMatch: 99, stage: 'QUARTER_FINALS', home: mw(91), away: mw(92)},
  {fifaMatch: 100, stage: 'QUARTER_FINALS', home: mw(95), away: mw(96)},

  {fifaMatch: 101, stage: 'SEMI_FINALS', home: mw(97), away: mw(98)},
  {fifaMatch: 102, stage: 'SEMI_FINALS', home: mw(99), away: mw(100)},

  {fifaMatch: 103, stage: 'THIRD_PLACE', home: ml(101), away: ml(102)},
  {fifaMatch: 104, stage: 'FINAL', home: mw(101), away: mw(102)}
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest bracket`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/bracket.ts backend/src/services/bracket.test.ts
git commit -m "feat(bracket): encode official 2026 knockout structure

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Resolve standings slots + qualified thirds (no fixtures yet)

**Files:**
- Modify: `backend/src/services/bracket.ts`
- Test: `backend/src/services/bracket.test.ts`

**Interfaces:**
- Consumes: `BRACKET`, `Stage`, `ResolvedSide`, `Bracket` from Task 1; `ITeam` from `../models/Team`; `IMatch` from `../models/Match`.
- Produces: `export const buildBracket = (teams: ITeam[], matches: IMatch[]): Bracket`. In this task it resolves Winner/Runner-up/third/matchWinner sides from standings only (no football-data fixture join yet — `matches` is accepted but unused), and computes `qualifiedThirds`.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/services/bracket.test.ts`:

```ts
import {buildBracket, BracketMatch} from './bracket';
import {ITeam} from '../models/Team';

let tid = 1;
const team = (group: string, position: number, games: number, opts: Partial<ITeam> = {}): ITeam => ({
  api_id: opts.api_id ?? tid++,
  name: opts.name ?? `${group}${position}`,
  group,
  position,
  games,
  wins: 0, losses: 0, draws: 0,
  goalsFor: opts.goalsFor ?? 0, goalsAgainst: 0,
  goalDifference: opts.goalDifference ?? 0,
  totalGames: 0, totalWins: 0, totalDraws: 0, totalLosses: 0,
  totalGoalsFor: 0, totalGoalsAgainst: 0,
  points: opts.points ?? 0, qualifications: 0,
  logo: opts.logo ?? '', eliminated: false, tier: 0
} as ITeam);

// A complete 4-team group: every team has played 3.
const completeGroup = (letter: string): ITeam[] => [
  team(letter, 1, 3, {name: `Winner${letter}`}),
  team(letter, 2, 3, {name: `Runner${letter}`}),
  team(letter, 3, 3, {name: `Third${letter}`}),
  team(letter, 4, 3, {name: `Fourth${letter}`})
];

const find = (b: ReturnType<typeof buildBracket>, fifaMatch: number): BracketMatch =>
  b.stages.flatMap((s) => s.matches).find((m) => m.fifaMatch === fifaMatch)!;

describe('buildBracket standings resolution', () => {
  it('resolves Winner/Runner-up once the group is complete', () => {
    const teams = [...completeGroup('A'), ...completeGroup('B')];
    const m73 = find(buildBracket(teams, []), 73); // Runner-up A vs Runner-up B
    expect(m73.home).toMatchObject({name: 'RunnerA', resolved: true});
    expect(m73.away).toMatchObject({name: 'RunnerB', resolved: true});
  });

  it('keeps slots as placeholders while a group is incomplete', () => {
    const incompleteA = completeGroup('A').map((t) => ({...t, games: 1}));
    const m79 = find(buildBracket(incompleteA, []), 79); // Winner A vs 3rd
    expect(m79.home).toMatchObject({name: 'Winner A', resolved: false});
  });

  it('always shows third-place slots as candidate placeholders pre-draw', () => {
    const teams = completeGroup('A');
    const m79 = find(buildBracket(teams, []), 79);
    expect(m79.away).toMatchObject({name: 'Best 3rd (C/E/F/H/I)', resolved: false});
  });

  it('ranks current third-placed teams and flags the top 8 as in', () => {
    const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].flatMap((letter, i) => {
      const g = completeGroup(letter);
      g[2] = {...g[2], points: 10 - i}; // 3rd-placed team, descending points
      return g;
    });
    const {qualifiedThirds} = buildBracket(teams, []);
    expect(qualifiedThirds).toHaveLength(9);
    expect(qualifiedThirds.slice(0, 8).every((t) => t.in)).toBe(true);
    expect(qualifiedThirds[8].in).toBe(false); // 9th-best third misses out
    expect(qualifiedThirds[0]).toMatchObject({name: 'ThirdA', in: true});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest bracket`
Expected: FAIL — `buildBracket` is not exported.

- [ ] **Step 3: Implement standings resolution**

Append to `backend/src/services/bracket.ts`:

```ts
import {ITeam} from '../models/Team';
import {IMatch} from '../models/Match';

const STAGE_LABELS: Record<Stage, string> = {
  FINAL: 'Final',
  THIRD_PLACE: 'Third-place match',
  SEMI_FINALS: 'Semi-finals',
  QUARTER_FINALS: 'Quarter-finals',
  LAST_16: 'Round of 16',
  LAST_32: 'Round of 32'
};

const STAGE_ORDER: Stage[] = [
  'FINAL',
  'THIRD_PLACE',
  'SEMI_FINALS',
  'QUARTER_FINALS',
  'LAST_16',
  'LAST_32'
];

const THIRD_PLACE_SLOTS = 8;

const placeholder = (name: string): ResolvedSide => ({
  api_id: null,
  name,
  logo: null,
  resolved: false
});

const realSide = (team: ITeam): ResolvedSide => ({
  api_id: team.api_id,
  name: team.name,
  logo: team.logo || null,
  resolved: true
});

const normalizeLetter = (group: string): string =>
  (group || '?').replace(/^Group\s+/i, '').toUpperCase();

const groupsByLetter = (teams: ITeam[]): Map<string, ITeam[]> => {
  const map = new Map<string, ITeam[]>();
  for (const team of teams) {
    const letter = normalizeLetter(team.group);
    const arr = map.get(letter) ?? [];
    arr.push(team);
    map.set(letter, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => (a.position || 99) - (b.position || 99));
  }
  return map;
};

// A group is decided only once every team has played its three matches.
const isGroupComplete = (arr: ITeam[]): boolean =>
  arr.length > 0 && arr.every((team) => team.games >= arr.length - 1);

const teamAtPosition = (arr: ITeam[] | undefined, position: number): ITeam | undefined =>
  arr?.find((team) => team.position === position);

interface FeederResult {
  winner?: ResolvedSide;
  loser?: ResolvedSide;
}

const resolveSide = (
  side: SideDef,
  groups: Map<string, ITeam[]>,
  results: Map<number, FeederResult>
): ResolvedSide => {
  switch (side.type) {
    case 'winner': {
      const arr = groups.get(side.group!);
      const team = isGroupComplete(arr ?? []) ? teamAtPosition(arr, 1) : undefined;
      return team ? realSide(team) : placeholder(`Winner ${side.group}`);
    }
    case 'runnerUp': {
      const arr = groups.get(side.group!);
      const team = isGroupComplete(arr ?? []) ? teamAtPosition(arr, 2) : undefined;
      return team ? realSide(team) : placeholder(`Runner-up ${side.group}`);
    }
    case 'third':
      return placeholder(`Best 3rd (${side.candidates!.join('/')})`);
    case 'matchWinner':
      return results.get(side.match!)?.winner ?? placeholder(`Winner of M${side.match}`);
    case 'matchLoser':
      return results.get(side.match!)?.loser ?? placeholder(`Loser of M${side.match}`);
  }
};

const computeQualifiedThirds = (groups: Map<string, ITeam[]>): QualifiedThird[] => {
  const thirds: ITeam[] = [];
  for (const arr of groups.values()) {
    const third = teamAtPosition(arr, 3);
    if (third) thirds.push(third);
  }
  thirds.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.api_id - b.api_id
  );
  return thirds.map((team, i) => ({
    api_id: team.api_id,
    name: team.name,
    logo: team.logo || null,
    group: normalizeLetter(team.group),
    in: i < THIRD_PLACE_SLOTS
  }));
};

export const buildBracket = (teams: ITeam[], _matches: IMatch[]): Bracket => {
  const groups = groupsByLetter(teams);
  const results = new Map<number, FeederResult>();
  const built = new Map<number, BracketMatch>();

  // Ascending fifaMatch so feeder results exist before dependent slots resolve.
  for (const slot of [...BRACKET].sort((a, b) => a.fifaMatch - b.fifaMatch)) {
    const home = resolveSide(slot.home, groups, results);
    const away = resolveSide(slot.away, groups, results);
    built.set(slot.fifaMatch, {
      fifaMatch: slot.fifaMatch,
      stage: slot.stage,
      home,
      away,
      status: 'SCHEDULED',
      utcDate: null,
      scoreHome: null,
      scoreAway: null,
      winner: null
    });
  }

  const stages: BracketStage[] = STAGE_ORDER.filter((stage) =>
    BRACKET.some((s) => s.stage === stage)
  ).map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    matches: [...built.values()]
      .filter((m) => m.stage === stage)
      .sort((a, b) => a.fifaMatch - b.fifaMatch)
  }));

  return {stages, qualifiedThirds: computeQualifiedThirds(groups)};
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest bracket`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/bracket.ts backend/src/services/bracket.test.ts
git commit -m "feat(bracket): resolve standings slots and qualified thirds

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Join football-data fixtures (scores, opponent fill, winner) + feeder propagation

**Files:**
- Modify: `backend/src/services/bracket.ts`
- Test: `backend/src/services/bracket.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces: `buildBracket` now joins each slot to its football-data `Match` by the deterministic side's `api_id`, filling unresolved sides (e.g. drawn third-place teams), scores, status, `utcDate`, and `winner`; finished decisive matches feed their winner/loser into `matchWinner`/`matchLoser` slots.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/services/bracket.test.ts`:

```ts
import {IMatch} from '../models/Match';

const fixture = (opts: Partial<IMatch>): IMatch =>
  ({
    api_id: opts.api_id ?? 9000 + tid++,
    stage: opts.stage ?? 'LAST_32',
    group: null,
    matchday: null,
    status: opts.status ?? 'FINISHED',
    utcDate: opts.utcDate ?? '2026-06-29T19:00:00Z',
    homeTeam: opts.homeTeam ?? {api_id: null, name: null, logo: null},
    awayTeam: opts.awayTeam ?? {api_id: null, name: null, logo: null},
    scoreHome: opts.scoreHome ?? null,
    scoreAway: opts.scoreAway ?? null,
    winner: opts.winner ?? null,
    duration: null
  } as IMatch);

describe('buildBracket fixture join', () => {
  it('fills a third-place opponent and score from the drawn fixture', () => {
    const teams = completeGroup('A'); // WinnerA = position 1
    const winnerA = teams.find((t) => t.position === 1)!;
    // football-data drew M79: WinnerA (home) vs Poland (away), WinnerA won 2-1.
    const fx = fixture({
      stage: 'LAST_32',
      status: 'FINISHED',
      winner: 'HOME_TEAM',
      scoreHome: 2,
      scoreAway: 1,
      homeTeam: {api_id: winnerA.api_id, name: winnerA.name, logo: ''},
      awayTeam: {api_id: 777, name: 'Poland', logo: 'pl.png'}
    });
    const m79 = find(buildBracket(teams, [fx]), 79);
    expect(m79.home).toMatchObject({api_id: winnerA.api_id, resolved: true});
    expect(m79.away).toMatchObject({api_id: 777, name: 'Poland', resolved: true});
    expect(m79.scoreHome).toBe(2);
    expect(m79.scoreAway).toBe(1);
    expect(m79.winner).toBe('HOME_TEAM');
    expect(m79.status).toBe('FINISHED');
  });

  it('maps scores correctly when our orientation is flipped vs the fixture', () => {
    const teams = completeGroup('A');
    const winnerA = teams.find((t) => t.position === 1)!;
    // Fixture lists WinnerA as the AWAY team; our slot home is WinnerA.
    const fx = fixture({
      stage: 'LAST_32',
      status: 'FINISHED',
      winner: 'AWAY_TEAM',
      scoreHome: 0,
      scoreAway: 3,
      homeTeam: {api_id: 777, name: 'Poland', logo: 'pl.png'},
      awayTeam: {api_id: winnerA.api_id, name: winnerA.name, logo: ''}
    });
    const m79 = find(buildBracket(teams, [fx]), 79);
    expect(m79.home).toMatchObject({api_id: winnerA.api_id}); // our home stays WinnerA
    expect(m79.scoreHome).toBe(3); // WinnerA scored 3
    expect(m79.away).toMatchObject({name: 'Poland'});
    expect(m79.scoreAway).toBe(0);
    expect(m79.winner).toBe('HOME_TEAM'); // WinnerA won
  });

  it('propagates a finished R32 winner into its Round-of-16 slot', () => {
    const teams = [...completeGroup('A'), ...completeGroup('B')];
    const runnerA = teams.find((t) => t.group === 'A' && t.position === 2)!;
    const runnerB = teams.find((t) => t.group === 'B' && t.position === 2)!;
    // M73 = Runner-up A vs Runner-up B; Runner-up A wins. Feeds M90 home.
    const fx73 = fixture({
      stage: 'LAST_32',
      status: 'FINISHED',
      winner: 'HOME_TEAM',
      scoreHome: 1,
      scoreAway: 0,
      homeTeam: {api_id: runnerA.api_id, name: runnerA.name, logo: ''},
      awayTeam: {api_id: runnerB.api_id, name: runnerB.name, logo: ''}
    });
    const m90 = find(buildBracket(teams, [fx73]), 90); // home = Winner M73
    expect(m90.home).toMatchObject({api_id: runnerA.api_id, resolved: true});
  });

  it('leaves a slot unjoined (placeholder, no score) before the draw', () => {
    const teams = completeGroup('A');
    const m79 = find(buildBracket(teams, []), 79);
    expect(m79.away.resolved).toBe(false);
    expect(m79.scoreHome).toBeNull();
    expect(m79.status).toBe('SCHEDULED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest bracket`
Expected: FAIL — third-place opponent/scores not filled (no join logic yet).

- [ ] **Step 3: Implement the fixture join**

In `backend/src/services/bracket.ts`, add these helpers above `buildBracket`:

```ts
// The resolved deterministic side's team id uniquely identifies its knockout
// fixture (a team plays only one match per round), so we never need to guess
// which fixture is which by date or order.
const findFixture = (
  home: ResolvedSide,
  away: ResolvedSide,
  fixtures: IMatch[]
): IMatch | undefined => {
  const ids = [home.api_id, away.api_id].filter((x): x is number => x != null);
  if (ids.length === 0) return undefined;
  return fixtures.find((fx) => {
    const fxIds = [fx.homeTeam.api_id, fx.awayTeam.api_id].filter(
      (x): x is number => x != null
    );
    return ids.every((id) => fxIds.includes(id));
  });
};

const sideFromFixtureTeam = (team: IMatch['homeTeam']): ResolvedSide =>
  team.api_id != null
    ? {api_id: team.api_id, name: team.name, logo: team.logo, resolved: true}
    : placeholder('TBD');

interface AppliedFixture {
  home: ResolvedSide;
  away: ResolvedSide;
  scoreHome: number | null;
  scoreAway: number | null;
  winner: BracketMatch['winner'];
  status: string;
  utcDate: string;
}

// Re-orient the fixture onto our structural home/away, anchored on whichever
// side we already resolved from standings/feeders.
const applyFixture = (home: ResolvedSide, away: ResolvedSide, fx: IMatch): AppliedFixture => {
  const homeId = home.api_id;
  const awayId = away.api_id;
  let homeIsFxHome: boolean;
  if (homeId != null && homeId === fx.homeTeam.api_id) homeIsFxHome = true;
  else if (homeId != null && homeId === fx.awayTeam.api_id) homeIsFxHome = false;
  else if (awayId != null && awayId === fx.homeTeam.api_id) homeIsFxHome = false;
  else homeIsFxHome = true; // awayId matches fx.awayTeam, or harmless fallback

  const homeFxTeam = homeIsFxHome ? fx.homeTeam : fx.awayTeam;
  const awayFxTeam = homeIsFxHome ? fx.awayTeam : fx.homeTeam;

  const fxWinSide = fx.winner === 'HOME_TEAM' ? 'home' : fx.winner === 'AWAY_TEAM' ? 'away' : null;
  let winner: BracketMatch['winner'] = null;
  if (fxWinSide) {
    const ourHomeFxSide = homeIsFxHome ? 'home' : 'away';
    winner = fxWinSide === ourHomeFxSide ? 'HOME_TEAM' : 'AWAY_TEAM';
  } else if (fx.winner === 'DRAW') {
    winner = 'DRAW';
  }

  return {
    home: home.resolved ? home : sideFromFixtureTeam(homeFxTeam),
    away: away.resolved ? away : sideFromFixtureTeam(awayFxTeam),
    scoreHome: homeIsFxHome ? fx.scoreHome : fx.scoreAway,
    scoreAway: homeIsFxHome ? fx.scoreAway : fx.scoreHome,
    winner,
    status: fx.status,
    utcDate: fx.utcDate
  };
};
```

Then replace the loop body inside `buildBracket` (the `for (const slot ...)` block) with:

```ts
  const fixturesByStage = new Map<Stage, IMatch[]>();
  for (const m of _matches) {
    if (!STAGE_ORDER.includes(m.stage as Stage)) continue;
    const arr = fixturesByStage.get(m.stage as Stage) ?? [];
    arr.push(m);
    fixturesByStage.set(m.stage as Stage, arr);
  }

  for (const slot of [...BRACKET].sort((a, b) => a.fifaMatch - b.fifaMatch)) {
    let home = resolveSide(slot.home, groups, results);
    let away = resolveSide(slot.away, groups, results);

    let status = 'SCHEDULED';
    let utcDate: string | null = null;
    let scoreHome: number | null = null;
    let scoreAway: number | null = null;
    let winner: BracketMatch['winner'] = null;

    const fx = findFixture(home, away, fixturesByStage.get(slot.stage) ?? []);
    if (fx) {
      const applied = applyFixture(home, away, fx);
      home = applied.home;
      away = applied.away;
      status = applied.status;
      utcDate = applied.utcDate;
      scoreHome = applied.scoreHome;
      scoreAway = applied.scoreAway;
      winner = applied.winner;
    }

    built.set(slot.fifaMatch, {
      fifaMatch: slot.fifaMatch,
      stage: slot.stage,
      home,
      away,
      status,
      utcDate,
      scoreHome,
      scoreAway,
      winner
    });

    // Feed the result forward to matchWinner/matchLoser slots.
    if (status === 'FINISHED' && winner && winner !== 'DRAW' && home.resolved && away.resolved) {
      results.set(slot.fifaMatch, {
        winner: winner === 'HOME_TEAM' ? home : away,
        loser: winner === 'HOME_TEAM' ? away : home
      });
    }
  }
```

Rename the unused `_matches` parameter to `matches` in the `buildBracket` signature now that it is used.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest bracket`
Expected: PASS (all bracket tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/bracket.ts backend/src/services/bracket.test.ts
git commit -m "feat(bracket): join football-data fixtures and propagate winners

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `/api/bracket` endpoint

**Files:**
- Create: `backend/src/controllers/Bracket.ts`
- Create: `backend/src/routes/Bracket.ts`
- Modify: `backend/src/server.ts` (import + mount, alongside the existing route mounts near lines 6–11 and 63–64)

**Interfaces:**
- Consumes: `buildBracket` from `../services/bracket`; `Team`/`ITeam` and `Match`/`IMatch` models.
- Produces: `GET /api/bracket` returning the `Bracket` JSON.

- [ ] **Step 1: Write the controller**

```ts
// backend/src/controllers/Bracket.ts
import {Request, Response} from 'express';
import Team, {ITeam} from '../models/Team';
import Match, {IMatch} from '../models/Match';
import {buildBracket} from '../services/bracket';

export const getBracket = async (_req: Request, res: Response) => {
  try {
    const [teams, matches] = await Promise.all([
      Team.find().lean<ITeam[]>(),
      Match.find().lean<IMatch[]>()
    ]);
    res.status(200).json(buildBracket(teams, matches));
  } catch (err) {
    res.status(500).json({message: 'Failed to load bracket'});
  }
};
```

- [ ] **Step 2: Write the route**

```ts
// backend/src/routes/Bracket.ts
import express from 'express';
import {getBracket} from '../controllers/Bracket';

const router = express.Router();

router.get('/', getBracket);

export default router;
```

- [ ] **Step 3: Mount the route in `server.ts`**

Add the import alongside the other route imports (near `import matchRoutes from './routes/Matches';`):

```ts
import bracketRoutes from './routes/Bracket';
```

Add the mount alongside `router.use('/api/matches', matchRoutes);`:

```ts
  router.use('/api/bracket', bracketRoutes);
```

- [ ] **Step 4: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/Bracket.ts backend/src/routes/Bracket.ts backend/src/server.ts
git commit -m "feat(bracket): expose GET /api/bracket endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Frontend bracket model + service method

**Files:**
- Modify: `src/app/tournament/tournament.model.ts`
- Modify: `src/app/tournament/tournament.service.ts`

**Interfaces:**
- Consumes: the `/api/bracket` shape from Task 4.
- Produces: `Bracket`, `BracketStage`, `BracketMatch`, `BracketSide`, `QualifiedThird` types; `TournamentService.getBracket(): Observable<Bracket>`.

- [ ] **Step 1: Add the model types**

Append to `src/app/tournament/tournament.model.ts`:

```ts
export interface BracketSide {
  api_id: number | null;
  name: string | null;
  logo: string | null;
  resolved: boolean;
}

export interface BracketMatch {
  fifaMatch: number;
  stage: string;
  home: BracketSide;
  away: BracketSide;
  status: string;
  utcDate: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  winner: string | null;
}

export interface BracketStage {
  stage: string;
  label: string;
  matches: BracketMatch[];
}

export interface QualifiedThird {
  api_id: number;
  name: string;
  logo: string | null;
  group: string;
  in: boolean;
}

export interface Bracket {
  stages: BracketStage[];
  qualifiedThirds: QualifiedThird[];
}
```

- [ ] **Step 2: Add the service method**

In `src/app/tournament/tournament.service.ts`, add `Bracket` to the model import and add this method to the class:

```ts
  getBracket(): Observable<Bracket> {
    return this.http.get<Bracket>(`${environment.apiUrl}/bracket`);
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/tournament/tournament.model.ts src/app/tournament/tournament.service.ts
git commit -m "feat(bracket): add frontend bracket model and service method

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Render the resolved bracket + qualified-thirds strip

**Files:**
- Modify: `src/app/tournament/bracket/bracket.component.ts`
- Modify: `src/app/tournament/bracket/bracket.component.html`
- Modify: `src/app/tournament/bracket/bracket.component.css`

**Interfaces:**
- Consumes: `TournamentService.getBracket()` and the bracket types from Task 5.
- Produces: the Playoffs tab rendering resolved teams, greyed placeholders, scores, and a qualified-thirds strip.

- [ ] **Step 1: Replace the component class**

Replace the contents of `src/app/tournament/bracket/bracket.component.ts` with:

```ts
import {Component, OnInit} from '@angular/core';
import {TournamentService} from '../tournament.service';
import {BracketMatch, BracketStage, QualifiedThird} from '../tournament.model';

interface StageView extends BracketStage {
  hasLive: boolean;
  hasUpcoming: boolean;
  allFinished: boolean;
}

@Component({
  selector: 'app-bracket',
  templateUrl: './bracket.component.html',
  styleUrls: ['./bracket.component.css']
})
export class BracketComponent implements OnInit {
  stages: StageView[] = [];
  qualifiedThirds: QualifiedThird[] = [];
  loading = true;
  expanded: Record<string, boolean> = {};

  constructor(private tournamentService: TournamentService) {}

  ngOnInit(): void {
    this.tournamentService.getBracket().subscribe({
      next: (bracket) => {
        this.stages = bracket.stages.map((s) => this.decorate(s));
        this.qualifiedThirds = bracket.qualifiedThirds;
        this.initExpanded();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  private decorate(stage: BracketStage): StageView {
    return {
      ...stage,
      hasLive: stage.matches.some((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED'),
      hasUpcoming: stage.matches.some((m) => m.status === 'TIMED' || m.status === 'SCHEDULED'),
      allFinished: stage.matches.length > 0 && stage.matches.every((m) => m.status === 'FINISHED')
    };
  }

  private initExpanded(): void {
    // Expand the stage with a live match, else the nearest upcoming stage
    // (stages are ordered Final..Round of 32, so reverse to reach the earliest),
    // else the most advanced finished stage.
    const live = this.stages.find((s) => s.hasLive);
    if (live) {
      this.expanded[live.stage] = true;
      return;
    }
    const upcoming = [...this.stages].reverse().find((s) => s.hasUpcoming);
    if (upcoming) {
      this.expanded[upcoming.stage] = true;
      return;
    }
    const mostAdvancedFinished = this.stages.find((s) => s.allFinished);
    if (mostAdvancedFinished) this.expanded[mostAdvancedFinished.stage] = true;
  }

  toggle(stage: string): void {
    this.expanded[stage] = !this.expanded[stage];
  }

  isExpanded(stage: string): boolean {
    return !!this.expanded[stage];
  }

  showThirds(stage: string): boolean {
    return stage === 'LAST_32' && this.qualifiedThirds.length > 0;
  }

  private formatKickoff(utcDate: string): string {
    const d = new Date(utcDate);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  stageStatusLabel(s: StageView): string {
    if (s.hasLive) return 'Live';
    if (s.allFinished) return 'Finished';
    if (s.hasUpcoming) {
      const next = s.matches.find(
        (m) => (m.status === 'TIMED' || m.status === 'SCHEDULED') && m.utcDate
      );
      if (next && next.utcDate) {
        const d = new Date(next.utcDate);
        return `Starts ${d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}`;
      }
    }
    return '';
  }

  matchStatusLabel(m: BracketMatch): string {
    if (m.status === 'IN_PLAY' || m.status === 'PAUSED') return 'LIVE';
    if (m.status === 'FINISHED') return 'FT';
    if (m.status === 'POSTPONED') return 'Postponed';
    if (m.status === 'CANCELLED') return 'Cancelled';
    if (m.status === 'AWARDED') return 'Awarded';
    return m.utcDate ? this.formatKickoff(m.utcDate) : '';
  }

  trackByFifa(_i: number, m: BracketMatch): number {
    return m.fifaMatch;
  }

  trackByThird(_i: number, t: QualifiedThird): number {
    return t.api_id;
  }

  loser(m: BracketMatch): 'home' | 'away' | null {
    if (m.status !== 'FINISHED') return null;
    if (m.winner === 'HOME_TEAM') return 'away';
    if (m.winner === 'AWAY_TEAM') return 'home';
    return null;
  }
}
```

- [ ] **Step 2: Replace the template**

Replace the contents of `src/app/tournament/bracket/bracket.component.html` with:

```html
<div class="bracket">
  <img *ngIf="loading" class="ball-spinner" src="assets/trionda.png" alt="Loading…" />

  <p class="empty" *ngIf="!loading && stages.length === 0">
    Knockout fixtures appear once the bracket is drawn.
  </p>

  <section
    class="stage"
    *ngFor="let s of stages"
    [class.stage--open]="isExpanded(s.stage)"
  >
    <button
      type="button"
      class="stage__header"
      (click)="toggle(s.stage)"
      [attr.aria-expanded]="isExpanded(s.stage)"
    >
      <span class="stage__title">{{ s.label }}</span>
      <span class="stage__meta">
        <span class="stage__status" [ngClass]="{'stage__status--live': s.hasLive, 'stage__status--done': s.allFinished}">
          <span class="live-dot" *ngIf="s.hasLive" aria-hidden="true"></span>
          {{ stageStatusLabel(s) }}
        </span>
        <mat-icon class="stage__chevron">{{ isExpanded(s.stage) ? 'expand_less' : 'expand_more' }}</mat-icon>
      </span>
    </button>

    <div class="stage__body" *ngIf="isExpanded(s.stage)">
      <ul class="stage__matches">
        <li class="match" *ngFor="let m of s.matches; trackBy: trackByFifa" [class.match--live]="m.status === 'IN_PLAY' || m.status === 'PAUSED'">
          <div class="match__sides">
            <div class="match__side" [class.match__side--loser]="loser(m) === 'home'" [class.match__side--placeholder]="!m.home.resolved">
              <span class="match__flag">
                <img *ngIf="m.home.logo" [src]="m.home.logo" [alt]="m.home.name || 'TBD'">
              </span>
              <span class="match__name">{{ m.home.name || 'TBD' }}</span>
              <span class="match__score" *ngIf="m.scoreHome !== null">{{ m.scoreHome }}</span>
            </div>
            <div class="match__side" [class.match__side--loser]="loser(m) === 'away'" [class.match__side--placeholder]="!m.away.resolved">
              <span class="match__flag">
                <img *ngIf="m.away.logo" [src]="m.away.logo" [alt]="m.away.name || 'TBD'">
              </span>
              <span class="match__name">{{ m.away.name || 'TBD' }}</span>
              <span class="match__score" *ngIf="m.scoreAway !== null">{{ m.scoreAway }}</span>
            </div>
          </div>
          <div class="match__meta">
            <span class="match__status" [ngClass]="{'match__status--live': m.status === 'IN_PLAY' || m.status === 'PAUSED', 'match__status--final': m.status === 'FINISHED'}">
              <span class="live-dot" *ngIf="m.status === 'IN_PLAY' || m.status === 'PAUSED'" aria-hidden="true"></span>
              {{ matchStatusLabel(m) }}
            </span>
          </div>
        </li>
      </ul>

      <div class="thirds" *ngIf="showThirds(s.stage)">
        <span class="thirds__title">Qualified 3rd-place teams</span>
        <ul class="thirds__list">
          <li class="third" *ngFor="let t of qualifiedThirds; trackBy: trackByThird" [class.third--in]="t.in">
            <span class="third__flag"><img *ngIf="t.logo" [src]="t.logo" [alt]="t.name"></span>
            <span class="third__name">{{ t.name }}</span>
            <span class="third__group">{{ t.group }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</div>
```

- [ ] **Step 3: Add the new styles**

Append to `src/app/tournament/bracket/bracket.component.css`:

```css
.match__side--placeholder .match__name {
  font-style: italic;
  opacity: 0.55;
}

.match__side--placeholder .match__flag {
  opacity: 0.4;
}

.thirds {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.thirds__title {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.7;
  margin-bottom: 0.5rem;
}

.thirds__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.third {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.05);
  font-size: 0.82rem;
  opacity: 0.55;
}

.third--in {
  opacity: 1;
  background: rgba(0, 128, 0, 0.12);
  font-weight: 600;
}

.third__flag img {
  width: 18px;
  height: 13px;
  object-fit: cover;
  border-radius: 2px;
}

.third__group {
  opacity: 0.6;
  font-size: 0.72rem;
}
```

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: build succeeds with no template/type errors.

- [ ] **Step 5: Manual verification**

Start backend and frontend (per repo README), open the Playoffs tab, and confirm:
- Resolved Winner/Runner-up teams appear in their R32 slots once groups are complete; undecided slots show greyed italic placeholders (`Winner A`, `Best 3rd (C/E/F/H/I)`).
- The "Qualified 3rd-place teams" strip lists current thirds with the top 8 highlighted.
- Finished knockout matches show scores and grey out the loser.

- [ ] **Step 6: Commit**

```bash
git add src/app/tournament/bracket/bracket.component.ts src/app/tournament/bracket/bracket.component.html src/app/tournament/bracket/bracket.component.css
git commit -m "feat(bracket): render resolved playoffs bracket with thirds strip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** static structure (Task 1), Winner/Runner-up + third placeholders + qualifiedThirds (Task 2), fixture join + matchWinner propagation (Task 3), `/api/bracket` (Task 4), frontend model/service (Task 5), rendering + thirds strip (Task 6). All spec sections covered.
- **Third-place placeholders / no Annex C:** enforced in `resolveSide` (`third` always placeholder) and only overwritten by a real drawn fixture in `applyFixture`.
- **Type consistency:** `buildBracket(teams, matches)`, `ResolvedSide`, `BracketMatch.winner` union, and `QualifiedThird.in` are used identically across backend tasks; frontend mirrors them as `BracketSide`/`BracketMatch`/`QualifiedThird`.
- **Risk (documented in spec):** join assumes football-data fixtures reuse our `Team` `api_id`s once populated; pre-draw fixtures carry null teams so they never mis-join.

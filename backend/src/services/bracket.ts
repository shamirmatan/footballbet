import {ITeam} from '../models/Team';
import {IMatch} from '../models/Match';

export type Stage =
  | 'LAST_32'
  | 'LAST_16'
  | 'QUARTER_FINALS'
  | 'SEMI_FINALS'
  | 'THIRD_PLACE'
  | 'FINAL'

export type SideType = 'winner' | 'runnerUp' | 'third' | 'matchWinner' | 'matchLoser'

export interface SideDef {
  type: SideType
  group?: string
  candidates?: string[]
  match?: number
}

export interface BracketSlotDef {
  fifaMatch: number
  stage: Stage
  home: SideDef
  away: SideDef
}

export interface ResolvedSide {
  api_id: number | null
  name: string | null
  logo: string | null
  resolved: boolean
}

export interface BracketMatch {
  fifaMatch: number
  stage: Stage
  home: ResolvedSide
  away: ResolvedSide
  status: string
  utcDate: string | null
  scoreHome: number | null
  scoreAway: number | null
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
}

export interface BracketStage {
  stage: Stage
  label: string
  matches: BracketMatch[]
}

export interface QualifiedThird {
  api_id: number
  name: string
  logo: string | null
  group: string
  in: boolean
}

export interface Bracket {
  stages: BracketStage[]
  qualifiedThirds: QualifiedThird[]
}

const w = (group: string): SideDef => ({type: 'winner', group})
const r = (group: string): SideDef => ({type: 'runnerUp', group})
const t = (candidates: string[]): SideDef => ({type: 'third', candidates})
const mw = (match: number): SideDef => ({type: 'matchWinner', match})
const ml = (match: number): SideDef => ({type: 'matchLoser', match})

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
  for (const t of teams) {
    const letter = normalizeLetter(t.group);
    const arr = map.get(letter) ?? [];
    arr.push(t);
    map.set(letter, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => (a.position || 99) - (b.position || 99));
  }
  return map;
};

// A group is decided only once every team has played its three matches.
const isGroupComplete = (arr: ITeam[]): boolean =>
  arr.length > 0 && arr.every((t) => t.games >= arr.length - 1);

const teamAtPosition = (arr: ITeam[] | undefined, position: number): ITeam | undefined =>
  arr?.find((t) => t.position === position);

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
      const t = isGroupComplete(arr ?? []) ? teamAtPosition(arr, 1) : undefined;
      return t ? realSide(t) : placeholder(`Winner ${side.group}`);
    }
    case 'runnerUp': {
      const arr = groups.get(side.group!);
      const t = isGroupComplete(arr ?? []) ? teamAtPosition(arr, 2) : undefined;
      return t ? realSide(t) : placeholder(`Runner-up ${side.group}`);
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
  return thirds.map((t, i) => ({
    api_id: t.api_id,
    name: t.name,
    logo: t.logo || null,
    group: normalizeLetter(t.group),
    in: i < THIRD_PLACE_SLOTS
  }));
};

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

export const buildBracket = (teams: ITeam[], matches: IMatch[]): Bracket => {
  const groups = groupsByLetter(teams);
  const results = new Map<number, FeederResult>();
  const built = new Map<number, BracketMatch>();

  const fixturesByStage = new Map<Stage, IMatch[]>();
  for (const m of matches) {
    if (!STAGE_ORDER.includes(m.stage as Stage)) continue;
    const arr = fixturesByStage.get(m.stage as Stage) ?? [];
    arr.push(m);
    fixturesByStage.set(m.stage as Stage, arr);
  }

  // Ascending fifaMatch so feeder results exist before dependent slots resolve.
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
]

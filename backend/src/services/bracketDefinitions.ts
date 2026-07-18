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
  group?: string;
  candidates?: string[];
  match?: number;
}

export interface BracketSlotDef {
  fifaMatch: number;
  stage: Stage;
  home: SideDef;
  away: SideDef;
}

const w = (group: string): SideDef => ({type: 'winner', group});
const r = (group: string): SideDef => ({type: 'runnerUp', group});
const t = (candidates: string[]): SideDef => ({type: 'third', candidates});
const mw = (match: number): SideDef => ({type: 'matchWinner', match});
const ml = (match: number): SideDef => ({type: 'matchLoser', match});

// FIFA's published knockout draw structure for the 2026 World Cup (48 teams,
// 12 groups, top 2 + 8 best thirds reach the Round of 32). This is a fixed,
// already-announced draw sheet — not something we can derive generically.
export const WC26_BRACKET: BracketSlotDef[] = [
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

// Registry of tournaments whose knockout draw is already known/published, so
// the bracket view can show meaningful pre-draw placeholders ("Winner of
// Group E", "Best 3rd (A/B/C/D/F)") wired to the exact announced structure.
// A tournament with no entry here (e.g. Euro 2028, until UEFA publishes its
// actual Round-of-16 draw in 2027) falls back to a generic bracket built
// directly from whatever matches the data source reports — see
// buildBracket() in bracket.ts.
export const BRACKET_DEFINITIONS: Record<string, BracketSlotDef[]> = {
  wc26: WC26_BRACKET
};

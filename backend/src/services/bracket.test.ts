import {BRACKET, BracketSlotDef, buildBracket, BracketMatch} from './bracket'
import {ITeam} from '../models/Team'

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

describe('BRACKET structure', () => {
  it('defines all 32 knockout matches, numbered 73..104', () => {
    expect(BRACKET).toHaveLength(32)
    const numbers = BRACKET.map((s) => s.fifaMatch).sort((a, b) => a - b)
    expect(numbers[0]).toBe(73)
    expect(numbers[numbers.length - 1]).toBe(104)
    expect(new Set(numbers).size).toBe(32)
  })

  it('only references feeder matches with a lower number that exist', () => {
    const known = new Set(BRACKET.map((s) => s.fifaMatch))
    for (const slot of BRACKET) {
      for (const side of [slot.home, slot.away]) {
        if (side.type === 'matchWinner' || side.type === 'matchLoser') {
          expect(known.has(side.match!)).toBe(true)
          expect(side.match!).toBeLessThan(slot.fifaMatch)
        }
      }
    }
  })

  it('gives every Round-of-32 match at least one deterministic side', () => {
    const r32 = BRACKET.filter((s) => s.stage === 'LAST_32')
    expect(r32).toHaveLength(16)
    for (const slot of r32) {
      const deterministic = [slot.home, slot.away].some(
        (s) => s.type === 'winner' || s.type === 'runnerUp'
      )
      expect(deterministic).toBe(true)
    }
  })
})

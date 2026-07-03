import {BRACKET, BracketSlotDef, buildBracket, BracketMatch} from './bracket'
import {ITeam} from '../models/Team'
import {IMatch} from '../models/Match'

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
    penaltyHome: opts.penaltyHome ?? null,
    penaltyAway: opts.penaltyAway ?? null,
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

  it('passes through penalty scores and advances the shootout winner', () => {
    const teams = completeGroup('A');
    const winnerA = teams.find((t) => t.position === 1)!;
    // Level at 90' (1-1), Poland win the shootout 4-2. The feed left winner as
    // a DRAW; the resolver/bracket must still advance Poland.
    const fx = fixture({
      stage: 'LAST_32',
      status: 'FINISHED',
      winner: 'DRAW',
      scoreHome: 1,
      scoreAway: 1,
      penaltyHome: 2,
      penaltyAway: 4,
      homeTeam: {api_id: winnerA.api_id, name: winnerA.name, logo: ''},
      awayTeam: {api_id: 777, name: 'Poland', logo: 'pl.png'}
    });
    const m79 = find(buildBracket(teams, [fx]), 79);
    expect(m79.scoreHome).toBe(1);
    expect(m79.scoreAway).toBe(1);
    expect(m79.penaltyHome).toBe(2);
    expect(m79.penaltyAway).toBe(4);
    expect(m79.winner).toBe('AWAY_TEAM'); // Poland advance on penalties
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

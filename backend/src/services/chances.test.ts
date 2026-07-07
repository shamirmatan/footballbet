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

import {
  SimParticipant,
  computeChances,
  computeChancesAndPaths,
  ActualKoResult
} from './chances';

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

  it('captures a sample winning path for a likely winner', () => {
    const {teams, matches} = fullTournament();
    const participants: SimParticipant[] = [0, 1, 2, 3].map((p) => ({
      lastName: `P${p}`,
      teamIds: teams.filter((_, i) => i % 4 === p).map((t) => t.api_id)
    }));
    const {chances, paths} = computeChancesAndPaths(teams, participants, matches, {
      runs: 2000,
      seed: 5
    });
    const top = Object.entries(chances).sort((a, b) => b[1] - a[1])[0][0];
    const path = paths[top];
    expect(path).toBeTruthy();
    expect(path.teams.length).toBeGreaterThan(0);
    // The winning total is the stated margin ahead of the runner-up.
    expect(path.margin).toBeGreaterThan(0);
    // Every team's stage is within the valid 0..6 range.
    expect(path.teams.every((t) => t.stageReached >= 0 && t.stageReached <= 6)).toBe(true);
  });

  it('continues from a fully frozen bracket deterministically', () => {
    // Finished 0-0 groups (equal group points) so only the frozen knockout
    // differentiates participants — making the result deterministic.
    const letters = 'ABCDEFGHIJKL'.split('');
    const teams: SimTeam[] = [];
    const matches: SimMatch[] = [];
    let gid = 1;
    for (const g of letters) {
      const ids = [gid, gid + 1, gid + 2, gid + 3];
      for (const x of ids) teams.push({api_id: x, group: g, tier: (x % 6) + 1, achievedQual: 0, eliminated: false});
      const drawn = (h: number, a: number): SimMatch => ({group: g, status: 'FINISHED', homeId: h, awayId: a, scoreHome: 0, scoreAway: 0});
      matches.push(drawn(ids[0], ids[1]), drawn(ids[2], ids[3]), drawn(ids[0], ids[2]), drawn(ids[1], ids[3]), drawn(ids[0], ids[3]), drawn(ids[1], ids[2]));
      gid += 4;
    }
    // Freeze the whole knockout: team 1 wins every round it plays (champion),
    // with distinct teams filling the rest so nobody is double-counted.
    const ko = (fifa: number, h: number, a: number, w: number): [number, ActualKoResult] => [
      fifa,
      {finished: true, homeId: h, awayId: a, winnerId: w, drawAt90: false}
    ];
    const actualKo = new Map<number, ActualKoResult>();
    let tid = 1;
    for (let f = 73; f <= 88; f++) {
      actualKo.set(...ko(f, tid, tid + 1, tid));
      tid += 2;
    }
    const r16 = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];
    for (let i = 0, f = 89; f <= 96; f++, i += 2) actualKo.set(...ko(f, r16[i], r16[i + 1], r16[i]));
    const qf = [1, 5, 9, 13, 17, 21, 25, 29];
    for (let i = 0, f = 97; f <= 100; f++, i += 2) actualKo.set(...ko(f, qf[i], qf[i + 1], qf[i]));
    actualKo.set(...ko(101, 1, 9, 1));
    actualKo.set(...ko(102, 17, 25, 17));
    actualKo.set(...ko(103, 9, 25, 9));
    actualKo.set(...ko(104, 1, 17, 1));

    const participants: SimParticipant[] = [
      {lastName: 'A', teamIds: [1, 3, 5, 7]},
      {lastName: 'B', teamIds: [2, 9, 17, 25]},
      {lastName: 'C', teamIds: [11, 13, 19, 21]}
    ];
    const {chances, paths} = computeChancesAndPaths(teams, participants, matches, {
      runs: 500,
      seed: 5,
      actualKo
    });
    // The frozen knockout makes the result deterministic: exactly one 100.
    const values = Object.values(chances).sort((a, b) => b - a);
    expect(values[0]).toBe(100);
    expect(values[1]).toBe(0);
    // Whoever wins, the tournament champion in their path is team 1 (frozen).
    const winner = Object.entries(chances).find(([, v]) => v === 100)![0];
    expect(paths[winner].championId).toBe(1);
  });
});

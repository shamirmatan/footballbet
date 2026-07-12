import {
  aggregateTeams,
  computeGroupOutcomes,
  computeKnockoutMatchPoints,
  computeKnockoutOutcomes,
  onPitchScore,
  penaltyScore,
  resolveKnockoutWinner,
} from './Update';
import {FDMatch, FDStandingGroup, FDStandingRow, Stage} from '../services/footballData';

let nextId = 1;

const row = (
  position: number,
  playedGames: number,
  opts: Partial<FDStandingRow> = {}
): FDStandingRow => {
  const id = opts.team?.id ?? nextId++;
  return {
    position,
    playedGames,
    won: opts.won ?? 0,
    draw: opts.draw ?? 0,
    lost: opts.lost ?? 0,
    points: opts.points ?? 0,
    goalsFor: opts.goalsFor ?? 0,
    goalsAgainst: opts.goalsAgainst ?? 0,
    goalDifference: opts.goalDifference ?? 0,
    team: {id, name: `T${id}`, shortName: `T${id}`, tla: 'TTT', crest: ''},
  };
};

const group = (name: string, rows: FDStandingRow[]): FDStandingGroup => ({
  stage: 'ALL',
  group: name,
  table: rows,
});

describe('computeGroupOutcomes', () => {
  it('qualifies the top two and eliminates the bottom of a completed group', () => {
    // 2026 format: top 2 advance, 4th is always out. Mirrors the live Group A
    // (Mexico 1st, Czechia 4th) that exposed the bug.
    const first = row(1, 3, {points: 9});
    const second = row(2, 3, {points: 4});
    const third = row(3, 3, {points: 3});
    const fourth = row(4, 3, {points: 1});
    const {qualified, eliminated} = computeGroupOutcomes([
      group('Group A', [first, second, third, fourth]),
      // An unfinished group keeps the tournament from resolving third places.
      group('Group D', [row(1, 2), row(2, 2), row(3, 2), row(4, 2)]),
    ]);

    expect(qualified.has(first.team.id)).toBe(true);
    expect(qualified.has(second.team.id)).toBe(true);
    expect(eliminated.has(fourth.team.id)).toBe(true);
    // 3rd place can only be resolved once every group has finished.
    expect(qualified.has(third.team.id)).toBe(false);
    expect(eliminated.has(third.team.id)).toBe(false);
  });

  it('leaves teams in an unfinished group undecided', () => {
    const leader = row(1, 2, {points: 6});
    const bottom = row(4, 2, {points: 0});
    const {qualified, eliminated} = computeGroupOutcomes([
      group('Group D', [leader, row(2, 2), row(3, 2), bottom]),
    ]);

    expect(qualified.has(leader.team.id)).toBe(false);
    expect(eliminated.has(bottom.team.id)).toBe(false);
  });

  it('keeps the 8 best thirds and eliminates the rest once all groups finish', () => {
    // 12 completed groups -> 12 third-placed teams; only the best 8 advance.
    const groups: FDStandingGroup[] = [];
    const thirds: {id: number; points: number}[] = [];
    for (let g = 0; g < 12; g++) {
      const t1 = row(1, 3, {points: 9});
      const t2 = row(2, 3, {points: 6});
      const t3 = row(3, 3, {points: 12 - g}); // distinct: 12 (best) .. 1 (worst)
      const t4 = row(4, 3, {points: 0});
      thirds.push({id: t3.team.id, points: 12 - g});
      groups.push(group(`Group ${g}`, [t1, t2, t3, t4]));
    }

    const {qualified, eliminated} = computeGroupOutcomes(groups);
    const ranked = [...thirds].sort((a, b) => b.points - a.points);
    for (const t of ranked.slice(0, 8)) {
      expect(qualified.has(t.id)).toBe(true);
    }
    for (const t of ranked.slice(8)) {
      expect(eliminated.has(t.id)).toBe(true);
      expect(qualified.has(t.id)).toBe(false);
    }
  });
});

// --- knockout (result-based, independent of next-fixture population) --------

let koId = 1000;
const team = (id: number) => ({id, name: `T${id}`, shortName: `T${id}`, tla: 'TTT', crest: ''});

const koMatch = (
  stage: Stage,
  homeId: number,
  awayId: number,
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null,
  status: FDMatch['status'] = 'FINISHED',
  duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' = 'REGULAR',
  opts: {
    fullTime?: {home: number; away: number};
    penalties?: {home: number; away: number};
  } = {}
): FDMatch => ({
  id: koId++,
  stage,
  group: null,
  matchday: null,
  status,
  utcDate: '2026-07-01T00:00:00Z',
  homeTeam: team(homeId),
  awayTeam: team(awayId),
  score: {
    winner,
    duration,
    fullTime:
      opts.fullTime ?? {home: winner === 'HOME_TEAM' ? 1 : 0, away: winner === 'AWAY_TEAM' ? 1 : 0},
    halfTime: {home: 0, away: 0},
    ...(opts.penalties ? {penalties: opts.penalties} : {}),
  },
});

describe('computeKnockoutOutcomes', () => {
  it('keeps a R32 winner alive even when the R16 fixture is not yet drawn', () => {
    // The core later-stage regression: winner has no upcoming match because the
    // next round is still TBD. It must NOT be marked eliminated.
    const out = computeKnockoutOutcomes([koMatch('LAST_32', 1, 2, 'HOME_TEAM')]);
    expect(out.get(1)).toEqual({reachedRank: 2, eliminated: false}); // reached R16
    expect(out.get(2)).toEqual({reachedRank: 1, eliminated: true}); // out at R32
  });

  it('advances the penalty-shootout winner', () => {
    const out = computeKnockoutOutcomes([
      koMatch('QUARTER_FINALS', 1, 2, 'AWAY_TEAM', 'FINISHED', 'PENALTY_SHOOTOUT'),
    ]);
    expect(out.get(2)!.eliminated).toBe(false);
    expect(out.get(2)!.reachedRank).toBe(4); // QF win -> reached SF
    expect(out.get(1)).toEqual({reachedRank: 3, eliminated: true});
  });

  it('does not eliminate a semi-final loser until the third-place match is played', () => {
    const out = computeKnockoutOutcomes([koMatch('SEMI_FINALS', 1, 2, 'HOME_TEAM')]);
    expect(out.get(2)).toEqual({reachedRank: 4, eliminated: false}); // SF loser -> 3rd place
    expect(out.get(1)).toEqual({reachedRank: 5, eliminated: false}); // SF winner -> final
  });

  it('eliminates both teams once the third-place match is finished', () => {
    const out = computeKnockoutOutcomes([
      koMatch('SEMI_FINALS', 1, 2, 'HOME_TEAM'),
      koMatch('THIRD_PLACE', 2, 3, 'HOME_TEAM'),
    ]);
    expect(out.get(2)).toEqual({reachedRank: 4, eliminated: true}); // bronze winner, done
    expect(out.get(3)).toEqual({reachedRank: 4, eliminated: true}); // bronze loser, done
  });

  it('crowns the final winner and eliminates the runner-up', () => {
    const out = computeKnockoutOutcomes([koMatch('FINAL', 1, 2, 'AWAY_TEAM')]);
    expect(out.get(2)).toEqual({reachedRank: 6, eliminated: false}); // champion
    expect(out.get(1)).toEqual({reachedRank: 5, eliminated: true}); // runner-up
  });

  it('tracks the deepest stage when a team has several knockout results', () => {
    const out = computeKnockoutOutcomes([
      koMatch('LAST_32', 1, 9, 'HOME_TEAM'),
      koMatch('LAST_16', 1, 8, 'HOME_TEAM'),
      koMatch('QUARTER_FINALS', 1, 7, 'AWAY_TEAM'), // team 1 loses the QF
    ]);
    expect(out.get(1)).toEqual({reachedRank: 3, eliminated: true}); // reached QF, out there
  });
});

describe('resolveKnockoutWinner', () => {
  const score = (
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null,
    fullTime: {home: number; away: number},
    penalties?: {home: number; away: number}
  ): FDMatch['score'] => ({
    winner,
    duration: penalties ? 'PENALTY_SHOOTOUT' : 'REGULAR',
    fullTime,
    halfTime: {home: 0, away: 0},
    ...(penalties ? {penalties} : {}),
  });

  it('uses the explicit decisive winner when present', () => {
    expect(resolveKnockoutWinner(score('AWAY_TEAM', {home: 1, away: 0}))).toBe('AWAY_TEAM');
  });

  it('breaks a draw on the penalty shootout score', () => {
    // Tie at 90/120 reported as a DRAW; the shootout decides who advances.
    expect(resolveKnockoutWinner(score('DRAW', {home: 4, away: 4}, {home: 3, away: 5}))).toBe(
      'AWAY_TEAM'
    );
  });

  it('falls back to the scoreline when winner is missing', () => {
    expect(resolveKnockoutWinner(score(null, {home: 5, away: 4}))).toBe('HOME_TEAM');
  });

  it('returns null when nothing distinguishes the sides', () => {
    expect(resolveKnockoutWinner(score('DRAW', {home: 1, away: 1}))).toBeNull();
  });
});

describe('onPitchScore / penaltyScore', () => {
  const score = (
    duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT',
    fullTime: {home: number; away: number},
    extra?: Partial<FDMatch['score']>
  ): FDMatch['score'] => ({
    winner: null,
    duration,
    fullTime,
    halfTime: {home: 0, away: 0},
    ...extra,
  });

  it('shows the regulation score for a normal knockout result', () => {
    const s = score('REGULAR', {home: 2, away: 1});
    expect(onPitchScore(s)).toEqual({home: 2, away: 1});
    expect(penaltyScore(s)).toBeNull();
  });

  it('sums regulation + extra time for a penalty result (no goals in ET)', () => {
    // 1-1 after 90', 0-0 in extra time, shootout 4-2. fullTime carries the
    // shootout; the 120' score is regularTime + extraTime = 1-1.
    const s = score('PENALTY_SHOOTOUT', {home: 4, away: 2}, {
      regularTime: {home: 1, away: 1},
      extraTime: {home: 0, away: 0},
      penalties: {home: 4, away: 2},
    });
    expect(onPitchScore(s)).toEqual({home: 1, away: 1}); // NOT 4-2 and NOT 0-0
    expect(penaltyScore(s)).toEqual({home: 4, away: 2});
  });

  it('sums goals scored during extra time into the 120-minute score', () => {
    // 1-1 after 90', then one goal each in ET (2-2), shootout 5-4.
    const s = score('PENALTY_SHOOTOUT', {home: 5, away: 4}, {
      regularTime: {home: 1, away: 1},
      extraTime: {home: 1, away: 1},
      penalties: {home: 5, away: 4},
    });
    expect(onPitchScore(s)).toEqual({home: 2, away: 2});
    expect(penaltyScore(s)).toEqual({home: 5, away: 4});
  });

  it('treats fullTime as the shootout when penalties are not broken out', () => {
    const s = score('PENALTY_SHOOTOUT', {home: 5, away: 4}, {
      regularTime: {home: 1, away: 1},
      extraTime: {home: 0, away: 0},
    });
    expect(onPitchScore(s)).toEqual({home: 1, away: 1});
    expect(penaltyScore(s)).toEqual({home: 5, away: 4});
  });

  it('uses the extra-time score for an extra-time winner', () => {
    const s = score('EXTRA_TIME', {home: 2, away: 1}, {
      regularTime: {home: 1, away: 1},
      extraTime: {home: 2, away: 1},
    });
    expect(onPitchScore(s)).toEqual({home: 2, away: 1});
    expect(penaltyScore(s)).toBeNull();
  });
});

describe('computeKnockoutOutcomes (penalty/extra-time winners)', () => {
  it('credits a penalty-shootout winner reported as a DRAW with the advancement', () => {
    // The exact bug: the feed leaves winner=DRAW and only records the shootout,
    // so the winner must still be marked as having reached the next round.
    const out = computeKnockoutOutcomes([
      koMatch('LAST_32', 1, 2, 'DRAW', 'FINISHED', 'PENALTY_SHOOTOUT', {
        fullTime: {home: 4, away: 4},
        penalties: {home: 3, away: 5},
      }),
    ]);
    expect(out.get(2)).toEqual({reachedRank: 2, eliminated: false}); // pens winner -> R16
    expect(out.get(1)).toEqual({reachedRank: 1, eliminated: true}); // pens loser out
  });
});

describe('computeKnockoutMatchPoints', () => {
  it('awards a regulation knockout win as a 3-point win to the winner only', () => {
    const pts = computeKnockoutMatchPoints([koMatch('LAST_32', 1, 2, 'HOME_TEAM')]);
    expect(pts.get(1)).toEqual({koWins: 1, koDraws: 0});
    // The loser earns nothing, so it never gets a map entry (defaults to 0 in
    // aggregateTeams).
    expect(pts.get(2)).toBeUndefined();
  });

  it('scores a tie at 90 settled on penalties as a draw for both sides', () => {
    const pts = computeKnockoutMatchPoints([
      koMatch('QUARTER_FINALS', 1, 2, 'AWAY_TEAM', 'FINISHED', 'PENALTY_SHOOTOUT'),
    ]);
    expect(pts.get(1)).toEqual({koWins: 0, koDraws: 1});
    expect(pts.get(2)).toEqual({koWins: 0, koDraws: 1});
  });

  it('scores an extra-time decider as a draw at 90 for both sides', () => {
    const pts = computeKnockoutMatchPoints([
      koMatch('LAST_16', 1, 2, 'HOME_TEAM', 'FINISHED', 'EXTRA_TIME'),
    ]);
    expect(pts.get(1)).toEqual({koWins: 0, koDraws: 1});
    expect(pts.get(2)).toEqual({koWins: 0, koDraws: 1});
  });

  it('ignores group-stage and genuinely unplayed matches', () => {
    const pts = computeKnockoutMatchPoints([
      koMatch('GROUP_STAGE' as Stage, 1, 2, 'HOME_TEAM'),
      koMatch('LAST_32', 3, 4, null, 'TIMED', 'REGULAR', {fullTime: {home: 0, away: 0}}),
    ]);
    expect(pts.size).toBe(0);
  });

  it('counts a decided knockout tie the feed still flags as scheduled', () => {
    // Data lag: status TIMED but a real 2-3 result is in — treat it as played.
    const pts = computeKnockoutMatchPoints([
      koMatch('LAST_32', 5, 6, 'AWAY_TEAM', 'TIMED', 'REGULAR', {fullTime: {home: 2, away: 3}}),
    ]);
    expect(pts.get(6)).toEqual({koWins: 1, koDraws: 0}); // away side banked the win
  });

  it('accumulates points across a multi-round knockout run', () => {
    const pts = computeKnockoutMatchPoints([
      koMatch('LAST_32', 1, 9, 'HOME_TEAM'), // regulation win: +3
      koMatch('LAST_16', 1, 8, 'AWAY_TEAM', 'FINISHED', 'PENALTY_SHOOTOUT'), // pens: draw
    ]);
    expect(pts.get(1)).toEqual({koWins: 1, koDraws: 1}); // 3 + 1 = 4 KO match points
  });
});

describe('aggregateTeams (knockout integration)', () => {
  it('does not eliminate a R32 winner whose next fixture is still TBD', () => {
    // Group A finished; team 1 then won its R32 match. The R16 fixture has no
    // ids yet (TBD), so the old has-upcoming-match logic would wrongly drop it.
    const standings: FDStandingGroup[] = [
      {
        stage: 'ALL',
        group: 'Group A',
        table: [
          {position: 1, playedGames: 3, won: 3, draw: 0, lost: 0, points: 9, goalsFor: 6, goalsAgainst: 1, goalDifference: 5, team: team(1)},
          {position: 2, playedGames: 3, won: 1, draw: 1, lost: 1, points: 4, goalsFor: 3, goalsAgainst: 3, goalDifference: 0, team: team(2)},
          {position: 3, playedGames: 3, won: 1, draw: 0, lost: 2, points: 3, goalsFor: 2, goalsAgainst: 3, goalDifference: -1, team: team(3)},
          {position: 4, playedGames: 3, won: 0, draw: 1, lost: 2, points: 1, goalsFor: 1, goalsAgainst: 5, goalDifference: -4, team: team(4)},
        ],
      },
    ];
    // Team 1 won its R32 match; the R16 fixture is still TBD, so it is simply
    // absent / id-less here — exactly the state that broke the old logic.
    const matches: FDMatch[] = [koMatch('LAST_32', 1, 50, 'HOME_TEAM')];

    const aggregates = aggregateTeams(standings, matches);
    const t1 = aggregates.find((a) => a.api_id === 1)!;
    expect(t1.eliminated).toBe(false);
    expect(t1.qualifications).toBe(2); // banked "reached R16" without the fixture
    // 4th place is still correctly eliminated from the group stage.
    expect(aggregates.find((a) => a.api_id === 4)!.eliminated).toBe(true);
  });
});

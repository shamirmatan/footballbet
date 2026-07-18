import {qualificationRank} from './qualificationRank';

const WC26_STAGES = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'];
const EURO_STAGES = ['LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'];

describe('qualificationRank', () => {
  it('reproduces the original WC26 QUALIFICATION_RANK table (reaching, not winning)', () => {
    expect(qualificationRank('LAST_32', WC26_STAGES, false)).toBe(1);
    expect(qualificationRank('LAST_16', WC26_STAGES, false)).toBe(2);
    expect(qualificationRank('QUARTER_FINALS', WC26_STAGES, false)).toBe(3);
    expect(qualificationRank('SEMI_FINALS', WC26_STAGES, false)).toBe(4);
    expect(qualificationRank('FINAL', WC26_STAGES, false)).toBe(5);
  });

  it('reproduces the original WC26 REACHED_ON_WIN table (winning/advancing)', () => {
    expect(qualificationRank('LAST_32', WC26_STAGES, true)).toBe(2);
    expect(qualificationRank('LAST_16', WC26_STAGES, true)).toBe(3);
    expect(qualificationRank('QUARTER_FINALS', WC26_STAGES, true)).toBe(4);
    expect(qualificationRank('SEMI_FINALS', WC26_STAGES, true)).toBe(5);
    expect(qualificationRank('FINAL', WC26_STAGES, true)).toBe(6); // champion
  });

  it('compresses ranks for a shorter bracket instead of inheriting WC26 stage-name values', () => {
    // Euro's Round of 16 is its FIRST knockout round — must rank 1 (like WC26's
    // Round of 32), not 2 (WC26's Round of 16 value), even though both are
    // named "LAST_16".
    expect(qualificationRank('LAST_16', EURO_STAGES, false)).toBe(1);
    expect(qualificationRank('QUARTER_FINALS', EURO_STAGES, false)).toBe(2);
    expect(qualificationRank('SEMI_FINALS', EURO_STAGES, false)).toBe(3);
    expect(qualificationRank('FINAL', EURO_STAGES, false)).toBe(4);
    expect(qualificationRank('FINAL', EURO_STAGES, true)).toBe(5); // champion
  });

  it('ranks GROUP_STAGE, THIRD_PLACE, and unknown stages as 0', () => {
    expect(qualificationRank('GROUP_STAGE', WC26_STAGES, false)).toBe(0);
    expect(qualificationRank('THIRD_PLACE', WC26_STAGES, false)).toBe(0);
    expect(qualificationRank('THIRD_PLACE', WC26_STAGES, true)).toBe(0);
  });
});

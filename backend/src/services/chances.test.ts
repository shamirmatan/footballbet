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

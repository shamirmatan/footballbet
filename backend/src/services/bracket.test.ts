import {BRACKET, BracketSlotDef} from './bracket'

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

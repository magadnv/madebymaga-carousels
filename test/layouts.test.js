import { describe, it, expect } from 'vitest'
import { layouts, resolveLayout } from '../src/layouts.js'
import { KEYS, measure, P0 } from '../src/geometry.js'

const rest = { pos: 0, vel: 0, hold: 0, intro: 1 }
const sizes = [measure(1440, 900), measure(390, 844)]

describe.each(Object.values(layouts))('$name', (L) => {
  it('returns a full, finite pose for every card', () => {
    for (const S of sizes) {
      for (const s of [rest, { ...rest, hold: 1 }, { ...rest, intro: 0 }, { ...rest, vel: 0.4 }]) {
        for (let d = -8; d <= 8; d += 0.25) {
          const P = L.layout(d, s, S, 16)
          KEYS.forEach((k) => expect(Number.isFinite(P[k]), `${k} at d=${d}`).toBe(true))
        }
      }
    }
  })

  it('the front card sits in the middle, fully visible, on top', () => {
    const S = sizes[0]
    const front = L.layout(0, rest, S, 14)
    expect(Math.abs(front.X)).toBeLessThan(1e-6)
    expect(front.OP).toBeGreaterThan(0.99)
    for (const d of [-2, -1, 1, 2]) expect(front.ZI).toBeGreaterThan(L.layout(d, rest, S, 14).ZI)
  })

  it('is mirror-symmetric around the front card', () => {
    const S = sizes[0]
    for (const d of [0.5, 1, 2.5, 4]) {
      const r = L.layout(d, rest, S, 14)
      const l = L.layout(-d, rest, S, 14)
      expect(r.X).toBeCloseTo(-l.X, 6)
      expect(r.OP).toBeCloseTo(l.OP, 6)
    }
  })

  it('one unit of drag moves about one card', () => {
    expect(L.unit(sizes[0])).toBeGreaterThan(0)
  })
})

it('drift spreads out and greys the sides while held', () => {
  const S = sizes[0]
  const loose = layouts.drift.layout(2, rest, S, 12)
  const held = layouts.drift.layout(2, { ...rest, hold: 1 }, S, 12)
  expect(Math.abs(held.X)).toBeGreaterThan(Math.abs(loose.X))
  expect(held.G).toBeGreaterThan(0.5)
  expect(layouts.drift.layout(0, { ...rest, hold: 1 }, S, 12).G).toBe(0)
})

it('orbit tilts further when held', () => {
  const S = sizes[0]
  expect(layouts.orbit.layout(0, { ...rest, hold: 1 }, S, 16).TX).toBeLessThan(layouts.orbit.layout(0, rest, S, 16).TX)
})

describe('resolveLayout', () => {
  it('accepts names and custom layouts', () => {
    expect(resolveLayout('fan')).toBe(layouts.fan)
    const own = { name: 'line', unit: () => 100, layout: (d) => ({ ...P0, X: d * 100 }) }
    expect(resolveLayout(own)).toBe(own)
  })
  it('explains what is wrong', () => {
    expect(() => resolveLayout('wheel')).toThrow(/unknown layout "wheel"/)
    expect(() => resolveLayout({})).toThrow(/layout\(\) and unit\(\)/)
  })
})

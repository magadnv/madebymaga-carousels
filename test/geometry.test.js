import { describe, it, expect } from 'vitest'
import { wrap, mod, smooth, blend, P0, KEYS, offscreen, facing, measure, visEdge } from '../src/geometry.js'
import { drift, orbit, fan } from '../src/layouts.js'

const S = measure(1440, 900)

describe('loop math', () => {
  it('wrap gives the shortest signed distance on a loop', () => {
    expect(wrap(0, 12)).toBe(0)
    expect(wrap(11, 12)).toBe(-1)
    expect(wrap(-11, 12)).toBe(1)
    expect(wrap(5.5, 12)).toBe(5.5)
    for (let x = -40; x <= 40; x += 0.75) {
      const w = wrap(x, 12)
      expect(w).toBeGreaterThanOrEqual(-6)
      expect(w).toBeLessThan(6)
      expect(mod(w - x, 12)).toBeCloseTo(0)
    }
  })

  it('mod is always positive', () => {
    expect(mod(-1, 12)).toBe(11)
    expect(mod(25, 12)).toBe(1)
  })

  it('smooth is clamped and symmetric', () => {
    expect(smooth(0, 1, -1)).toBe(0)
    expect(smooth(0, 1, 2)).toBe(1)
    expect(smooth(0, 1, 0.5)).toBeCloseTo(0.5)
  })

  it('blend hits both ends exactly', () => {
    const a = { ...P0, X: -100, OP: 0 }
    const b = { ...P0, X: 300, OP: 1 }
    expect(blend(a, b, 0)).toEqual(a)
    expect(blend(a, b, 1)).toEqual(b)
    expect(blend(a, b, 0.25).X).toBe(0)
  })
})

describe('projection', () => {
  it('a card in the centre is visible and faces the camera', () => {
    const P = { ...P0 }
    expect(offscreen(P, S).off).toBe(false)
    expect(facing(P, S)).toBe(1)
  })

  it('a card far outside the container is invisible', () => {
    expect(offscreen({ ...P0, X: S.vw * 2 }, S).off).toBe(true)
    expect(offscreen({ ...P0, X: -S.vw * 2 }, S).off).toBe(true)
    expect(offscreen({ ...P0, Y: S.vh * 2 }, S).off).toBe(true)
  })

  it('a card standing edge-on has no area', () => {
    expect(offscreen({ ...P0, TY: 90 }, S).off).toBe(true)
  })

  it('a card turned round shows its back', () => {
    expect(facing({ ...P0, TY: 180 }, S)).toBe(-1)
  })

  it('measure keeps cards 4:5 and inside the container height', () => {
    for (const [w, h] of [[1440, 900], [390, 844], [1024, 400]]) {
      const m = measure(w, h)
      expect(m.W / m.H).toBeCloseTo(0.8)
      expect(m.H).toBeLessThanOrEqual(h * 0.4 + 1e-9)
    }
  })
})

describe('morph edges', () => {
  const rest = { pos: 0, vel: 0, hold: 0, intro: 1 }

  it('finds an invisible spot between drift and fan on both sides', () => {
    for (const t of [0, 0.5, 1]) {
      const r = visEdge(drift, rest, 12, fan, rest, 14, t, S, 1)
      const l = visEdge(drift, rest, 12, fan, rest, 14, t, S, -1)
      expect(r).not.toBeNull()
      expect(l).not.toBeNull()
      expect(r).toBeLessThan(7)
    }
  })

  it('on the ring a card is hidden before or at edge-on', () => {
    // the ring is wider than the container, so cards leave at the sides
    // before they stand edge-on, a quarter of the way round (16 / 4 = 4)
    const e = visEdge(orbit, rest, 16, orbit, rest, 16, 0, S, 1)
    expect(e).toBeGreaterThan(1)
    expect(e).toBeLessThanOrEqual(4)
    // in a narrow portrait container the ring still hides cards in time
    const p = measure(390, 844)
    expect(visEdge(orbit, rest, 16, orbit, rest, 16, 0, p, -1)).toBeLessThanOrEqual(4)
  })
})

it('every pose key is a number', () => {
  expect(KEYS).toHaveLength(15)
  KEYS.forEach((k) => expect(typeof P0[k]).toBe('number'))
})

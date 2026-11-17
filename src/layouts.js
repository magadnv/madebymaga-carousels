import { P0, clamp, smooth, depth } from './geometry.js'

/* ------------------------------------------------------------------
   A layout is a plain object:
     name     string
     unit(S)  pixels of drag that move the carousel by one card
     layout(d, s, S, n) -> pose
       d  signed distance of this card from the front card (float)
       s  motion state { pos, vel, hold (0..1), intro (0..1) }
       S  sizes from measure()
       n  number of cards
   A pose uses the shared grid from geometry.js (P0), so any two layouts
   can morph into each other.
------------------------------------------------------------------- */

/** N° 01 Drift: a band with inner parallax and a speed lean. Hold spreads it out and greys the rest. */
export const drift = {
  name: 'drift',
  unit: (S) => S.W * 1.07,
  layout(d, s, S, n) {
    const gap = S.W * (1.07 + 0.28 * s.hold)
    const ad = Math.abs(d)
    const near = Math.max(0, 1 - ad)
    const scale = (1 + 0.32 * near) * (1 - 0.1 * s.hold * (1 - near))
    // intro: cards unfold from the centre, staggered by distance
    const li = smooth(ad * 0.08, ad * 0.08 + 0.68, s.intro)
    const x = (d * gap + Math.sign(d) * Math.min(ad, 1) * S.W * 0.13) * li
    return depth(
      {
        ...P0,
        X: x,
        Y: (1 - li) * S.H * 0.18,
        SK: clamp(s.vel * -55, -9, 9),
        SC: scale,
        OP: (1 - smooth(n / 2 - 0.45, n / 2 - 0.05, ad)) * smooth(0, 0.6, li),
        ZI: 100 - Math.round(ad * 10),
        IX: -clamp(d, -1.6, 1.6) * 9,
        IS: 1.3,
        G: s.hold * smooth(0.25, 0.9, ad),
      },
      ad,
      S
    )
  },
}

/** N° 02 Orbit: a ring in space. Hold tilts the view from above. */
export const orbit = {
  name: 'orbit',
  // a closed ring: switching to or from it travels half way round
  ring: true,
  unit: (S) => S.R * 0.36,
  layout(d, s, S, n) {
    const tilt = -7 - 15 * s.hold
    const lift = -S.R * Math.sin((-tilt * Math.PI) / 180) * 0.5
    const a = (d / n) * 360 + (1 - s.intro) * -140
    const front = Math.cos((a * Math.PI) / 180)
    const li = smooth((Math.abs(d) / n) * 0.6, (Math.abs(d) / n) * 0.6 + 0.7, s.intro)
    return {
      ...P0,
      Y: lift,
      Z: -S.R,
      TX: tilt,
      TY: a,
      R: S.R * (0.35 + 0.65 * s.intro),
      RZ: clamp(s.vel * -40, -8, 8) * front,
      OP: li * (0.55 + 0.45 * smooth(-0.6, 0.9, front)),
      ZI: Math.round(front * 100) + 100,
      // tied to the angle: runs smoothly all the way round, no jump at the back
      IX: -Math.sin((a * Math.PI) / 180) * 10,
      IS: 1.18,
      B: 1 - 0.18 * (1 - smooth(-0.2, 1, front)),
    }
  },
}

/** N° 03 Fan: cards sit on a huge arc whose centre lies below the container. */
export const fan = {
  name: 'fan',
  unit: (S) => S.fanR * ((S.fanStep * Math.PI) / 180),
  layout(d, s, S, n) {
    const ad = Math.abs(d)
    // intro: the arc rises from below and turns in
    const li = smooth(ad * 0.05, ad * 0.05 + 0.7, s.intro)
    const deg = d * S.fanStep + (1 - li) * -12
    const th = (deg * Math.PI) / 180
    return depth(
      {
        ...P0,
        X: Math.sin(th) * S.fanR,
        Y: (1 - Math.cos(th)) * S.fanR + (1 - li) * S.H * 0.8,
        RZ: deg + clamp(s.vel * -25, -5, 5),
        SC: 0.9 + 0.1 * Math.max(0, 1 - ad),
        OP: smooth(0, 0.4, li) * (1 - smooth(n / 2 - 0.6, n / 2 - 0.1, ad)),
        ZI: 100 - Math.round(ad * 10),
        IX: -clamp(d, -1.5, 1.5) * 5,
        IS: 1.12,
      },
      ad,
      S
    )
  },
}

export const layouts = { drift, orbit, fan }

/** Turn a name or a custom layout object into a layout. */
export function resolveLayout(l) {
  if (typeof l === 'string') {
    const found = layouts[l]
    if (!found) throw new Error(`carousels: unknown layout "${l}", use ${Object.keys(layouts).join(', ')} or a layout object`)
    return found
  }
  if (l && typeof l.layout === 'function' && typeof l.unit === 'function') return l
  throw new Error('carousels: a layout needs layout() and unit()')
}

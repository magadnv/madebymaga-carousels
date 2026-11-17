/* ------------------------------------------------------------------
   Pure math. No DOM, no GSAP: everything here is unit-tested.
------------------------------------------------------------------- */

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, t) => a + (b - a) * t

/** Smoothstep between e0 and e1. */
export const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Shortest signed distance on a loop of length n, in [-n/2, n/2). */
export const wrap = (x, n) => ((((x + n / 2) % n) + n) % n) - n / 2

/** Positive modulo. */
export const mod = (x, n) => ((x % n) + n) % n

/**
 * Every layout describes a card on the same grid:
 * translate3d(X,Y,Z) rotateX(TX) rotateY(TY) translateZ(R) rotateZ(RZ)
 * skewX(SK) scale(SC), plus opacity OP, stacking ZI, inner image shift IX
 * and scale IS, grayscale G and brightness B.
 * Because the grid is shared, any layout can morph into any other.
 */
export const P0 = Object.freeze({
  X: 0, Y: 0, Z: 0, TX: 0, TY: 0, R: 0, RZ: 0, SK: 0, SC: 1,
  OP: 1, ZI: 0, IX: 0, IS: 1, G: 0, B: 1,
})
export const KEYS = Object.keys(P0)

/** Linear blend of two poses. */
export function blend(a, b, t) {
  const o = {}
  for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t
  return o
}

/**
 * Real depth: the centre sits in front, the sides behind it. Perspective is
 * compensated, so the picture looks the same but the stacking order is
 * physically correct.
 */
export function depth(P, ad, S) {
  const z = ad * 90
  const f = (S.persp + z) / S.persp
  P.Z = -z
  P.X *= f
  P.Y *= f
  P.SC *= f
  return P
}

/** The four corners of a card, rotated and projected like the browser does. */
export function project(P, S) {
  const rz = (P.RZ * Math.PI) / 180
  const ty = (P.TY * Math.PI) / 180
  const tx = (P.TX * Math.PI) / 180
  const hw = (S.W / 2) * P.SC
  const hh = (S.H / 2) * P.SC
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x0, y0]) => {
    let x = x0 * Math.cos(rz) - y0 * Math.sin(rz)
    let y = x0 * Math.sin(rz) + y0 * Math.cos(rz)
    let z = P.R
    ;[x, z] = [x * Math.cos(ty) + z * Math.sin(ty), -x * Math.sin(ty) + z * Math.cos(ty)]
    ;[y, z] = [y * Math.cos(tx) - z * Math.sin(tx), y * Math.sin(tx) + z * Math.cos(tx)]
    x += P.X
    y += P.Y
    z += P.Z
    const k = S.persp / (S.persp - z)
    return [x * k, y * k]
  })
}

/**
 * Is a card invisible? Either all corners are outside the viewport,
 * or it stands edge-on and has (almost) no area. The signed area flips
 * when a card turns past edge-on.
 */
export function offscreen(P, S) {
  const pts = project(P, S)
  const m = 2
  const hx = S.vw / 2
  const hy = S.vh / 2
  let area = 0
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % 4]
    area += x1 * y2 - x2 * y1
  }
  const off =
    pts.every((q) => q[0] > hx + m) ||
    pts.every((q) => q[0] < -hx - m) ||
    pts.every((q) => q[1] > hy + m) ||
    pts.every((q) => q[1] < -hy - m) ||
    Math.abs(area) / 2 < S.W * S.H * 0.002
  return { off, area }
}

/**
 * First invisible position on one side (sign = +1 right, -1 left) of the
 * blended shape between layout a and layout b at mix t. Cards may only swap
 * their photo while passing this point, so nobody sees the swap.
 * Returns null if every position is visible.
 */
export function visEdge(a, sa, na, b, sb, nb, t, S, sign) {
  const lim = Math.min(na, nb) / 2
  let prev = null
  for (let d = 0.5; d < lim; d += 0.05) {
    const o = offscreen(blend(a.layout(sign * d, sa, S, na), b.layout(sign * d, sb, S, nb), t), S)
    if (o.off) return d
    if (prev !== null && Math.sign(o.area) !== Math.sign(prev)) return d
    prev = o.area
  }
  return null
}

/**
 * Which side of the card faces the camera: +1 front, -1 back.
 * Card normal against the way to the camera, so the image flips exactly
 * when the card is edge-on, not when the browser guesses.
 */
export function facing(P, S) {
  const ty = (P.TY * Math.PI) / 180
  const tx = (P.TX * Math.PI) / 180
  const nx = Math.sin(ty)
  const ny = -Math.cos(ty) * Math.sin(tx)
  const nz = Math.cos(ty) * Math.cos(tx)
  const px = P.X + P.R * nx
  const py = P.Y + P.R * ny
  const pz = P.Z + P.R * nz
  return nx * -px + ny * -py + nz * (S.persp - pz) >= 0 ? 1 : -1
}

/** Card and ring sizes for a container of vw x vh pixels. */
export function measure(vw, vh) {
  const H = Math.min(vh * 0.4, vw * 0.62)
  const W = H * 0.8
  // ring wider than the container, so it runs out at the sides
  const R = Math.max(vw * 0.72, W * 2.6)
  // fan: arc spacing from card width, a tighter arc in portrait
  const fanR = vw > vh ? Math.max(vh * 1.5, vw * 0.9) : vh * 0.85
  const fanStep = ((W * 0.72) / fanR) * (180 / Math.PI)
  const persp = Math.max(1200, vw * 2)
  return { vw, vh, W, H, R, fanR, fanStep, persp }
}

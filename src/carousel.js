import { gsap } from 'gsap'
import { clamp, lerp, mod, wrap, blend, visEdge, facing, measure } from './geometry.js'
import { resolveLayout } from './layouts.js'

/* ------------------------------------------------------------------
   Every frame reads from one state: pos (float index), vel, hold (0..1)
   and intro (0..1). Drag, wheel, keys and autoplay only ever write to
   target, so every motion stays soft.
------------------------------------------------------------------- */

const DEFAULTS = {
  layout: 'drift',
  repeat: 'auto',
  autoplay: false,
  wheel: 'x',
  keyboard: true,
  hold: true,
  credits: true,
  intro: true,
  reducedMotion: 'auto',
  label: 'Carousel',
}
const MIN_CARDS = 12
const HOLD_MS = 240
const AUTOPLAY_MS = 2400

function normalizeItems(list) {
  if (!Array.isArray(list) || !list.length) throw new Error('carousels: pass at least one item in options.items')
  return list.map((it, i) => {
    const item = typeof it === 'string' ? { src: it } : { ...it }
    if (!item.src) throw new Error(`carousels: item ${i} has no src`)
    return item
  })
}

/** How often the items repeat, so a ring or band is always full. */
export function repeatFor(repeat, len) {
  if (repeat === 'auto') return Math.max(1, Math.ceil(MIN_CARDS / len))
  return Math.max(1, Math.round(Number(repeat) || 1))
}

const div = (cls) => {
  const el = document.createElement('div')
  el.className = cls
  return el
}

/**
 * Create a carousel inside a container. The container needs a size;
 * the carousel fills it and runs over its edges.
 * @param {HTMLElement|string} target element or selector
 * @param {import('../types/index').CarouselOptions} options
 * @returns {import('../types/index').Carousel}
 */
export function createCarousel(target, options = {}) {
  const root = typeof target === 'string' ? document.querySelector(target) : target
  if (!root) throw new Error('carousels: container not found')
  const o = { ...DEFAULTS, ...options }
  const reduce =
    o.reducedMotion === 'auto'
      ? typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
      : !!o.reducedMotion

  let items = normalizeItems(o.items)
  let cfg = resolveLayout(o.layout)
  let S = measure(1, 1)
  const s = { pos: 0, target: 0, vel: 0, hold: 0, holdTarget: 0, intro: 1, driven: false }

  let layer = null
  let ring = null
  let cards = []
  let morph = null
  let switching = false
  let pending = null
  let autoplay = o.autoplay ? (o.autoplay === true ? AUTOPLAY_MS : Number(o.autoplay)) : 0
  let lastStep = performance.now()
  let lastIdx = -1
  let creditOn = null
  let down = null
  let holdTimer = 0
  let wheelTimer = 0
  let visible = true
  let dirty = true
  let idleDrawn = false
  let destroyed = false
  const listeners = {}
  const emit = (type, detail) => (listeners[type] || []).slice().forEach((fn) => fn(detail))

  /* ---------- container ---------- */
  const setAttrs = []
  const setAttr = (k, v) => {
    if (root.hasAttribute(k)) return
    root.setAttribute(k, v)
    setAttrs.push(k)
  }
  const hadClass = root.hasAttribute('class')
  root.classList.add('mbm-carousel')
  setAttr('role', 'region')
  setAttr('aria-roledescription', 'carousel')
  setAttr('aria-label', o.label)
  if (o.keyboard) setAttr('tabindex', '0')
  const live = div('mbm-live')
  live.setAttribute('aria-live', 'polite')
  root.appendChild(live)

  function size() {
    const r = root.getBoundingClientRect()
    S = measure(r.width || root.clientWidth || 1, r.height || root.clientHeight || 1)
    root.querySelectorAll('.mbm-layer').forEach((l) => (l.style.perspective = `${S.persp}px`))
    const all = morph ? cards.concat(morph.from.cards) : cards
    all.forEach((c) => {
      c.el.style.width = `${S.W}px`
      c.el.style.height = `${S.H}px`
    })
    dirty = true
  }

  function makeCard(item, i) {
    const el = div('mbm-card')
    el.dataset.i = String(i)
    const face = div('mbm-face')
    const img = document.createElement('img')
    img.src = item.src
    img.alt = item.alt ?? item.title ?? ''
    img.draggable = false
    img.decoding = 'async'
    face.appendChild(img)
    let credit = null
    if (o.credits && item.credit) {
      credit = div('mbm-credit')
      const inner = document.createElement('span')
      inner.className = 'mbm-credit-in'
      const label = document.createElement('span')
      label.className = 'mbm-credit-label'
      label.textContent = item.credit.label ?? 'Photo by'
      const name = document.createElement(item.credit.url ? 'a' : 'span')
      name.className = 'mbm-credit-name'
      name.textContent = item.credit.name ?? ''
      if (item.credit.url) {
        name.href = item.credit.url
        name.target = '_blank'
        name.rel = 'noopener'
      }
      inner.append(label, name)
      credit.appendChild(inner)
      face.appendChild(credit)
    }
    const back = div('mbm-back')
    back.style.visibility = 'hidden'
    // the back shows the same photo, mirrored back the right way round
    const backImg = img.cloneNode()
    backImg.alt = ''
    back.appendChild(backImg)
    el.append(face, back)
    ring.appendChild(el)
    return { el, img, backImg, face, back, credit, item, index: i % items.length, side: 1 }
  }

  function build(keepLayer) {
    // while morphing, new cards share the old layer, so every card sorts
    // in front of or behind its neighbour by its real position
    if (!keepLayer) {
      layer = div('mbm-layer')
      layer.setAttribute('aria-hidden', 'true')
      ring = div('mbm-ring')
      layer.appendChild(ring)
      root.insertBefore(layer, live)
    }
    layer.dataset.layout = cfg.name ?? ''
    const len = items.length
    const n = len * repeatFor(o.repeat, len)
    cards = Array.from({ length: n }, (_, i) => makeCard(items[i % len], i))
    size()
  }

  function apply(c, P, zBoost = 0) {
    c.el.style.zIndex = String(Math.round(P.ZI) * 2 + zBoost)
    c.el.style.opacity = clamp(P.OP, 0, 1).toFixed(3)
    c.el.style.transform =
      `translate(-50%,-50%) translate3d(${P.X.toFixed(2)}px,${P.Y.toFixed(2)}px,${P.Z.toFixed(2)}px) ` +
      `rotateX(${P.TX.toFixed(3)}deg) rotateY(${P.TY.toFixed(3)}deg) translateZ(${P.R.toFixed(2)}px) ` +
      `rotateZ(${P.RZ.toFixed(3)}deg) skewX(${P.SK.toFixed(3)}deg) scale(${P.SC.toFixed(4)})`
    c.img.style.transform = `translate3d(${P.IX.toFixed(2)}%,0,0) scale(${P.IS.toFixed(3)})`
    c.backImg.style.transform = `translate3d(${(-P.IX).toFixed(2)}%,0,0) scale(${P.IS.toFixed(3)})`
    const f = (P.G > 0.01 ? `grayscale(${P.G.toFixed(2)}) ` : '') + (P.B < 0.995 ? `brightness(${P.B.toFixed(3)})` : '')
    c.img.style.filter = f
    c.backImg.style.filter = f
    const side = facing(P, S)
    if (side !== c.side) {
      c.side = side
      c.face.style.visibility = side > 0 ? '' : 'hidden'
      c.back.style.visibility = side > 0 ? 'hidden' : ''
    }
  }

  /* ---------- credit ---------- */
  function showCredit(c) {
    hideCredit()
    creditOn = c
    const inner = c.credit.firstChild
    gsap.killTweensOf([c.credit, inner])
    gsap.set(c.credit, { visibility: 'visible' })
    if (reduce) {
      gsap.set(c.credit, { clipPath: 'inset(0% 0% 0% 0%)' })
      gsap.set(inner, { xPercent: 0, opacity: 1 })
      return
    }
    gsap.fromTo(c.credit, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.7, ease: 'expo.out' })
    gsap.fromTo(inner, { xPercent: -30, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.8, ease: 'expo.out', delay: 0.05 })
  }
  function hideCredit() {
    if (!creditOn) return
    const c = creditOn
    creditOn = null
    gsap.killTweensOf([c.credit, c.credit.firstChild])
    if (reduce) {
      gsap.set(c.credit, { visibility: 'hidden' })
      return
    }
    gsap.to(c.credit, {
      clipPath: 'inset(0% 0% 0% 100%)',
      duration: 0.45,
      ease: 'power3.in',
      onComplete: () => gsap.set(c.credit, { visibility: 'hidden' }),
    })
  }

  /** The front card was tapped (or Enter pressed). */
  function select(c) {
    if (c.credit) creditOn === c ? hideCredit() : showCredit(c)
    emit('select', { index: c.index, item: c.item })
  }

  /* ---------- index ---------- */
  function updateIndex() {
    const n = cards.length
    const idx = mod(Math.round(s.pos), n)
    if (idx === lastIdx) return
    const direction = lastIdx === -1 || mod(idx - lastIdx, n) <= n / 2 ? 1 : -1
    lastIdx = idx
    hideCredit()
    const c = cards[idx]
    live.textContent = `${c.index + 1} / ${items.length}${c.item.title ? `: ${c.item.title}` : ''}`
    emit('change', { index: c.index, item: c.item, total: items.length, direction })
  }

  const step = (by) => {
    s.target = Math.round(s.target) + by
    lastStep = performance.now()
  }

  function goTo(index) {
    const n = cards.length
    const t = Math.round(s.target)
    let best = null
    cards.forEach((c, k) => {
      if (c.index !== mod(index, items.length)) return
      const d = wrap(k - t, n)
      if (best === null || Math.abs(d) < Math.abs(best)) best = d
    })
    if (best !== null) step(best)
  }

  /* ---------- morph between layouts ---------- */
  function setLayout(next, opts = {}) {
    if (destroyed || switching) return Promise.resolve(false)
    const nextCfg = resolveLayout(next)
    const nextItems = opts.items ? normalizeItems(opts.items) : items
    if (nextCfg === cfg && nextItems === items) return Promise.resolve(true)
    const dir = opts.direction < 0 ? -1 : 1
    switching = true
    hideCredit()

    // the old carousel stays where it is and becomes part of the morph
    const from = { cfg, layer, ring, cards, st: { ...s, holdTarget: 0 } }
    cfg = nextCfg
    items = nextItems

    if (reduce) {
      from.cards.forEach((c) => c.el.remove())
      build(true)
      Object.assign(s, { pos: 0, target: 0, vel: 0, hold: 0, holdTarget: 0, intro: 1 })
      lastIdx = 0
      switching = false
      emit('layoutchange', { layout: cfg.name, items, direction: dir, duration: 0 })
      return Promise.resolve(true)
    }

    gsap.to(from.st, { hold: 0, duration: 0.6, ease: 'power2.out' })
    build(true)
    // travel far enough that every visible card passes an invisible spot
    // once; on a ring that means half way round
    const nNew = cards.length
    const nOld = from.cards.length
    const st1 = { ...s, intro: 1, hold: 0, vel: 0 }
    const lim = Math.min(nOld, nNew) / 2
    const Emax = Math.max(
      ...[0, 0.5, 1].flatMap((tt) => [1, -1].map((sg) => visEdge(from.cfg, from.st, nOld, cfg, st1, nNew, tt, S, sg) ?? lim))
    )
    const ringTravel = Math.max(from.cfg.ring ? nOld / 2 : 0, cfg.ring ? nNew / 2 : 0)
    const travel = Math.ceil(Math.max(2 * Emax, ringTravel)) + 1
    const Emax0 = visEdge(from.cfg, from.st, nOld, cfg, st1, nNew, 0, S, 1) ?? Emax
    from.cards.forEach((c) => ((c.crossed = false), (c.inside = undefined)))

    const frac = from.st.pos - Math.round(from.st.pos)
    s.pos = -dir * travel + frac
    s.target = 0
    s.vel = from.st.vel
    s.hold = s.holdTarget = 0
    s.intro = 1
    lastIdx = 0
    morph = { from, t: 0, start: s.pos, Er: Emax0, El: Emax0 }
    from.start = from.st.pos
    s.driven = true
    // starts like a normal step, glides, brakes softly
    const duration = 1.1 + travel * 0.2
    emit('layoutchange', { layout: cfg.name, items, direction: dir, duration })
    return new Promise((resolve) => {
      pending = resolve
      gsap.to(s, { pos: 0, duration, ease: 'power2.inOut' })
      // the shape only changes once the band is already moving
      gsap.to(morph, {
        t: 1,
        duration: duration * 0.8,
        delay: duration * 0.12,
        ease: 'sine.inOut',
        onComplete() {
          from.cards.forEach((c) => c.el.remove())
          morph = null
          s.driven = false
          switching = false
          pending = null
          resolve(true)
        },
      })
    })
  }

  /* ---------- input ---------- */
  function onDown(e) {
    if (switching || e.target.closest('a') || (e.pointerType === 'mouse' && e.button !== 0)) return
    try {
      root.setPointerCapture(e.pointerId)
    } catch {}
    const now = performance.now()
    down = { x: e.clientX, start: s.target, moved: false, held: false, vx: 0, lx: e.clientX, lt: now }
    if (o.hold) {
      holdTimer = setTimeout(() => {
        if (down && !down.moved) {
          down.held = true
          s.holdTarget = 1
        }
      }, HOLD_MS)
    }
  }

  function onMove(e) {
    if (!down) return
    const dx = e.clientX - down.x
    if (!down.moved && Math.abs(dx) > 6 && !down.held) {
      down.moved = true
      clearTimeout(holdTimer)
      root.classList.add('mbm-dragging')
      hideCredit()
    }
    if (down.moved || down.held) {
      const now = performance.now()
      down.vx = lerp(down.vx, (e.clientX - down.lx) / Math.max(1, now - down.lt), 0.4)
      down.lx = e.clientX
      down.lt = now
      s.target = down.start - dx / cfg.unit(S)
      lastStep = now
    }
  }

  function onUp(e) {
    if (!down) return
    clearTimeout(holdTimer)
    root.classList.remove('mbm-dragging')
    if (down.moved || down.held) {
      s.target = Math.round(s.target - (down.vx * 140) / cfg.unit(S))
    } else if (e.type === 'pointerup') {
      // pointer capture makes the container the target, so find the real card
      const hit = document.elementFromPoint?.(e.clientX, e.clientY)?.closest('.mbm-card')
      if (hit && hit.parentElement === ring) {
        const i = Number(hit.dataset.i)
        const d = wrap(i - s.target, cards.length)
        if (Math.abs(d) < 0.5) select(cards[i])
        else s.target = Math.round(s.target + d)
      } else hideCredit()
    }
    s.holdTarget = 0
    down = null
    lastStep = performance.now()
  }

  function onWheel(e) {
    if (!o.wheel) return
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
    // 'x' leaves vertical scrolling to the page
    if (o.wheel === 'x' && !horizontal) return
    e.preventDefault()
    if (switching) return
    const delta = horizontal ? e.deltaX : e.deltaY
    s.target += (delta / cfg.unit(S)) * 0.7
    lastStep = performance.now()
    clearTimeout(wheelTimer)
    wheelTimer = setTimeout(() => (s.target = Math.round(s.target)), 140)
  }

  function onKey(e) {
    if (!o.keyboard || e.target !== root) return
    if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'Enter' || e.key === ' ') select(cards[mod(Math.round(s.target), cards.length)])
    else return
    e.preventDefault()
  }

  root.addEventListener('pointerdown', onDown)
  root.addEventListener('pointermove', onMove)
  root.addEventListener('pointerup', onUp)
  root.addEventListener('pointercancel', onUp)
  root.addEventListener('wheel', onWheel, { passive: false })
  root.addEventListener('keydown', onKey)

  let ro = null
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(size)
    ro.observe(root)
  } else addEventListener('resize', size)

  // no work while the carousel is scrolled out of view
  let io = null
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) dirty = true
    })
    io.observe(root)
  }

  /* ---------- loop ---------- */
  function tick() {
    if (!cards.length || !visible) return
    const now = performance.now()
    if (autoplay && !down && !switching && now - lastStep > autoplay) step(1)
    const prev = s.pos
    if (!s.driven) s.pos += (s.target - s.pos) * (reduce ? 0.35 : down?.moved ? 0.24 : 0.075)
    s.vel = reduce ? 0 : lerp(s.vel, s.pos - prev, 0.25)
    s.hold += (s.holdTarget - s.hold) * 0.08

    // at rest nothing is written to the DOM
    const still =
      !morph &&
      !s.driven &&
      s.intro === 1 &&
      Math.abs(s.target - s.pos) < 1e-4 &&
      Math.abs(s.vel) < 1e-6 &&
      Math.abs(s.holdTarget - s.hold) < 1e-4
    if (still) {
      if (idleDrawn && !dirty) return
      s.pos = s.target
      s.hold = s.holdTarget
      idleDrawn = true
    } else idleDrawn = false
    dirty = false

    const n = cards.length
    if (morph) {
      // old and new cards stand on the same spots, the shape travels from
      // old to new, and each card swaps its photo only while it passes an
      // invisible spot: the edge for band and arc, edge-on for the ring
      const f = morph.from
      const t = morph.t
      const nOld = f.cards.length
      const Er = visEdge(f.cfg, f.st, nOld, cfg, s, n, t, S, 1) ?? morph.Er
      const El = visEdge(f.cfg, f.st, nOld, cfg, s, n, t, S, -1) ?? morph.El
      morph.Er = Er
      morph.El = El
      const crossing = (c, d) => {
        const inside = d >= 0 ? d < Er : -d < El
        if (c.inside !== undefined && inside !== c.inside) c.crossed = true
        c.inside = inside
      }
      f.st.pos = f.start + (s.pos - morph.start)
      f.st.vel = s.vel
      f.cards.forEach((c, i) => {
        const d = wrap(i - f.st.pos, nOld)
        crossing(c, d)
        const P = blend(f.cfg.layout(d, f.st, S, nOld), cfg.layout(d, s, S, n), t)
        if (c.crossed) P.OP = 0
        apply(c, P)
      })
      cards.forEach((c, i) => {
        const d = wrap(i - s.pos, n)
        crossing(c, d)
        // shown once it has passed the invisible spot, or if no old card
        // stands at its place, then it stays shown
        if (c.crossed || Math.abs(d) > nOld / 2 - 0.5) c.shown = true
        const P = blend(f.cfg.layout(d, f.st, S, nOld), cfg.layout(d, s, S, n), t)
        if (!c.shown) P.OP = 0
        apply(c, P, 1)
      })
    } else {
      cards.forEach((c, i) => apply(c, cfg.layout(wrap(i - s.pos, n), s, S, n)))
    }
    if (!switching) updateIndex()
  }

  /* ---------- start ---------- */
  build(false)
  lastIdx = 0
  if (o.intro && !reduce) {
    s.intro = 0
    switching = true
    gsap.fromTo(layer, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power1.out' })
    gsap.to(s, { intro: 1, duration: 1.6, ease: 'power3.out', onComplete: () => (switching = false) })
  }
  gsap.ticker.add(tick)

  function destroy() {
    if (destroyed) return
    destroyed = true
    gsap.ticker.remove(tick)
    const all = morph ? cards.concat(morph.from.cards) : cards
    gsap.killTweensOf([s, morph, morph?.from.st, layer, ...all.flatMap((c) => (c.credit ? [c.credit, c.credit.firstChild] : []))].filter(Boolean))
    clearTimeout(holdTimer)
    clearTimeout(wheelTimer)
    root.removeEventListener('pointerdown', onDown)
    root.removeEventListener('pointermove', onMove)
    root.removeEventListener('pointerup', onUp)
    root.removeEventListener('pointercancel', onUp)
    root.removeEventListener('wheel', onWheel)
    root.removeEventListener('keydown', onKey)
    if (ro) ro.disconnect()
    else removeEventListener('resize', size)
    io?.disconnect()
    root.querySelectorAll(':scope > .mbm-layer').forEach((l) => l.remove())
    live.remove()
    root.classList.remove('mbm-carousel', 'mbm-dragging')
    if (!hadClass && !root.classList.length) root.removeAttribute('class')
    setAttrs.forEach((k) => root.removeAttribute(k))
    cards = []
    morph = null
    pending?.(false)
    pending = null
    for (const k in listeners) delete listeners[k]
  }

  return {
    next: () => step(1),
    prev: () => step(-1),
    goTo,
    setLayout,
    play(ms) {
      autoplay = ms || AUTOPLAY_MS
      lastStep = performance.now()
    },
    pause() {
      autoplay = 0
    },
    on(type, fn) {
      ;(listeners[type] ||= []).push(fn)
      return () => (listeners[type] = (listeners[type] || []).filter((f) => f !== fn))
    },
    destroy,
    get index() {
      return cards.length ? cards[mod(Math.round(s.target), cards.length)].index : 0
    },
    get item() {
      return items[this.index]
    },
    get items() {
      return items.slice()
    },
    get layout() {
      return cfg.name
    },
    get playing() {
      return autoplay > 0
    },
    get element() {
      return root
    },
  }
}

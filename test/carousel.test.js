import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { gsap } from 'gsap'
import { createCarousel, repeatFor } from '../src/carousel.js'

const items = Array.from({ length: 6 }, (_, i) => ({
  src: `/img/${i}.jpg`,
  title: `Photo ${i + 1}`,
  credit: { name: `Person ${i + 1}`, url: `https://example.com/${i}` },
}))

// jsdom has no layout: give the container a size and drive frames by hand
let el
const frames = (n = 1) => {
  for (let i = 0; i < n; i++) gsap.ticker.tick()
}
beforeEach(() => {
  el = document.createElement('div')
  el.getBoundingClientRect = () => ({ width: 1200, height: 800, top: 0, left: 0, right: 1200, bottom: 800 })
  document.body.appendChild(el)
})
afterEach(() => el.remove())

describe('repeatFor', () => {
  it('fills at least 12 cards on auto', () => {
    expect(repeatFor('auto', 6)).toBe(2)
    expect(repeatFor('auto', 7)).toBe(2)
    expect(repeatFor('auto', 3)).toBe(4)
    expect(repeatFor('auto', 20)).toBe(1)
    expect(repeatFor(3, 6)).toBe(3)
    expect(repeatFor(0, 6)).toBe(1)
  })
})

describe('createCarousel', () => {
  it('builds cards, repeats items and sets accessible attributes', () => {
    const c = createCarousel(el, { items, intro: false })
    expect(el.querySelectorAll('.mbm-card')).toHaveLength(12)
    expect(el.getAttribute('aria-roledescription')).toBe('carousel')
    expect(el.getAttribute('tabindex')).toBe('0')
    expect(el.querySelector('.mbm-card img').alt).toBe('Photo 1')
    expect(el.querySelector('.mbm-credit-name').href).toBe('https://example.com/0')
    expect(c.layout).toBe('drift')
    c.destroy()
  })

  it('accepts plain strings and a selector', () => {
    el.id = 'stage'
    const c = createCarousel('#stage', { items: ['/a.jpg', '/b.jpg'], intro: false })
    expect(el.querySelectorAll('.mbm-card')).toHaveLength(12)
    c.destroy()
  })

  it('throws clear errors', () => {
    expect(() => createCarousel('#nope', { items })).toThrow(/container not found/)
    expect(() => createCarousel(el, { items: [] })).toThrow(/at least one item/)
    expect(() => createCarousel(el, { items: [{}] })).toThrow(/no src/)
  })

  it('steps with next, prev and goTo and reports changes', () => {
    const c = createCarousel(el, { items, intro: false })
    const seen = []
    c.on('change', (e) => seen.push(e.index))
    c.next()
    frames(200)
    expect(c.index).toBe(1)
    c.prev()
    c.prev()
    frames(200)
    expect(c.index).toBe(5)
    c.goTo(2)
    frames(200)
    expect(c.index).toBe(2)
    expect(seen).toContain(1)
    expect(seen.at(-1)).toBe(2)
    expect(el.querySelector('.mbm-live').textContent).toBe('3 / 6: Photo 3')
    c.destroy()
  })

  it('goTo takes the short way round', () => {
    const c = createCarousel(el, { items, intro: false })
    const off = c.on('change', (e) => expect(e.direction).toBe(-1))
    c.goTo(5)
    frames(200)
    expect(c.index).toBe(5)
    off()
    c.destroy()
  })

  it('arrow keys move while focused', () => {
    const c = createCarousel(el, { items, intro: false })
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    frames(200)
    expect(c.index).toBe(1)
    c.destroy()
  })

  it('autoplay steps on its own and can be paused', () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    const c = createCarousel(el, { items, intro: false, autoplay: 500 })
    expect(c.playing).toBe(true)
    vi.advanceTimersByTime(600)
    frames(1)
    expect(c.index).toBe(1)
    c.pause()
    expect(c.playing).toBe(false)
    vi.advanceTimersByTime(2000)
    frames(1)
    expect(c.index).toBe(1)
    c.destroy()
    vi.useRealTimers()
  })

  it('morphs into another layout with new items', async () => {
    const c = createCarousel(el, { items, intro: false, reducedMotion: true })
    const events = []
    c.on('layoutchange', (e) => events.push(e))
    const ok = await c.setLayout('orbit', { items: items.slice(0, 4) })
    expect(ok).toBe(true)
    expect(c.layout).toBe('orbit')
    expect(c.items).toHaveLength(4)
    expect(el.querySelectorAll('.mbm-card')).toHaveLength(12)
    expect(events[0]).toMatchObject({ layout: 'orbit', duration: 0 })
    c.destroy()
  })

  it('refuses a second morph while one is running', async () => {
    const c = createCarousel(el, { items, intro: false })
    const first = c.setLayout('fan')
    expect(await c.setLayout('orbit')).toBe(false)
    c.destroy()
    expect(await first).toBe(false)
  })

  it('destroy leaves the container exactly as it was', () => {
    el.setAttribute('aria-label', 'Mine')
    const before = el.outerHTML
    const add = vi.spyOn(gsap.ticker, 'add')
    const remove = vi.spyOn(gsap.ticker, 'remove')
    const c = createCarousel(el, { items })
    c.destroy()
    expect(el.outerHTML).toBe(before)
    expect(remove).toHaveBeenCalledWith(add.mock.calls[0][0])
    // a second destroy is harmless
    c.destroy()
    add.mockRestore()
    remove.mockRestore()
  })
})

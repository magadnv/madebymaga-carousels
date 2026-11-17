// The demo uses the package exactly like anyone who installs it.
import '../../src/carousels.css'
import './demo.css'
import { gsap } from 'gsap'
import { createCarousel } from '../../src/index.js'

// dev only: access for tests (e.g. slow motion)
if (import.meta.env.DEV) window.__gsap = gsap

const pad = (n) => String(n).padStart(2, '0')
const mod = (x, n) => ((x % n) + n) % n

/* ---------- photos and credits ---------- */
const SETS = {
  '01': ['Upward', 'Timber', 'Fog Tower', 'Rear Light', 'Narrow Street', 'Lone Tree'],
  '02': ['Corner Office', 'Stairs', 'Huddle', 'Bow', 'Finish', 'Tee', 'Ascent', 'Aim High'],
  '03': ['Underfoot', 'Temple', 'Monolith', 'Autumn Frame', 'Spire', 'Green Corner', 'Crossing'],
}
const ph = (name, id) => ({ name, url: `https://unsplash.com/photos/${id}` })
// Pinterest: author unknown, so honestly "Found on Pinterest" with a link to the pin
const pin = (id) => ({ label: 'Found on', name: 'Pinterest', url: `https://www.pinterest.com/pin/${id}/` })
const CREDITS = {
  '01': [
    ph('Alexander Kaufmann', 'AmFOtBst8VI'),
    ph('Alexander Kaufmann', 'OVaIF2qj3-A'),
    ph('Arlind Photography', 'GMryDEOKFpE'),
    ph('Benjamin Szabo', 'H0irkxlAQzk'),
    ph('Bruno da Costa', 'DHjzGzw5fl8'),
    ph('SAJAD FI', 'hfp6P8YDFhU'),
  ],
  '02': [
    pin('715087247128778152'),
    pin('578994095832308719'),
    pin('212865519883335671'),
    pin('384776361936692572'),
    pin('1090434128552997076'),
    pin('835558537160978572'),
    pin('953003971159736693'),
    pin('1056516393864865239'),
  ],
  '03': [
    ph('Georgi Kalaydzhiev', 'NNaNpDns_HE'),
    ph('netograph .capture', 'GZ1WAGjnTnA'),
    ph('Warren Griffiths', 'UpFq4YfDAMU'),
    ph('yang jia', 'De-LSx-7X1c'),
    ph('Keithen Schwahn', 'mFjzQgNtXLU'),
    ph('Keithen Schwahn', 'z06ZPiFNAbY'),
    ph('Musa Ortaç', '-qgP9qYNVNg'),
  ],
}
const itemsFor = (set) =>
  SETS[set].map((title, i) => ({ src: `/img/${set}/${pad(i + 1)}.jpg`, title, credit: CREDITS[set][i] }))

const CAROUSELS = [
  { layout: 'drift', name: 'Drift', set: '01', hint: 'Drag, scroll, hold or tap' },
  { layout: 'orbit', name: 'Orbit', set: '02', hint: 'Drag, scroll, hold or tap' },
  { layout: 'fan', name: 'Fan', set: '03', hint: 'Drag, scroll or tap' },
]

/* ---------- masked text swaps ---------- */
const slots = {}
document.querySelectorAll('[data-slot]').forEach((el) => (slots[el.dataset.slot] = el))
const shown = {}
Object.entries(slots).forEach(([k, el]) => (shown[k] = el.textContent))
function swap(slot, text, dir = 1) {
  if (shown[slot] === text) return
  shown[slot] = text
  const el = slots[slot]
  gsap.killTweensOf(el)
  gsap.to(el, {
    yPercent: -110 * dir,
    duration: 0.32,
    ease: 'power2.in',
    onComplete() {
      el.textContent = shown[slot]
      gsap.fromTo(el, { yPercent: 110 * dir }, { yPercent: 0, duration: 0.7, ease: 'expo.out' })
    },
  })
}

/* ---------- state ---------- */
const root = document.documentElement
const stage = document.querySelector('.stage')
const navItems = [...document.querySelectorAll('[data-go]')]
const params = new URLSearchParams(location.search)
let auto = params.has('auto')
let current = Math.min(3, Math.max(1, Number(params.get('n')) || 1)) - 1
let wanted = current
let carousel = null

const setNav = () => navItems.forEach((el, i) => el.classList.toggle('is-active', i === current))
const updateHint = () => swap('hint', auto ? 'Autoplay, press A to stop' : CAROUSELS[current].hint)

function go(next) {
  next = mod(next, CAROUSELS.length)
  if (next === current) return
  wanted = next
  carousel.setLayout(CAROUSELS[next].layout, { items: itemsFor(CAROUSELS[next].set), direction: next > current ? 1 : -1 })
}

function start() {
  carousel = createCarousel(stage, {
    items: itemsFor(CAROUSELS[current].set),
    layout: CAROUSELS[current].layout,
    wheel: 'both',
    keyboard: false,
    autoplay: auto,
    label: 'Carousels by madebymaga',
  })

  carousel.on('change', (e) => {
    swap('index', pad(e.index + 1), e.direction)
    swap('caption', e.item.title, e.direction)
  })

  // accepted switch: texts follow halfway through the morph
  carousel.on('layoutchange', (e) => {
    current = wanted
    const cfg = CAROUSELS[current]
    setNav()
    updateHint()
    const u = new URL(location.href)
    u.searchParams.set('n', String(current + 1))
    history.replaceState(null, '', u)
    gsap.delayedCall(e.duration * 0.45, () => {
      swap('index', '01', e.direction)
      swap('caption', e.items[0].title, e.direction)
      swap('total', pad(e.items.length), e.direction)
      swap('num', `N° ${pad(current + 1)}`, e.direction)
      swap('name', cfg.name, e.direction)
    })
  })

  // set texts directly, so nothing jumps on the first frame
  const cfg = CAROUSELS[current]
  const set = SETS[cfg.set]
  for (const [k, v] of Object.entries({ num: `N° ${pad(current + 1)}`, name: cfg.name, index: '01', total: pad(set.length), caption: set[0] }))
    slots[k].textContent = shown[k] = v
  setNav()
  updateHint()
}

/* ---------- input ---------- */
addEventListener('keydown', (e) => {
  if (!carousel) return
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') carousel.next()
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') carousel.prev()
  else if (['1', '2', '3'].includes(e.key)) go(Number(e.key) - 1)
  else if (e.key === 'a' || e.key === 'A') {
    auto = !auto
    auto ? carousel.play() : carousel.pause()
    updateHint()
  } else if (e.key === 'Enter' && document.activeElement?.dataset.go) go(Number(document.activeElement.dataset.go))
})
navItems.forEach((el) => el.addEventListener('click', () => go(Number(el.dataset.go))))

// install line: click copies, the line confirms briefly
const install = document.querySelector('.install')
const copyInstall = async () => {
  const text = 'npm i madebymaga-carousels'
  try {
    await navigator.clipboard.writeText(text)
    install.textContent = 'Copied'
  } catch {
    return
  }
  install.classList.add('is-copied')
  setTimeout(() => {
    install.textContent = text
    install.classList.remove('is-copied')
  }, 1400)
}
install.addEventListener('click', copyInstall)
install.addEventListener('keydown', (e) => e.key === 'Enter' && copyInstall())

/* ---------- load everything first, then show ---------- */
async function boot() {
  const imgs = Object.keys(SETS).flatMap((set) =>
    itemsFor(set).map(({ src }) => {
      const im = new Image()
      im.src = src
      return im.decode().catch(() => {})
    })
  )
  const fonts = Promise.all([
    document.fonts.load('italic 28px "Instrument Serif"'),
    document.fonts.load('500 14px "Geist"'),
    document.fonts.load('11px "Geist Mono"'),
  ]).catch(() => {})
  await Promise.race([Promise.all([...imgs, fonts]), new Promise((r) => setTimeout(r, 4000))])
  start()
  root.classList.add('is-ready')
  gsap.from('.ui', { opacity: 0, y: 8, duration: 1.2, ease: 'power3.out', stagger: 0.06, delay: 0.2 })
}
boot()

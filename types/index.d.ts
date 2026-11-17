/** One photo in the carousel. A plain string is shorthand for `{ src }`. */
export interface CarouselItem {
  src: string
  /** Alt text. Falls back to `title`. */
  alt?: string
  /** Short title, announced to screen readers and passed to events. */
  title?: string
  /** Shown when the front card is tapped. */
  credit?: { name: string; url?: string; label?: string }
  /** Anything else you want back in events. */
  [key: string]: unknown
}

/** A card pose on the shared grid. Any two layouts can morph into each other. */
export interface Pose {
  /** translate3d, px */
  X: number
  Y: number
  Z: number
  /** rotateX / rotateY, deg */
  TX: number
  TY: number
  /** translateZ after rotation (ring radius), px */
  R: number
  /** rotateZ, skewX, deg */
  RZ: number
  SK: number
  /** scale */
  SC: number
  /** opacity 0..1 */
  OP: number
  /** stacking order */
  ZI: number
  /** inner image shift in %, inner image scale */
  IX: number
  IS: number
  /** grayscale 0..1, brightness */
  G: number
  B: number
}

export interface MotionState {
  pos: number
  vel: number
  /** 0..1 while the pointer is held */
  hold: number
  /** 0..1 during the entrance */
  intro: number
}

export interface Sizes {
  vw: number
  vh: number
  W: number
  H: number
  R: number
  fanR: number
  fanStep: number
  persp: number
}

export interface Layout {
  name: string
  /** True for closed rings: a switch travels half way round. */
  ring?: boolean
  /** Pixels of drag that move the carousel by one card. */
  unit(S: Sizes): number
  /** Pose of a card at signed distance d from the front card. */
  layout(d: number, s: MotionState, S: Sizes, n: number): Pose
}

export type LayoutName = 'drift' | 'orbit' | 'fan'

export interface CarouselOptions {
  items: Array<CarouselItem | string>
  /** Default 'drift'. */
  layout?: LayoutName | Layout
  /** How often items repeat. 'auto' fills at least 12 cards. */
  repeat?: 'auto' | number
  /** true = every 2400 ms, or a number of ms. Default false. */
  autoplay?: boolean | number
  /** 'x' = only horizontal wheel/trackpad (default), 'both' = also vertical, false = off. */
  wheel?: 'x' | 'both' | false
  /** Arrow keys and Enter while the container is focused. Default true. */
  keyboard?: boolean
  /** Hold the pointer to reveal the second state. Default true. */
  hold?: boolean
  /** Show item credits on tap. Default true. */
  credits?: boolean
  /** Entrance animation. Default true. */
  intro?: boolean
  /** 'auto' follows prefers-reduced-motion. */
  reducedMotion?: 'auto' | boolean
  /** aria-label of the container. Default 'Carousel'. */
  label?: string
}

export interface ChangeEvent {
  index: number
  item: CarouselItem
  total: number
  direction: 1 | -1
}
export interface LayoutChangeEvent {
  layout: string
  items: CarouselItem[]
  direction: 1 | -1
  /** Seconds the morph takes. */
  duration: number
}
export interface SelectEvent {
  index: number
  item: CarouselItem
}

export interface Carousel {
  next(): void
  prev(): void
  /** Move to an item by its index in `items`, the short way round. */
  goTo(index: number): void
  /** Morph into another layout, optionally with new items. Resolves false if a morph is already running. */
  setLayout(layout: LayoutName | Layout, options?: { items?: Array<CarouselItem | string>; direction?: 1 | -1 }): Promise<boolean>
  play(ms?: number): void
  pause(): void
  on(type: 'change', fn: (e: ChangeEvent) => void): () => void
  on(type: 'layoutchange', fn: (e: LayoutChangeEvent) => void): () => void
  on(type: 'select', fn: (e: SelectEvent) => void): () => void
  /** Removes every element, listener, tween and observer it created. */
  destroy(): void
  readonly index: number
  readonly item: CarouselItem
  readonly items: CarouselItem[]
  readonly layout: string
  readonly playing: boolean
  readonly element: HTMLElement
}

export function createCarousel(target: HTMLElement | string, options: CarouselOptions): Carousel

export const drift: Layout
export const orbit: Layout
export const fan: Layout
export const layouts: { drift: Layout; orbit: Layout; fan: Layout }
/** The neutral pose. Spread it when writing your own layout. */
export const P0: Readonly<Pose>

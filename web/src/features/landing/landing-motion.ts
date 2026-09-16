import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Motion budget for this page is deliberately small. Every animation below has
 * a job: the hero establishes the scene before the claim, reveals lead the eye
 * down the page in reading order, the counters make the numbers land, and the
 * marquee shows breadth without giving each keyword a box.
 *
 * Everything collapses to static when the visitor asks for reduced motion.
 */

export const EASE = 'power3.out'
export const EASE_SOFT = 'power2.out'

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Fade-and-rise for anything marked `data-reveal`. Batched so a grid of cells
 * enters as one gesture instead of a dozen independent triggers.
 */
export function revealOnScroll(scope: HTMLElement): void {
  const targets = gsap.utils.toArray<HTMLElement>('[data-reveal]', scope)
  if (targets.length === 0) return

  gsap.set(targets, { opacity: 0, y: 26 })

  ScrollTrigger.batch(targets, {
    start: 'top 88%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: 0.72,
        ease: EASE,
        stagger: 0.07,
        overwrite: true,
      }),
  })
}

/** Counts a metric up once it is on screen, so the figure reads as a result. */
export function countUp(el: HTMLElement, value: number): void {
  const state = { n: 0 }
  ScrollTrigger.create({
    trigger: el,
    start: 'top 90%',
    once: true,
    onEnter: () => {
      gsap.to(state, {
        n: value,
        duration: 1.4,
        ease: EASE_SOFT,
        onUpdate: () => {
          el.textContent = String(Math.round(state.n))
        },
      })
    },
  })
}

/** Continuous keyword band. One per page, and only when motion is welcome. */
export function loopMarquee(track: HTMLElement): void {
  const distance = track.scrollWidth / 2
  if (distance <= 0) return

  gsap.to(track, {
    x: `-=${distance}`,
    duration: 34,
    ease: 'none',
    repeat: -1,
    modifiers: {
      x: gsap.utils.unitize((x) => parseFloat(x) % distance),
    },
  })
}

export { gsap, ScrollTrigger }

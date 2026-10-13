import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import MotionPathPlugin from 'gsap/MotionPathPlugin'

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin)

/**
 * Motion budget for this page is deliberately small. Every animation below has
 * a job: the hero establishes the scene before the claim, reveals lead the eye
 * down the page in reading order, the pinned journey lets the robot travel the
 * three steps as the visitor scrolls, the counters make the numbers land, and
 * the marquee shows breadth without giving each keyword a box.
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
 * Reveal visible Home elements once. IntersectionObserver remains reliable
 * while Lenis is driving smooth scrolling; CSS owns the actual animation.
 */
export function revealOnScroll(scope: HTMLElement): () => void {
  const targets = Array.from(scope.querySelectorAll<HTMLElement>('[data-reveal]'))
  if (targets.length === 0) return () => {}
  if (typeof IntersectionObserver === 'undefined') {
    targets.forEach((target) => target.classList.add('is-visible'))
    return () => {}
  }

  const sectionCounts = new Map<Element, number>()
  targets.forEach((target) => {
    const section = target.closest('section') ?? scope
    const index = sectionCounts.get(section) ?? 0
    target.style.setProperty('--lp3-reveal-delay', `${Math.min(index, 5) * 90}ms`)
    sectionCounts.set(section, index + 1)
  })

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('is-visible')
      observer.unobserve(entry.target)
    })
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 })
  targets.forEach((target) => observer.observe(target))
  return () => observer.disconnect()
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

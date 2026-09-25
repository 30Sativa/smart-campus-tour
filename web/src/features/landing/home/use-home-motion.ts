import { useCallback, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import Lenis from '@studio-freight/lenis'
import { ScrollTrigger, gsap, prefersReducedMotion } from '../landing-motion'

/**
 * Every motion on the home page, set up once with one teardown.
 *
 * - `[data-split]`, `.hm-fade`, `.hm-divider`, `[data-zoom]`: get `is-in` when
 *   they enter the viewport (the hero's `[data-auto]` right after mount).
 * - `[data-count]`: counts up from zero when visible.
 * - Scroll-linked: hero parallax, the word-by-word statements, the process
 *   progress line, the robot driving in, and the partner/footer parallax.
 *
 * With reduced motion the root is marked `data-motion="off"`; the CSS only
 * hides anything under `data-motion="on"`, so nothing is left invisible.
 */
export function useHomeMotion(rootRef: RefObject<HTMLDivElement | null>) {
  const lenisRef = useRef<Lenis | null>(null)

  const lockScroll = useCallback((locked: boolean) => {
    const lenis = lenisRef.current
    if (!lenis) return
    if (locked) lenis.stop()
    else lenis.start()
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const reduced = prefersReducedMotion()
    root.dataset.motion = reduced ? 'off' : 'on'

    let rafId = 0
    if (!reduced) {
      const lenis = new Lenis({
        duration: 1.05,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      })
      lenisRef.current = lenis
      lenis.on('scroll', ScrollTrigger.update)
      const raf = (time: number) => {
        lenis.raf(time)
        rafId = requestAnimationFrame(raf)
      }
      rafId = requestAnimationFrame(raf)
    }

    // Anchor links go through Lenis when it runs, so the jump is smooth too.
    const onAnchorClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href^="#"]')
      const href = anchor?.getAttribute('href')
      if (!href || href === '#') return
      const target = root.querySelector<HTMLElement>(href)
      if (!target) return
      event.preventDefault()
      if (lenisRef.current) lenisRef.current.scrollTo(target, { offset: -60, duration: 1.1 })
      else target.scrollIntoView({ block: 'start' })
    }
    root.addEventListener('click', onAnchorClick)

    if (reduced) {
      root.querySelectorAll('.hm-rw').forEach((w) => w.classList.add('is-on'))
      return () => root.removeEventListener('click', onAnchorClick)
    }

    const counters: gsap.core.Tween[] = []
    const countUp = (el: HTMLElement) => {
      const to = Number(el.dataset.count)
      const prefix = el.dataset.prefix ?? ''
      const pad = Number(el.dataset.pad ?? 0)
      const state = { n: 0 }
      counters.push(
        gsap.to(state, {
          n: to,
          duration: 1.6,
          ease: 'power3.out',
          onUpdate: () => {
            el.textContent = prefix + String(Math.round(state.n)).padStart(pad, '0')
          },
        }),
      )
    }

    // 1. Enter-the-viewport reveals.
    let observer: IntersectionObserver | null = null
    const revealables = root.querySelectorAll<HTMLElement>(
      '[data-split]:not([data-auto]), .hm-fade, .hm-divider, [data-zoom], [data-count]',
    )
    if (typeof IntersectionObserver !== 'undefined') {
      root.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
        el.textContent = (el.dataset.prefix ?? '') + '0'.padStart(Number(el.dataset.pad ?? 0), '0')
      })
      observer = new IntersectionObserver(
        (entries) =>
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return
            const el = entry.target as HTMLElement
            el.classList.add('is-in')
            if (el.dataset.count) countUp(el)
            observer?.unobserve(el)
          }),
        { rootMargin: '0px 0px -12% 0px' },
      )
      revealables.forEach((el) => observer?.observe(el))
    } else {
      revealables.forEach((el) => el.classList.add('is-in'))
    }

    const heroTimer = window.setTimeout(() => {
      root.querySelectorAll('#hero, #hero [data-auto], #hero .hm-fade').forEach((el) => el.classList.add('is-in'))
    }, 120)

    // 2. Scroll-linked motion.
    const light = (words: Element[], p: number) => {
      const n = Math.round(Math.min(1, Math.max(0, p)) * words.length)
      words.forEach((w, i) => w.classList.toggle('is-on', i < n))
    }

    const ctx = gsap.context(() => {
      const heroMedia = root.querySelector('#hero .hm-hero__media > *')
      if (heroMedia) {
        gsap.to(heroMedia, {
          y: 160,
          ease: 'none',
          scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true },
        })
      }

      const statement = root.querySelector('#hm-statement')
      if (statement) {
        const words = [...statement.querySelectorAll('.hm-rw')]
        ScrollTrigger.create({
          trigger: '#hm-statement-wrap',
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => light(words, self.progress * 1.15),
        })
      }

      const partnerWords = [...root.querySelectorAll('#hm-partner-words .hm-rw')]
      if (partnerWords.length) {
        ScrollTrigger.create({
          trigger: '#cong-nghe',
          start: 'top 75%',
          end: 'center 45%',
          onUpdate: (self) => light(partnerWords, self.progress),
        })
      }
      if (root.querySelector('#cong-nghe .hm-partner__bg')) {
        gsap.fromTo('#cong-nghe .hm-partner__bg', { y: -60 }, {
          y: 60,
          ease: 'none',
          scrollTrigger: { trigger: '#cong-nghe', start: 'top bottom', end: 'bottom top', scrub: true },
        })
      }

      const progress = root.querySelector<HTMLElement>('#hm-progress')
      const steps = [...root.querySelectorAll<HTMLElement>('.hm-step')]
      if (progress && steps.length) {
        ScrollTrigger.create({
          trigger: '#hm-steps',
          start: 'top 85%',
          end: 'bottom 55%',
          onUpdate: (self) => {
            progress.style.setProperty('--p', self.progress.toFixed(4))
            steps.forEach((s, i) => s.classList.toggle('is-active', self.progress >= i / steps.length + 0.02))
          },
        })
      }

      const robot = root.querySelector<HTMLElement>('#hm-robot-img')
      if (robot) {
        ScrollTrigger.create({
          trigger: robot,
          start: 'top bottom',
          end: 'center 45%',
          onUpdate: (self) => robot.style.setProperty('--p', self.progress.toFixed(4)),
        })
      }

      if (root.querySelector('.hm-footer__parallax')) {
        gsap.fromTo('.hm-footer__parallax', { yPercent: 0 }, {
          yPercent: 18,
          ease: 'none',
          scrollTrigger: { trigger: '.hm-footer', start: 'top bottom', end: 'bottom bottom', scrub: true },
        })
      }
    }, root)

    return () => {
      root.removeEventListener('click', onAnchorClick)
      window.clearTimeout(heroTimer)
      observer?.disconnect()
      counters.forEach((t) => t.kill())
      ctx.revert()
      if (rafId) cancelAnimationFrame(rafId)
      lenisRef.current?.destroy()
      lenisRef.current = null
    }
  }, [rootRef])

  return { lockScroll }
}

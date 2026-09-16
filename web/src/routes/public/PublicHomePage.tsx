import { useCallback, useLayoutEffect, useRef } from 'react'
import Lenis from '@studio-freight/lenis'
import { SiteNav } from '../../features/landing/sections/SiteNav'
import { Hero } from '../../features/landing/sections/Hero'
import { Overview } from '../../features/landing/sections/Overview'
import { Journey } from '../../features/landing/sections/Journey'
import { Marquee } from '../../features/landing/sections/Marquee'
import { Capabilities } from '../../features/landing/sections/Capabilities'
import { Metrics } from '../../features/landing/sections/Metrics'
import { RobotRail } from '../../features/landing/sections/RobotRail'
import { Platform } from '../../features/landing/sections/Platform'
import { CtaBand } from '../../features/landing/sections/CtaBand'
import { SiteFooter } from '../../features/landing/sections/SiteFooter'
import { metrics } from '../../features/landing/landing-content'
import {
  EASE,
  ScrollTrigger,
  countUp,
  gsap,
  loopMarquee,
  prefersReducedMotion,
  revealOnScroll,
} from '../../features/landing/landing-motion'
import '../../features/landing/landing.css'

/**
 * Public landing page for CampusTour DT-AMR.
 *
 * Composition, top to bottom: split hero over footage, offset statement,
 * asymmetric three-cell journey, keyword band, sticky capability list, metric
 * rail, scroll-snap technology rail, hairline platform grid, closing band,
 * footer. No two sections share a layout family.
 *
 * All motion lives here in one GSAP context so it has exactly one teardown, and
 * the whole layer is skipped when the visitor prefers reduced motion.
 */
export default function PublicHomePage() {
  const rootRef = useRef<HTMLDivElement>(null)
  const lenisRef = useRef<Lenis | null>(null)

  const handleLockScroll = useCallback((locked: boolean) => {
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

    // Smooth scrolling is motion too, so it only exists when motion is welcome.
    let rafId = 0
    if (!reduced) {
      const lenis = new Lenis({
        duration: 1.15,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 2,
      })
      lenisRef.current = lenis
      lenis.on('scroll', ScrollTrigger.update)

      const raf = (time: number) => {
        lenis.raf(time)
        rafId = requestAnimationFrame(raf)
      }
      rafId = requestAnimationFrame(raf)
    }

    // Anchor navigation, routed through Lenis when it is running.
    const onAnchorClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href^="#"]')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href === '#') return
      const target = root.querySelector<HTMLElement>(href)
      if (!target) return
      event.preventDefault()
      if (lenisRef.current) lenisRef.current.scrollTo(target, { offset: -72, duration: 1.2 })
      else target.scrollIntoView({ block: 'start' })
    }
    root.addEventListener('click', onAnchorClick)

    const ctx = gsap.context(() => {
      if (reduced) return

      // Hero: the scene settles first, then the claim arrives on top of it.
      const media = root.querySelector('#hero-media video, #hero-media img')
      const title = root.querySelector('#hero-title')
      const lead = root.querySelector('#hero-lead')
      const cta = root.querySelector('#hero-cta')

      const intro = gsap.timeline({ defaults: { ease: EASE } })
      if (media) {
        gsap.set(media, { scale: 1.08, filter: 'blur(18px)', opacity: 0 })
        intro.to(media, { scale: 1, filter: 'blur(0px)', opacity: 1, duration: 1.8, ease: 'power2.out' })
      }
      const copy = [title, lead, cta].filter(Boolean) as Element[]
      if (copy.length > 0) {
        gsap.set(copy, { opacity: 0, y: 26 })
        intro.to(copy, { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, media ? '-=1.25' : 0)
      }

      // Hero depth: the footage drifts slower than the copy leaving the screen.
      if (media) {
        gsap.to(media, {
          y: 120,
          ease: 'none',
          scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true },
        })
      }

      // Same idea inside the overview frame, at a quarter of the amplitude.
      const overviewImg = root.querySelector('#overview-media img')
      if (overviewImg) {
        gsap.fromTo(
          overviewImg,
          { yPercent: -5 },
          {
            yPercent: 5,
            ease: 'none',
            scrollTrigger: { trigger: '#overview-media', start: 'top bottom', end: 'bottom top', scrub: true },
          },
        )
      }

      revealOnScroll(root)

      metrics.forEach((metric) => {
        const el = root.querySelector<HTMLElement>(`#${metric.id}`)
        if (el) countUp(el, metric.value)
      })

      const track = root.querySelector<HTMLElement>('#marquee-track')
      if (track) loopMarquee(track)
    }, root)

    return () => {
      root.removeEventListener('click', onAnchorClick)
      ctx.revert()
      if (rafId) cancelAnimationFrame(rafId)
      lenisRef.current?.destroy()
      lenisRef.current = null
    }
  }, [])

  return (
    <div className="lp" ref={rootRef} id="top">
      <SiteNav onLockScroll={handleLockScroll} />

      <main>
        <Hero />
        <Overview />
        <Journey />
        <Marquee />
        <Capabilities />
        <Metrics />
        <RobotRail />
        <Platform />
        <CtaBand />
      </main>

      <SiteFooter />
    </div>
  )
}

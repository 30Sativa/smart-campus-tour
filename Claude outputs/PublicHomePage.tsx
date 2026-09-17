import { useCallback, useLayoutEffect, useRef } from 'react'
import Lenis from '@studio-freight/lenis'
import { SiteNav } from '../../features/landing/sections/SiteNav'
import { Hero } from '../../features/landing/sections/Hero'
import { Marquee } from '../../features/landing/sections/Marquee'
import { Journey } from '../../features/landing/sections/Journey'
import { Capabilities } from '../../features/landing/sections/Capabilities'
import { Overview } from '../../features/landing/sections/Overview'
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
 * The order tells the visit before it tells the stack: what it is, what it can
 * do, how one tour goes, what the platform covers, what operations can see,
 * what it aims for, then the technology and the infrastructure behind it. A
 * student gets an answer in the first screen; a stakeholder gets the engineering
 * further down without either audience reading the other's section first.
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
        duration: 1.05,
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
      if (lenisRef.current) lenisRef.current.scrollTo(target, { offset: -72, duration: 1.1 })
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
        gsap.set(media, { scale: 1.06, filter: 'blur(12px)', opacity: 0 })
        intro.to(media, { scale: 1, filter: 'blur(0px)', opacity: 1, duration: 1.2, ease: 'power2.out' })
      }
      const copy = [title, lead, cta].filter(Boolean) as Element[]
      if (copy.length > 0) {
        gsap.set(copy, { opacity: 0, y: 22 })
        intro.to(copy, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1 }, media ? '-=0.8' : 0)
      }

      // Enough drift to separate the footage from the copy leaving the screen,
      // not enough to read as a parallax demo.
      if (media) {
        gsap.to(media, {
          y: 70,
          ease: 'none',
          scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true },
        })
      }

      const overviewImg = root.querySelector('#overview-media img')
      if (overviewImg) {
        gsap.fromTo(
          overviewImg,
          { yPercent: -3.5 },
          {
            yPercent: 3.5,
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
        <Marquee />
        <Journey />
        <Capabilities />
        <Overview />
        <Metrics />
        <RobotRail />
        <Platform />
        <CtaBand />
      </main>

      <SiteFooter />
    </div>
  )
}

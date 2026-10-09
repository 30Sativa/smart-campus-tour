import { useCallback, useLayoutEffect, useRef } from 'react'
import Lenis from '@studio-freight/lenis'
import { ArrowRight, BatteryCharging, Bot, MapPin, MessageCircle, Radar, Radio, Route, Video } from 'lucide-react'
import { SiteNav } from '../../features/landing/sections/SiteNav'
import { Hero } from '../../features/landing/sections/Hero'
import { CtaBand } from '../../features/landing/sections/CtaBand'
import { SiteFooter } from '../../features/landing/sections/SiteFooter'
import { AiPreview, CyclingStatus, JourneyRouteOverlay, TechShowcase } from '../../features/landing/sections/JourneyParts'
import type { TechItem } from '../../features/landing/sections/JourneyParts'
import { EASE, ScrollTrigger, gsap, prefersReducedMotion, revealOnScroll } from '../../features/landing/landing-motion'
import '../../features/landing/landing.css'
import '../../features/landing/home-3d.css'

const steps = [
  { number: '01', title: 'Đại diện đăng ký đoàn', body: 'Chọn buổi tham quan đã công bố và gửi danh sách học sinh để được duyệt.' },
  { number: '02', title: 'Học sinh vào phòng chờ', body: 'Mở link được chia sẻ, nhập mã đoàn và đối chiếu họ tên, lớp.' },
  { number: '03', title: 'Cả lớp xem tour trực tiếp', body: 'Một robot đi qua các điểm dừng; mỗi học sinh theo dõi trên trình duyệt của mình.' },
]

/**
 * Parts of the robot, in the order of the numbered rings already drawn on
 * `technology-robot-quest.png`; `spot` is the centre of that ring, in percent,
 * so each button sits exactly on top of the picture's own number.
 */
const technology: TechItem[] = [
  { icon: Radar, title: 'LiDAR & tự hành', body: 'Cảm biến LiDAR quét quanh robot để định vị, tránh vật cản và bám theo tuyến đã chuẩn bị qua từng điểm tham quan.', spot: { x: 33, y: 63.5 } },
  { icon: BatteryCharging, title: 'Pin & nguồn điện', body: 'Pin trên robot cấp điện cho động cơ và máy tính; mức pin hiện cho đội vận hành theo dõi.', spot: { x: 62.8, y: 58 } },
  { icon: Radio, title: 'Vị trí đồng bộ', body: 'Cùng một vị trí phục vụ bản đồ 2D của học sinh và Twin 3D của đội vận hành.', spot: { x: 42.8, y: 70.5 } },
  { icon: Video, title: 'Nguồn hình trực tiếp', body: 'Kính Meta Quest 3 trên trụ giữ truyền góc nhìn của chuyến đi tới học sinh.', spot: { x: 60.6, y: 9.6 } },
]

/** Labelled buildings on `twin-smartbus.png`, in percent of the picture. */
const twinPins = [
  { label: 'Ký túc xá', x: 55, y: 18 },
  { label: 'Nhà ăn', x: 44.5, y: 61 },
  { label: 'Thư viện', x: 89, y: 44 },
] as const

/** Example values for the illustrated operations panel. */
const twinStatus = {
  position: ['Trục chính', 'Gần Nhà ăn', 'Gần Thư viện'],
  stop: ['Nhà ăn · 1/3', 'Thư viện · 2/3', 'Ký túc xá · 3/3'],
  session: ['Đang di chuyển', 'Đang thuyết minh', 'Đang di chuyển'],
} as const

export default function PublicHomePage() {
  const rootRef = useRef<HTMLDivElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const handleLockScroll = useCallback((locked: boolean) => {
    if (locked) lenisRef.current?.stop()
    else lenisRef.current?.start()
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduced = prefersReducedMotion()
    root.dataset.motion = reduced ? 'off' : 'on'
    let rafId = 0
    if (!reduced) {
      const lenis = new Lenis({ duration: 1.05, smoothWheel: true })
      lenisRef.current = lenis
      lenis.on('scroll', ScrollTrigger.update)
      const raf = (time: number) => {
        lenis.raf(time)
        rafId = requestAnimationFrame(raf)
      }
      rafId = requestAnimationFrame(raf)
    }
    const onAnchorClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href^="#"]')
      const href = anchor?.getAttribute('href')
      if (!href || href === '#') return
      const target = root.querySelector<HTMLElement>(href)
      if (!target) return
      event.preventDefault()
      if (lenisRef.current) lenisRef.current.scrollTo(target, { offset: -72, duration: 1.05 })
      else target.scrollIntoView({ block: 'start' })
    }
    root.addEventListener('click', onAnchorClick)
    const stopReveal = reduced ? () => {} : revealOnScroll(root)
    let stopPointer = () => {}
    const ctx = gsap.context(() => {
      if (reduced) return
      const media = root.querySelector('#hero-media img')
      const kicker = root.querySelector('.lp3-hero-kicker')
      const titleLines = root.querySelectorAll('#hero-title .lp3-hero-line > span')
      const heroPins = root.querySelectorAll('#hero-media .lp3-pin')
      const lead = root.querySelector('#hero-lead')
      const cta = root.querySelector('#hero-cta')
      const footnote = root.querySelector('.lp3-hero-footnote')
      const intro = gsap.timeline({ defaults: { ease: EASE } })
      if (media) {
        intro.fromTo(media, { scale: 1.09, opacity: 0.62 }, { scale: 1, opacity: 1, duration: 1.45 })
      }
      if (kicker) intro.fromTo(kicker, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7 }, '-=0.9')
      // Each headline line rises out of its own mask.
      if (titleLines.length) {
        intro.fromTo(titleLines, { yPercent: 115 }, { yPercent: 0, duration: 1.15, stagger: 0.14, ease: 'power4.out' }, '-=0.6')
      }
      if (lead) intro.fromTo(lead, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.6')
      if (cta) intro.fromTo(cta, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.55')
      if (footnote) intro.fromTo(footnote, { opacity: 0 }, { opacity: 1, duration: 0.9 }, '-=0.3')
      if (heroPins.length) {
        intro.fromTo(heroPins, { opacity: 0, y: 24, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, stagger: 0.16, ease: 'back.out(1.6)' }, '-=1.1')
      }

      // The picture and its pins drift a little against the pointer, and the
      // copy lifts away as the hero scrolls out.
      const hero = root.querySelector<HTMLElement>('#hero')
      const stage = root.querySelector('#hero-media .lp3-hero-stage')
      if (hero && stage) {
        if (window.matchMedia('(pointer: fine)').matches) {
          const toX = gsap.quickTo(stage, 'x', { duration: 1.4, ease: 'power3' })
          const toY = gsap.quickTo(stage, 'y', { duration: 1.4, ease: 'power3' })
          const onPointer = (event: PointerEvent) => {
            const box = hero.getBoundingClientRect()
            toX(-((event.clientX - box.left) / box.width - 0.5) * 26)
            toY(-((event.clientY - box.top) / box.height - 0.5) * 16)
          }
          hero.addEventListener('pointermove', onPointer)
          stopPointer = () => hero.removeEventListener('pointermove', onPointer)
        }
        gsap.to(stage, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } })
        const copy = root.querySelector('.lp-hero__copy')
        if (copy) gsap.to(copy, { y: -70, opacity: 0, ease: 'none', scrollTrigger: { trigger: hero, start: 'center center', end: 'bottom top', scrub: true } })
      }

      // Journey: on wide screens the illustration and steps hold still while
      // the robot rides the route and each step lights up in turn.
      const journey = root.querySelector<HTMLElement>('.lp3-journey')
      const grid = root.querySelector<HTMLElement>('.lp3-journey-grid')
      const route = root.querySelector<SVGPathElement>('.lp3-route__line')
      const bot = root.querySelector('.lp3-route__bot')
      if (journey && grid && route && bot) {
        const steps = Array.from(root.querySelectorAll('.lp3-steps > li:not(.lp3-steps-link)'))
        const stops = Array.from(root.querySelectorAll('.lp3-route__stop'))
        const list = root.querySelector<HTMLElement>('.lp3-steps')
        const length = route.getTotalLength()
        gsap.set(route, { strokeDasharray: length, strokeDashoffset: length })
        const ride = { path: route, align: route, alignOrigin: [0.5, 0.5] as [number, number] }
        if (window.matchMedia('(min-width: 1100px)').matches) {
          journey.dataset.journey = 'pinned'
          const setStep = (active: number) => {
            steps.forEach((step, index) => step.classList.toggle('is-active', index === active))
            stops.forEach((stop, index) => stop.classList.toggle('is-active', index <= active))
          }
          setStep(0)
          gsap.timeline({
            scrollTrigger: {
              trigger: grid,
              start: 'center center',
              end: '+=1500',
              pin: true,
              scrub: 0.8,
              onUpdate: (self) => {
                setStep(self.progress < 0.34 ? 0 : self.progress < 0.7 ? 1 : 2)
                list?.style.setProperty('--lp3-journey-progress', self.progress.toFixed(3))
              },
            },
          })
            .to(route, { strokeDashoffset: 0, ease: 'none', duration: 1 }, 0)
            .to(bot, { motionPath: ride, ease: 'none', duration: 1 }, 0)
        } else {
          const once = { trigger: grid, start: 'top 70%' }
          gsap.to(route, { strokeDashoffset: 0, duration: 2.4, ease: 'power2.inOut', scrollTrigger: once })
          gsap.to(bot, { motionPath: ride, duration: 2.4, ease: 'power2.inOut', scrollTrigger: once })
        }
      }

      const journeyImage = root.querySelector('.lp3-journey-art img')
      if (journeyImage) gsap.fromTo(journeyImage, { yPercent: 3 }, {
        yPercent: -3,
        ease: 'none',
        scrollTrigger: { trigger: '.lp3-journey', start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      })
      const twinImage = root.querySelector('.lp3-twin-stage')
      if (twinImage) gsap.fromTo(twinImage, { scale: 1.07, yPercent: -2 }, {
        scale: 1.07,
        yPercent: 2,
        ease: 'none',
        scrollTrigger: { trigger: '.lp3-twin', start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      })
      const twinMarks = root.querySelectorAll('.lp3-twin .lp3-pin, .lp3-twin-robot')
      if (twinMarks.length) gsap.fromTo(twinMarks, { opacity: 0, y: -28 }, {
        opacity: 1, y: 0, duration: 0.8, stagger: 0.15, ease: 'back.out(1.8)',
        scrollTrigger: { trigger: '.lp3-twin', start: 'top 55%' },
      })

      const hotspots = root.querySelectorAll('.lp3-hotspot')
      if (hotspots.length) gsap.fromTo(hotspots, { scale: 0 }, {
        scale: 1, duration: 0.7, stagger: 0.15, ease: 'back.out(2.2)',
        scrollTrigger: { trigger: '.lp3-tech-art', start: 'top 75%' },
      })

      const ctaLines = root.querySelectorAll('#cta-title .lp3-line > span')
      if (ctaLines.length) gsap.fromTo(ctaLines, { yPercent: 115 }, {
        yPercent: 0, duration: 1.1, stagger: 0.14, ease: 'power4.out',
        scrollTrigger: { trigger: '.lp-cta', start: 'top 60%' },
      })
      const ctaImage = root.querySelector('.lp-cta__media img')
      if (ctaImage) gsap.fromTo(ctaImage, { scale: 1.14 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: '.lp-cta', start: 'top bottom', end: 'bottom bottom', scrub: true },
      })
    }, root)

    // Lazy images change the page height after layout; re-measure the pinned
    // journey and the scrubbed scenes once each one arrives.
    let refreshTimer = 0
    const refresh = () => {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 120)
    }
    const pending = reduced ? [] : Array.from(root.querySelectorAll('img')).filter((img) => !img.complete)
    pending.forEach((img) => img.addEventListener('load', refresh, { once: true }))
    return () => {
      root.removeEventListener('click', onAnchorClick)
      stopReveal()
      stopPointer()
      window.clearTimeout(refreshTimer)
      pending.forEach((img) => img.removeEventListener('load', refresh))
      delete root.querySelector<HTMLElement>('.lp3-journey')?.dataset.journey
      ctx.revert()
      if (rafId) cancelAnimationFrame(rafId)
      lenisRef.current?.destroy()
      lenisRef.current = null
    }
  }, [])

  return (
    <div className="lp lp3" ref={rootRef} id="top">
      <SiteNav onLockScroll={handleLockScroll} />
      <main>
        <Hero />
        <section className="lp3-journey lp3-section" id="quy-trinh">
          <div className="lp3-container">
            <div className="lp3-section-head">
              <span className="lp3-kicker" data-reveal>01 / Hành trình</span>
              <h2 data-reveal>Một hành trình.<br />Cả lớp cùng khám phá.</h2>
              <p data-reveal>Robot di chuyển qua từng điểm dừng. Học sinh theo dõi từ xa trên trình duyệt, cùng một thời điểm.</p>
            </div>
            <div className="lp3-journey-grid">
              <div className="lp3-journey-art" data-reveal data-reveal-media>
                <img src="/images/home-3d/journey-smartbus.png" alt="Mô hình 3D minh họa robot SmartBus đi qua ba điểm dừng trong khuôn viên" loading="lazy" decoding="async" />
                <JourneyRouteOverlay />
                <span className="lp3-art-note">Mô hình hành trình minh họa</span>
              </div>
              <ol className="lp3-steps">
                {steps.map((step) => <li key={step.number} data-reveal><span>{step.number}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}
                <li className="lp3-steps-link" data-reveal><a href="#trai-nghiem">Xem trải nghiệm học sinh <ArrowRight size={18} aria-hidden="true" /></a></li>
              </ol>
            </div>
          </div>
        </section>

        <section className="lp3-student lp3-section" id="trai-nghiem">
          <div className="lp3-container lp3-student-grid">
            <div className="lp3-student-copy">
              <span className="lp3-kicker" data-reveal>02 / Góc nhìn học sinh</span>
              <h2 data-reveal>Ở xa vẫn thấy <br />campus đang <br />chuyển động<span>.</span></h2>
              <p data-reveal>Một khung hình chung, bản đồ 2D và trợ lý AI riêng cho mỗi học sinh trong buổi tham quan.</p>
              <div className="lp3-student-tags" data-reveal><span><Video size={16} /> Hình ảnh trực tiếp</span><span><MapPin size={16} /> Bản đồ 2D</span><span><MessageCircle size={16} /> Hỏi AI riêng</span></div>
              <a href="#quy-trinh" className="lp3-text-link" data-reveal>Xem cách tham gia <ArrowRight size={19} aria-hidden="true" /></a>
            </div>
            <div className="lp3-browser" data-reveal data-reveal-media aria-label="Bố cục minh họa giao diện học sinh">
              <div className="lp3-browser-bar"><span className="lp3-browser-dots"><i /><i /><i /></span><span>CampusTour · Buổi tham quan</span><span className="lp3-browser-live">MINH HỌA</span></div>
              <div className="lp3-browser-content">
                <div className="lp3-video"><img src="/images/home-3d/student.png" alt="Góc nhìn minh họa từ camera robot trong thư viện" loading="lazy" decoding="async" /><span>GÓC NHÌN MINH HỌA</span><b>Thư viện · Không gian học tập</b></div>
                <div className="lp3-browser-side">
                  <div className="lp3-mini-map"><div className="lp3-panel-title"><MapPin size={16} /> Bản đồ campus (2D)</div><div className="lp3-map-art"><span className="lp3-map-route" /><i className="lp3-map-point lp3-map-point--one" /><i className="lp3-map-point lp3-map-point--two" /><i className="lp3-map-point lp3-map-point--three" /><b className="lp3-map-robot"><Bot size={17} /></b></div></div>
                  <AiPreview />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp3-twin" id="gioi-thieu">
          <div className="lp3-twin-media" aria-hidden="true">
            <div className="lp3-twin-stage">
              <img className="lp3-twin-image" src="/images/home-3d/twin-smartbus.png" alt="" loading="lazy" decoding="async" />
              {twinPins.map((pin) => (
                <span className="lp3-pin" key={pin.label} style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
                  <span className="lp3-pin__card">{pin.label}</span>
                  <span className="lp3-pin__stem" />
                  <span className="lp3-pin__dot" />
                </span>
              ))}
              <span className="lp3-twin-robot" style={{ left: '71%', top: '46%' }}><i />SmartBus</span>
            </div>
          </div>
          <div className="lp3-container lp3-twin-inner">
            <div className="lp3-twin-copy">
              <span className="lp3-kicker" data-reveal>03 / Digital Twin</span>
              <h2 data-reveal>Robot thật.<br />Bản sao số.<br /><em>Một hành trình.</em></h2>
              <p data-reveal>Đội vận hành theo dõi vị trí, điểm dừng và trạng thái của robot trên mô hình không gian 3D.</p>
              <div className="lp3-twin-facts">
                <div data-reveal><MapPin size={19} /><span><strong>Vị trí robot</strong><small>Cùng nguồn dữ liệu với bản đồ học sinh</small></span><CyclingStatus values={twinStatus.position} /></div>
                <div data-reveal><Route size={19} /><span><strong>Điểm dừng hiện tại</strong><small>Tiến độ theo tuyến tham quan</small></span><CyclingStatus values={twinStatus.stop} /></div>
                <div data-reveal><Radio size={19} /><span><strong>Trạng thái phiên</strong><small>Thông tin phục vụ vận hành</small></span><CyclingStatus values={twinStatus.session} /></div>
              </div>
              <a href="#cong-nghe" className="lp3-outline-link" data-reveal>Tìm hiểu công nghệ <ArrowRight size={18} aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <section className="lp3-tech lp3-section" id="cong-nghe">
          <div className="lp3-container">
            <div className="lp3-section-head"><span className="lp3-kicker" data-reveal>04 / Công nghệ</span><h2 data-reveal>Công nghệ đứng sau<br />mỗi điểm dừng.</h2><p data-reveal>Robot tự hành, nguồn hình và dữ liệu vận hành cùng kết nối trong một tour.</p></div>
            <TechShowcase items={technology} />
          </div>
        </section>
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  )
}

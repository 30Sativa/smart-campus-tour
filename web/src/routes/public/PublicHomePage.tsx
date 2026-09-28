import { useCallback, useLayoutEffect, useRef } from 'react'
import Lenis from '@studio-freight/lenis'
import { ArrowRight, Bot, MapPin, MessageCircle, Radio, Route, Video } from 'lucide-react'
import { SiteNav } from '../../features/landing/sections/SiteNav'
import { Hero } from '../../features/landing/sections/Hero'
import { CtaBand } from '../../features/landing/sections/CtaBand'
import { SiteFooter } from '../../features/landing/sections/SiteFooter'
import { EASE, ScrollTrigger, gsap, prefersReducedMotion, revealOnScroll } from '../../features/landing/landing-motion'
import '../../features/landing/landing.css'
import '../../features/landing/home-3d.css'

const steps = [
  { number: '01', title: 'Đại diện đăng ký đoàn', body: 'Chọn buổi tham quan đã công bố và gửi danh sách học sinh để được duyệt.' },
  { number: '02', title: 'Học sinh vào phòng chờ', body: 'Mở link được chia sẻ, nhập mã đoàn và đối chiếu họ tên, lớp.' },
  { number: '03', title: 'Cả lớp xem tour trực tiếp', body: 'Một robot đi qua các điểm dừng; mỗi học sinh theo dõi trên trình duyệt của mình.' },
]

const technology = [
  { icon: Route, title: 'Lộ trình tự hành', body: 'Robot đi theo tuyến đã chuẩn bị và dừng tại từng điểm tham quan.' },
  { icon: Video, title: 'Nguồn hình trực tiếp', body: 'Camera trên robot truyền góc nhìn của chuyến đi tới học sinh.' },
  { icon: Radio, title: 'Vị trí đồng bộ', body: 'Cùng một vị trí phục vụ bản đồ 2D của học sinh và Twin 3D của đội vận hành.' },
]

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
    const ctx = gsap.context(() => {
      if (reduced) return
      const media = root.querySelector('#hero-media img')
      const kicker = root.querySelector('.lp3-hero-kicker')
      const titleLines = root.querySelectorAll('#hero-title .lp3-hero-line')
      const lead = root.querySelector('#hero-lead')
      const cta = root.querySelector('#hero-cta')
      const footnote = root.querySelector('.lp3-hero-footnote')
      const intro = gsap.timeline({ defaults: { ease: EASE } })
      if (media) {
        intro.fromTo(media, { scale: 1.09, opacity: 0.62 }, { scale: 1, opacity: 1, duration: 1.45 })
      }
      if (kicker) intro.fromTo(kicker, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7 }, '-=0.9')
      if (titleLines.length) {
        intro.fromTo(titleLines, { opacity: 0, y: 55 }, { opacity: 1, y: 0, duration: 1, stagger: 0.16 }, '-=0.55')
      }
      if (lead) intro.fromTo(lead, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.6')
      if (cta) intro.fromTo(cta, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.55')
      if (footnote) intro.fromTo(footnote, { opacity: 0 }, { opacity: 1, duration: 0.9 }, '-=0.3')

      const journeyImage = root.querySelector('.lp3-journey-art img')
      if (journeyImage) gsap.fromTo(journeyImage, { yPercent: 3 }, {
        yPercent: -3,
        ease: 'none',
        scrollTrigger: { trigger: '.lp3-journey', start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      })
      const twinImage = root.querySelector('.lp3-twin-image')
      if (twinImage) gsap.fromTo(twinImage, { scale: 1.07, yPercent: -2 }, {
        scale: 1.07,
        yPercent: 2,
        ease: 'none',
        scrollTrigger: { trigger: '.lp3-twin', start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      })
    }, root)
    return () => {
      root.removeEventListener('click', onAnchorClick)
      stopReveal()
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
                  <div className="lp3-ai-preview"><div className="lp3-panel-title"><MessageCircle size={16} /> Trợ lý AI của bạn</div><p>Thư viện có những không gian học tập nào?</p><span>Đặt câu hỏi về điểm dừng hiện tại...</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp3-twin" id="gioi-thieu">
          <img className="lp3-twin-image" src="/images/home-3d/twin-smartbus.png" alt="" loading="lazy" decoding="async" />
          <div className="lp3-container lp3-twin-inner">
            <div className="lp3-twin-copy">
              <span className="lp3-kicker" data-reveal>03 / Digital Twin</span>
              <h2 data-reveal>Robot thật.<br />Bản sao số.<br /><em>Một hành trình.</em></h2>
              <p data-reveal>Đội vận hành theo dõi vị trí, điểm dừng và trạng thái của robot trên mô hình không gian 3D.</p>
              <div className="lp3-twin-facts">
                <div data-reveal><MapPin size={19} /><span><strong>Vị trí robot</strong><small>Cùng nguồn dữ liệu với bản đồ học sinh</small></span></div>
                <div data-reveal><Route size={19} /><span><strong>Điểm dừng hiện tại</strong><small>Tiến độ theo tuyến tham quan</small></span></div>
                <div data-reveal><Radio size={19} /><span><strong>Trạng thái phiên</strong><small>Thông tin phục vụ vận hành</small></span></div>
              </div>
              <a href="#cong-nghe" className="lp3-outline-link" data-reveal>Tìm hiểu công nghệ <ArrowRight size={18} aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <section className="lp3-tech lp3-section" id="cong-nghe">
          <div className="lp3-container">
            <div className="lp3-section-head"><span className="lp3-kicker" data-reveal>04 / Công nghệ</span><h2 data-reveal>Công nghệ đứng sau<br />mỗi điểm dừng.</h2><p data-reveal>Robot tự hành, nguồn hình và dữ liệu vận hành cùng kết nối trong một tour.</p></div>
            <div className="lp3-tech-grid">
              <div className="lp3-tech-art" data-reveal data-reveal-media><img src="/images/home-3d/technology-smartbus.png" alt="Minh họa 3D ý tưởng cấu trúc robot SmartBus" loading="lazy" decoding="async" /><span>MÔ HÌNH ROBOT MINH HỌA</span></div>
              <div className="lp3-tech-list">{technology.map((item, index) => <div className="lp3-tech-item" key={item.title} data-reveal><span className="lp3-tech-number">0{index + 1}</span><item.icon size={23} strokeWidth={1.7} aria-hidden="true" /><div><h3>{item.title}</h3><p>{item.body}</p></div></div>)}</div>
            </div>
          </div>
        </section>
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  )
}

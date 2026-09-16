import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from '@studio-freight/lenis';
import { useAuthStore } from '../../stores/auth-store';
import { useLogout } from '../../auth/use-logout';
import { isStaffRole } from '../../auth/roles';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import '../../landing.css';

gsap.registerPlugin(ScrollTrigger);

export default function PublicHomePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();
  const isStaff = isStaffRole(user?.role);

  useEffect(() => {
    // Lenis smooth scroll
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2
    });

    let rafId: number;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    lenis.on('scroll', ScrollTrigger.update);

    const ctx = gsap.context(() => {
      // Hero Animation
      const img = document.querySelector("#hero-img video") || document.querySelector("#hero-img img");
      const t1 = document.getElementById("ht1");
      const t2 = document.getElementById("ht2");
      const tags = document.getElementById("htags");
      const scrl = document.getElementById("hscroll");
      const stat = document.getElementById("hstat");

      function split(el: HTMLElement | null) {
        if (!el) return [];
        const txt = el.textContent?.trim() || "";
        el.textContent = "";
        const ls: HTMLSpanElement[] = [];
        [...txt].forEach(c => {
          const s = document.createElement("span");
          s.textContent = c;
          s.style.cssText = "display:inline-block;will-change:transform,opacity,filter";
          el.appendChild(s);
          ls.push(s);
        });
        return ls;
      }

      const l1 = split(t1);
      const l2 = split(t2);

      const elementsToFade = [tags, scrl, stat].filter(Boolean);

      if (img) gsap.set(img, { scale: 1, filter: "blur(20px)", opacity: 0 });
      gsap.set([...l1, ...l2], { opacity: 0, filter: "blur(14px)", y: 36 });
      if (elementsToFade.length > 0) gsap.set(elementsToFade, { opacity: 0, y: 18 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      if (img) tl.to(img, { scale: 1, filter: "blur(0px)", opacity: 1, duration: 2.2, ease: "power2.out" })
      tl.to(l1, { opacity: 1, filter: "blur(0px)", y: 0, duration: 1.1, stagger: 0.06 }, "-=1.8")
        .to(l2, { opacity: 1, filter: "blur(0px)", y: 0, duration: 1.1, stagger: 0.06 }, "-=0.7")
      if (elementsToFade.length > 0) tl.to(elementsToFade, { opacity: 1, y: 0, duration: 0.8, stagger: 0.1 }, "-=0.4")
      if (scrl) tl.to(scrl, { opacity: 1, y: 0, duration: 0.6 }, "-=0.2");

      tl.call(() => {
        // Optional: Keep a very subtle animation or remove completely to avoid any cropping
        // if (img) gsap.to(img, { scale: 1.02, duration: 10, ease: "sine.inOut", yoyo: true, repeat: -1 });
      });

      ScrollTrigger.create({
        trigger: "#hero",
        start: "top top",
        end: "bottom top",
        onUpdate: s => gsap.set(img, { y: s.progress * 160 })
      });

      // Navbar background
      ScrollTrigger.create({
        start: "top -80",
        onToggle: s => {
          const nav = document.getElementById("nav");
          if (nav) {
            nav.style.background = s.isActive ? "var(--navbar-bg)" : "transparent";
            nav.style.backdropFilter = s.isActive ? "blur(20px)" : "none";
          }
        }
      });

      // Floating items
      gsap.utils.toArray<HTMLElement>(".sc-fi").forEach(fi => {
        const d = gsap.utils.random(160, 300);
        const dur = gsap.utils.random(4, 6);
        const tl = gsap.timeline({ repeat: -1 });
        tl.fromTo(fi,
          { y: d / 2, opacity: 0, scale: 0.8 },
          { y: 0, opacity: 0.85, scale: 1, duration: dur / 2, ease: "sine.inOut" }
        )
          .to(fi,
            { y: -d / 2, opacity: 0, scale: 0.8, duration: dur / 2, ease: "sine.inOut" }
          );
      });

      // Process cards
      const cards = Array.from(document.querySelectorAll(".proc-card")) as HTMLElement[];
      let activeCard = cards.find(c => c.dataset.a === "1") || cards[1];
      function setACard(n: HTMLElement) {
        if (n === activeCard) return;
        if (activeCard) activeCard.dataset.a = "0";
        n.dataset.a = "1";
        activeCard = n;
      }
      cards.map(c => {
        const h = () => setACard(c);
        c.addEventListener("mouseenter", h);
        return { c, h };
      });

      gsap.from(cards, {
        rotationY: i => i % 2 ? -90 : 90, rotationX: 4, scale: 0.94, opacity: 0,
        duration: 1.15, stagger: 0.14, ease: "expo.out",
        scrollTrigger: { trigger: "#proc-grid", start: "top 82%", once: true }
      });

      // Marquee
      const mq = document.getElementById("mq");
      if (mq) {
        // We render the duplicated items in JSX now, so just calculate width
        const w = mq.scrollWidth / 2;
        gsap.to(mq, {
          x: "-=" + w, duration: 32, ease: "none", repeat: -1,
          modifiers: { x: gsap.utils.unitize(x => parseFloat(x) % w) }
        });
      }

      // Services tabs
      const items = Array.from(document.querySelectorAll(".svc-item")) as HTMLElement[];
      const imgs = Array.from(document.querySelectorAll(".svc-img"));
      let activeSvc = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      function setSvc(i: number) {
        if (i === activeSvc) return;
        items[activeSvc].classList.remove("on");
        imgs[activeSvc].classList.remove("on");
        activeSvc = i;
        items[i].classList.add("on");
        imgs[i].classList.add("on");
      }
      items.forEach((it, i) => it.addEventListener("mouseenter", () => {
        clearTimeout(timer);
        setSvc(i);
        timer = setTimeout(loopSvc, 3500);
      }));
      function loopSvc() {
        setSvc((activeSvc + 1) % items.length);
        timer = setTimeout(loopSvc, 3500);
      }
      timer = setTimeout(loopSvc, 3500);

      // Stats counters
      [{ id: "s1", v: 500 }, { id: "s2", v: 15 }, { id: "s3", v: 5 }, { id: "s4", v: 99 }].forEach(({ id, v }) => {
        const el = document.getElementById(id);
        if (el) {
          ScrollTrigger.create({
            trigger: el, start: "top 88%", once: true,
            onEnter: () => {
              const obj = { n: 0 };
              gsap.to(obj, {
                n: v, duration: 1.5, ease: "power2.out",
                onUpdate: () => { el.textContent = Math.round(obj.n).toString(); }
              });
            }
          });
        }
      });

      // How it works slider
      const slides = Array.from(document.querySelectorAll(".how-slide")) as HTMLElement[];
      const track = document.getElementById("how-track");
      let cur = 0;
      let busy = false;
      let auto: ReturnType<typeof setInterval> | undefined;
      function centerSlider(i: number, anim = true) {
        const vw = window.innerWidth;
        const sl = slides[i];
        if (!sl) return;
        const off = vw / 2 - (sl.offsetLeft + sl.offsetWidth / 2);
        gsap.to(track, { x: off, duration: anim ? 0.8 : 0, ease: "power3.inOut", overwrite: true });
        slides.forEach((s, j) => s.classList.toggle("on", j === i));
      }
      function goSlider(d: number) {
        if (busy) return;
        busy = true;
        cur = Math.max(0, Math.min(slides.length - 1, cur + d));
        centerSlider(cur);
        setTimeout(() => { busy = false; }, 850);
      }
      document.getElementById("how-prev")?.addEventListener("click", () => goSlider(-1));
      document.getElementById("how-next")?.addEventListener("click", () => goSlider(1));
      requestAnimationFrame(() => centerSlider(cur, false));
      const handleResize = () => centerSlider(cur, false);
      window.addEventListener("resize", handleResize);
      auto = setInterval(() => goSlider(cur < slides.length - 1 ? 1 : -(slides.length - 1)), 3800);
      const wrap = document.getElementById("how-slides");
      if (wrap) {
        wrap.addEventListener("mouseenter", () => clearInterval(auto));
        wrap.addEventListener("mouseleave", () => { auto = setInterval(() => goSlider(cur < slides.length - 1 ? 1 : -(slides.length - 1)), 3800); });
      }

      // Tech cards
      document.querySelectorAll(".tech-card").forEach(card => {
        const curtain = card.querySelector(".tech-curtain");
        const body = card.querySelector(".tech-body");
        card.addEventListener("mouseenter", () => {
          gsap.to(curtain, { y: 0, duration: 0.45, ease: "power3.out" });
          gsap.to(body?.querySelectorAll("*") || [], { color: "var(--text-inverse)", duration: 0.2 });
        });
        card.addEventListener("mouseleave", () => {
          gsap.to(curtain, { y: "100%", duration: 0.38, ease: "power2.in" });
          gsap.to(body?.querySelectorAll("*") || [], { color: "", duration: 0.2 });
        });
      });

      // Mobile Menu
      document.getElementById("burger")?.addEventListener("click", () => {
        const nl = document.getElementById("nav-links");
        if (nl) {
          const open = nl.style.display === "flex" && nl.style.position === "fixed";
          if (open) {
            nl.style.display = "none";
          } else {
            Object.assign(nl.style, {
              display: "flex", flexDirection: "column", position: "fixed",
              top: "72px", left: "0", right: "0", background: "var(--navbar-bg)",
              padding: "24px 40px", gap: "18px", backdropFilter: "blur(20px)", zIndex: "99"
            });
          }
        }
      });

      // Smooth anchor scroll using lenis
      document.querySelectorAll("a[href^='#']").forEach(a => {
        a.addEventListener("click", e => {
          const id = a.getAttribute("href");
          if (id === "#") return;
          const t = document.querySelector(id || "");
          if (t) {
            e.preventDefault();
            lenis.scrollTo(t as HTMLElement, { offset: -80, duration: 1.4 });
          }
        });
      });

      return () => {
        window.removeEventListener("resize", handleResize);
        clearTimeout(timer);
        clearInterval(auto);
      };
    }, containerRef);

    return () => {
      ctx.revert();
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return (
    <div ref={containerRef} style={{ background: "var(--bg-primary)", color: "var(--text-primary)", minHeight: "100vh" }}>
      <nav className="nav" id="nav" style={{ transition: 'background 0.3s ease' }}>
        <div className="nav-inner">
          <a href="#" className="nav-logo">
            <div style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img src="/images/logo.png" alt="CampusTour Logo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
            </div>
          </a>
          <div className="nav-links" id="nav-links">
            <a href="#gioi-thieu" className="nav-link">Giới thiệu</a>
            <a href="#tinh-nang" className="nav-link">Tính năng</a>
            <a href="#quy-trinh" className="nav-link">Quy trình</a>
            <a href="#robot" className="nav-link">Robot AMR</a>
            <a href="#lien-he" className="nav-link">Liên hệ</a>
            {isAuthenticated && (
              <>
                {isStaff && (
                  <Link to="/admin" className="nav-link" style={{ color: '#22d3ee' }}>Ops Admin</Link>
                )}
                <button
                  onClick={logout}
                  className="nav-link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: 0, color: 'var(--text-secondary)' }}
                >
                  Đăng xuất
                </button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <ThemeToggle />
            {isAuthenticated ? (
              <>
                <span
                  className="nav-link"
                  style={{ fontSize: '13px', marginRight: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block', flexShrink: 0 }}></span>
                  <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.username}</span>
                </span>
                {isStaff && (
                  <Link
                    to="/admin"
                    className="btn btn-dark"
                    style={{
                      padding: '7px 12px',
                      fontSize: '11px',
                      minWidth: 'auto',
                      background: 'rgba(6, 182, 212, 0.15)',
                      border: '1px solid rgba(6, 182, 212, 0.3)',
                      color: '#22d3ee',
                    }}
                  >
                    Admin
                  </Link>
                )}
                <button
                  onClick={logout}
                  className="btn btn-ghost"
                  style={{ padding: '7px 12px', minWidth: 'auto', fontSize: '11px', cursor: 'pointer' }}
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="nav-link" style={{ fontSize: '13px', marginRight: 0, whiteSpace: 'nowrap' }}>
                  Đăng nhập
                </Link>
              </>
            )}
          </div>
          <div className="burger" id="burger">
            <span></span><span></span><span></span>
          </div>
        </div>
      </nav>

      <div style={{ position: "relative" }}>
        <div style={{ position: "sticky", top: 0 }}>
          <section className="hero" id="hero">
            <div className="hero-img" id="hero-img">
              {/* <!-- Video Source: Đặt file video tại thư mục public/videos/campus-tour-hero.mp4 --> */}
              <video
                src="/videos/campus-tour-hero.mp4"
                poster="/images/hero-campus.jpg"
                autoPlay
                muted
                loop
                playsInline
              />
            </div>
            <div className="hero-ov"></div>
            <div className="hero-body ctn">
              <div className="hero-titles">
                <h1 className="h1-hero" id="ht1">CAMPUS</h1>
                <div className="hero-t2">
                  <div className="h1-hero" id="ht2" style={{ color: '#22d3ee' }}>TOUR</div>
                </div>
              </div>
              <p id="hstat" style={{ fontSize: '15px', lineHeight: 1.7, color: 'rgba(255,255,255,.7)', maxWidth: '480px', marginBottom: '28px', fontWeight: 300 }}>
                Tham quan khuôn viên qua góc nhìn công nghệ cao với hướng dẫn viên robot thông minh và bản đồ 3D tương tác.
              </p>
              {isAuthenticated && isStaff ? (
                <div>
                  <Link
                    to="/admin"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '8px',
                      padding: '14px 28px', borderRadius: '9999px',
                      background: 'linear-gradient(135deg,#10b981,#06b6d4)',
                      color: '#000', fontWeight: 700, fontSize: '14px',
                      boxShadow: '0 0 32px rgba(16,185,129,.35)', textDecoration: 'none',
                      transition: 'opacity .2s', whiteSpace: 'nowrap'
                    }}
                  >
                    Vào trang điều hành
                  </Link>
                </div>
              ) : (
                <div>
                  <Link
                    to="/login"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '8px',
                      padding: '14px 28px', borderRadius: '9999px',
                      background: 'linear-gradient(135deg,#10b981,#06b6d4)',
                      color: '#000', fontWeight: 700, fontSize: '14px',
                      boxShadow: '0 0 32px rgba(16,185,129,.35)', textDecoration: 'none',
                      transition: 'opacity .2s', whiteSpace: 'nowrap'
                    }}
                  >
                    Đăng nhập điều hành
                  </Link>
                </div>
              )}
              <div id="hscroll" className="scroll-wrap" style={{ marginTop: '40px', opacity: 0.5 }}>
                <span className="scroll-lbl">Cuộn xuống</span>
                <div className="scroll-ln"></div>
              </div>
            </div>
          </section>
        </div>


        <section className="showcase" id="gioi-thieu">
          <div className="ctn">
            <div className="showcase-wrap">
              <div className="sc-main">
                <img src="/images/digital-twin.jpg" alt="Digital Twin" />
              </div>
              <div className="sc-title-w">
                <h2 className="sc-title">Trải nghiệm tham quan khuôn viên đại học thông minh, tự động và được cá nhân hóa bởi AI</h2>
              </div>
              <div className="sc-floats">
                <div className="sc-fi" style={{ left: "3%", top: "10%" }}>
                  <img src="/images/booking-app.jpg" alt="App đặt tour" />
                </div>
                <div className="sc-fi" style={{ right: "3%", top: "18%" }}>
                  <img src="/images/ai-assistant.jpg" alt="AI trợ lý" />
                </div>
                <div className="sc-fi" style={{ left: "7%", bottom: "14%" }}>
                  <img src="/images/hero-campus.jpg" alt="Robot" />
                </div>
                <div className="sc-fi" style={{ right: "7%", bottom: "10%" }}>
                  <img src="/images/digital-twin.jpg" alt="Digital twin" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="sec" id="quy-trinh" style={{ background: "var(--bg-primary)" }}>
        <div className="ctn">
          <div className="flex-sb">
            <div style={{ flex: "1 1 38%", minWidth: 0 }}>
              <div className="sub">// &nbsp; Quy trình hoạt động</div>
              <h2 className="sec-title">Hành trình trong mỗi chuyến tour</h2>
            </div>
            <div style={{ flex: "1 1 28%", minWidth: 0, maxWidth: '360px' }}>
              <p>Hành trình tham quan thông minh kết hợp robot tự hành, AI đa ngôn ngữ và giám sát song song thời gian thực.</p>
            </div>
          </div>
          <div className="proc-grid" id="proc-grid">
            <div className="proc-card" data-a="0">
              <div className="proc-img"><img src="/images/booking-app.jpg" alt="Đặt lịch" /></div>
              <div className="proc-dark"></div>
              <div className="proc-ov">
                <div className="ucase">01 — Đặt lịch</div>
                <div>
                  <div className="proc-icon">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M8 2v3M16 2v3M3 9h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="h6" style={{ marginTop: "8px", color: "var(--white)" }}>Đặt lịch trực tuyến</div>
                  <p style={{ fontSize: "13px", marginTop: "6px" }}>Chọn lộ trình, giờ đến và số người — hệ thống tự phân bổ robot phù hợp</p>
                </div>
              </div>
              <div className="proc-lbl"><div className="h6" style={{ color: "var(--accent)" }}>Đặt lịch trực tuyến →</div></div>
            </div>
            <div className="proc-card" data-a="1">
              <div className="proc-img"><img src="/images/hero-campus.jpg" alt="Robot" /></div>
              <div className="proc-dark"></div>
              <div className="proc-ov">
                <div className="ucase">02 — Dẫn đường</div>
                <div>
                  <div className="proc-icon">
                    <svg viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="h6" style={{ marginTop: "8px", color: "var(--white)" }}>Robot tự hành AMR</div>
                  <p style={{ fontSize: "13px", marginTop: "6px" }}>Robot điều hướng chính xác, tránh vật cản, dẫn đến từng điểm tham quan</p>
                </div>
              </div>
              <div className="proc-lbl"><div className="h6" style={{ color: "var(--accent)" }}>Robot AMR dẫn đường →</div></div>
            </div>
            <div className="proc-card" data-a="0">
              <div className="proc-img"><img src="/images/ai-assistant.jpg" alt="AI" /></div>
              <div className="proc-dark"></div>
              <div className="proc-ov">
                <div className="ucase">03 — Khám phá</div>
                <div>
                  <div className="proc-icon">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" stroke="currentColor" strokeWidth="2" />
                      <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="h6" style={{ marginTop: "8px", color: "var(--white)" }}>AI hướng dẫn đa ngôn ngữ</div>
                  <p style={{ fontSize: "13px", marginTop: "6px" }}>AI thuyết minh, trả lời câu hỏi bằng tiếng Việt, Anh và nhiều ngôn ngữ</p>
                </div>
              </div>
              <div className="proc-lbl"><div className="h6" style={{ color: "var(--accent)" }}>AI đa ngôn ngữ →</div></div>
            </div>
          </div>
        </div>
      </section>

      <div className="mqw">
        <div className="mq-track" id="mq">
          <div className="mq-item"><div className="mq-dot"></div><span className="mq-text">Robot AMR tự hành</span></div>
          <div className="mq-item"><div className="mq-dot" style={{ background: "var(--accent2)" }}></div><span className="mq-text">AI đa ngôn ngữ</span></div>
          <div className="mq-item"><div className="mq-dot"></div><span className="mq-text">Digital Twin thời gian thực</span></div>
          <div className="mq-item"><div className="mq-dot" style={{ background: "var(--accent2)" }}></div><span className="mq-text">Đặt tour trực tuyến</span></div>
          <div className="mq-item"><div className="mq-dot"></div><span className="mq-text">Giám sát đội robot</span></div>
          <div className="mq-item"><div className="mq-dot" style={{ background: "var(--accent2)" }}></div><span className="mq-text">Navigation ROS 2</span></div>
          <div className="mq-item"><div className="mq-dot"></div><span className="mq-text">LiDAR &amp; Camera</span></div>

          {/* Duplicated for infinite scroll loop */}
          <div className="mq-item"><div className="mq-dot"></div><span className="mq-text">Robot AMR tự hành</span></div>
          <div className="mq-item"><div className="mq-dot" style={{ background: "var(--accent2)" }}></div><span className="mq-text">AI đa ngôn ngữ</span></div>
          <div className="mq-item"><div className="mq-dot"></div><span className="mq-text">Digital Twin thời gian thực</span></div>
          <div className="mq-item"><div className="mq-dot" style={{ background: "var(--accent2)" }}></div><span className="mq-text">Đặt tour trực tuyến</span></div>
          <div className="mq-item"><div className="mq-dot"></div><span className="mq-text">Giám sát đội robot</span></div>
          <div className="mq-item"><div className="mq-dot" style={{ background: "var(--accent2)" }}></div><span className="mq-text">Navigation ROS 2</span></div>
          <div className="mq-item"><div className="mq-dot"></div><span className="mq-text">LiDAR &amp; Camera</span></div>
        </div>
      </div>

      <section className="sec" id="tinh-nang" style={{ background: "var(--black)", paddingBottom: "120px" }}>
        <div className="ctn">
          <div style={{ textAlign: "center", marginBottom: "56px" }}>
            <div className="sub">// &nbsp; Tính năng hệ thống</div>
            <h2 className="sec-title">Thiết kế với mục đích rõ ràng</h2>
          </div>
          <div className="svc-layout">
            <div className="svc-left">
              <div className="svc-stack">
                <div className="svc-img on"><img src="/images/hero-campus.jpg" alt="Robot" /></div>
                <div className="svc-img"><img src="/images/booking-app.jpg" alt="Booking" /></div>
                <div className="svc-img"><img src="/images/ai-assistant.jpg" alt="AI" /></div>
                <div className="svc-img"><img src="/images/digital-twin.jpg" alt="Digital twin" /></div>
                <div className="svc-img"><img src="/images/hero-campus.jpg" alt="Dashboard" /></div>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ marginBottom: "22px" }}>Từ đặt lịch đến khám phá — giải pháp tham quan toàn diện, tự động và thông minh.</p>
                <a href="#dat-tour" className="btn btn-dark" style={{ margin: "0 auto" }}>
                  Khám phá thêm
                  <span className="btn-arrow">
                    <svg width="11" height="8" viewBox="0 0 12 8" fill="none">
                      <path d="M11.5 3.89L6.5 7.77V4.39H0V3.39H6.5V0L11.5 3.89Z" fill="currentColor" />
                    </svg>
                  </span>
                </a>
              </div>
            </div>
            <div className="svc-right" id="svc-right">
              <div className="svc-item on" data-i="0">
                <div className="svc-row"><div className="svc-name">Robot tự hành AMR</div><div className="svc-num">01</div></div>
                <div className="svc-desc">Robot di động tự hành sử dụng ROS 2, LiDAR và camera RGB-D để điều hướng an toàn trên khuôn viên. Tự tránh vật cản, tuân thủ lộ trình và quay về trạm sạc tự động.</div>
              </div>
              <div className="svc-item" data-i="1">
                <div className="svc-row"><div className="svc-name">Đặt lịch &amp; Lên lộ trình</div><div className="svc-num">02</div></div>
                <div className="svc-desc">Khách tham quan đặt tour qua web app. Hệ thống backend tự động lên lịch, phân bổ robot phù hợp và gửi thông báo thời gian thực về trạng thái chuyến tour.</div>
              </div>
              <div className="svc-item" data-i="2">
                <div className="svc-row"><div className="svc-name">AI Trợ lý đa ngôn ngữ</div><div className="svc-num">03</div></div>
                <div className="svc-desc">Trợ lý AI tích hợp STT, LLM và TTS hỗ trợ tiếng Việt, tiếng Anh và nhiều ngôn ngữ. Thuyết minh điểm tham quan, trả lời câu hỏi tức thì bằng giọng nói.</div>
              </div>
              <div className="svc-item" data-i="3">
                <div className="svc-row"><div className="svc-name">Digital Twin thời gian thực</div><div className="svc-num">04</div></div>
                <div className="svc-desc">Bản sao kỹ thuật số của khuôn viên đồng bộ theo thời gian thực với vị trí robot. Đội vận hành theo dõi toàn bộ đội robot, quản lý lịch trình và phát hiện sự cố tức thì.</div>
              </div>
              <div className="svc-item" data-i="4">
                <div className="svc-row"><div className="svc-name">Bảng điều khiển vận hành</div><div className="svc-num">05</div></div>
                <div className="svc-desc">Dashboard trực quan: theo dõi trạng thái pin, lịch tour, cảnh báo sự cố và số liệu hiệu suất — tất cả trong một giao diện duy nhất.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="stats-sec">
        <div className="ctn">
          <div className="stats-grid">
            <div className="stat-box">
              <div className="stat-n"><span id="s1">500</span>+</div>
              <div className="stat-lbl">Lượt tham quan / tháng</div>
              <div className="stat-sub">Robot phục vụ không gián đoạn 24/7</div>
            </div>
            <div className="stat-box">
              <div className="stat-n"><span id="s2">15</span>+</div>
              <div className="stat-lbl">Điểm tham quan</div>
              <div className="stat-sub">Tòa nhà, phòng lab, thư viện, công viên</div>
            </div>
            <div className="stat-box">
              <div className="stat-n"><span id="s3">5</span></div>
              <div className="stat-lbl">Ngôn ngữ hỗ trợ</div>
              <div className="stat-sub">Việt, Anh, Pháp, Nhật, Hàn</div>
            </div>
            <div className="stat-box">
              <div className="stat-n"><span id="s4">99</span><span className="ac">%</span></div>
              <div className="stat-lbl">Uptime hệ thống</div>
              <div className="stat-sub">Giám sát và phục hồi tự động</div>
            </div>
          </div>
        </div>
      </div>

      <section className="how-sec" id="robot">
        <div className="ctn">
          <div className="flex-sb" style={{ alignItems: "flex-end" }}>
            <div>
              <div className="sub">// &nbsp; Hệ thống robot</div>
              <h2 className="sec-title">Công nghệ trong từng bước đi</h2>
            </div>
            <div className="how-nav">
              <button className="how-btn" id="how-prev">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button className="how-btn" id="how-next">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className="how-slides" id="how-slides">
          <div className="how-track" id="how-track">
            <div className="how-slide on">
              <img src="/images/hero-campus.jpg" alt="Nav" />
              <div className="how-cnt">
                <div className="how-num">01 — NAVIGATION</div>
                <div className="how-ttl">Điều hướng tự hành ROS 2</div>
                <div className="how-dsc">SLAM, Nav2, costmap — robot tự tạo bản đồ và lên kế hoạch đường đi tối ưu</div>
              </div>
            </div>
            <div className="how-slide">
              <img src="/images/digital-twin.jpg" alt="DT" />
              <div className="how-cnt">
                <div className="how-num">02 — DIGITAL TWIN</div>
                <div className="how-ttl">Bản sao kỹ thuật số</div>
                <div className="how-dsc">Đồng bộ trạng thái robot và môi trường theo thời gian thực qua ROS Bridge</div>
              </div>
            </div>
            <div className="how-slide">
              <img src="/images/ai-assistant.jpg" alt="AI" />
              <div className="how-cnt">
                <div className="how-num">03 — AI ASSISTANT</div>
                <div className="how-ttl">STT · LLM · TTS Pipeline</div>
                <div className="how-dsc">Whisper STT → LLM dialogue → TTS engine — hội thoại tự nhiên đa ngôn ngữ</div>
              </div>
            </div>
            <div className="how-slide">
              <img src="/images/booking-app.jpg" alt="Book" />
              <div className="how-cnt">
                <div className="how-num">04 — BOOKING</div>
                <div className="how-ttl">API Đặt lịch &amp; Điều phối</div>
                <div className="how-dsc">FastAPI phân bổ tour, điều phối đội robot và quản lý hàng đợi tự động</div>
              </div>
            </div>
            <div className="how-slide">
              <img src="/images/hero-campus.jpg" alt="Ops" />
              <div className="how-cnt">
                <div className="how-num">05 — OPERATIONS</div>
                <div className="how-ttl">Dashboard vận hành đội robot</div>
                <div className="how-dsc">Theo dõi pin, cảnh báo, metrics — quản lý toàn bộ fleet từ một nơi duy nhất</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="tech-sec">
        <div className="ctn">
          <div className="flex-sb">
            <div style={{ flex: "1 1 38%", minWidth: 0 }}>
              <div className="sub">// &nbsp; Nghiên cứu &amp; phát triển</div>
              <h2 className="sec-title">Được xây dựng trên nền tảng vững chắc</h2>
            </div>
            <div style={{ flex: "1 1 28%", minWidth: 0, maxWidth: '360px' }}>
              <p>Hệ thống tích hợp các công nghệ robotics, AI và IoT tiên tiến nhất, phát triển theo phương pháp Agile với kiểm thử liên tục.</p>
            </div>
          </div>
          <div className="tech-grid">
            <div className="tech-card">
              <div className="tech-curtain"></div>
              <div className="tech-body">
                <div className="tech-tag">ROS 2 HUMBLE</div>
                <div className="tech-ttl">Navigation Stack</div>
                <div className="tech-sub">Nav2 · SLAM Toolbox · MoveIt 2</div>
              </div>
            </div>
            <div className="tech-card">
              <div className="tech-curtain"></div>
              <div className="tech-body">
                <div className="tech-tag">AI STACK</div>
                <div className="tech-ttl">Multilingual Pipeline</div>
                <div className="tech-sub">Whisper STT · GPT-4o · Coqui TTS</div>
              </div>
            </div>
            <div className="tech-card">
              <div className="tech-curtain"></div>
              <div className="tech-body">
                <div className="tech-tag">BACKEND</div>
                <div className="tech-ttl">Booking &amp; Dispatch API</div>
                <div className="tech-sub">FastAPI · PostgreSQL · Redis · AWS EC2</div>
              </div>
            </div>
            <div className="tech-card">
              <div className="tech-curtain"></div>
              <div className="tech-body">
                <div className="tech-tag">FRONTEND</div>
                <div className="tech-ttl">Visitor App &amp; Dashboard</div>
                <div className="tech-sub">React · TypeScript · Vite · Three.js</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-sec" id="dat-tour">
        <div className="ctn">
          <div className="cta-box">
            <div className="cta-glow"></div>
            <div className="sub" style={{ color: "var(--accent)", position: "relative", zIndex: 1 }}>// &nbsp; Bắt đầu ngay hôm nay</div>
            <h2 className="cta-t">Trải nghiệm<br />khuôn viên theo<br />cách mới</h2>
            <p className="cta-p">Đặt lịch tour với robot AMR — nhanh chóng, thông minh và hoàn toàn tự động. Khám phá đại học theo cách chưa từng có.</p>
            <div className="cta-btns">
              <Link to="/login" className="btn btn-dark">
                Đăng nhập điều hành
                <span className="btn-arrow">
                  <svg width="11" height="8" viewBox="0 0 12 8" fill="none">
                    <path d="M11.5 3.89L6.5 7.77V4.39H0V3.39H6.5V0L11.5 3.89Z" fill="currentColor" />
                  </svg>
                </span>
              </Link>
              <Link to="/admin/digital-twin" className="btn btn-ghost">Xem demo Digital Twin</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer" id="lien-he">
        <div className="ctn">
          <div className="footer-top">
            <div className="footer-brand">
              <a href="#" className="nav-logo" style={{ fontSize: "17px" }}>
                <div className="logo-box">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26C16.81 13.47 18 11.38 18 9c0-3.87-3.13-7-6-7z" fill="currentColor" />
                    <path d="M9 21h6v-1H9v1z" fill="currentColor" opacity=".6" />
                    <circle cx="12" cy="9" r="2" fill="black" />
                  </svg>
                </div>
                CampusTour DT-AMR
              </a>
              <p className="footer-tag">Hệ thống tham quan khuôn viên đại học bằng robot tự hành AMR kết hợp AI trợ lý đa ngôn ngữ và Digital Twin theo thời gian thực.</p>
            </div>
            <div className="footer-cols">
              <div className="fc">
                <div className="fc-title">Hệ thống</div>
                <a href="#">Robot AMR</a><a href="#">AI Assistant</a><a href="#">Digital Twin</a><a href="#">Booking API</a><a href="#">Dashboard</a>
              </div>
              <div className="fc">
                <div className="fc-title">Thông tin</div>
                <a href="#">Về dự án</a><a href="#">Kiến trúc hệ thống</a><a href="#">Tài liệu kỹ thuật</a><a href="#">Nhóm phát triển</a>
              </div>
              <div className="fc">
                <div className="fc-title">Liên hệ</div>
                <a href="#">GitHub Repository</a><a href="#">Báo lỗi</a><a href="#">Đóng góp</a><a href="#">Email nhóm</a>
              </div>
            </div>
          </div>
          <div className="footer-bot">
            <div className="footer-copy">© 2026 CampusTour DT-AMR. Dự án nghiên cứu &amp; phát triển.</div>
            <div className="soc">
              <a href="#" className="soc-a">GH</a><a href="#" className="soc-a">FB</a><a href="#" className="soc-a">YT</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

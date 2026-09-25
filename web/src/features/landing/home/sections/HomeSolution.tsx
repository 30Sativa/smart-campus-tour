import type { CSSProperties } from 'react'
import { solutionCards, tickerItems } from '../home-content'
import type { SolutionCard } from '../home-content'
import { DotLink, Kicker, RevealWords, SplitText } from '../primitives'

const k = (n: number) => ({ '--k': n }) as CSSProperties

function Graphic({ kind }: { kind: SolutionCard['graphic'] }) {
  switch (kind) {
    case 'ellipses':
      return (
        <div className="hm-gfx hm-gfx--ell">
          {[0, 1, 2, 3, 4, 5, 6].map((n) => <span key={n} style={k(n)} />)}
          <b />
        </div>
      )
    case 'ripple':
      return (
        <div className="hm-gfx hm-gfx--ripple">
          {[0, 1, 2, 3].map((n) => <span key={n} style={k(n)} />)}
          <b />
        </div>
      )
    case 'pan':
      return (
        <div className="hm-gfx hm-gfx--pan">
          <i className="al s" /><i className="al" />
          <span className="cam">
            <svg viewBox="0 0 26 26"><rect x="4" y="8" width="18" height="11" rx="3" fill="#bde74e" /><circle cx="13" cy="13.5" r="3" fill="#1c1c1c" /><path d="M13 3v5" stroke="#bde74e" strokeWidth="2" strokeLinecap="round" /></svg>
          </span>
          <i className="ar" /><i className="ar s" />
        </div>
      )
    case 'grid':
      return (
        <div className="hm-gfx">
          <div className="hm-gfx--grid">
            {[0, 1, 2, 5, 4, 3, 6, 7, 8].map((n, i) => <span key={i} style={k(n)} />)}
          </div>
        </div>
      )
  }
}

/** Dark band: the promise, four animated cards, a scroll-lit statement and the ticker. */
export function HomeSolution() {
  const ticker = [...tickerItems, ...tickerItems]

  return (
    <section className="hm-solution" id="giai-phap">
      <div className="hm-ctn">
        <div className="hm-split2 hm-solution__main">
          <div><Kicker className="hm-fade">Giải pháp của chúng tôi</Kicker></div>
          <div>
            <SplitText
              className="hm-solution__title"
              text="Một backend điều phối, một robot tự hành, một luồng hình chung và trợ lý AI riêng cho từng học sinh, gói trong một buổi tham quan tự chạy."
            />
            <div className="hm-fade" style={{ marginTop: 40 }}>
              <DotLink href="#quy-trinh">Xem quy trình một buổi tham quan</DotLink>
            </div>
          </div>
        </div>
        <div className="hm-cards">
          {solutionCards.map((c, i) => (
            <div key={c.id} className={c.light ? 'hm-card hm-card--light hm-fade' : 'hm-card hm-fade'} style={{ '--d': `${i * 100}ms` } as CSSProperties}>
              <div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
              <Graphic kind={c.graphic} />
            </div>
          ))}
        </div>
      </div>

      <div className="hm-statement" id="hm-statement-wrap">
        <div className="hm-statement__sticky">
          <div className="hm-statement__bg" aria-hidden="true">
            <img src="/images/ai-fleet-management-autonomous-robot-fleet.webp" alt="" loading="lazy" decoding="async" />
          </div>
          <RevealWords
            id="hm-statement"
            className="hm-statement__text"
            accent="CampusTour"
            text="kết nối học sinh, nhà trường, công nghệ và một robot tự hành để mỗi lớp học có thể đi qua từng góc của khuôn viên, trực tiếp, chỉ bằng một đường link."
          />
        </div>
      </div>

      <div className="hm-ticker" aria-hidden="true">
        <div className="hm-ticker__track">
          {ticker.map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>
    </section>
  )
}

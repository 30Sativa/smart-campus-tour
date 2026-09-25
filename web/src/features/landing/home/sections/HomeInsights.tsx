import type { CSSProperties } from 'react'
import { insights } from '../home-content'
import type { Insight } from '../home-content'
import { ArrowRightIcon, Kicker, SplitText } from '../primitives'
import { TourStateDiagram } from './illustrations'

/**
 * Two highlighted notes and three regular ones. The notes are not published as
 * pages yet, so the cards are not links; the hover badge says so instead of
 * pointing at a dead URL.
 */
function Card({ item, delay }: { item: Insight; delay: number }) {
  return (
    <article
      className={item.highlight ? 'hm-post hm-post--hl hm-fade' : 'hm-post hm-post--def hm-fade'}
      style={{ '--d': `${delay}ms` } as CSSProperties}
    >
      <div className="hm-post__thumb">
        {item.image ? (
          <img src={item.image} alt={item.alt} loading="lazy" decoding="async" style={{ objectPosition: item.imagePosition }} />
        ) : (
          <TourStateDiagram label={item.alt} />
        )}
        <span className="hm-post__cat">{item.category}</span>
        <span className="hm-post__more">Sắp đăng<i><ArrowRightIcon /></i></span>
      </div>
      <div>
        {item.highlight && <div className="hm-post__tag">● Điểm nổi bật</div>}
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
      </div>
    </article>
  )
}

export function HomeInsights() {
  const highlights = insights.filter((i) => i.highlight)
  const rest = insights.filter((i) => !i.highlight)

  return (
    <section className="hm-insights" id="goc-ky-thuat">
      <div className="hm-ctn">
        <div className="hm-split2 hm-insights__head">
          <div><Kicker className="hm-fade">Góc kỹ thuật</Kicker></div>
          <SplitText className="hm-insights__title" text="Ghi chép từ quá trình xây dựng robot dẫn tour." />
        </div>
        <div className="hm-insights__hl">
          {highlights.map((item, i) => <Card key={item.id} item={item} delay={i * 120} />)}
        </div>
        <div className="hm-insights__def">
          {rest.map((item, i) => <Card key={item.id} item={item} delay={i * 120} />)}
        </div>
      </div>
    </section>
  )
}

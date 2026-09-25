import type { CSSProperties } from 'react'
import { processSteps } from '../home-content'
import { Kicker, SplitText } from '../primitives'
import { RouteMap } from './illustrations'

/** Four steps with a progress line that follows the scroll. */
export function HomeProcess() {
  return (
    <section className="hm-process" id="quy-trinh">
      <div className="hm-ctn">
        <div className="hm-split2">
          <div><Kicker className="hm-fade">Cách một buổi tham quan diễn ra</Kicker></div>
          <SplitText className="hm-process__title" text="Bốn bước từ bảng Excel tới buổi tham quan trực tiếp." />
        </div>
        <div className="hm-progress" id="hm-progress" aria-hidden="true"><i /><b /></div>
        <ol className="hm-steps" id="hm-steps">
          {processSteps.map((s, i) => (
            <li key={s.id} className="hm-step hm-fade" style={{ '--d': `${i * 120}ms` } as CSSProperties}>
              <div className="hm-step__n"><em>{s.step}</em><span>{s.actor}</span></div>
              <div className="hm-step__ph">
                {s.image ? <img src={s.image} alt={s.alt} loading="lazy" decoding="async" /> : <RouteMap label={s.alt} />}
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

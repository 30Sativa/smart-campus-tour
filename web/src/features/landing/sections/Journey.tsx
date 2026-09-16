import { CalendarCheck, Languages, Route } from 'lucide-react'
import { journeySteps } from '../landing-content'

const icons = [CalendarCheck, Route, Languages] as const

/**
 * Three stages, three cells. The grid is deliberately uneven (one tall cell
 * plus two stacked) so the section does not read as the usual row of identical
 * feature cards, and every cell carries a real photograph.
 */
export function Journey() {
  return (
    <section className="lp-sec lp-ctn" id="quy-trinh">
      <div className="lp-jrn__head">
        <h2 className="lp-h2" data-reveal>
          Hành trình của một chuyến tour
        </h2>
        <p className="lp-body" data-reveal style={{ marginTop: 18 }}>
          Ba bước, từ lúc khách đặt lịch tới lúc robot đưa họ đi hết lộ trình.
        </p>
      </div>

      <div className="lp-jrn__grid">
        {journeySteps.map((step, index) => {
          const Icon = icons[index]
          return (
            <article className="lp-step" key={step.id} data-reveal>
              <div className="lp-step__img">
                <img src={step.image} alt={step.alt} loading="lazy" decoding="async" />
              </div>
              <div className="lp-step__scrim" aria-hidden="true" />
              <span className="lp-step__icon" aria-hidden="true">
                <Icon size={20} strokeWidth={1.75} />
              </span>
              <h3 className="lp-step__title">{step.title}</h3>
              <p className="lp-step__body">{step.body}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

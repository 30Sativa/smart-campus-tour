import { metrics } from '../landing-content'

/**
 * A hairline rail, not four boxes. The figures are the project's operating
 * targets and the heading says so, so nothing here reads as a measured result
 * the system has not produced yet.
 */
export function Metrics() {
  return (
    <section className="lp-sec lp-sec--compact lp-sunk" id="chi-so">
      <div className="lp-ctn">
        <h2 className="lp-h2" data-reveal>
          Mục tiêu vận hành của hệ thống
        </h2>

        <div className="lp-met__grid">
          {metrics.map((metric) => (
            <div className="lp-met__cell" key={metric.id} data-reveal>
              <p className="lp-met__n">
                <span id={metric.id}>{metric.value}</span>
                {metric.suffix}
                {metric.accentSuffix ? <em>{metric.accentSuffix}</em> : null}
              </p>
              <p className="lp-met__lbl">{metric.label}</p>
              <p className="lp-met__sub">{metric.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

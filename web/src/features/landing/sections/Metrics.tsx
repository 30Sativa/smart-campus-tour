import { metrics } from '../landing-content'

/**
 * A hairline rail, not four boxes. The figures are the project's operating
 * targets and the section says so, so nothing here reads as a measured claim
 * the system has not made yet.
 */
export function Metrics() {
  return (
    <section className="lp-sec lp-sunk" id="chi-so">
      <div className="lp-ctn">
        <h2 className="lp-h2" data-reveal>
          Mục tiêu vận hành của hệ thống
        </h2>

        <div className="lp-met__grid" style={{ marginTop: 40 }}>
          {metrics.map((metric) => (
            <div className="lp-met__cell" key={metric.id} data-reveal>
              <div className="lp-met__n">
                <span id={metric.id}>{metric.value}</span>
                {metric.suffix}
                {metric.accentSuffix ? <em>{metric.accentSuffix}</em> : null}
              </div>
              <div className="lp-met__lbl">{metric.label}</div>
              <p className="lp-met__sub">{metric.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

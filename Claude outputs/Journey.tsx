import { journeySteps } from '../landing-content'

/**
 * The four stages of one visit, as a process rather than a gallery.
 *
 * What makes it read as a sequence in about three seconds: an ordered list, a
 * numbered tick sitting on a shared rule across the top of every card, and the
 * same shape repeated four times. Captions sit under the photograph instead of
 * on top of it, because three of the four images already carry UI of their own.
 */
export function Journey() {
  return (
    <section className="lp-sec lp-ctn" id="quy-trinh">
      <div className="lp-jrn__head">
        <h2 className="lp-h2" data-reveal>
          Hành trình của một chuyến Campus Tour
        </h2>
        <p className="lp-body" data-reveal>
          Bốn bước, từ lúc khách chọn tour tới lúc robot quay về trạm sạc.
        </p>
      </div>

      <ol className="lp-jrn__grid">
        {journeySteps.map((step) => (
          <li className="lp-step" key={step.id} data-reveal>
            <p className="lp-step__num">{step.step}</p>
            <div className="lp-step__img">
              <img src={step.image} alt={step.alt} loading="lazy" decoding="async" />
            </div>
            <h3 className="lp-step__title">{step.title}</h3>
            <p className="lp-step__body">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

import { marqueeItems } from '../landing-content'

/**
 * The only marquee on the page. It shows the breadth of the stack without
 * giving each keyword a card it does not deserve. Duplicated once so the
 * translate loop can wrap seamlessly.
 */
export function Marquee() {
  const loop = [...marqueeItems, ...marqueeItems]

  return (
    <div className="lp-mq" aria-hidden="true">
      <div className="lp-mq__track" id="marquee-track">
        {loop.map((item, index) => (
          <span className="lp-mq__item" key={`${item}-${index}`}>
            {item}
            <span className="lp-mq__sep">/</span>
          </span>
        ))}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { faqs } from '../home-content'
import { SplitText } from '../primitives'

export function HomeFaq() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section className="hm-faq" id="hoi-dap">
      <div className="hm-ctn hm-split2">
        <SplitText className="hm-faq__title" text="Câu hỏi thường gặp" />
        <div>
          {faqs.map((f, i) => {
            const isOpen = open === i
            return (
              <div key={f.q} className="hm-qa" data-open={isOpen}>
                <h3 className="hm-qa__head">
                  <button type="button" aria-expanded={isOpen} aria-controls={`faq-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                    <span className="hm-qa__q">{f.q}</span>
                    <span className="hm-qa__pm" aria-hidden="true" />
                  </button>
                </h3>
                <div className="hm-qa__a" id={`faq-${i}`}>
                  <div><p>{f.a}</p></div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

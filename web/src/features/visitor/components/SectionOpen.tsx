import type { ReactNode } from 'react'

/**
 * The opener for a section inside a page.
 *
 * Before this existed each page drew its own: a `.vs-secnav` with an `h2` here,
 * a bare heading there, a heading plus a link somewhere else. That is how eleven
 * screens end up looking like eleven products. This is the one shape, and it is
 * the reference design's: a hairline, an accent eyebrow, a large heading, and
 * whatever the section's own action is pushed to the far edge.
 *
 * `id` is passed straight to the heading so the calling `<section>` can point
 * `aria-labelledby` at it and the page keeps a real document outline.
 */
export function SectionOpen({
  eyebrow,
  title,
  id,
  lead,
  action,
}: {
  eyebrow: string
  title: string
  id?: string
  /** One short line. Sits opposite the title on a wide screen. */
  lead?: string
  action?: ReactNode
}) {
  return (
    <div className="vs-open">
      <div className="vs-open__text">
        <p className="vs-eyebrow">{eyebrow}</p>
        <h2 className="vs-open__title" id={id}>
          {title}
        </h2>
      </div>
      {lead && !action && <p className="vs-open__lead">{lead}</p>}
      {action}
    </div>
  )
}

import type { ReactNode } from 'react'

/**
 * The page masthead, in the reference design's language.
 *
 * Every visitor page renders this, which is why it is where the redesign is
 * cheapest to apply: one change here moves eleven screens at once, and none of
 * them can drift from the others because none of them draws its own heading.
 *
 * The shape is the reference's section opener — a rule, an accent eyebrow, a
 * large display title, and the supporting line set on its own measure beside it
 * rather than underneath. The header above names the product and the current
 * section, so this must not repeat either: each line says something new. The
 * same rule also applies to `features/staff/StaffUi.tsx`'s PageHeader.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="vs-head">
      <div className="vs-head__text">
        <p className="vs-eyebrow">{eyebrow}</p>
        <h1 className="vs-title">{title}</h1>
      </div>

      {/* The lead and the actions share the far column: on a wide screen the
          measure stays short and the page keeps a two-column masthead; below
          768px they stack under the title in reading order. */}
      {(description || actions) && (
        <div className="vs-head__side">
          {description && <p className="vs-lead">{description}</p>}
          {actions && <div className="vs-head__actions">{actions}</div>}
        </div>
      )}
    </header>
  )
}

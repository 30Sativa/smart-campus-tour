import type { ReactNode } from 'react'

/**
 * The page's own heading: eyebrow, title, one supporting line, optional actions.
 *
 * The header above names the product and the current section, so this must not
 * repeat either — each of the three lines says something new. Same rule, and the
 * same three-part shape, as `features/operations/OperationsUi.tsx`'s PageHeader.
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
        {description && <p className="vs-lead">{description}</p>}
      </div>
      {actions && <div className="vs-head__actions">{actions}</div>}
    </header>
  )
}

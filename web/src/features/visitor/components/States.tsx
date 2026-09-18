import type { ReactNode } from 'react'
import { AlertCircle, Inbox } from 'lucide-react'
import { ApiError } from '../../../api/client'

/**
 * The three things a data screen can be instead of ready: loading, failed, or
 * genuinely empty. Kept together because they share one frame — a `.vs-card`,
 * the same hairline and radius as the content they stand in for, so the page
 * does not change shape when the data arrives.
 *
 * Mirrors `features/staff/StaffUi.tsx`: an error says what went wrong
 * rather than showing fixtures, and an empty list is never dressed up as an
 * error.
 */

/** Rectangles at the shape of what is coming, not a spinner in the middle. */
export function LoadingSkeleton({ rows = 3, media = false, columns = media ? 3 : rows === 1 ? 1 : 2 }: { rows?: number; media?: boolean; columns?: 1 | 2 | 3 }) {
  return (
    <div className={`vs-grid vs-grid--${columns}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="vs-card">
          {media && <div className="vs-skel" style={{ aspectRatio: '16 / 10', borderRadius: 0 }} />}
          <div className="vs-card__body">
            <div className="vs-skel" style={{ height: 18, width: '58%', borderRadius: 6 }} />
            <div className="vs-skel" style={{ height: 13, width: '34%', marginTop: 10, borderRadius: 6 }} />
            <div className="vs-skel" style={{ height: 13, width: '82%', marginTop: 14, borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** A single panel-shaped placeholder, for a page that loads one panel. */
export function LoadingPanel({ minHeight = 240 }: { minHeight?: number }) {
  return <div className="vs-skel" style={{ minHeight }} aria-busy="true" aria-label="Loading" />
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const detail =
    error instanceof ApiError && error.status === 401
      ? 'Your session has expired. Please sign in again.'
      : error instanceof ApiError && error.status === 403
        ? 'This account does not have access to that.'
        : 'We could not load this just now. Check your connection and try again.'

  return (
    <div className="vs-card">
      <div className="vs-empty" role="alert">
        <span className="vs-empty__mark" style={{ color: 'var(--vs-danger-ink)', borderColor: 'var(--vs-danger-line)', background: 'var(--vs-danger-bg)' }}>
          <AlertCircle size={22} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <p className="vs-empty__title">Something went wrong</p>
        <p className="vs-empty__text">{detail}</p>
        {onRetry && (
          <div className="vs-empty__actions">
            <button type="button" className="lp-btn lp-btn--ghost lp-btn--sm" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function EmptyState({
  title,
  text,
  icon,
  actions,
}: {
  title: string
  text: string
  icon?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="vs-card">
      <div className="vs-empty">
        <span className="vs-empty__mark">{icon ?? <Inbox size={22} strokeWidth={1.9} aria-hidden="true" />}</span>
        <p className="vs-empty__title">{title}</p>
        <p className="vs-empty__text">{text}</p>
        {actions && <div className="vs-empty__actions">{actions}</div>}
      </div>
    </div>
  )
}

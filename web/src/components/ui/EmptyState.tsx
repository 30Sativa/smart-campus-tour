import type { ReactNode } from 'react'
import { Inbox, SearchX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { buttonClass } from './ui-classes'

/**
 * The one way a list says it has nothing to show.
 *
 * - `empty`: there is nothing yet. The title says so in the screen's words,
 *   "Chưa có Tour nào hôm nay", and `action` may offer the way to add one.
 * - `noMatch`: there are rows, but the search or filter hides them all. Use it
 *   only while a search or filter is applied. `onClear` adds a "Xóa bộ lọc" button.
 *
 * It draws no panel of its own, so it sits inside a table body, a card or a panel.
 */
type EmptyStateProps =
  | { variant: 'empty'; title: string; description?: string; action?: ReactNode; icon?: LucideIcon; className?: string }
  | { variant: 'noMatch'; title?: string; description?: string; action?: ReactNode; onClear?: () => void; icon?: LucideIcon; className?: string }

const NO_MATCH_TITLE = 'Không có kết quả phù hợp'
const NO_MATCH_DESCRIPTION = 'Thử từ khóa khác hoặc bỏ bớt bộ lọc.'

export function EmptyState(props: EmptyStateProps) {
  const noMatch = props.variant === 'noMatch'
  const Icon = props.icon ?? (noMatch ? SearchX : Inbox)
  const title = props.title ?? NO_MATCH_TITLE
  const description = props.description ?? (noMatch ? NO_MATCH_DESCRIPTION : undefined)
  const clear = noMatch && props.onClear
    ? <button type="button" onClick={props.onClear} className={buttonClass('secondary', 'sm')}>Xóa bộ lọc</button>
    : null

  return (
    <div role="status" className={`flex flex-col items-center justify-center gap-2 px-6 py-10 text-center ${props.className ?? ''}`}>
      <span className="grid size-10 place-items-center rounded-full bg-[#f1f5f9] text-muted" aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </span>
      <p className="text-sm font-semibold text-[#0f172a]">{title}</p>
      {description && <p className="max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>}
      {(props.action || clear) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {clear}
          {props.action}
        </div>
      )}
    </div>
  )
}

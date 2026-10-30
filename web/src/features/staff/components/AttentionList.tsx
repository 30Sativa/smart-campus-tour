import { Link } from 'react-router'
import type { AttentionItem } from '../attention'
import { buttonClass } from '../../../components/ui/ui-classes'

const DOT: Record<AttentionItem['tone'], string> = {
  danger: 'bg-[#b23e31] shadow-[0_0_0_4px_#fff1ef]',
  warn: 'bg-[#d69412] shadow-[0_0_0_4px_#fff8e6]',
  info: 'bg-[#2d719e] shadow-[0_0_0_4px_#e5f3ff]',
}

/**
 * What needs doing now, first on the page: one line per item with its
 * severity, what it is, and the one button that deals with it. The same queue
 * the bell reads.
 */
export function AttentionList({ items, max = 4 }: { items: AttentionItem[]; max?: number }) {
  if (items.length === 0) return null
  return (
    <section aria-label="Cần chú ý ngay" className="mb-3">
      <ul className="grid gap-1.5">
        {items.slice(0, max).map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e2e8f0] bg-white p-3 sm:px-4">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${DOT[item.tone]}`} />
            <p className="min-w-[160px] flex-1 text-sm">
              <b className="font-semibold text-[#0f172a]">{item.subject}</b>
              <span className="mt-0.5 block text-[#64748b]">{item.headline}{item.detail ? ` · ${item.detail}` : ''}</span>
            </p>
            <Link to={item.to} className={buttonClass(item.tone === 'danger' ? 'primary' : 'secondary', 'sm')}>{item.toLabel}</Link>
          </li>
        ))}
      </ul>
      {items.length > max && <p className="mt-1 text-xs text-[#64748b]">Còn {items.length - max} việc khác trong chuông thông báo.</p>}
    </section>
  )
}

import { useEffect, useId, useRef, useState } from 'react'
import { Bell, CheckCheck, ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import type { TechnicalActionItem } from './api/diagnostics-api'
import { useTechnicalDashboard } from './technical-hooks'

/** The bell re-reads the Dashboard on its own; the Dashboard page polls faster while it is open. */
const POLL_MS = 60_000

const RANK: Record<string, number> = { DANGER: 0, WARNING: 1 }
const DOT: Record<string, string> = { DANGER: 'bg-[#dc2626]', WARNING: 'bg-[#f59e0b]' }

/** Only links into this area are followed, as on the Dashboard. */
const internalLink = (url: string | null) => (url && url.startsWith('/technical/') ? url : null)

/**
 * The Technical bell: the work items the Dashboard already lists (held robots,
 * map mismatches, POI and route queues), from the same `/api/technical/dashboard`
 * read and the same cache. They are open work, not notices, so nothing is marked
 * read: an item leaves the bell when the work is done.
 */
export function TechnicalBell() {
  const dashboard = useTechnicalDashboard(POLL_MS)
  const items = [...(dashboard.data?.actionItems ?? [])].sort((a, b) => (RANK[a.severity] ?? 2) - (RANK[b.severity] ?? 2))
  const urgent = items.filter((item) => item.severity === 'DANGER').length

  const [open, setOpen] = useState(false)
  const panelId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const [seenPath, setSeenPath] = useState(location.pathname)
  if (seenPath !== location.pathname) {
    setSeenPath(location.pathname)
    if (open) setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [open])

  const parts = [items.length ? `${items.length} việc đang chờ` : '', urgent ? `${urgent} nghiêm trọng` : ''].filter(Boolean)
  const label = parts.length ? `Thông báo, ${parts.join(', ')}` : 'Thông báo'
  return (
    <div ref={wrapRef} className="relative">
      <button ref={buttonRef} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={panelId} aria-label={label}
        className={`relative grid size-9 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${open ? 'bg-[#eceef1] text-[#374151]' : 'text-[#6b7280] hover:bg-[#eceef1] hover:text-[#374151]'}`}>
        <Bell size={17} aria-hidden="true" />
        {items.length > 0 && (
          <span aria-hidden="true" className={`absolute top-0.5 right-0 grid min-w-4 place-items-center rounded-full px-1 text-[9.5px] leading-4 font-bold text-white tabular-nums ring-2 ring-[#f6f7f9] ${urgent ? 'bg-[#dc2626]' : 'bg-[#2d719e]'}`}>{items.length > 9 ? '9+' : items.length}</span>
        )}
      </button>
      {open && (
        <div id={panelId} role="region" aria-label="Bảng thông báo"
          className="absolute top-[calc(100%+10px)] right-0 z-50 w-[min(380px,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_16px_40px_-16px_rgba(17,24,39,0.3)] transition-[opacity,scale] duration-200 ease-out starting:scale-95 starting:opacity-0 motion-reduce:transition-none">
          <div className="flex items-center justify-between gap-3 border-b border-[#f1f2f4] px-4 py-3">
            <h2 className="text-sm font-bold text-[#111827]">Việc đang chờ</h2>
            {items.length > 0 && <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-[11px] font-bold text-[#b23e31] tabular-nums">{items.length}</span>}
          </div>
          <div className="max-h-[min(520px,70vh)] overflow-y-auto">
            {items.length > 0 ? (
              <ul className="divide-y divide-[#f3f4f6]">{items.map((item, index) => <BellRow key={`${item.type}-${item.targetId ?? index}`} item={item} />)}</ul>
            ) : dashboard.isError ? (
              <p className="px-4 py-4 text-sm font-semibold text-[#b45309]">Không đọc được việc đang chờ. Bảng này sẽ tự thử lại; mở Tổng quan để kiểm tra.</p>
            ) : dashboard.isPending ? (
              <p className="px-4 py-4 text-sm text-[#6b7280]">Đang tải...</p>
            ) : (
              <p className="flex items-center gap-2.5 px-4 py-4 text-sm font-semibold text-[#16a34a]"><CheckCheck size={18} aria-hidden="true" />Không có việc đang chờ.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function BellRow({ item }: { item: TechnicalActionItem }) {
  const to = internalLink(item.linkUrl)
  const body = (
    <>
      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[item.severity] ?? 'bg-[#3b82f6]'}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-5 font-semibold text-[#111827]">{item.title}</span>
        <span className="mt-0.5 line-clamp-2 block text-xs text-[#6b7280]">{item.description}</span>
        {to && <span className="mt-1 inline-flex items-center gap-0.5 text-xs font-bold text-[#2d719e] group-hover:underline">Mở<ChevronRight size={13} aria-hidden="true" /></span>}
      </span>
    </>
  )
  return (
    <li>
      {to
        ? <Link to={to} className="group flex gap-3 px-4 py-3 transition-colors hover:bg-[#f8f9fb] focus-visible:bg-[#f1f8fe] focus-visible:outline-none">{body}</Link>
        : <div className="flex gap-3 px-4 py-3">{body}</div>}
    </li>
  )
}

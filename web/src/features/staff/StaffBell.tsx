import { useEffect, useId, useRef, useState } from 'react'
import { Bell, CheckCheck, ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useStaffAmrs, useTours } from './staff-hooks'
import { buildAttentionQueue, type AttentionItem } from './attention'
import { useNow } from './use-now'

const DOT: Record<AttentionItem['tone'], string> = { danger: 'bg-[#dc2626]', warn: 'bg-[#f59e0b]', info: 'bg-[#3b82f6]' }
const LINK: Record<AttentionItem['tone'], string> = { danger: 'text-[#dc2626]', warn: 'text-[#b45309]', info: 'text-[#2d719e]' }

/**
 * The bell at the top right of operations: the same attention queue the
 * dashboard used to list ("Cần chú ý"), one click from anywhere. A session
 * that needs assistance is counted and named first.
 */
export function StaffBell() {
  const tours = useTours()
  const robots = useStaffAmrs()
  const now = useNow(15_000)
  const items = tours.data && robots.data ? buildAttentionQueue({ tours: tours.data, robots: robots.data }, now) : []
  const urgent = items.filter((item) => item.tone === 'danger').length
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

  const label = items.length ? `Thông báo, ${items.length} việc cần chú ý${urgent ? `, ${urgent} buổi cần hỗ trợ` : ''}` : 'Thông báo'
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
        <div id={panelId} role="region" aria-label="Cần chú ý"
          className="absolute top-[calc(100%+10px)] right-0 z-50 w-[min(380px,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_16px_40px_-16px_rgba(17,24,39,0.3)] transition-[opacity,scale] duration-200 ease-out starting:scale-95 starting:opacity-0 motion-reduce:transition-none">
          <div className="flex items-center justify-between gap-3 border-b border-[#f1f2f4] px-4 py-3">
            <p className="text-sm font-bold text-[#111827]">Cần chú ý</p>
            {items.length > 0 && <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-[11px] font-bold text-[#b23e31] tabular-nums">{items.length}</span>}
          </div>
          {items.length === 0 ? (
            <p className="flex items-center gap-2.5 px-4 py-5 text-sm font-semibold text-[#16a34a]"><CheckCheck size={18} aria-hidden="true" />Hệ thống hoạt động bình thường, không có sự cố.</p>
          ) : (
            <ul className="max-h-[min(440px,60vh)] divide-y divide-[#f3f4f6] overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <Link to={item.to} className="group flex gap-3 px-4 py-3 transition-colors hover:bg-[#f8f9fb] focus-visible:bg-[#f1f8fe] focus-visible:outline-none">
                    <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[item.tone]} ${item.tone === 'danger' ? 'animate-pulse motion-reduce:animate-none' : ''}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-5 font-semibold text-[#111827]">{item.subject}</span>
                      <span className={`block text-xs font-semibold ${LINK[item.tone]}`}>{item.headline}</span>
                      {item.detail && <span className="mt-0.5 line-clamp-2 block text-xs text-[#6b7280]">{item.detail}</span>}
                      <span className={`mt-1 inline-flex items-center gap-0.5 text-xs font-bold group-hover:underline ${LINK[item.tone]}`}>{item.toLabel}<ChevronRight size={13} aria-hidden="true" /></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

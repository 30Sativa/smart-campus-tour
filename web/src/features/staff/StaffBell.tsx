import { useEffect, useId, useRef, useState } from 'react'
import { Bell, CheckCheck, ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { campusDay } from '../administration/tours/tour-calendar'
import { formatRelative } from '../../components/ui/date-time'
import { useNow } from './use-now'
import { useDayTours, useRunningTours, useToursNeedingReconcile } from './operations/hooks'
import { buildAttention, type AttentionItem } from './operations/attention'
import { useStaffNotifications } from './notifications/notifications-api'
import { toStaffNotices, type StaffNotice } from './notifications/staff-notices'
import { useReadNotices } from './notifications/read-notices'

const DOT: Record<AttentionItem['tone'] | StaffNotice['tone'], string> = { danger: 'bg-[#dc2626]', warn: 'bg-[#f59e0b]', info: 'bg-[#3b82f6]', ok: 'bg-[#16a34a]' }
const LINK: Record<AttentionItem['tone'] | StaffNotice['tone'], string> = { danger: 'text-[#dc2626]', warn: 'text-[#b45309]', info: 'text-[#2d719e]', ok: 'text-[#15803d]' }

/**
 * The bell at the top right of operations, in two parts: what needs a person
 * now, from real Tours (a Tour that needs assistance first), and what Technical
 * Staff ("Kỹ thuật" on screen, by full name) decided on Staff's POIs, Routes, maps and held robots. The count is the
 * open work plus the notices this account has not seen; opening the bell sees them.
 */
export function StaffBell() {
  const running = useRunningTours()
  const today = useDayTours(campusDay(new Date()))
  const ended = useToursNeedingReconcile()
  const items = buildAttention(running.tours, today.data?.data ?? [], ended.tours)
  const urgent = items.filter((item) => item.tone === 'danger').length
  // An empty list only means "nothing to do" once every source answered; otherwise the bell would give a false all-clear.
  const attentionFailed = running.isError || today.isError || ended.list.isError
  const attentionLoading = !attentionFailed && (running.isPending || today.isPending || ended.list.isPending)

  const owner = useAuthStore((state) => state.user?.userId) ?? ''
  const notifications = useStaffNotifications()
  const notices = toStaffNotices(notifications.data ?? [])
  const { readIds, markRead } = useReadNotices(owner)
  const unread = notices.filter((notice) => !readIds.has(notice.id))
  const now = useNow(60_000)

  const [open, setOpen] = useState(false)
  // Opening the bell is seeing it: the count clears, but what was new stays marked until the panel closes.
  const [newOnOpen, setNewOnOpen] = useState<ReadonlySet<string>>(new Set())
  const toggle = () => {
    if (!open) {
      setNewOnOpen(new Set(unread.map((notice) => notice.id)))
      markRead(unread.map((notice) => notice.id))
    }
    setOpen(!open)
  }
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

  const count = items.length + unread.length
  const parts = [items.length ? `${items.length} việc cần chú ý` : '', urgent ? `${urgent} cần xử lý ngay` : '', unread.length ? `${unread.length} thông báo chưa đọc` : ''].filter(Boolean)
  const label = parts.length ? `Thông báo, ${parts.join(', ')}` : 'Thông báo'
  return (
    <div ref={wrapRef} className="relative">
      <button ref={buttonRef} type="button" onClick={toggle} aria-expanded={open} aria-controls={panelId} aria-label={label}
        className={`relative grid size-9 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${open ? 'bg-[#eceef1] text-[#374151]' : 'text-[#6b7280] hover:bg-[#eceef1] hover:text-[#374151]'}`}>
        <Bell size={17} aria-hidden="true" />
        {count > 0 && (
          <span aria-hidden="true" className={`absolute top-0.5 right-0 grid min-w-4 place-items-center rounded-full px-1 text-[9.5px] leading-4 font-bold text-white tabular-nums ring-2 ring-[#f6f7f9] ${urgent ? 'bg-[#dc2626]' : 'bg-[#2d719e]'}`}>{count > 9 ? '9+' : count}</span>
        )}
      </button>
      {open && (
        <div id={panelId} role="region" aria-label="Bảng thông báo"
          className="absolute top-[calc(100%+10px)] right-0 z-50 w-[min(380px,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_16px_40px_-16px_rgba(17,24,39,0.3)] transition-[opacity,scale] duration-200 ease-out starting:scale-95 starting:opacity-0 motion-reduce:transition-none">
          <div className="max-h-[min(520px,70vh)] overflow-y-auto">
            <section aria-labelledby={`${panelId}-attention`}>
              <div className="flex items-center justify-between gap-3 border-b border-[#f1f2f4] px-4 py-3">
                <h2 id={`${panelId}-attention`} className="text-sm font-bold text-[#111827]">Cần chú ý</h2>
                {items.length > 0 && <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-[11px] font-bold text-[#b23e31] tabular-nums">{items.length}</span>}
              </div>
              {items.length > 0 ? (
                <ul className="divide-y divide-[#f3f4f6]">
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
              ) : attentionFailed ? (
                <p className="px-4 py-4 text-sm font-semibold text-[#b45309]">Không đọc được danh sách Tour. Bảng này sẽ tự thử lại; mở Tổng quan để kiểm tra.</p>
              ) : attentionLoading ? (
                <p className="px-4 py-4 text-sm text-[#6b7280]">Đang tải...</p>
              ) : (
                <p className="flex items-center gap-2.5 px-4 py-4 text-sm font-semibold text-[#16a34a]"><CheckCheck size={18} aria-hidden="true" />Không có việc cần chú ý.</p>
              )}
            </section>

            <section aria-labelledby={`${panelId}-notices`} className="border-t border-[#e5e7eb]">
              <div className="flex items-center justify-between gap-3 border-b border-[#f1f2f4] px-4 py-3">
                <h2 id={`${panelId}-notices`} className="text-sm font-bold text-[#111827]">Từ Kỹ thuật</h2>
                {unread.length > 0 && (
                  <button type="button" onClick={() => markRead(unread.map((notice) => notice.id))}
                    className="rounded-lg px-1.5 py-0.5 text-xs font-semibold text-[#2d719e] hover:bg-[#f1f8fe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">
                    Đánh dấu đã đọc ({unread.length})
                  </button>
                )}
              </div>
              {notices.length > 0 ? (
                <ul className="divide-y divide-[#f3f4f6]">
                  {notices.map((notice) => {
                    const isUnread = !readIds.has(notice.id) || newOnOpen.has(notice.id)
                    const body = (
                      <>
                        <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${isUnread ? DOT[notice.tone] : 'bg-[#d1d5db]'}`} />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[13px] leading-5 ${isUnread ? 'font-semibold text-[#111827]' : 'font-medium text-[#4b5563]'}`}>
                            {isUnread && <span className="sr-only">Chưa đọc: </span>}{notice.title}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-[#6b7280]">{notice.detail}</span>
                          <span className="mt-1 flex items-center gap-2 text-xs">
                            <span className="text-muted">{formatRelative(notice.occurredAt, now)}</span>
                            {notice.to && <span className={`inline-flex items-center gap-0.5 font-bold group-hover:underline ${LINK[notice.tone]}`}>{notice.toLabel}<ChevronRight size={13} aria-hidden="true" /></span>}
                          </span>
                        </span>
                      </>
                    )
                    const rowClass = `group flex gap-3 px-4 py-3 transition-colors ${isUnread ? 'bg-[#f8fbff]' : ''}`
                    return (
                      <li key={notice.id}>
                        {notice.to ? (
                          <Link to={notice.to} onClick={() => markRead([notice.id])} className={`${rowClass} hover:bg-[#f8f9fb] focus-visible:bg-[#f1f8fe] focus-visible:outline-none`}>{body}</Link>
                        ) : (
                          <div className={rowClass}>{body}</div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : notifications.isError ? (
                <p className="px-4 py-4 text-sm font-semibold text-[#b45309]">Không đọc được thông báo. Bảng này sẽ tự thử lại.</p>
              ) : notifications.isPending ? (
                <p className="px-4 py-4 text-sm text-[#6b7280]">Đang tải...</p>
              ) : (
                <p className="px-4 py-4 text-sm text-[#6b7280]">Chưa có kết quả duyệt nào từ Kỹ thuật.</p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

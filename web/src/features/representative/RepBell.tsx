import { useEffect, useId, useRef, useState } from 'react'
import { Bell, CheckCheck, ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useNow } from '../staff/use-now'
import { useRepRegistrations } from './representative-hooks'
import { buildRepNotices, type RepNotice } from './rep-notices'
import { formatRelative } from './rep-format'
import './rep-bell.css'

const READ_KEY = 'rep-notices-read:'
const READ_CAP = 300

function loadRead(owner: string): string[] {
  try {
    const raw = localStorage.getItem(READ_KEY + owner)
    const list: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}
function saveRead(owner: string, ids: string[]) {
  try { localStorage.setItem(READ_KEY + owner, JSON.stringify(ids.slice(-READ_CAP))) } catch { /* private mode: reads stay for this visit */ }
}

/**
 * The representative's bell: review results and Tour news for their own
 * registrations, with "đã đọc" remembered per account on this browser.
 */
export function RepBell() {
  const owner = useAuthStore((s) => s.user?.userId) ?? ''
  const registrations = useRepRegistrations({ size: 50 })
  const now = useNow(60_000)
  const notices = registrations.data ? buildRepNotices(registrations.data.data, now) : []
  const [read, setRead] = useState<{ owner: string; ids: string[] }>(() => ({ owner, ids: loadRead(owner) }))
  if (read.owner !== owner) setRead({ owner, ids: loadRead(owner) })
  const readSet = new Set(read.ids)
  const unread = notices.filter((n) => !readSet.has(n.id))

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

  const markRead = (ids: string[]) => {
    const next = [...read.ids.filter((id) => !ids.includes(id)), ...ids]
    setRead({ owner, ids: next })
    saveRead(owner, next)
  }

  const label = unread.length ? `Thông báo, ${unread.length} chưa đọc` : 'Thông báo'
  return (
    <div ref={wrapRef} className="rep-bell">
      <button ref={buttonRef} type="button" className="rep-icon-btn rep-bell-btn" data-open={open || undefined}
        onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={panelId} aria-label={label} title="Thông báo">
        <Bell size={18} strokeWidth={1.8} aria-hidden="true" />
        {unread.length > 0 && <span className="rep-bell-count" aria-hidden="true">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {open && (
        <div id={panelId} role="region" aria-label="Thông báo" className="rep-bell-panel">
          <div className="rep-bell-head">
            <p>Thông báo{unread.length > 0 && <span>{unread.length} mới</span>}</p>
            {unread.length > 0 && (
              <button type="button" onClick={() => markRead(notices.map((n) => n.id))}><CheckCheck size={15} aria-hidden="true" />Đánh dấu đã đọc</button>
            )}
          </div>
          {registrations.isPending ? (
            <p className="rep-bell-empty">Đang tải thông báo…</p>
          ) : registrations.isError ? (
            <p className="rep-bell-empty">Chưa tải được thông báo. Thử lại sau ít phút.</p>
          ) : notices.length === 0 ? (
            <p className="rep-bell-empty"><CheckCheck size={18} aria-hidden="true" />Chưa có thông báo nào. Kết quả duyệt đơn và tin về buổi tham quan sẽ hiện ở đây.</p>
          ) : (
            <ul className="rep-bell-list">
              {notices.map((n) => <NoticeRow key={n.id} notice={n} unread={!readSet.has(n.id)} now={now} onOpen={() => markRead([n.id])} />)}
            </ul>
          )}
          <Link to="/dai-dien/dang-ky" className="rep-bell-foot">Xem tất cả đơn đăng ký<ChevronRight size={14} aria-hidden="true" /></Link>
        </div>
      )}
    </div>
  )
}

function NoticeRow({ notice, unread, now, onOpen }: { notice: RepNotice; unread: boolean; now: number; onOpen: () => void }) {
  const when = notice.pinned && notice.tone === 'warn' ? 'Nhắc trước 24 giờ' : notice.at > new Date(now).toISOString() ? 'Sắp tới' : formatRelative(notice.at, now)
  return (
    <li>
      <Link to={notice.to} className="rep-bell-item" data-tone={notice.tone} data-unread={unread || undefined} onClick={onOpen}>
        <span className="rep-bell-dot" aria-hidden="true" />
        <span className="rep-bell-copy">
          <strong>{notice.title}{unread && <span className="sr-only"> (chưa đọc)</span>}</strong>
          <span className="rep-bell-subject">{notice.subject}</span>
          <span className="rep-bell-detail">{notice.detail}</span>
          <span className="rep-bell-meta"><span>{when}</span><span className="rep-bell-go">{notice.toLabel}<ChevronRight size={13} aria-hidden="true" /></span></span>
        </span>
      </Link>
    </li>
  )
}

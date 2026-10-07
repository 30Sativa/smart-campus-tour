import { useEffect, useId, useRef, useState } from 'react'
import { Bell, CheckCheck, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useAdminRegistrations, useAdminTours } from './admin-hooks'
import { buildAdminTasks, type AdminTask } from './admin-attention'

const PENDING = { state: 'Submitted' as const }
const MAX_ITEMS = 6

const TONE_DOT: Record<AdminTask['tone'], string> = {
  warn: 'bg-[#f59e0b]',
  info: 'bg-[#3b82f6]',
  ok: 'bg-[#16a34a]',
}

/** The same work the dashboard lists, read from the same cached queries. */
function useAdminNotifications(): AdminTask[] {
  const tours = useAdminTours()
  const pending = useAdminRegistrations(PENDING)
  if (!Array.isArray(tours.data) || !Array.isArray(pending.data)) return []
  try {
    return buildAdminTasks(tours.data, pending.data)
  } catch {
    // A malformed payload must never take the whole shell down with it.
    return []
  }
}

/**
 * Top-right of the administration header: the work waiting for Admin behind a
 * bell, then the signed-in account. Sign-out stays in the sidebar.
 */
export function AdminHeaderActions({ name, role, icon: UserIcon }: { name: string; role: string; icon: LucideIcon }) {
  const tasks = useAdminNotifications()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const count = tasks.length
  const [seenPath, setSeenPath] = useState(location.pathname)

  // Close the panel when the route changes (a task link was followed).
  if (seenPath !== location.pathname) {
    setSeenPath(location.pathname)
    if (open) setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus() }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="ml-auto flex min-w-0 items-center gap-2.5">
      <div ref={wrapRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={count > 0 ? `Thông báo, ${count} việc cần xử lý` : 'Thông báo'}
          className={`relative grid size-9.5 shrink-0 place-items-center rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${open ? 'border-[#a8cde6] bg-[#f1f8fe] text-[#2d78a9]' : 'border-[#d9e9f5] bg-white text-[#607f93] hover:border-[#a8cde6] hover:bg-[#f1f8fe] hover:text-[#2d78a9]'}`}
        >
          <Bell size={17} aria-hidden="true" />
          {count > 0 && (
            <span aria-hidden="true" className="absolute -top-1 -right-1 grid min-w-4.5 place-items-center rounded-full bg-[#dc2626] px-1 text-[10px] leading-4 font-bold text-white tabular-nums ring-2 ring-white">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>

        {open && (
          <div
            id={panelId}
            role="region"
            aria-label="Việc cần xử lý"
            className="absolute top-[calc(100%+10px)] right-0 z-50 w-[min(360px,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl border border-[#d9e9f5] bg-white shadow-[0_24px_48px_-24px_rgba(23,59,89,0.45)] transition-[opacity,scale] duration-200 ease-out starting:scale-95 starting:opacity-0 motion-reduce:transition-none"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#eef3f7] px-4 py-3">
              <p className="text-sm font-bold text-[#173b59]">Việc cần xử lý</p>
              {count > 0 && <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-[11px] font-bold text-[#b23e31] tabular-nums">{count}</span>}
            </div>
            {count === 0 ? (
              <p className="flex items-center gap-2.5 px-4 py-5 text-sm font-semibold text-[#2f7a5b]"><CheckCheck size={18} aria-hidden="true" />Không có việc nào đang chờ.</p>
            ) : (
              <ul className="max-h-[min(420px,60vh)] divide-y divide-[#f1f5f9] overflow-y-auto">
                {tasks.slice(0, MAX_ITEMS).map((task) => (
                  <li key={task.id}>
                    <Link to={task.to} className="group flex gap-3 px-4 py-3 transition-colors hover:bg-[#f8fbff] focus-visible:bg-[#f1f8fe] focus-visible:outline-none">
                      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE_DOT[task.tone]}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] leading-5 font-semibold text-[#0f172a]">{task.title}</span>
                        {task.detail && <span className="mt-0.5 block truncate text-xs text-[#64748b]">{task.detail}</span>}
                        <span className="mt-1 inline-flex items-center gap-0.5 text-xs font-bold text-[#2d78a9] group-hover:underline">{task.actionLabel}<ChevronRight size={13} aria-hidden="true" /></span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/admin" className="block border-t border-[#eef3f7] bg-[#f8fbff] px-4 py-2.5 text-center text-xs font-bold text-[#2d78a9] hover:bg-[#f1f8fe]">
              {count > MAX_ITEMS ? `Xem tất cả ${count} việc ở Tổng quan` : 'Mở Tổng quan'}
            </Link>
          </div>
        )}
      </div>

      <div role="group" aria-label="Tài khoản đang đăng nhập" className="flex min-w-0 items-center gap-2.5 border-l border-[#e2e8f0] pl-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e3f2ff] text-[#2b6c98]"><UserIcon size={16} aria-hidden="true" /></span>
        <div className="hidden min-w-0 sm:block">
          <p className="max-w-40 truncate text-[13px] leading-tight font-semibold text-[#0f172a]">{name}</p>
          <p className="max-w-40 truncate text-[11px] leading-tight text-[#94a3b8]">{role}</p>
        </div>
      </div>
    </div>
  )
}

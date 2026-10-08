import { useState } from 'react'
import type { Ref } from 'react'
import { ChevronDown, LogOut, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { GroupedNavEntry } from './grouped-nav'

type Badge = { value: number; label: string; tone?: 'info' | 'danger' }
type Secondary = { to: string; label: string; icon: LucideIcon; current?: boolean }

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]'
const tinted = 'bg-gradient-to-r from-[#e5f3ff] to-[#f1f8fe]'

function BadgePill({ badge }: { badge?: Badge }) {
  if (!badge || badge.value <= 0) return null
  return <span className={`ml-auto grid h-[18px] min-w-5 place-items-center rounded-md px-1.5 text-[11px] font-bold text-white tabular-nums ${badge.tone === 'danger' ? 'bg-[#dc2626]' : 'bg-[#2d719e]'}`} aria-label={badge.label}>{badge.value}</span>
}

/**
 * The sidebar both signed-in consoles use: the site's logo, "Trang" (the
 * work) with folding groups, "Khác" (references) and sign-out. The group
 * holding the current page starts open and tinted; what the person folds or
 * unfolds stays that way. Off-canvas below `lg`.
 */
export function GroupedSidebar({ id, label, navLabel, homePath, subtitle, entries, currentPath, badges = {}, secondary = [], onNavigate, onLogout, open, panelRef, closeRef }: {
  id: string
  label: string
  navLabel: string
  homePath: string
  subtitle: string
  entries: GroupedNavEntry[]
  currentPath: string | null
  badges?: Record<string, Badge>
  secondary?: Secondary[]
  onNavigate: () => void
  onLogout: () => void
  open: boolean
  panelRef: Ref<HTMLElement>
  closeRef?: Ref<HTMLButtonElement>
}) {
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  return (
    <aside
      id={id}
      ref={panelRef}
      tabIndex={-1}
      aria-label={label}
      className={`fixed top-0 left-0 z-40 flex h-[100dvh] w-[248px] flex-col bg-white shadow-[1px_0_0_#eceef1] transition-transform duration-300 ease-out lg:sticky lg:translate-x-0 motion-reduce:transition-none focus-visible:outline-none ${open ? 'translate-x-0 shadow-[16px_0_40px_rgba(31,49,77,0.12)]' : '-translate-x-full'}`}
    >
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link to={homePath} onClick={onNavigate} className={`group flex min-w-0 flex-1 items-center gap-3 rounded-xl ${focusRing}`}>
          <span className="grid size-[38px] shrink-0 place-items-center rounded-[11px] bg-white shadow-[0_0_0_1px_#e5e7eb,0_6px_14px_-8px_rgba(17,24,39,0.35)] transition-transform duration-500 group-hover:-rotate-6 motion-reduce:transition-none">
            <img src="/images/logo.png" alt="" width={30} height={30} className="size-[30px] object-contain" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-[-0.03em] text-[#0f172a]">CampusTour</span>
            <span className="block truncate text-[10.5px] font-semibold tracking-[0.04em] text-[#9ca3af]">{subtitle}</span>
          </span>
        </Link>
        <button ref={closeRef} type="button" onClick={onNavigate} className="grid size-9 place-items-center rounded-xl text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] lg:hidden" aria-label="Đóng menu"><X size={19} /></button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3.5 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={navLabel}>
        <p className="mt-3 mb-2 px-2.5 text-[10.5px] font-semibold tracking-[0.08em] text-[#9ca3af] uppercase">Trang</p>
        <div className="space-y-0.5">
          {entries.map((entry) => {
            if (entry.kind === 'link') {
              const { path, label: text, icon: Icon } = entry.item
              const active = currentPath === path
              return (
                <Link key={path} to={path} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                  className={`flex min-h-9 items-center gap-[11px] rounded-[10px] px-2.5 text-[13px] transition-colors ${focusRing} ${active ? `${tinted} font-semibold text-[#0f172a]` : 'font-medium text-[#374151] hover:text-[#0f172a]'}`}>
                  <Icon size={16} strokeWidth={1.9} aria-hidden="true" className={active ? 'text-[#2d719e]' : 'text-[#9ca3af]'} />
                  <span className="min-w-0 flex-1 truncate">{text}</span>
                  <BadgePill badge={badges[path]} />
                </Link>
              )
            }
            const holds = entry.items.some((item) => item.path === currentPath)
            const expanded = toggled[entry.key] ?? holds
            const Icon = entry.icon
            const subId = `${id}-${entry.key.replace(/\s+/g, '-')}`
            const folded = entry.items.reduce((sum, item) => sum + Math.max(0, badges[item.path]?.value ?? 0), 0)
            const foldedTone = entry.items.some((item) => (badges[item.path]?.value ?? 0) > 0 && badges[item.path]?.tone === 'danger') ? 'danger' : 'info'
            return (
              <div key={entry.key} className={`rounded-[10px] transition-colors duration-200 ${holds ? tinted : ''}`}>
                <button type="button" aria-expanded={expanded} aria-controls={subId} onClick={() => setToggled((value) => ({ ...value, [entry.key]: !expanded }))}
                  className={`flex min-h-9 w-full items-center gap-[11px] rounded-[10px] px-2.5 text-left text-[13px] transition-colors ${focusRing} ${holds ? 'font-semibold text-[#0f172a]' : 'font-medium text-[#374151] hover:text-[#0f172a]'}`}>
                  <Icon size={16} strokeWidth={1.9} aria-hidden="true" className={holds ? 'text-[#2d719e]' : 'text-[#9ca3af]'} />
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {!expanded && <BadgePill badge={folded ? { value: folded, label: `${folded} việc trong ${entry.label}`, tone: foldedTone } : undefined} />}
                  <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-[#9ca3af] transition-transform duration-300 motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
                </button>
                <div id={subId} inert={!expanded} className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <div className="pb-1.5">
                      {entry.items.map(({ path, label: text }) => {
                        const active = currentPath === path
                        return (
                          <Link key={path} to={path} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                            className={`flex min-h-7 items-center rounded-lg pr-2.5 pl-[37px] text-[12.5px] transition-colors ${focusRing} ${active ? 'font-semibold text-[#2d719e]' : 'font-medium text-[#6b7280] hover:text-[#0f172a]'}`}>
                            <span className="min-w-0 flex-1 truncate">{text}</span>
                            <BadgePill badge={badges[path]} />
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {secondary.length > 0 && (
          <>
            <p className="mt-5 mb-2 px-2.5 text-[10.5px] font-semibold tracking-[0.08em] text-[#9ca3af] uppercase">Khác</p>
            <div className="space-y-0.5">
              {secondary.map(({ to, label: text, icon: Icon, current }) => (
                <Link key={to} to={to} onClick={onNavigate} aria-current={current ? 'page' : undefined}
                  className={`flex min-h-9 items-center gap-[11px] rounded-[10px] px-2.5 text-[13px] transition-colors ${focusRing} ${current ? `${tinted} font-semibold text-[#0f172a]` : 'font-medium text-[#374151] hover:text-[#0f172a]'}`}>
                  <Icon size={16} strokeWidth={1.9} aria-hidden="true" className={current ? 'text-[#2d719e]' : 'text-[#9ca3af]'} />
                  {text}
                </Link>
              ))}
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-[#eceef1] p-3">
        <button type="button" onClick={onLogout} className={`flex min-h-9 w-full items-center gap-3 rounded-[10px] px-2.5 text-[13px] font-medium text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#0f172a] ${focusRing}`}>
          <LogOut size={16} aria-hidden="true" className="text-[#9ca3af]" />Đăng xuất
        </button>
      </div>
    </aside>
  )
}

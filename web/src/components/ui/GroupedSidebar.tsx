import { useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { ChevronDown, ChevronLeft, LogOut, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { useSidebarStore } from '../../stores/sidebar-store'
import type { GroupedNavEntry } from './grouped-nav'

type Badge = { value: number; label: string; tone?: 'info' | 'danger' }
type Secondary = { to: string; label: string; icon: LucideIcon; current?: boolean }

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]'
const tinted = 'bg-[#f1f8fe] shadow-[inset_3px_0_0_#2d719e]'
/** One curve and one length for everything that moves when the sidebar folds. */
const EASE = 'duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'

/**
 * The sidebar both signed-in consoles use: the site's logo, "Trang" (the
 * work) with folding groups, "Khác" (references) and sign-out. The group
 * holding the current page starts open and tinted; what the person folds or
 * unfolds stays that way. Off-canvas below `lg`.
 *
 * From `lg` up the arrow in its top corner folds it to a 68px icon rail; the
 * choice is remembered per browser. Nothing jumps while it folds: every icon
 * keeps its x position (centred on the rail), labels only fade, the width
 * eases, and charts on the page wait for the end (their resize is debounced).
 * Labels stay in the accessibility tree; on the rail they are also tooltips.
 * A badge fades into a dot on its icon, and choosing a group unfolds the
 * sidebar with that group open.
 */
export function GroupedSidebar({ id, label, navLabel, homePath, subtitle, entries, currentPath, badges = {}, secondary = [], highlight, onNavigate, onLogout, open, panelRef, closeRef, look = 'line' }: {
  id: string
  label: string
  navLabel: string
  homePath: string
  subtitle: string
  entries: GroupedNavEntry[]
  currentPath: string | null
  badges?: Record<string, Badge>
  secondary?: Secondary[]
  /** Something live to keep in view under the logo, e.g. the running session; told whether the sidebar is a rail. */
  highlight?: (rail: boolean) => ReactNode
  onNavigate: () => void
  onLogout: () => void
  open: boolean
  panelRef: Ref<HTMLElement>
  closeRef?: Ref<HTMLButtonElement>
  /**
   * `line` (Admin, Technical): white rail, tinted active row with an inset bar.
   * `soft` (Staff): the rail sits on the page ground, each page has a 30px icon
   * tile, the active page lifts onto a white card and its tile fills blue.
   */
  look?: 'line' | 'soft'
}) {
  const soft = look === 'soft'
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const hasHeadings = entries.some((entry) => entry.kind === 'heading')
  const rail = useSidebarStore((state) => state.collapsed)
  const toggleRail = useSidebarStore((state) => state.toggle)
  const setRail = useSidebarStore((state) => state.setCollapsed)

  /** Fades on the rail (wide screens only: the phone drawer is always full). */
  const fade = `transition-opacity ${EASE} ${rail ? 'lg:pointer-events-none lg:opacity-0' : ''}`
  const row = soft
    ? `relative flex min-h-[44px] items-center gap-3 rounded-[12px] px-2 text-[14px] whitespace-nowrap transition-[background-color,box-shadow,color] duration-200 ${focusRing}`
    : `relative flex min-h-8 items-center gap-[11px] rounded-lg px-3 text-[13px] whitespace-nowrap transition-colors ${focusRing}`
  /** Width of the item column on the rail: the icon stays put while the sidebar folds. */
  const railWidth = soft ? 'lg:w-[46px]' : 'lg:w-10'
  const navPad = soft ? 'px-[11px]' : 'px-3.5'
  const heading = soft ? 'px-2 pt-3 pb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#64748b]' : 'px-3 pb-1 text-[11.5px] font-semibold text-[#6b7280]'
  const activeRow = soft ? 'bg-[#eef2f7]/90 font-semibold text-[#1e293b] ring-1 ring-white/70' : `${tinted} font-semibold text-[#0f172a]`
  const idleRow = soft ? 'font-medium text-[#334155] hover:bg-white/60 hover:text-[#0f172a]' : 'font-medium text-[#374151] hover:text-[#0f172a]'
  /** The page's icon: bare in `line`, on its own tile in `soft`. */
  const glyph = (Icon: LucideIcon, active: boolean) => soft
    ? <span aria-hidden="true" className={`grid size-[30px] shrink-0 place-items-center rounded-xl transition-colors duration-200 ${active ? 'bg-white/90 text-[#5b7fbf]' : 'bg-white/60 text-[#64748b]'}`}><Icon size={15} strokeWidth={2.1} /></span>
    : <Icon size={16} strokeWidth={1.9} aria-hidden="true" className={`shrink-0 ${active ? 'text-[#2d719e]' : 'text-[#9ca3af]'}`} />

  const pill = (badge?: Badge) => {
    if (!badge || badge.value <= 0) return null
    const color = badge.tone === 'danger' ? 'bg-[#dc2626]' : 'bg-[#2d719e]'
    return (
      <>
        <span className={`ml-auto grid h-[18px] min-w-5 place-items-center rounded-md px-1.5 text-[11px] font-bold text-white tabular-nums ${color} ${fade}`} aria-label={badge.label}>{badge.value}</span>
        <span aria-hidden="true" className={`absolute ${soft ? 'top-1.5 left-[34px]' : 'top-1.5 left-[29px]'} size-2 scale-0 rounded-full opacity-0 ring-2 ring-white transition-[opacity,scale] ${EASE} ${color} ${rail ? 'lg:scale-100 lg:opacity-100' : ''}`} />
      </>
    )
  }

  return (
    <aside
      id={id}
      ref={panelRef}
      tabIndex={-1}
      aria-label={label}
      data-collapsed={rail || undefined}
      className={`fixed top-0 left-0 z-40 flex h-[100dvh] w-[248px] shrink-0 flex-col overflow-hidden ${soft ? 'border-r border-white/70 bg-white/55 backdrop-blur-2xl backdrop-saturate-150' : 'bg-white shadow-[1px_0_0_#eceef1]'} transition-[transform,width] ${EASE} lg:sticky lg:translate-x-0 focus-visible:outline-none ${rail ? 'lg:w-[68px]' : ''} ${open ? 'translate-x-0 shadow-[16px_0_40px_rgba(31,49,77,0.12)]' : '-translate-x-full'}`}
    >
      <div className="relative flex h-14 w-[248px] shrink-0 items-center px-[15px]">
        <Link to={homePath} onClick={onNavigate} tabIndex={rail ? -1 : undefined} className={`group flex min-w-0 flex-1 items-center gap-3 rounded-xl pr-9 ${focusRing} ${fade}`}>
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white shadow-[0_0_0_1px_#e5e7eb,0_6px_14px_-8px_rgba(17,24,39,0.35)] transition-transform duration-500 group-hover:-rotate-6 motion-reduce:transition-none">
            <img src="/images/logo.png" alt="" width={25} height={25} className="size-[25px] object-contain" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-[-0.03em] text-[#0f172a]">CampusTour</span>
            <span className="block truncate text-[10.5px] font-semibold tracking-[0.04em] text-[#9ca3af]">{subtitle}</span>
          </span>
        </Link>
        {/* The fold arrow: a bare chevron in the corner; on the rail it slides to the centre and turns round. */}
        <button
          type="button"
          onClick={toggleRail}
          aria-controls={id}
          aria-expanded={!rail}
          aria-label={rail ? 'Mở rộng thanh menu' : 'Thu gọn thanh menu'}
          title={rail ? 'Mở rộng thanh menu' : 'Thu gọn thanh menu'}
          className={`absolute top-1/2 hidden size-8 -translate-y-1/2 place-items-center rounded-lg text-[#9ca3af] transition-[left,color,background-color] ${EASE} hover:bg-[#f3f4f6] hover:text-[#2d719e] lg:grid ${focusRing} ${rail ? 'left-[18px]' : 'left-[204px]'}`}
        >
          <ChevronLeft size={17} strokeWidth={2.2} aria-hidden="true" className={`transition-transform ${EASE} ${rail ? 'rotate-180' : ''}`} />
        </button>
        <button ref={closeRef} type="button" onClick={onNavigate} className="absolute top-1/2 right-4 grid size-9 -translate-y-1/2 place-items-center rounded-xl text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] lg:hidden" aria-label="Đóng menu"><X size={19} /></button>
      </div>
      {soft && <div aria-hidden="true" className={`mx-[15px] mb-2 h-px w-[218px] shrink-0 bg-[linear-gradient(90deg,rgba(224,225,226,0)_0%,#e0e1e2_50%,rgba(224,225,226,0.16)_100%)] ${fade}`} />}

      <nav className={`w-[248px] flex-1 overflow-x-hidden overflow-y-auto ${navPad} pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`} aria-label={navLabel}>
        {highlight && <div className="mt-1">{highlight(rail)}</div>}
        {!hasHeadings && <p className={`mt-3 mb-1 ${heading} ${fade}`}>Trang</p>}
        <div className={`space-y-0.5 transition-[width] ${EASE} ${rail ? railWidth : 'w-full'}`}>
          {entries.map((entry, index) => {
            if (entry.kind === 'heading') {
              return (
                <div key={entry.key} className={index === 0 || soft ? 'pt-1' : 'mt-1.5 border-t border-[#eef1f4] pt-1.5'}>
                  <p className={`${heading} ${fade}`}>{entry.label}</p>
                </div>
              )
            }
            if (entry.kind === 'link') {
              const { path, label: name, icon: Icon } = entry.item
              const active = currentPath === path
              return (
                <Link key={path} to={path} onClick={onNavigate} aria-current={active ? 'page' : undefined} title={rail ? name : undefined}
                  className={`${row} ${active ? activeRow : idleRow}`}>
                  {glyph(Icon, active)}
                  <span className={`min-w-0 flex-1 truncate ${fade}`}>{name}</span>
                  {pill(badges[path])}
                </Link>
              )
            }
            const holds = entry.items.some((item) => item.path === currentPath)
            const expanded = toggled[entry.key] ?? holds
            const shown = expanded && !rail
            const Icon = entry.icon
            const subId = `${id}-${entry.key.replace(/\s+/g, '-')}`
            const folded = entry.items.reduce((sum, item) => sum + Math.max(0, badges[item.path]?.value ?? 0), 0)
            const foldedTone = entry.items.some((item) => (badges[item.path]?.value ?? 0) > 0 && badges[item.path]?.tone === 'danger') ? 'danger' : 'info'
            const onGroup = () => {
              // On the rail a group has no room to unfold: widen the sidebar and open the group.
              if (rail && window.matchMedia?.('(min-width: 1024px)').matches) {
                setRail(false)
                setToggled((value) => ({ ...value, [entry.key]: true }))
                return
              }
              setToggled((value) => ({ ...value, [entry.key]: !expanded }))
            }
            return (
              <div key={entry.key} className={`${soft ? 'rounded-[15px]' : 'rounded-[10px]'} transition-colors duration-200 ${holds ? (soft ? 'bg-[#eef2f7]/90' : tinted) : ''}`}>
                <button type="button" aria-expanded={shown} aria-controls={subId} onClick={onGroup} title={rail ? entry.label : undefined}
                  className={`${row} w-full text-left ${holds ? (soft ? 'font-semibold text-[#1e293b]' : 'font-semibold text-[#0f172a]') : idleRow}`}>
                  {glyph(Icon, holds)}
                  <span className={`min-w-0 flex-1 truncate ${fade}`}>{entry.label}</span>
                  {!shown && pill(folded ? { value: folded, label: `${folded} việc trong ${entry.label}`, tone: foldedTone } : undefined)}
                  <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-[#9ca3af] transition-[rotate,opacity] ${EASE} ${expanded ? 'rotate-180' : ''} ${rail ? 'lg:opacity-0' : ''}`} />
                </button>
                <div id={subId} inert={!shown} className={`grid transition-[grid-template-rows,opacity] ${EASE} ${shown ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="pb-1.5">
                      {entry.items.map(({ path, label: name }) => {
                        const active = currentPath === path
                        const badge = badges[path]
                        return (
                          <Link key={path} to={path} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                            className={`flex min-h-7 items-center rounded-lg pr-2.5 pl-[39px] text-[12.5px] whitespace-nowrap transition-colors ${focusRing} ${active ? 'font-semibold text-[#2d719e]' : 'font-medium text-[#6b7280] hover:text-[#0f172a]'}`}>
                            <span className="min-w-0 flex-1 truncate">{name}</span>
                            {badge && badge.value > 0 && <span className={`ml-auto grid h-[18px] min-w-5 place-items-center rounded-md px-1.5 text-[11px] font-bold text-white tabular-nums ${badge.tone === 'danger' ? 'bg-[#dc2626]' : 'bg-[#2d719e]'}`} aria-label={badge.label}>{badge.value}</span>}
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
            <div className={soft ? 'mt-2' : 'mt-2 border-t border-[#f1f3f5] pt-2'}>
              <p className={`${heading} ${fade}`}>Khu vực khác</p>
            </div>
            <div className={`space-y-0.5 transition-[width] ${EASE} ${rail ? railWidth : 'w-full'}`}>
              {secondary.map(({ to, label: name, icon: Icon, current }) => (
                <Link key={to} to={to} onClick={onNavigate} aria-current={current ? 'page' : undefined} title={rail ? name : undefined}
                  className={`${row} ${current ? activeRow : idleRow}`}>
                  {glyph(Icon, Boolean(current))}
                  <span className={fade}>{name}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </nav>

      {soft ? (
        // The ground-coloured sidebar ends on one blue card, the way out of the shift.
        <div className={`w-[248px] ${navPad} pt-2 pb-4`}>
          <div className={`transition-[width] ${EASE} ${rail ? railWidth : 'w-full'}`}>
            <button type="button" onClick={onLogout} title={rail ? 'Đăng xuất' : undefined} className={`${row} w-full overflow-hidden bg-[#eef2f7]/90 font-semibold text-[#1e293b] ring-1 ring-white/70 hover:bg-[#e5eaf1]`}>
              <span aria-hidden="true" className="grid size-[30px] shrink-0 place-items-center rounded-xl bg-white/90 text-[#5b7fbf]"><LogOut size={15} strokeWidth={2.1} /></span>
              <span className={`min-w-0 text-left ${fade}`}>
                <span className="block">Đăng xuất</span>
                <span className="block text-[11.5px] font-normal text-[#64748b]">Kết thúc phiên làm việc</span>
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="w-[248px] border-t border-[#eceef1] px-3.5 py-3">
          <div className={`transition-[width] ${EASE} ${rail ? railWidth : 'w-full'}`}>
            <button type="button" onClick={onLogout} title={rail ? 'Đăng xuất' : undefined} className={`${row} w-full font-medium text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#0f172a]`}>
              <LogOut size={16} aria-hidden="true" className="shrink-0 text-[#9ca3af]" /><span className={fade}>Đăng xuất</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

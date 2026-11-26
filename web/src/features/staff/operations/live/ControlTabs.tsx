import type { LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { PanelHead, panelClass } from '../../../../components/ui/ConsolePrimitives'

export type ControlTab = {
  id: string
  label: string
  icon: LucideIcon
  content: ReactNode
  /** Needs the Operator now (an open ballot): the tab is marked, and the card turns to it when this becomes true. */
  urgent?: boolean
  /** How many items the tab holds (talk messages): the tab is marked while it holds more than when it was last shown. */
  count?: number
}

/**
 * The side card of the live console: the Viewers' vote, the camera head and the
 * talk share one card with a switch, so the column stays as short as the
 * camera beside it. Every panel stays mounted (a hidden one keeps its polling
 * and state). The card opens on the first tab and turns to an urgent one when
 * it becomes urgent, so the Operator never misses a ballot while turning the
 * head; otherwise the Operator's pick stays. One tab is a plain panel.
 */
export function ControlTabs({ label, tabs }: { label: string; tabs: ControlTab[] }) {
  const [picked, setPicked] = useState(tabs[0]?.id)
  const current = tabs.find(item => item.id === picked) ?? tabs[0]

  const urgentIds = tabs.filter(item => item.urgent).map(item => item.id).join(' ')
  const wasUrgent = useRef(urgentIds)
  useEffect(() => {
    const before = wasUrgent.current.split(' ')
    const raised = urgentIds.split(' ').find(id => id && !before.includes(id))
    if (raised) setPicked(raised)
    wasUrgent.current = urgentIds
  }, [urgentIds])

  // What the shown tab holds counts as seen (adjusted while rendering, React's pattern for state derived from props).
  const [seen, setSeen] = useState<Record<string, number>>({})
  if (current?.count !== undefined && seen[current.id] !== current.count) setSeen({ ...seen, [current.id]: current.count })

  const base = useId()
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})
  if (!current) return null
  if (tabs.length === 1) return <div className={panelClass}><PanelHead title={current.label} />{current.content}</div>

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = tabs.indexOf(current)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
    setPicked(tabs[next].id)
    buttons.current[tabs[next].id]?.focus()
  }

  const urgentNow = tabs.some(item => item.urgent)
  return (
    <div className={`${panelClass} ${urgentNow ? 'border-[#93c5fd] ring-2 ring-[#dbeafe]' : ''}`} data-testid="control-tabs">
      <div className="border-b border-[#eef1f4] p-2">
        <div role="tablist" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-[#f1f5f9] p-1" onKeyDown={onKey}>
          {tabs.map(item => {
            const selected = item === current
            const Icon = item.icon
            const mark = !selected && (item.urgent ? 'đang mở' : (item.count ?? 0) > (seen[item.id] ?? 0) ? 'có tin mới' : null)
            return (
              <button key={item.id} ref={node => { buttons.current[item.id] = node }} type="button" role="tab"
                id={`${base}-tab-${item.id}`} aria-selected={selected} aria-controls={`${base}-panel-${item.id}`} tabIndex={selected ? 0 : -1}
                onClick={() => setPicked(item.id)}
                className={`relative flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${selected ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'}`}>
                <Icon size={15} aria-hidden="true" />
                {item.label}
                {mark && <>
                  <span className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-[#2563eb]" aria-hidden="true" />
                  <span className="sr-only"> ({mark})</span>
                </>}
              </button>
            )
          })}
        </div>
      </div>
      {tabs.map(item => (
        <div key={item.id} role="tabpanel" id={`${base}-panel-${item.id}`} aria-labelledby={`${base}-tab-${item.id}`} hidden={item !== current}>
          {item.content}
        </div>
      ))}
    </div>
  )
}

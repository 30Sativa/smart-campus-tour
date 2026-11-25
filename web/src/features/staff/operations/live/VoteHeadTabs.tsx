import { Camera, Vote } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { panelClass } from '../../../../components/ui/ConsolePrimitives'

export type VoteHeadTab = 'vote' | 'head'

const TABS: { id: VoteHeadTab; label: string; icon: typeof Vote }[] = [
  { id: 'vote', label: 'Bầu chọn', icon: Vote },
  { id: 'head', label: 'Đầu camera', icon: Camera },
]

/**
 * The Viewers' vote and the camera head share one card in the side column; a
 * switch at the top shows one at a time so the column stays short. Both stay
 * mounted (the hidden one keeps its polling and state). The card opens on the
 * vote, and jumps back to it whenever a ballot opens, so the Operator never
 * misses one while turning the head; otherwise the Operator's pick stays.
 */
export function VoteHeadTabs({ voteOpen, vote, head }: { voteOpen: boolean; vote: ReactNode; head: ReactNode }) {
  const [tab, setTab] = useState<VoteHeadTab>('vote')
  const wasOpen = useRef(voteOpen)
  useEffect(() => {
    if (voteOpen && !wasOpen.current) setTab('vote')
    wasOpen.current = voteOpen
  }, [voteOpen])

  const base = useId()
  const tabId = (id: VoteHeadTab) => `${base}-tab-${id}`
  const panelId = (id: VoteHeadTab) => `${base}-panel-${id}`
  const buttons = useRef<Record<VoteHeadTab, HTMLButtonElement | null>>({ vote: null, head: null })

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = TABS.findIndex(item => item.id === tab)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
    setTab(TABS[next].id)
    buttons.current[TABS[next].id]?.focus()
  }

  return (
    <div className={`${panelClass} ${voteOpen ? 'border-[#93c5fd] ring-2 ring-[#dbeafe]' : ''}`} data-testid="vote-head-card">
      <div className="border-b border-[#eef1f4] p-2">
        <div role="tablist" aria-label="Bầu chọn và đầu camera" className="grid grid-cols-2 gap-1 rounded-lg bg-[#f1f5f9] p-1" onKeyDown={onKey}>
          {TABS.map(item => {
            const selected = item.id === tab
            const Icon = item.icon
            return (
              <button key={item.id} ref={node => { buttons.current[item.id] = node }} type="button" role="tab"
                id={tabId(item.id)} aria-selected={selected} aria-controls={panelId(item.id)} tabIndex={selected ? 0 : -1}
                onClick={() => setTab(item.id)}
                className={`relative flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${selected ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'}`}>
                <Icon size={15} aria-hidden="true" />
                {item.label}
                {item.id === 'vote' && voteOpen && !selected && <>
                  <span className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-[#2563eb]" aria-hidden="true" />
                  <span className="sr-only"> (đang mở)</span>
                </>}
              </button>
            )
          })}
        </div>
      </div>
      {TABS.map(item => (
        <div key={item.id} role="tabpanel" id={panelId(item.id)} aria-labelledby={tabId(item.id)} hidden={item.id !== tab}>
          {item.id === 'vote' ? vote : head}
        </div>
      ))}
    </div>
  )
}

import { ChevronRight } from 'lucide-react'

export type Stage<K extends string> = { key: K; label: string; color: string; count?: number; separated?: boolean }

/**
 * One row of filters that reads as a flow: the stages of the work joined by
 * chevrons, then (after a divider) the ways out of it. Exactly one is shown
 * below; the counts say how much waits in each.
 */
export function StageTabs<K extends string>({ stages, value, onChange, label }: { stages: Stage<K>[]; value: K; onChange: (value: K) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-x-0.5 gap-y-1 md:flex-nowrap md:overflow-x-auto md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden">
      {stages.map((stage, index) => {
        const selected = stage.key === value
        return (
          <span key={stage.key} className="flex shrink-0 items-center gap-0.5">
            {index > 0 && (stage.separated
              ? <span aria-hidden="true" className="mx-2 hidden h-5 w-px bg-[#e5e7eb] md:block" />
              : <ChevronRight aria-hidden="true" size={14} className="hidden text-[#d1d5db] md:block" />)}
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(stage.key)}
              style={{ ['--c' as string]: stage.color }}
              className={`inline-flex h-[34px] items-center gap-[7px] rounded-lg px-[11px] text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${selected ? 'bg-[color-mix(in_srgb,var(--c)_10%,#fff)] font-semibold text-[#0f172a] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c)_35%,transparent)]' : 'font-medium text-[#4b5563] hover:bg-[#f6f7f9] hover:text-[#0f172a]'}`}
            >
              <span aria-hidden="true" className="size-2 rounded-full bg-[var(--c)]" />
              {stage.label}
              {stage.count != null && (
                <span className={`grid h-[19px] min-w-5 place-items-center rounded-full px-1.5 text-[11.5px] font-bold tabular-nums ${selected ? 'bg-[var(--c)] text-white' : 'bg-[#f3f4f6] text-[#6b7280]'}`}>{stage.count}</span>
              )}
            </button>
          </span>
        )
      })}
    </div>
  )
}

/** The line under the tabs: what the shown stage is and how much is in it. */
export function StageHint({ color, title, count, note }: { color: string; title: string; count: string; note?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-5 pt-3.5 pb-1.5 text-xs text-[#9ca3af]">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: color }} />
      <b className="text-[13.5px] font-semibold text-[#0f172a]">{title}</b>
      <span className="tabular-nums">{count}</span>
      {note && <span>{note}</span>}
    </p>
  )
}

import type { ReactNode } from 'react'
import { toneClass, type StatusTone } from '../../components/ui/status-tone'

export function TechnicalPage({ children }: { children: ReactNode }) {
  return <div className="min-h-full bg-[#f6f7f9] px-4 py-5 sm:px-6 lg:px-8 lg:py-6"><div className="mx-auto w-full max-w-[1360px]">{children}</div></div>
}

export function ToneBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-px text-[11px] font-bold whitespace-nowrap ${toneClass[tone]}`}>{children}</span>
}

/** A short statement with a tone: the colour carries how much it matters, the words carry the rule. */
export function Note({ tone = 'info', children }: { tone?: StatusTone; children: ReactNode }) {
  return <div className={`rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-5 ${toneClass[tone]}`}>{children}</div>
}

/** A labelled checkbox row, large enough to hit on a tablet in the field. */
export function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg border border-[#e2e8f0] px-3 text-[13px] text-[#334155] transition-colors hover:bg-[#fafcfe] has-[:checked]:border-[#cde9dc] has-[:checked]:bg-[#effbf5]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-[#1f7a55]" />
      {children}
    </label>
  )
}

import type { ReactNode } from 'react'
import { CircleCheck, CircleX, Eye } from 'lucide-react'
import { toneClass, type StatusTone } from '../../components/ui/status-tone'
import { labelClass } from '../../components/ui/ui-classes'

export function TechnicalPage({ children }: { children: ReactNode }) {
  return <div className="min-h-full bg-[#f6f7f9] px-4 py-5 sm:px-6 lg:px-8 lg:py-6"><div className="mx-auto w-full max-w-[1360px]">{children}</div></div>
}

export function ToneBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-px text-[11px] font-bold whitespace-nowrap ${toneClass[tone]}`}>{children}</span>
}

/** The eye on a table row: the row stays short and the rest opens on demand. */
export function ViewDetailButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" title="Xem chi tiết" aria-label={label} onClick={onClick} className="grid size-8 shrink-0 place-items-center rounded-lg border border-[#e2e8f0] text-[#475569] transition-colors hover:bg-[#f1f5f9] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"><Eye size={15} aria-hidden="true" /></button>
}

/** One labelled line of a detail dialog; wrap several in a divided `dl`. */
export function DetailFact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-0.5 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3"><dt className="text-[13px] text-[#64748b]">{label}</dt><dd className="min-w-0 text-[13px] text-[#1e293b]">{children}</dd></div>
}

/** A short statement with a tone: the colour carries how much it matters, the words carry the rule. */
export function Note({ tone = 'info', children }: { tone?: StatusTone; children: ReactNode }) {
  return <div className={`rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-5 ${toneClass[tone]}`}>{children}</div>
}

/** A labelled checkbox row, large enough to hit on a tablet in the field. */
const RESULT_CHOICES = [
  { value: 'PASS' as const, label: 'Đạt', icon: CircleCheck, selectedClass: 'border-[#15803d] bg-[#f0fdf4] text-[#166534]' },
  { value: 'FAIL' as const, label: 'Không đạt', icon: CircleX, selectedClass: 'border-[#b23e18] bg-[#fff1ef] text-[#b23e18]' },
]

/** Đạt / Không đạt as two visible buttons, so recording a failure is as obvious as recording a pass. */
export function ResultToggle({ id, value, onChange, hint }: { id: string; value: 'PASS' | 'FAIL'; onChange: (value: 'PASS' | 'FAIL') => void; hint?: ReactNode }) {
  return (
    <div>
      <p id={id} className={labelClass}>Kết quả</p>
      <div role="group" aria-labelledby={id} className="mt-1 grid grid-cols-2 gap-2">
        {RESULT_CHOICES.map(choice => {
          const selected = value === choice.value
          return <button key={choice.value} type="button" aria-pressed={selected} onClick={() => onChange(choice.value)}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] motion-reduce:transition-none ${selected ? choice.selectedClass : 'border-[#e2e8f0] bg-white text-[#334155] hover:border-[#cbd5e1]'}`}>
            <choice.icon size={15} aria-hidden="true" />{choice.label}
          </button>
        })}
      </div>
      {value === 'FAIL' && hint && <p className="mt-1 text-xs text-[#64748b]">{hint}</p>}
    </div>
  )
}

/** Beside a disabled save button: what is still missing, so a greyed-out button never leaves the reader guessing. */
export function SaveBlockedHint({ missing }: { missing: string[] }) {
  if (!missing.length) return null
  return <p role="status" className="mr-auto text-xs text-[#b23e18]">Chưa lưu được: {missing.join(', ')}.</p>
}

export function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg border border-[#e2e8f0] px-3 text-[13px] text-[#334155] transition-colors hover:bg-[#fafcfe] has-[:checked]:border-[#cde9dc] has-[:checked]:bg-[#effbf5]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-[#1f7a55]" />
      {children}
    </label>
  )
}

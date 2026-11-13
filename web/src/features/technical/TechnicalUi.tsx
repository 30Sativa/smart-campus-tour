import type { ReactNode } from 'react'
import { Check, CircleCheck, CircleX, Eye } from 'lucide-react'
import { toneClass, type StatusTone } from '../../components/ui/status-tone'
import { labelClass } from '../../components/ui/ui-classes'

export function TechnicalPage({ children }: { children: ReactNode }) {
  return <div className="min-h-full bg-transparent px-4 py-5 sm:px-6 lg:px-8 lg:py-6"><div className="mx-auto w-full max-w-[1360px]">{children}</div></div>
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

/**
 * Đạt / Không đạt as two visible buttons, so recording a failure is as obvious as recording a pass.
 * `null` means not chosen yet: an evidence form never starts on a result the checker did not pick.
 */
export function ResultToggle({ id, value, onChange, hint }: { id: string; value: 'PASS' | 'FAIL' | null; onChange: (value: 'PASS' | 'FAIL') => void; hint?: ReactNode }) {
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

export type SetupStep = { label: string; done: boolean; hint: string; action?: ReactNode }

/**
 * A numbered list of steps that can span days and happen partly off the web, so it is a
 * checklist rather than a wizard: done steps are ticked, and only the first open one shows
 * what to do next.
 */
export function SetupSteps({ title, steps }: { title: string; steps: SetupStep[] }) {
  const current = steps.findIndex(step => !step.done)
  const doneCount = current === -1 ? steps.length : steps.filter(step => step.done).length
  return (
    <section aria-label={title} className="rounded-xl border border-[#e2e8f0] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-[#0f172a]">{title}</h3>
        <span className="text-xs font-semibold text-[#64748b]">{doneCount}/{steps.length} bước</span>
      </div>
      <ol className="mt-2.5 space-y-2">
        {steps.map((step, index) => {
          const isCurrent = index === current
          return (
            <li key={step.label} aria-current={isCurrent ? 'step' : undefined} className={`flex gap-2.5 rounded-lg px-2.5 py-2 ${isCurrent ? 'bg-[#eff6ff]' : ''}`}>
              <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${step.done ? 'bg-[#dcfce7] text-[#166534]' : isCurrent ? 'bg-[#2563eb] text-white' : 'bg-[#f1f5f9] text-[#64748b]'}`}>{step.done ? <Check size={13} /> : index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] font-medium ${step.done ? 'text-[#64748b]' : 'text-[#0f172a]'}`}>{step.label}<span className="sr-only">{step.done ? ', đã xong' : isCurrent ? ', bước tiếp theo' : ', chưa làm'}</span></p>
                {isCurrent && <p className="mt-0.5 text-xs text-[#475569]">{step.hint}</p>}
                {isCurrent && step.action && <div className="mt-1.5">{step.action}</div>}
              </div>
            </li>
          )
        })}
      </ol>
      {current === -1 && <p className="mt-2 text-xs text-[#166534]">Đã xong các bước thiết lập.</p>}
    </section>
  )
}

/**
 * Beside a disabled save button: what is still missing, so a greyed-out button never leaves the reader guessing.
 * It is the button's description (pass the same `id` to its aria-describedby), not a live region, so a screen
 * reader hears it on reaching the button instead of on every keystroke.
 */
export function SaveBlockedHint({ id, missing, lead = 'Chưa lưu được', tone = 'danger' }: {
  id: string; missing: string[]; lead?: string
  /** `neutral` for what a form simply still needs (grey); the default red is for a real refusal. */
  tone?: 'danger' | 'neutral'
}) {
  if (!missing.length) return null
  return <p id={id} className={`mr-auto text-xs ${tone === 'neutral' ? 'text-[#64748b]' : 'text-[#b23e18]'}`}>{lead}: {missing.join(', ')}.</p>
}

export function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg border border-[#e2e8f0] px-3 text-[13px] text-[#334155] transition-colors hover:bg-[#fafcfe] has-[:checked]:border-[#cde9dc] has-[:checked]:bg-[#effbf5]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-[#1f7a55]" />
      {children}
    </label>
  )
}

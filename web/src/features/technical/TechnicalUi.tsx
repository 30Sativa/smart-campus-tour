import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Check } from 'lucide-react'
import { toneClass, type StatusTone } from '../../components/ui/status-tone'
import { STEP_CLASS, CONFIRMATION_STATE, routeLabel, type PipelineStep } from './technical-format'
import type { ConfirmationState, RouteVersionConfirmation } from './types'

export function TechnicalPage({ children }: { children: ReactNode }) {
  return <div className="min-h-full bg-[#f6f7f9] px-4 py-5 sm:px-6 lg:px-8 lg:py-6"><div className="mx-auto w-full max-w-[1360px]">{children}</div></div>
}

export function ToneBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${toneClass[tone]}`}>{children}</span>
}

/** A short statement inside a panel: tone carries meaning, the words carry the rule. */
export function Notice({ tone = 'info', children }: { tone?: StatusTone; children: ReactNode }) {
  return <div className={`rounded-xl border px-3.5 py-2.5 text-[13px] leading-5 ${toneClass[tone]}`}>{children}</div>
}

/** The five steps of one map version as a row of chips. */
export function PipelineChips({ steps }: { steps: PipelineStep[] }) {
  return (
    <ol className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-5" aria-label="Tiến trình">
      {steps.map((step) => (
        <li key={step.key} className={`flex min-w-0 items-center gap-1.5 truncate rounded-lg border px-2.5 py-2 text-[12.5px] font-semibold ${STEP_CLASS[step.state]}`}>
          {step.state === 'done' && <Check size={13} strokeWidth={3} aria-hidden="true" />}
          <span className="truncate">{step.label}</span>
          <span className="sr-only">{step.state === 'done' ? ' (xong)' : step.state === 'fail' ? ' (không đạt)' : step.state === 'doing' ? ' (đang chờ)' : ' (chưa tới)'}</span>
        </li>
      ))}
    </ol>
  )
}

/** A numbered step with a line down to the next one. */
export function EvidenceStep({ index, state, title, children }: { index: number; state: 'done' | 'doing' | 'todo' | 'fail'; title: string; children: ReactNode }) {
  const dot = { done: 'bg-[#effbf5] text-[#1f7a55]', doing: 'bg-[#fff8e6] text-[#8a5a06]', fail: 'bg-[#fff1ef] text-[#b23e31]', todo: 'bg-[#f1f5f9] text-[#64748b]' }[state]
  return (
    <section className="relative flex gap-4 pb-6 last:pb-0 [&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:top-9 [&:not(:last-child)]:before:bottom-1 [&:not(:last-child)]:before:left-[15px] [&:not(:last-child)]:before:w-0.5 [&:not(:last-child)]:before:bg-[#e2e8f0]">
      <span className={`grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold ${dot}`} aria-hidden="true">{state === 'done' ? <Check size={15} strokeWidth={3} /> : index}</span>
      <div className="min-w-0 flex-1 pt-1">
        <h3 className="text-sm font-semibold text-[#0f172a]">{title}</h3>
        <div className="mt-2.5 space-y-3">{children}</div>
      </div>
    </section>
  )
}

/** Key–value lines for evidence already recorded. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents"><dt className="text-[#64748b]">{label}</dt><dd className="text-right font-semibold [overflow-wrap:anywhere] text-[#0f172a]">{value}</dd></div>
      ))}
    </dl>
  )
}

/** Radio buttons drawn as a segmented control. */
export function ChoiceGroup<T extends string>({ name, label, value, options, onChange }: { name: string; label: string; value: T | null; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-[#334155]">{label}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-xl bg-[#eef1f4] p-1">
        {options.map((option) => (
          <label key={option.value} className="relative">
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="peer absolute inset-0 opacity-0" />
            <span className="flex min-h-9 cursor-pointer items-center rounded-lg px-3.5 text-[13px] font-semibold text-[#475569] peer-checked:bg-white peer-checked:text-[#174b70] peer-checked:shadow-xs peer-focus-visible:ring-2 peer-focus-visible:ring-[#5b9dc9]">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Pass / fail as two large choices; the result is the one decision that matters on the form. */
export function ResultChoice({ name, value, onChange }: { name: string; value: boolean | null; onChange: (passed: boolean) => void }) {
  const option = (passed: boolean) => {
    const on = value === passed
    const look = !on ? 'border-[#cbd5e1] bg-white text-[#475569]' : passed ? 'border-2 border-[#1f7a55] bg-[#effbf5] text-[#1f7a55]' : 'border-2 border-[#b23e31] bg-[#fff1ef] text-[#b23e31]'
    return (
      <label className="relative">
        <input type="radio" name={name} checked={on} onChange={() => onChange(passed)} className="peer absolute inset-0 opacity-0" />
        <span className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-[#5b9dc9] ${look}`}>{passed ? 'Đạt' : 'Không đạt'}</span>
      </label>
    )
  }
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-[#334155]">Kết quả</legend>
      <div className="grid grid-cols-2 gap-2">{option(true)}{option(false)}</div>
    </fieldset>
  )
}

export function CheckRow({ checked, onChange, children, tone }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; tone?: 'warn' }) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2 text-[13.5px] text-[#0f172a] ${tone === 'warn' ? 'border-[#f0d89f] bg-[#fffbeb]' : 'border-[#e2e8f0] bg-white hover:bg-[#f8fafc]'}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-[18px] shrink-0 accent-[#2d719e]" />
      <span className="min-w-0">{children}</span>
    </label>
  )
}

const COLUMNS: { state: ConfirmationState; color: string }[] = [
  { state: 'NEEDS_RECONFIRM', color: 'text-[#b23e31]' },
  { state: 'UNCONFIRMED', color: 'text-[#8a5a06]' },
  { state: 'CONFIRMED', color: 'text-[#1f7a55]' },
]

/** Route versions in three columns by confirmation state. */
export function RouteBoard({ routes }: { routes: RouteVersionConfirmation[] }) {
  return (
    <div className="grid gap-3.5 md:grid-cols-3">
      {COLUMNS.map(({ state, color }) => {
        const list = routes.filter((route) => route.state === state)
        return (
          <section key={state} aria-label={CONFIRMATION_STATE[state].label} className="flex min-h-28 flex-col gap-2.5 rounded-2xl bg-[#eef1f4] p-3">
            <h3 className={`flex justify-between px-1 text-[13px] font-bold ${color}`}><span>{CONFIRMATION_STATE[state].label}</span><span className="tabular-nums">{list.length}</span></h3>
            {list.map((route) => (
              <Link key={route.id} to={`/technical/confirmations/${route.id}`} className={`block rounded-xl border bg-white px-3.5 py-3 transition-colors hover:border-[#2d719e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${state === 'NEEDS_RECONFIRM' ? 'border-[#f5c8c2]' : 'border-[#e2e8f0]'}`}>
                <span className="block font-semibold text-[#0f172a]">{routeLabel(route)}</span>
                <span className="mt-1 block text-[12.5px] text-[#64748b]">{route.mapKey} · {route.stopIds.length} điểm dừng{route.inheritedFrom ? ` · giữ xác nhận v${route.inheritedFrom}` : ''}</span>
                {route.blockingSession && <span className="mt-2 block text-[12.5px] font-semibold text-[#b23e31]">Đang chặn {route.blockingSession}</span>}
              </Link>
            ))}
            {list.length === 0 && <p className="px-1 text-[12.5px] text-[#64748b]">Không có.</p>}
          </section>
        )
      })}
    </div>
  )
}

import { ArrowLeft, Check, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { buttonClass } from '../../../components/ui/ui-classes'
import { useTourOrigin } from './tour-origin'
import type { TourDetails } from '../../administration/tours/types'
import { tourSteps, type StepStatus, type TourPageKind } from './tour-steps'

const CIRCLE: Record<StepStatus, string> = {
  done: 'bg-[#ecfdf3] text-[#15803d] border-[#b8dec9]',
  current: 'bg-[#2563eb] text-white border-[#2563eb]',
  next: 'bg-white text-[#64748b] border-[#e2e8f0]',
  skipped: 'bg-[#f8fafc] text-[#94a3b8] border-[#e2e8f0]',
}

/**
 * The top of every page of one Tour: back to where it was opened from, and
 * the four steps with the page being viewed marked. The three pages stay
 * separate; this is what makes them read as one flow.
 */
export function TourStepper({ detail, page, compact = false }: { detail: Pick<TourDetails, 'tour' | 'startedAt'>; page: TourPageKind; compact?: boolean }) {
  const back = useTourOrigin()
  // The live console needs its height for the Tour itself: back and the steps share one short line there.
  if (compact) return <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
    <Link to={back.to} className={`${buttonClass('ghost', 'sm')} -ml-2`}><ArrowLeft size={15} aria-hidden="true" />{back.label}</Link>
    <nav aria-label="Các bước của Tour">
      <ol className="flex flex-wrap items-center gap-1">
        {tourSteps(detail).map((step, index) => {
          const viewing = step.key === page
          const body = <>
            <span className={`grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${CIRCLE[step.status]}`}>
              {step.status === 'done' ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : index + 1}
            </span>
            <span className={step.status === 'skipped' ? 'text-[#94a3b8] line-through' : ''}>{step.title}</span>
          </>
          const pill = `inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[12.5px] font-semibold ${viewing ? 'border-[#93c5fd] bg-[#eff6ff] text-[#0f172a]' : 'border-transparent text-[#475569]'}`
          return <li key={step.key} aria-current={viewing ? 'step' : undefined} data-status={step.status} className="flex items-center gap-1">
            {index > 0 && <ChevronRight size={13} className="text-[#cbd5e1]" aria-hidden="true" />}
            {step.to && !viewing
              ? <Link to={step.to} title={step.note} className={`${pill} transition-colors duration-150 hover:border-[#93c5fd] hover:bg-white motion-reduce:transition-none`}>{body}</Link>
              : <span title={step.note} className={pill}>{body}</span>}
          </li>
        })}
      </ol>
    </nav>
  </div>
  return <div className="mb-4">
    <Link to={back.to} className={`${buttonClass('ghost', 'sm')} mb-2 -ml-2`}><ArrowLeft size={15} aria-hidden="true" />{back.label}</Link>
    <nav aria-label="Các bước của Tour">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tourSteps(detail).map((step, index) => {
          const viewing = step.key === page
          const body = <>
            <span className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold ${CIRCLE[step.status]}`}>
              {step.status === 'done' ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className={`block truncate text-[13px] font-semibold ${step.status === 'skipped' ? 'text-[#94a3b8] line-through' : 'text-[#0f172a]'}`}>{step.title}</span>
              <span className="block truncate text-[11.5px] text-[#64748b]">{step.note}</span>
            </span>
          </>
          const box = `flex h-full items-start gap-2.5 rounded-xl border px-3 py-2.5 ${viewing ? 'border-[#93c5fd] bg-[#eff6ff]' : 'border-[#e2e8f0] bg-white'}`
          return <li key={step.key} aria-current={viewing ? 'step' : undefined} data-status={step.status}>
            {step.to && !viewing
              ? <Link to={step.to} className={`${box} transition-colors duration-150 hover:border-[#93c5fd] motion-reduce:transition-none`}>{body}</Link>
              : <div className={box}>{body}</div>}
          </li>
        })}
      </ol>
    </nav>
  </div>
}

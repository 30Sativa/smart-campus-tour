import { ArrowLeft, Check } from 'lucide-react'
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
export function TourStepper({ detail, page }: { detail: Pick<TourDetails, 'tour' | 'startedAt'>; page: TourPageKind }) {
  const back = useTourOrigin()
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

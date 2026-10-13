import { Check } from 'lucide-react'

/**
 * Progress of the registration form, drawn as a route. Done steps can be
 * reopened; later steps cannot be skipped to, because each one checks the one
 * before it.
 */
export function RegistrationStepper({ steps, current, onSelect }: { steps: string[]; current: number; onSelect?: (index: number) => void }) {
  const offset = 100 - (current / Math.max(1, steps.length - 1)) * 100
  return (
    <div className="rep-stepper-wrap">
      <svg className="rep-stepper-line" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <line className="rep-track-bg" x1="0" y1="2" x2="100" y2="2" />
        <line className="rep-stepper-fg" x1="0" y1="2" x2="100" y2="2" pathLength={100} strokeDashoffset={offset} />
      </svg>
      <ol className="rep-stepper" aria-label="Các bước đăng ký">
      {steps.map((label, i) => {
        const status = i < current ? 'done' : i === current ? 'now' : 'todo'
        const clickable = status === 'done' && onSelect
        const body = (
          <>
            <span className="rep-step-dot">{status === 'done' ? <Check size={17} strokeWidth={2.75} aria-hidden="true" /> : i + 1}</span>
            <span>{label}<span className="sr-only">{status === 'done' ? ' (đã xong)' : status === 'now' ? ' (bước hiện tại)' : ' (chưa tới)'}</span></span>
          </>
        )
        return (
          <li key={label} className={`rep-step${status === 'done' ? ' is-done' : status === 'now' ? ' is-now' : ''}`} aria-current={status === 'now' ? 'step' : undefined}>
            {clickable ? <button type="button" onClick={() => onSelect(i)} aria-label={`Quay lại bước ${i + 1}: ${label}`}>{body}</button> : body}
          </li>
        )
      })}
      </ol>
    </div>
  )
}

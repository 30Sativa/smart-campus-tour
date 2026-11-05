import { Check } from 'lucide-react'

export function RegistrationStepper({ steps, current, onSelect }: { steps: string[]; current: number; onSelect?: (index: number) => void }) {
  return <ol className="rep-stepper" aria-label="Các bước đăng ký">{steps.map((label, index) => {
    const completed = index < current
    const content = <><span className="rep-step-number" aria-hidden="true">{completed ? <Check size={17} aria-hidden="true" /> : index + 1}</span><span>{label}<span className="rep-sr-only">{completed ? ' (đã xong)' : index === current ? ' (bước hiện tại)' : ' (chưa tới)'}</span></span></>
    return <li key={label} className={`rep-step${index === current ? ' is-now' : completed ? ' is-done' : ''}`} aria-current={index === current ? 'step' : undefined}>{completed && onSelect ? <button type="button" onClick={() => onSelect(index)} aria-label={`Quay lại bước ${index + 1}: ${label}`}>{content}</button> : content}</li>
  })}</ol>
}

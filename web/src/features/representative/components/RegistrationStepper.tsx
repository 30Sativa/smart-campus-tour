import { Check } from 'lucide-react'

/**
 * Progress of the registration form. Done steps can be reopened; later steps
 * cannot be skipped to, because each one checks the one before it.
 */
export function RegistrationStepper({ steps, current, onSelect }: { steps: string[]; current: number; onSelect?: (index: number) => void }) {
  return (
    <ol className="flex w-full items-start" aria-label="Các bước đăng ký">
      {steps.map((label, i) => {
        const status = i < current ? 'done' : i === current ? 'current' : 'todo'
        const clickable = status === 'done' && onSelect
        const circle = (
          <span
            className={`relative z-10 grid size-9 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors duration-200 ${
              status === 'done' ? 'border-[1.5px] border-[#2563eb] bg-white text-[#2563eb]'
              : status === 'current' ? 'bg-[#2563eb] text-white shadow-[0_0_0_5px_rgba(37,99,235,0.14)]'
              : 'border-[1.5px] border-[#cbd5e1] bg-white text-[#94a3b8]'
            }`}
          >
            {status === 'done' ? <Check size={16} strokeWidth={2.75} aria-hidden="true" /> : i + 1}
          </span>
        )
        const text = (
          <span className={`mt-2 block text-center text-[13px] leading-snug sm:text-sm ${status === 'current' ? 'font-semibold text-[#0f172a]' : status === 'done' ? 'font-medium text-[#334155]' : 'text-[#94a3b8]'}`}>
            {label}
            <span className="sr-only">{status === 'done' ? ' (đã xong)' : status === 'current' ? ' (bước hiện tại)' : ' (chưa tới)'}</span>
          </span>
        )
        return (
          <li key={label} className="relative flex min-w-0 flex-1 flex-col items-center" aria-current={status === 'current' ? 'step' : undefined}>
            {i > 0 && (
              <span aria-hidden="true" className={`absolute top-[18px] right-[calc(50%+24px)] left-[calc(-50%+24px)] h-0.5 -translate-y-1/2 rounded-full transition-colors duration-300 ${i <= current ? 'bg-[#2563eb]' : 'bg-[#e2e8f0]'}`} />
            )}
            {clickable ? (
              <button type="button" onClick={() => onSelect(i)} className="flex flex-col items-center rounded-xl px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]" aria-label={`Quay lại bước ${i + 1}: ${label}`}>
                {circle}{text}
              </button>
            ) : (
              <div className="flex flex-col items-center px-1">{circle}{text}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

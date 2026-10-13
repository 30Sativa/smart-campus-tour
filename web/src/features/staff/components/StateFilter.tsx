import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export type StateFilterOption<T extends string> = { value: T; label: string; color?: string; count: number }

/**
 * A one-choice dropdown for filtering by state: the trigger says what is shown,
 * the menu lists each state with its colour and how many there are. Works by
 * keyboard (arrows, Home/End, Enter, Escape) and closes on an outside click.
 */
export function StateFilter<T extends string>({ value, onChange, options, label, className = '' }: {
  value: T
  onChange: (value: T) => void
  options: Array<StateFilterOption<T>>
  label: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const current = options.find((option) => option.value === value) ?? options[0]

  const show = () => {
    setActive(Math.max(0, options.findIndex((option) => option.value === value)))
    setOpen(true)
  }
  const hide = (refocus = true) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }
  const choose = (index: number) => {
    onChange(options[index].value)
    hide()
  }

  useEffect(() => {
    if (!open) return
    list.current?.focus()
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const onTriggerKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      show()
    }
  }
  const onListKey = (event: KeyboardEvent) => {
    const last = options.length - 1
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((index) => Math.min(last, index + 1)),
      ArrowUp: () => setActive((index) => Math.max(0, index - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => choose(active),
      ' ': () => choose(active),
      Escape: () => hide(),
      Tab: () => hide(false),
    }
    const run = keys[event.key]
    if (!run) return
    if (event.key !== 'Tab') event.preventDefault()
    run()
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${label}: ${current.label}`}
        onClick={() => (open ? hide() : show())}
        onKeyDown={onTriggerKey}
        className={`flex h-10 w-full items-center gap-2 rounded-xl border bg-white pr-2.5 pl-3 text-left text-[13.5px] transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]/40 sm:w-auto sm:min-w-[230px] ${
          open ? 'border-[#5b9dc9] shadow-[0_0_0_3px_rgba(91,157,201,0.15)]' : 'border-[#e2e8f0] hover:border-[#cbd5e1]'
        }`}
      >
        <span className="font-medium text-[#94a3b8]">Trạng thái</span>
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: current.color ?? '#0f172a' }} />
        <span className="min-w-0 flex-1 truncate font-semibold text-[#0f172a]">{current.label}</span>
        <span className="rounded-md bg-[#f1f5f9] px-1.5 text-[11px] font-bold text-[#64748b] tabular-nums">{current.count}</span>
        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-[#64748b] transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
          className="absolute top-full left-0 z-30 mt-1.5 w-full min-w-[240px] rounded-xl border border-[#e2e8f0] bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.28)] outline-none transition-[opacity,translate] duration-150 starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none sm:w-auto"
        >
          {options.map((option, index) => {
            const selected = option.value === value
            return (
              <li
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] ${index === active ? 'bg-[#f1f5f9]' : ''} ${
                  index === 0 && options.length > 1 ? 'mb-1 shadow-[0_5px_0_-4px_#eef2f6]' : ''
                }`}
              >
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: option.color ?? '#0f172a' }} />
                <span className={`flex-1 ${selected ? 'font-bold text-[#0f172a]' : 'font-medium text-[#334155]'}`}>{option.label}</span>
                <span className="text-[11.5px] font-bold text-[#94a3b8] tabular-nums">{option.count}</span>
                <Check size={15} aria-hidden="true" className={`shrink-0 text-[#2563eb] ${selected ? '' : 'invisible'}`} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

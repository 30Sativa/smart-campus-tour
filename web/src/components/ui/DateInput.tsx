import { useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { inputClass } from './ui-classes'
import { isoToDisplay, maskDateText, parseDisplayDate } from './date-time'

/**
 * A date field that always reads dd/mm/yyyy.
 *
 * `<input type="date">` prints its value in the browser's language, so a Staff
 * laptop set to English shows mm/dd/yyyy. This is a plain text field with a
 * dd/mm/yyyy mask instead, and no library. Its contract is the native one:
 * `value` is `yyyy-mm-dd` or `''`, and `onChange` receives `yyyy-mm-dd` once a
 * real date is typed and `''` while the text is incomplete or not a date.
 * Like the native field, a date outside `min`/`max` is still reported, and the
 * field is marked invalid so a form cannot submit it.
 */

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max'> & {
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
}

export function DateInput({ value, onChange, min, max, className = inputClass, onBlur, ...rest }: DateInputProps) {
  const [text, setText] = useState(() => isoToDisplay(value))
  const [shownValue, setShownValue] = useState(value)
  const [touched, setTouched] = useState(false)

  // A new value from the parent (reset, preset button) replaces the text. A value
  // this field reported itself already matches what is typed, so it is left alone.
  if (value !== shownValue) {
    setShownValue(value)
    if (value !== parseDisplayDate(text)) setText(isoToDisplay(value))
  }

  const parsed = parseDisplayDate(text)
  const outOfRange = parsed !== '' && ((min != null && min !== '' && parsed < min) || (max != null && max !== '' && parsed > max))
  const unreadable = text !== '' && parsed === ''
  const message = unreadable ? 'Nhập ngày theo dạng dd/mm/yyyy.'
    : outOfRange ? `Chọn ngày${min ? ` từ ${isoToDisplay(min)}` : ''}${max ? ` đến ${isoToDisplay(max)}` : ''}.`
      : ''
  const showInvalid = rest['aria-invalid'] ?? ((touched && unreadable) || outOfRange ? true : undefined)

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={rest.placeholder ?? 'dd/mm/yyyy'}
      maxLength={10}
      value={text}
      aria-invalid={showInvalid}
      className={className}
      ref={(element) => { element?.setCustomValidity(message) }}
      onChange={(event) => {
        const next = maskDateText(event.target.value)
        setText(next)
        const nextValue = parseDisplayDate(next)
        setShownValue(nextValue)
        if (nextValue !== value) onChange(nextValue)
      }}
      onBlur={(event) => {
        setTouched(true)
        onBlur?.(event)
      }}
    />
  )
}

import { useId, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  /** Message for this field. The slot below the input is reserved either way. */
  error?: string
}

/**
 * One labelled input with its error wired to it.
 *
 * The label is a real `<label htmlFor>`, never a placeholder, and the message
 * is bound through `aria-describedby` so a screen reader reads the field and
 * its problem together instead of announcing a colour change. The message slot
 * keeps its height when empty, so validating on blur does not shove the rest of
 * the form down the page.
 */
export function AuthField({ label, error, id, ...input }: FieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`

  return (
    <div className="auth-field">
      <label className="auth-label" htmlFor={fieldId}>
        {label}
      </label>
      <span className="auth-input-wrap">
        <input
          {...input}
          id={fieldId}
          className="auth-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </span>
      <span className="auth-error-slot">
        {error && (
          <span className="auth-error" id={errorId} role="alert">
            {error}
          </span>
        )}
      </span>
    </div>
  )
}

/**
 * The same field with a visibility toggle.
 *
 * The toggle is a real button inside a 42px hit area, it is reachable by
 * keyboard in the natural tab order, and its accessible name states what the
 * next press will do. Toggling swaps only the input `type`, so nothing moves.
 */
export function AuthPasswordField({ label, error, id, ...input }: FieldProps) {
  const [visible, setVisible] = useState(false)
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`

  return (
    <div className="auth-field">
      <label className="auth-label" htmlFor={fieldId}>
        {label}
      </label>
      <span className="auth-input-wrap">
        <input
          {...input}
          id={fieldId}
          type={visible ? 'text' : 'password'}
          className="auth-input auth-input--with-toggle"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          className="auth-reveal"
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </span>
      <span className="auth-error-slot">
        {error && (
          <span className="auth-error" id={errorId} role="alert">
            {error}
          </span>
        )}
      </span>
    </div>
  )
}

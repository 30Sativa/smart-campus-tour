import { Search, X } from 'lucide-react'
import { useId } from 'react'

/**
 * One search field. The control itself is the auth surface's `.auth-input`, so
 * its height, border, radius, focus ring and autofill handling are the ones the
 * sign-in form already uses — this adds the leading icon and the clear button.
 *
 * The label is a real `<label>` kept off-screen only when the placeholder says
 * the same thing, so a screen reader still gets a named field.
 */
export function SearchBar({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  label: string
}) {
  const id = useId()
  return (
    <div className="vs-search">
      <label className="auth-label vs-sr" htmlFor={id}>
        {label}
      </label>
      <Search size={17} strokeWidth={1.9} aria-hidden="true" />
      <input
        id={id}
        type="search"
        className="auth-input"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
      />
      {value && (
        <button type="button" className="vs-search__clear" onClick={() => onChange('')} aria-label="Clear search">
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

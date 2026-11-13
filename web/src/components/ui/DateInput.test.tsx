import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DateInput } from './DateInput'

function Harness({ initial = '', min, max, onValue }: { initial?: string; min?: string; max?: string; onValue?: (value: string) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <label htmlFor="day">Ngày</label>
      <DateInput id="day" value={value} min={min} max={max} onChange={(next) => { setValue(next); onValue?.(next) }} />
      <button type="button" onClick={() => setValue('2026-12-01')}>Đặt ngày</button>
      <output>{value}</output>
    </>
  )
}

const field = () => screen.getByLabelText('Ngày') as HTMLInputElement

describe('DateInput', () => {
  it('shows dd/mm/yyyy whatever the browser language', () => {
    render(<Harness initial="2026-11-13" />)
    expect(field()).toHaveValue('13/11/2026')
    expect(field()).toHaveAttribute('type', 'text')
    expect(field()).toHaveAttribute('placeholder', 'dd/mm/yyyy')
  })

  it('reports yyyy-mm-dd once a real date is typed, and empty before', () => {
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    fireEvent.change(field(), { target: { value: '1311' } })
    expect(field()).toHaveValue('13/11')
    expect(onValue).not.toHaveBeenCalled()
    fireEvent.change(field(), { target: { value: '13/11/2026' } })
    expect(onValue).toHaveBeenLastCalledWith('2026-11-13')
    expect(screen.getByRole('status')).toHaveTextContent('2026-11-13')
    fireEvent.change(field(), { target: { value: '13/11/202' } })
    expect(onValue).toHaveBeenLastCalledWith('')
  })

  it('marks a date that does not exist as invalid after leaving the field', () => {
    render(<Harness />)
    fireEvent.change(field(), { target: { value: '31022026' } })
    expect(field()).toHaveValue('31/02/2026')
    expect(field().validity.valid).toBe(false)
    expect(field()).not.toHaveAttribute('aria-invalid')
    fireEvent.blur(field())
    expect(field()).toHaveAttribute('aria-invalid', 'true')
  })

  it('reports a date outside min and max but marks it invalid, like the native field', () => {
    const onValue = vi.fn()
    render(<Harness min="2026-11-13" max="2026-11-30" onValue={onValue} />)
    fireEvent.change(field(), { target: { value: '01/12/2026' } })
    expect(onValue).toHaveBeenLastCalledWith('2026-12-01')
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(field().validationMessage).toBe('Chọn ngày từ 13/11/2026 đến 30/11/2026.')
  })

  it('follows a new value set by the parent', () => {
    render(<Harness initial="2026-11-13" />)
    fireEvent.click(screen.getByRole('button', { name: 'Đặt ngày' }))
    expect(field()).toHaveValue('01/12/2026')
  })
})

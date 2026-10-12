import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RosterPreview } from './RosterPreview'
import type { RosterRow } from './roster'

describe.each(['console', 'representative'] as const)('shared roster in %s', variant => {
  it('preserves source rows and finds shared viewing by name or email', () => {
    const rows: RosterRow[] = Array.from({ length: 13 }, (_, index) => ({ rowNumber: index + 4, rowType: 'INDIVIDUAL', displayName: `Học sinh ${index}`, email: `student${index}@example.com`, className: '12A' }))
    rows[0] = { rowNumber: 4, rowType: 'SHARED_VIEWING', displayName: 'Điểm xem chung Đặng', email: 'room@example.com', className: null }
    render(<RosterPreview rows={rows} variant={variant} label="Danh sách chung" />)
    const search = screen.getByRole('searchbox', { name: 'Tìm dòng trong danh sách' })
    fireEvent.change(search, { target: { value: 'dang' } })
    const row = within(screen.getByRole('table', { name: 'Danh sách chung' })).getAllByRole('row')[1]
    expect(within(row).getByRole('cell', { name: '4' })).toBeInTheDocument()
    expect(within(row).getByRole('cell', { name: 'Điểm xem chung' })).toBeInTheDocument()
    expect(within(row).getByRole('cell', { name: '-' })).toBeInTheDocument()
    expect(screen.getByText('1 / 13 dòng khớp')).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'room@example.com' } })
    expect(screen.getByText('Điểm xem chung Đặng')).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'không tồn tại' } })
    expect(screen.getByText('Không có dòng khớp "không tồn tại".')).toBeInTheDocument()
  })
})

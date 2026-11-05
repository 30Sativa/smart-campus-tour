import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ExcelUploader } from './ExcelUploader'
import type { AcceptedRoster } from './ExcelUploader'
import type { RepresentativeRosterRow } from '../api/types'

const csv = (body: string, name = 'roster.csv') => {
  const file = new File([body], name, { type: 'text/csv' })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(body).buffer })
  return file
}
function choose(body: string, name?: string) {
  fireEvent.change(screen.getByLabelText('Chọn file Excel danh sách lời mời'), { target: { files: [csv(body, name)] } })
}
const header = 'LoaiDong,HoTen,Email,Lop\n'

describe('roster file picker validation and replacement confirmation', () => {
  it('uses explicit acceptance and retains the last accepted list after an invalid or unreadable file', async () => {
    const accept = vi.fn()
    function Harness() {
      const [accepted, setAccepted] = useState<AcceptedRoster | null>(null)
      return <ExcelUploader accepted={accepted} onAccept={next => { accept(next); setAccepted(next) }} />
    }
    render(<Harness />)
    choose(header + 'CA_NHAN,Học sinh,student@example.test,12A')
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận sử dụng danh sách này' }))
    expect(accept).toHaveBeenCalledTimes(1)
    choose(header + 'CA_NHAN,Học sinh,broken,12A', 'invalid.csv')
    expect(await screen.findByText(/Vẫn giữ 1 dòng đã xác nhận/)).toBeInTheDocument()
    expect(screen.getByText('Email thiếu hoặc sai định dạng.')).toBeInTheDocument()
    expect(accept).toHaveBeenCalledTimes(1)
    const brokenFile = new File([''], 'unreadable.csv')
    Object.defineProperty(brokenFile, 'arrayBuffer', { value: async () => { throw new Error('disk') } })
    fireEvent.change(screen.getByLabelText('Chọn file Excel danh sách lời mời'), { target: { files: [brokenFile] } })
    expect(await screen.findByText(/Không đọc được tệp/)).toBeInTheDocument()
    expect(accept).toHaveBeenCalledTimes(1)
  })
  it('reviews accepted-row impact before allowing a replacement', async () => {
    const existing: RepresentativeRosterRow = { id: 'row', rowNumber: 2, rowType: 'INDIVIDUAL', displayName: 'Học sinh', email: 'student@example.test', className: '12A', participationState: 'ACCEPTED', canRemove: true }
    const accept = vi.fn()
    render(<ExcelUploader accepted={null} onAccept={accept} inUse={{ count: 1 }} existingRows={[existing]} />)
    choose(header + 'CA_NHAN,Học sinh,student@example.test,12B')
    const confirm = await screen.findByRole('button', { name: 'Xác nhận sử dụng danh sách này' })
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi đã kiểm tra thay đổi/ }))
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    expect(accept).toHaveBeenCalledTimes(1)
  })
  it('blocks a suspected accepted email change and additions after cutoff', async () => {
    const existing: RepresentativeRosterRow = { id: 'row', rowNumber: 2, rowType: 'INDIVIDUAL', displayName: 'Học sinh', email: 'student@example.test', className: '12A', participationState: 'ACCEPTED' }
    render(<ExcelUploader accepted={null} onAccept={vi.fn()} inUse={{ count: 1 }} existingRows={[existing]} canAddRows={false} />)
    choose(header + 'CA_NHAN,Học sinh,new@example.test,12A')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận sử dụng danh sách này' })).toBeDisabled())
    expect(screen.getByText(/Email của dòng đã chấp nhận/)).toBeInTheDocument()
    expect(screen.getByText(/Đã qua hạn thêm điểm xem mới/)).toBeInTheDocument()
  })
})

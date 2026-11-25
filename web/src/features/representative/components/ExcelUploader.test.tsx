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
  it('explains each column in plain words and what an unknown row type should be', async () => {
    render(<ExcelUploader accepted={null} onAccept={vi.fn()} />)
    expect(screen.getByText(/nếu một học sinh xem trên máy riêng/)).toBeInTheDocument()
    expect(screen.getByText(/nếu cả phòng xem chung một màn hình/)).toBeInTheDocument()
    choose(header + 'CANHAN,Học sinh,student@example.test,12A', 'typo.csv')
    expect(await screen.findByText('Ghi CA_NHAN (một học sinh xem trên máy riêng) hoặc DIEM_XEM_CHUNG (cả phòng xem chung một màn hình).')).toBeInTheDocument()
  })
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
  it('labels the accepted-row review checkbox by its own text', async () => {
    const existing: RepresentativeRosterRow = { id: 'row', rowNumber: 2, rowType: 'INDIVIDUAL', displayName: 'Học sinh', email: 'student@example.test', className: '12A', participationState: 'ACCEPTED', canRemove: true }
    render(<ExcelUploader accepted={null} onAccept={vi.fn()} inUse={{ count: 1 }} existingRows={[existing]} />)
    choose(header + 'CA_NHAN,Học sinh,student@example.test,12B')
    const box = await screen.findByRole('checkbox', { name: 'Tôi đã kiểm tra thay đổi trên dòng đã chấp nhận và hiểu việc loại dòng sẽ thu hồi quyền truy cập của dòng đó.' })
    expect(box).toHaveAttribute('aria-labelledby')
  })
  it('keeps a row that only moved out of the update count and lists only fields that changed', async () => {
    const room: RepresentativeRosterRow = { id: 'room', rowNumber: 2, rowType: 'SHARED_VIEWING', displayName: 'TEST WFB Màn hình lớp 10A1', email: 'room@example.test', className: '10A1', participationState: 'PENDING', canRemove: true }
    const person: RepresentativeRosterRow = { id: 'person', rowNumber: 3, rowType: 'INDIVIDUAL', displayName: 'Học sinh', email: 'student@example.test', className: '12A', participationState: 'PENDING', canRemove: true }
    render(<ExcelUploader accepted={null} onAccept={vi.fn()} inUse={{ count: 2 }} existingRows={[room, person]} />)
    choose(header + 'CA_NHAN,Học sinh,student@example.test,12B\nDIEM_XEM_CHUNG,TEST WFB Màn hình lớp 10A1,room@example.test, 10A1 ')
    const diff = await screen.findByRole('region', { name: 'Thay đổi danh sách' })
    expect(diff).toHaveTextContent('Giữ nguyên 1 dòng, cập nhật 1 dòng, thêm 0 dòng, loại 0 dòng.')
    expect(diff).toHaveTextContent('Lớp: 12A → 12B. Giữ định danh dòng và email student@example.test.')
    expect(diff).not.toHaveTextContent('Cập nhật TEST WFB')
    expect(diff).not.toHaveTextContent(/Thay vị trí|Tên:/)
    expect(screen.getAllByRole('columnheader', { name: 'Dòng trong tệp' }).length).toBeGreaterThan(0)
  })
  it('says an over-capacity file is well formed but too long, and reports dropping it', async () => {
    const discard = vi.fn()
    render(<ExcelUploader accepted={null} onAccept={vi.fn()} onDiscard={discard} seatsForGroup={1} />)
    choose(header + 'CA_NHAN,An,an@example.test,\nCA_NHAN,Binh,binh@example.test,')
    expect(await screen.findByText('Tệp đúng định dạng nhưng có 2 dòng, Tour chỉ còn 1 chỗ cho đoàn của bạn. Bớt dòng rồi chọn lại tệp.')).toBeInTheDocument()
    expect(screen.queryByText(/Tệp hợp lệ/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ tệp vừa chọn' }))
    expect(discard).toHaveBeenCalledTimes(1)
  })
})

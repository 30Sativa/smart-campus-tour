import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminAuditLogsPage from './AdminAuditLogsPage'
import { useAuthStore } from '../../stores/auth-store'

const entry = { id: 1, occurredAt: '2026-10-30T08:00:00Z', action: 'TOUR_CANCELLED', entityType: 'Tour', entityId: 'tour-1',
  actorUserId: 'u1', actorName: 'Lan Staff', tourId: 'tour-1', tourName: 'Tour sáng', robotCode: null, resultCode: 'SUCCESS' }
let rows: unknown[] = []
let status = 200
let urls: URL[] = []

function show() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AdminAuditLogsPage /></MemoryRouter></QueryClientProvider>)
}

describe('system audit log', () => {
  beforeEach(() => {
    rows = [entry]
    status = 200
    urls = []
    useAuthStore.getState().setAuth('token', { userId: 'admin', username: 'admin', role: 'Admin' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      urls.push(new URL(String(input), 'http://localhost'))
      return new Response(JSON.stringify({ success: status === 200, message: 'Không tải được.', data: rows, pagination: { page: 1, pageSize: 20, totalItems: rows.length, totalPages: 1 } }), { status })
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

  it('shows entries in plain words and no raw action code', async () => {
    show()
    expect(await screen.findByRole('cell', { name: 'Hủy Tour' })).toBeInTheDocument()
    expect(screen.getByText('Tour sáng')).toBeInTheDocument()
    expect(screen.getByText('Lan Staff')).toBeInTheDocument()
    expect(screen.getByText('Thành công')).toBeInTheDocument()
    expect(screen.queryByText('TOUR_CANCELLED')).not.toBeInTheDocument()
  })

  it('labels an unknown action and an entry with no account', async () => {
    rows = [{ ...entry, action: 'SOMETHING_NEW', actorName: null, resultCode: null }]
    show()
    expect(await screen.findByText('Thao tác khác')).toBeInTheDocument()
    expect(screen.getByText('Hệ thống')).toBeInTheDocument()
    expect(screen.queryByText('SOMETHING_NEW')).not.toBeInTheDocument()
  })

  it('words a system auto-cancel without showing its result code', async () => {
    rows = [{ ...entry, actorUserId: null, actorName: null, resultCode: 'SYSTEM_NO_START' }]
    show()
    expect(await screen.findByText('Tự huỷ: không bắt đầu đúng giờ')).toBeInTheDocument()
    expect(screen.getByText('Hệ thống')).toBeInTheDocument()
    expect(screen.queryByText('SYSTEM_NO_START')).not.toBeInTheDocument()
  })

  it('sends the action code and actor, then clears the filters', async () => {
    show()
    await screen.findByRole('cell', { name: 'Hủy Tour' })
    fireEvent.change(screen.getByLabelText('Thao tác'), { target: { value: 'TOUR_CANCELLED' } })
    fireEvent.change(screen.getByLabelText('Người thực hiện'), { target: { value: 'lan' } })
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('actor')).toBe('lan'))
    expect(urls.at(-1)?.searchParams.get('action')).toBe('TOUR_CANCELLED')
    fireEvent.click(screen.getByRole('button', { name: 'Xóa lọc' }))
    await waitFor(() => expect(urls.at(-1)?.searchParams.has('action')).toBe(false))
  })

  it('offers a retry when the log cannot load', async () => {
    status = 503
    show()
    expect(await screen.findByText('Không tải được.')).toBeInTheDocument()
    status = 200
    fireEvent.click(screen.getByRole('button', { name: /Thử lại|Tải lại/ }))
    expect(await screen.findByRole('cell', { name: 'Hủy Tour' })).toBeInTheDocument()
  })
  it('names a student invitation step instead of the system', async () => {
    rows = [{ ...entry, action: 'INVITATION_ENTERED', entityType: 'Invitation', actorUserId: null, actorName: null, resultCode: 'OK' }]
    show()
    expect(await screen.findByRole('cell', { name: 'Học sinh vào Tour lần đầu' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Học sinh (lời mời)' })).toBeInTheDocument()
    expect(screen.queryByText('Hệ thống')).not.toBeInTheDocument()
  })

  it('groups the action filter with one optgroup per group and no unknown label', async () => {
    show()
    await screen.findByRole('cell', { name: 'Hủy Tour' })
    const select = screen.getByLabelText('Thao tác')
    const groups = [...select.querySelectorAll('optgroup')].map(group => group.label)
    expect(groups).toEqual(expect.arrayContaining(['Tài khoản', 'Tour', 'Vận hành Tour', 'Lời mời', 'Email', 'Lịch vận hành']))
    expect(select.querySelector('optgroup[label="Tài khoản"] option[value="PASSWORD_RESET_BY_ADMIN"]')).not.toBeNull()
    expect(select.querySelector('optgroup[label="Vận hành Tour"] option[value="ROBOT_DISPATCH_CHANGED"]')).not.toBeNull()
    expect(select.textContent).not.toContain('Thao tác khác')
  })

  it('filters by campus day typed as dd/mm/yyyy, both ends inclusive', async () => {
    show()
    await screen.findByRole('cell', { name: 'Hủy Tour' })
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '01/11/2026' } })
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '13/11/2026' } })
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('to')).toBe('2026-11-13T16:59:59.999Z'))
    expect(urls.at(-1)?.searchParams.get('from')).toBe('2026-10-31T17:00:00.000Z')
    expect(await screen.findByText('30/10/2026 15:00')).toBeInTheDocument()
  })

  it('says there is nothing yet, and offers to clear filters only while filtering', async () => {
    rows = []
    show()
    expect(await screen.findByText('Chưa có nhật ký')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Thao tác'), { target: { value: 'TOUR_CANCELLED' } })
    expect(await screen.findByText('Không có kết quả phù hợp')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }))
    expect(await screen.findByText('Chưa có nhật ký')).toBeInTheDocument()
  })
})

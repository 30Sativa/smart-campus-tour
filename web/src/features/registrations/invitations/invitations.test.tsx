import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../stores/auth-store'
import { InvitationPanel } from './InvitationPanel'
import { StudentInvitationPage } from '../../student/invitation/StudentInvitationPage'
import type { InvitationDetails } from './api'

let client: QueryClient
const initial: InvitationDetails = { enabled: true, canIssue: false, items: [{
  id: 'invite', rowNumber: 2, rowType: 'SHARED_VIEWING', displayName: 'Phòng A', email: 'room@example.test',
  rowVersion: 'AAAAAAAAAAE=', accessVersion: 1, expiresAt: '2026-10-30T00:00:00Z', revokedAt: null,
  emailStatus: 'UNKNOWN', lastEmailAt: '2026-10-10T00:00:00Z', canSend: true, canReissue: true, canRevoke: true,
}] }
function response(data: unknown, status = 200) { return new Response(JSON.stringify({ success: status === 200, data }), { status }) }
function mount(element: React.ReactNode) { return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>) }
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  useAuthStore.getState().setAuth('owner-token', { userId: 'rep', username: 'representative', role: 'Representative' })
})
afterEach(() => { client.clear(); useAuthStore.getState().logout(); vi.unstubAllGlobals() })

it('shows truthful email status and keeps the request ID when retrying an uncertain write', async () => {
  const writes: Record<string, unknown>[] = []
  const fetch = vi.fn(async (_input: string, options?: RequestInit) => {
    expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer owner-token')
    if (options?.method === 'POST') {
      writes.push(JSON.parse(options.body as string))
      if (writes.length === 1) throw new TypeError('connection lost after commit')
      return response(null)
    }
    return response(initial)
  })
  vi.stubGlobal('fetch', fetch)
  mount(<InvitationPanel registrationId="group" rowVersion="AAAAAAAAAAE=" tourRowVersion="AAAAAAAAAAI=" />)
  expect(await screen.findByText('Chưa biết kết quả')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Gửi lại email' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
  expect(within(dialog).getByText(/giữ nguyên/i)).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi lại' }))
  await waitFor(() => expect(writes).toHaveLength(1))
  await screen.findAllByText(/Không xác nhận được kết quả/)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi lại' }))
  await waitFor(() => expect(writes).toHaveLength(2))
  expect(writes[0]).toEqual(writes[1])
  expect(writes[0].expectedRowVersion).toBe('AAAAAAAAAAE=')
  expect(JSON.stringify(writes)).not.toContain('room@example.test')
  expect(await screen.findByRole('status')).toHaveTextContent('Đã lưu thao tác')
})

it('confirms that reissue closes old sessions and never restores the code after email failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(initial)))
  mount(<InvitationPanel registrationId="group" rowVersion="AAAAAAAAAAE=" tourRowVersion="AAAAAAAAAAI=" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Thu hồi và cấp mã mới' }))
  expect(within(screen.getByRole('dialog')).getByText(/gửi email lỗi không khôi phục mã cũ/i)).toBeInTheDocument()
})

it('uses only an access code for Student entry and never refreshes/logs out an account on invalid Student access', async () => {
  const calls: { path: string; options?: RequestInit }[] = []
  let joined = false
  vi.stubGlobal('fetch', vi.fn(async (path: string, options?: RequestInit) => {
    calls.push({ path, options })
    expect((options?.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(options?.credentials).toBe('include')
    if (path.endsWith('/join')) { joined = true; return response({ tourId: 'tour', tourName: 'Tour được mời', tourState: 'SCHEDULED', scheduledStartAt: '2026-10-20T02:00:00Z', invitationExpiresAt: '2026-10-21T02:00:00Z', rowType: 'SHARED_VIEWING', fallbackVideoUrl: null }) }
    return response(null, 401)
  }))
  mount(<StudentInvitationPage tourId="tour" />)
  const input = await screen.findByRole('textbox', { name: 'Mã truy cập' })
  expect(screen.queryByLabelText(/Email|Họ tên|Lớp|Mã đoàn/)).not.toBeInTheDocument()
  fireEvent.change(input, { target: { value: 'ABCDE-FGHIJ-KLMNO-PQRST' } })
  fireEvent.click(screen.getByRole('button', { name: 'Vào Tour' }))
  expect(await screen.findByText('Bạn đã vào phòng chờ')).toBeInTheDocument()
  expect(joined).toBe(true)
  const body = JSON.parse(calls.find(c => c.path.endsWith('/join'))!.options!.body as string)
  expect(body).toEqual({ accessCode: 'ABCDE-FGHIJ-KLMNO-PQRST' })
  expect(calls.some(c => c.path.includes('/api/auth/'))).toBe(false)
  expect(calls.every(c => !c.path.includes('ABCDE'))).toBe(true)
  expect(useAuthStore.getState().accessToken).toBe('owner-token')
  await act(async () => { client.clear() })
})

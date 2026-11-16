import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../stores/auth-store'
import { useToastStore } from '../../../components/ui/toast-store'
import { InvitationPanel } from './InvitationPanel'
import { StudentInvitationPage } from '../../student/invitation/StudentInvitationPage'
import type { InvitationDetails } from './api'
import { time } from './viewer-presence'

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
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer owner-token')
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
  await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.title).toBe('Đã lưu thao tác'))
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
    expect(new Headers(options?.headers).get('Authorization')).toBeNull()
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

const base = initial.items[0]
const withPresence: InvitationDetails = { enabled: true, canIssue: false, items: [
  { ...base, id: 'a', displayName: 'Em An', viewerPresence: 'CONNECTED', firstEnteredAt: '2026-10-20T02:00:00Z', lastSeenAt: '2026-10-20T02:30:00Z', sessionExpiresAt: '2026-10-20T02:40:00Z' },
  { ...base, id: 'b', displayName: 'Em Bình', viewerPresence: 'DISCONNECTED', firstEnteredAt: '2026-10-20T02:01:00Z', lastSeenAt: '2026-10-20T02:10:00Z', sessionExpiresAt: '2026-10-20T02:20:00Z' },
  { ...base, id: 'c', displayName: 'Em Chi', viewerPresence: 'LEFT', firstEnteredAt: '2026-10-20T02:02:00Z', lastSeenAt: '2026-10-20T02:15:00Z', sessionExpiresAt: null },
  { ...base, id: 'd', displayName: 'Em Dũng', viewerPresence: 'NOT_ENTERED', firstEnteredAt: null, lastSeenAt: null, sessionExpiresAt: null },
  { ...base, id: 'e', displayName: 'Em Én', viewerPresence: 'NOT_ENTERED', firstEnteredAt: null, lastSeenAt: null, sessionExpiresAt: null },
] }
const rowOf = (name: string, variant: 'console' | 'representative') =>
  screen.getByText(name).closest(variant === 'console' ? 'article' : 'tr') as HTMLElement

it.each(['console', 'representative'] as const)('shows viewer presence for each invitation in the %s variant', async variant => {
  vi.stubGlobal('fetch', vi.fn(async () => response(withPresence)))
  mount(<InvitationPanel registrationId="group" rowVersion="AAAAAAAAAAE=" tourRowVersion="AAAAAAAAAAI=" variant={variant} />)
  expect(await screen.findByText('1 đang xem · 1 mất kết nối · 2 chưa vào')).toBeInTheDocument()
  if (variant === 'representative') expect(screen.getByRole('columnheader', { name: 'Người xem' })).toBeInTheDocument()

  const connected = within(rowOf('Em An', variant))
  expect(connected.getByText('Đang xem')).toBeInTheDocument()
  expect(connected.getByText(`Vào lần đầu ${time('2026-10-20T02:00:00Z')}`)).toBeInTheDocument()

  const disconnected = within(rowOf('Em Bình', variant))
  expect(disconnected.getByText(`Mất kết nối · lần cuối ${time('2026-10-20T02:10:00Z')}`)).toBeInTheDocument()
  expect(disconnected.getByText(`Cấp mã mới để em vào lại ngay, hoặc đợi tới ${time('2026-10-20T02:20:00Z')}.`)).toBeInTheDocument()

  const left = within(rowOf('Em Chi', variant))
  expect(left.getByText(`Đã rời · lần cuối ${time('2026-10-20T02:15:00Z')}`)).toBeInTheDocument()
  expect(left.queryByText(/Cấp mã mới để em/)).not.toBeInTheDocument()

  const notEntered = within(rowOf('Em Dũng', variant))
  expect(notEntered.getByText('Chưa vào')).toBeInTheDocument()
  expect(notEntered.queryByText(/Vào lần đầu/)).not.toBeInTheDocument()

  if (variant === 'representative') {
    expect(connected.getByText('Đang xem')).toHaveClass('rep-badge--ok')
    expect(disconnected.getByText(/Mất kết nối/)).toHaveClass('rep-badge--warn')
    expect(left.getByText(/Đã rời/)).toHaveClass('rep-badge--muted')
    expect(notEntered.getByText('Chưa vào')).toHaveClass('rep-badge--muted')
    expect(disconnected.getByText(/Mất kết nối/).closest('td')).toHaveAttribute('data-label', 'Người xem')
  }
  // The support actions are unchanged by presence.
  expect(within(rowOf('Em Bình', variant)).getByRole('button', { name: 'Thu hồi và cấp mã mới' })).toBeEnabled()
})

it.each(['console', 'representative'] as const)('leaves out viewer presence when an older backend omits it (%s)', async variant => {
  vi.stubGlobal('fetch', vi.fn(async () => response(initial)))
  mount(<InvitationPanel registrationId="group" rowVersion="AAAAAAAAAAE=" tourRowVersion="AAAAAAAAAAI=" variant={variant} />)
  expect(await screen.findByText('Phòng A')).toBeInTheDocument()
  expect(screen.queryByText(/Người xem/)).not.toBeInTheDocument()
  expect(screen.queryByText(/đang xem ·/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Gửi lại email' })).toBeEnabled()
})

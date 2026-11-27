import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TourDetails } from '../../administration/tours/types'
import { useAuthStore } from '../../../stores/auth-store'
import StaffManageTourDetailPage from '../../../routes/staff/manage/StaffManageTourDetailPage'
import { OperatorPresencePanel } from './OperatorPresencePanel'
import { useOperationTour } from './hooks'

const NOW = Date.parse('2026-11-27T03:00:00Z')
const LAST = '2026-11-27T02:55:00Z'
const BUTTON = 'Kết thúc sớm thay người vận hành'
let detail: TourDetails
let reconnect: boolean
let calls: Array<Record<string, unknown>>
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  detail = {
    tour: { id: 'tour-1', name: 'Tour thử', description: null, routeId: 'route-1', routeName: 'Tuyến thử', activeRouteId: 'route-1',
      scheduledStartAt: '2026-11-27T02:30:00Z', state: 'RUNNING', createdByUserId: 'operator', createdAt: LAST, updatedAt: LAST,
      rowVersion: 'AAAAAAAAB9E=', registrationCount: 2, invitationCount: 2, routeRevisionId: null },
    route: null, activeRoute: null, routeRevision: null, reservation: null,
    operator: { userId: 'operator', fullName: 'Lan', username: 'lan' },
    fallbackVideoUrl: null, startedAt: '2026-11-27T02:30:00Z', endedAt: null, endReason: null,
    usage: { hasRegistrations: true, hasAllowedBranches: false, hasOperationalHistory: true, hasRobotOwnership: false },
    permissions: { canEditMetadata: false, canChangeScheduleAndRoute: false, canCancel: false },
    operatorLastSeenAt: LAST, operatorDisconnectedSince: LAST, operatorDisconnectEndEarlyMinutes: 5,
    allowedActions: { start: { allowed: false, reason: null, blockedBy: [] }, next: { allowed: false, reason: null, blockedBy: ['callerIsOperator'] },
      endEarly: { allowed: true, reason: null, blockedBy: [] } },
  }
  calls = []; reconnect = false
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  useAuthStore.getState().setAuth('token', { userId: 'backup', username: 'minh', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname
    if (init?.method === 'POST' && path.endsWith('/end-early')) {
      calls.push(JSON.parse(String(init.body)))
      if (reconnect) return json({ success: false, message: 'Người vận hành vẫn đang kết nối (lần cuối 10:00:00). Chỉ kết thúc sớm thay được sau 5 phút mất kết nối.',
        errors: { code: 'OPERATOR_STILL_CONNECTED', operatorLastSeenAt: ['2026-11-27T03:00:00Z'], allowedAt: ['2026-11-27T03:05:00Z'] } }, 409)
      return json({ success: true, data: { id: 'tour-1' } })
    }
    if (path === '/api/staff/manage/tours/tour-1') {
      if (reconnect && calls.length) return json({ success: false }, 503)
      return json({ success: true, data: detail })
    }
    return json({ success: true, data: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 } })
  }))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); useAuthStore.getState().logout() })

function ConnectedPanel() {
  const query = useOperationTour('tour-1', false)
  return query.data ? <OperatorPresencePanel detail={query.data} /> : null
}
function show(element = <ConnectedPanel />, path = '/') {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
  </QueryClientProvider>)
}

describe('backup Staff End Early', () => {
  it('shows contact with seconds and uses the API interval for its locked countdown', async () => {
    detail.operatorLastSeenAt = '2026-11-27T02:58:00Z'; detail.operatorDisconnectedSince = null
    detail.operatorDisconnectEndEarlyMinutes = 7; detail.allowedActions!.endEarly!.allowed = false
    show()
    expect(await screen.findByRole('button', { name: BUTTON })).toBeDisabled()
    expect(screen.getByText('Người vận hành: Lan · còn kết nối (lần cuối 09:58:00)')).toBeInTheDocument()
    expect(screen.getByText('Chỉ dùng được sau 7 phút người vận hành mất kết nối (còn 05:00).')).toBeInTheDocument()
  })

  it('requires a reason and sends the existing versioned, idempotent request after confirmation', async () => {
    show(); fireEvent.click(await screen.findByRole('button', { name: BUTTON }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Hành động này được ghi lại với tên bạn, thay cho Lan đã mất kết nối từ 09:55.')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Kết thúc sớm' })).toBeDisabled()
    fireEvent.change(dialog.getByRole('textbox'), { target: { value: 'Không thể tiếp tục' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Kết thúc sớm' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({ expectedRowVersion: 'AAAAAAAAB9E=', reason: 'Không thể tiếp tục', requestId: expect.any(String) })
  })

  it('shows the reconnect refusal and locks immediately even if refresh fails, preserving the reason', async () => {
    reconnect = true; show(); fireEvent.click(await screen.findByRole('button', { name: BUTTON }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByRole('textbox'), { target: { value: 'Cần kết thúc thay' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Kết thúc sớm' }))
    expect(await dialog.findByText(/Người vận hành vẫn đang kết nối \(lần cuối 10:00:00\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: BUTTON })).toBeDisabled()
    expect(dialog.getByRole('button', { name: 'Kết thúc sớm' })).toBeDisabled()
    expect(dialog.getByRole('textbox')).toHaveValue('Cần kết thúc thay')
    expect(screen.getByText('Chỉ dùng được sau 5 phút người vận hành mất kết nối (còn 05:00).')).toBeInTheDocument()
  })

  it('waits for the server even when the local countdown is zero', async () => {
    detail.allowedActions!.endEarly!.allowed = false; detail.operatorDisconnectedSince = null
    detail.operatorLastSeenAt = '2026-11-27T02:54:00Z'; show()
    expect(await screen.findByRole('button', { name: BUTTON })).toBeDisabled()
    expect(screen.getByText(/còn 00:00/)).toBeInTheDocument()
  })

  it('allows legacy null contact through the server gate and explains the missing timestamp', async () => {
    detail.operatorLastSeenAt = null; detail.operatorDisconnectedSince = null; show()
    const action = await screen.findByRole('button', { name: BUTTON }); expect(action).toBeEnabled(); fireEvent.click(action)
    expect(screen.getByText(/Tour cũ chưa ghi nhận lần liên lạc/)).toBeInTheDocument()
  })

  it('fails closed on a server without the interval contract', async () => {
    delete detail.operatorDisconnectEndEarlyMinutes; show()
    expect(await screen.findByRole('button', { name: BUTTON })).toBeDisabled()
  })

  it.each([{ role: 'Admin', userId: 'backup' }, { role: 'Staff', userId: 'operator' }] as const)('hides the backup button for the assigned Operator or Admin ($role)', ({ role, userId }) => {
    useAuthStore.getState().setAuth('token', { userId, username: 'lan', role })
    show(<OperatorPresencePanel detail={detail} />)
    expect(screen.queryByRole('button', { name: BUTTON })).not.toBeInTheDocument()
  })

  it('shows the audited backup event in the Tour detail opened from history', async () => {
    detail.tour.state = 'CANCELLED'; detail.endedAt = '2026-11-27T03:00:00Z'
    detail.endedEarlyByBackupStaff = { actorUserId: 'backup', actorName: 'Minh', operatorUserId: 'operator', operatorName: 'Lan', operatorLastSeenAt: LAST }
    show(<Routes><Route path="/staff/manage/tours/:tourId" element={<StaffManageTourDetailPage />} /></Routes>, '/staff/manage/tours/tour-1')
    expect(await screen.findByText('Kết thúc sớm bởi Minh thay người vận hành Lan (mất kết nối từ 09:55)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: BUTTON })).not.toBeInTheDocument()
  })
})

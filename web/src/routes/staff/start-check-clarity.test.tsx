import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TourDetails, TourStartChecks } from '../../features/administration/tours/types'
import { useAuthStore } from '../../stores/auth-store'
import StartCheckPage from './StartCheckPage'

const TOUR = {
  tour: { id: 'tour-1', name: 'Tour trình diễn', description: null, routeId: 'route-1', routeName: 'Tuyến tầng 6', activeRouteId: 'route-1',
    scheduledStartAt: new Date(Date.now() + 10 * 60_000).toISOString(), state: 'READY', createdByUserId: 'u', createdAt: '2026-10-01T00:00:00Z', updatedAt: null,
    rowVersion: 'AAAAAAAAB9E=', registrationCount: 1, invitationCount: 2, routeRevisionId: 'rev-1' },
  route: null, activeRoute: null, routeRevision: null,
  operator: { userId: 'staff-1', fullName: 'Lan Staff', username: 'lan' },
  reservation: { robotCode: 'amr_01', startsAt: '2026-11-04T01:45:00Z', endsAt: '2026-11-04T02:40:00Z', measuredDurationSeconds: 600, expectedDurationSeconds: 900, releasedAt: null },
  fallbackVideoUrl: null, startedAt: null, endedAt: null, endReason: null,
  usage: { hasRegistrations: true, hasAllowedBranches: false, hasOperationalHistory: false, hasRobotOwnership: false },
  permissions: { canEditMetadata: false, canChangeScheduleAndRoute: false, canCancel: true, canMarkReady: false, canReopen: true, readyBlockers: [] },
  execution: null,
} as unknown as TourDetails

/** What the real server sends for a robot that reported 16 hours ago, with the system gates closed. */
const CHECKS: TourStartChecks = {
  canStart: false,
  blockedBy: ['telemetryFresh', 'operatorConsoleConnected', 'commandTransportEnabled'],
  checks: [
    { id: 'tourReady', passed: true, source: 'DB', detail: 'Tour đang READY.' },
    { id: 'callerIsOperator', passed: true, source: 'DB', detail: 'Bạn là người vận hành của Tour.' },
    { id: 'telemetryFresh', passed: false, source: 'TELEMETRY', detail: 'Telemetry nhận cách đây 59488.2 giây, quá 10 giây.' },
    { id: 'mapContextMatches', passed: false, source: 'TELEMETRY', detail: 'Chưa kiểm tra vì telemetryFresh chưa đạt.' },
    { id: 'executionIdle', passed: false, source: 'TELEMETRY', detail: 'Chưa kiểm tra vì telemetryFresh chưa đạt.' },
    { id: 'operatorConsoleConnected', passed: false, source: 'CONSOLE', detail: 'Console của người vận hành chưa kết nối.' },
    { id: 'commandTransportEnabled', passed: false, source: 'CONFIG', detail: 'FleetCommands:Enabled = false nên backend không tạo lệnh cho robot.' },
    { id: 'batteryInfo', passed: true, source: 'TELEMETRY', detail: 'Pin 80% (chỉ hiển thị, không chặn Start).' },
  ],
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', { userId: 'staff-1', username: 'lan', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/start-checks')) return json({ success: true, data: CHECKS })
    if (url.pathname === '/api/staff/manage/tours/tour-1') return json({ success: true, data: TOUR })
    return json({ success: true, data: [] })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/staff/tours/tour-1/start']}><Routes><Route path="/staff/tours/:tourId/start" element={<StartCheckPage />} /></Routes></MemoryRouter>
  </QueryClientProvider>)
}

describe('pre-start check wording', () => {
  it('leads with what needs doing and folds the full list', async () => {
    renderPage()
    expect(await screen.findByText('Cần xử lý')).toBeInTheDocument()
    const all = screen.getByRole('group', { name: 'Toàn bộ điều kiện' })
    expect(all.tagName).toBe('DETAILS')
    expect(all).not.toHaveAttribute('open')
  })

  it('counts the same way everywhere, and never calls a group with unchecked rows passed', async () => {
    renderPage()
    await screen.findByText('Cần xử lý')
    // 2 passed, 3 failed, 2 not run, out of 7 counted checks (battery is information only).
    expect(screen.getByText('2/7 đạt')).toBeInTheDocument()
    expect(screen.getByText('2/7 đạt, 3 chưa đạt, 2 chưa kiểm tra')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Bước 1: Máy chủ cho phép' })).getByText('Còn 3 mục chặn')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Robot tự báo' })).getByText('0/3 đạt, 1 chưa đạt, 2 chưa kiểm tra')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Tour và lịch' })).getByText('2/2 đạt')).toBeInTheDocument()
  })

  it('says when the robot last reported in hours, and the operator check by what to do', async () => {
    renderPage()
    expect((await screen.findAllByText('Robot báo lần cuối 16 giờ trước, đã quá lâu.')).length).toBeGreaterThan(0)
    expect(screen.getByText('Đăng nhập đúng người vận hành')).toBeInTheDocument()
  })

  it('shows no internal names, configuration keys or raw seconds', async () => {
    renderPage()
    await screen.findByText('Cần xử lý')
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/QUEST_CONTROL_URL|quest-stream|miniPC|Fleet Sync|telemetry|M2\.3|FleetCommands|59488/i)
    expect(text).not.toMatch(/Console của người vận hành/)
  })
})

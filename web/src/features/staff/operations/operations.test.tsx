import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../api/client'
import { useAuthStore } from '../../../stores/auth-store'
import type { TourSummary } from '../../administration/tours/types'
import { buildAttention } from './attention'
import type { RunningTour } from './hooks'
import { useFleetConnection, useFleetTelemetrySync, type FleetRobot } from './fleet-telemetry'
import { operationRefusal } from './operation-errors'
import { checkVerdict } from './operation-labels'
import { RobotTelemetryPanel } from './OperationParts'

type Handler = (...args: unknown[]) => void
const hub = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  tokenFactory: null as null | (() => string),
  failCreate: false,
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../../api/signalr', () => ({
  createHubConnection: (_path: string, options: { accessTokenFactory: () => string }) => {
    if (hub.failCreate) throw new Error("Cannot resolve '/hubs/operations'.")
    hub.tokenFactory = options.accessTokenFactory
    return {
      on: (name: string, handler: Handler) => hub.handlers.set(name, handler),
      off: (name: string) => hub.handlers.delete(name),
      onreconnecting: () => undefined, onreconnected: () => undefined, onclose: () => undefined,
      start: hub.start, stop: hub.stop,
    }
  },
}))

const ROBOT: FleetRobot = {
  id: 'amr_01', name: 'AMR 01', connectionState: 'Live', batteryPercent: null, lastSeenAt: '2026-11-04T02:00:00Z', telemetryAgeSeconds: 1,
  source: 'Physical', pose: { x: 1.234, y: -2.5, yaw: 0, capturedAt: '2026-11-04T02:00:00Z' }, poseAgeSeconds: 1, localized: true, motionReady: null,
  syncFresh: true, poseFresh: true, executionStatus: 'IDLE', mapKey: 'tang-6-v1', frameId: 'map', legId: null, faultCode: null, needsCheck: false,
}

function Probe() {
  useFleetTelemetrySync()
  return <RobotTelemetryPanel robotCode="amr_01" />
}

afterEach(() => {
  hub.handlers.clear()
  hub.failCreate = false
  useAuthStore.getState().logout()
  useFleetConnection.setState({ state: 'connecting' })
})

describe('fleet telemetry from /hubs/operations', () => {
  it('connects with the current access token and shows only what the robot reported', async () => {
    useAuthStore.getState().setAuth('jwt-1', { userId: 'u', username: 'lan', role: 'Staff' })
    const view = render(<QueryClientProvider client={new QueryClient()}><Probe /></QueryClientProvider>)
    expect(hub.tokenFactory?.()).toBe('jwt-1')
    expect(await screen.findByText(/chưa gửi telemetry/)).toBeInTheDocument()
    act(() => hub.handlers.get('FleetUpdated')?.([ROBOT]))
    expect(await screen.findByText('Đã định vị')).toBeInTheDocument()
    expect(screen.getByText('x 1.23, y -2.50 m')).toBeInTheDocument()
    // Not reported is said as such, never filled in.
    expect(screen.getAllByText('Robot chưa báo')).toHaveLength(2)
    view.unmount()
    expect(hub.stop).toHaveBeenCalled()
    expect(hub.handlers.has('FleetUpdated')).toBe(false)
  })

  it('re-reads the Tours on screen when the hub says a Tour changed, and stops listening on unmount', async () => {
    useAuthStore.getState().setAuth('jwt-1', { userId: 'u', username: 'lan', role: 'Staff' })
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const view = render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
    act(() => hub.handlers.get('TourUpdated')?.())
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'tour-management'] })
    view.unmount()
    expect(hub.handlers.has('TourUpdated')).toBe(false)
  })
})

describe('a hub that cannot be created', () => {
  it('is reported as disconnected and does not take the page down', async () => {
    hub.failCreate = true
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<QueryClientProvider client={new QueryClient()}><Probe /></QueryClientProvider>)
    expect(await screen.findByText(/Mất kết nối telemetry/)).toBeInTheDocument()
    expect(useFleetConnection.getState().state).toBe('disconnected')
  })
})

describe('operation refusals', () => {
  it('reads the checks of a refused Start', () => {
    const error = new ApiError(409, JSON.stringify({ errors: { code: 'START_PRECONDITION_FAILED', blockedBy: ['telemetryFresh'],
      checks: [{ id: 'telemetryFresh', passed: false, source: 'TELEMETRY', detail: 'Robot chưa báo telemetry.' }] } }))
    const refusal = operationRefusal(error, { operator: true })
    expect(refusal.code).toBe('START_PRECONDITION_FAILED')
    expect(refusal.checks?.[0].id).toBe('telemetryFresh')
    expect(refusal.blockedBy).toEqual(['telemetryFresh'])
    expect(refusal.message).toMatch(/từ chối bắt đầu/)
  })

  it('words a 403 by who may act', () => {
    const error = new ApiError(403, '')
    expect(operationRefusal(error, { operator: true }).message).toMatch(/người vận hành được giao/)
    expect(operationRefusal(error).message).toMatch(/không có quyền/)
  })

  it('tells a failed check from one the server did not run', () => {
    expect(checkVerdict({ id: 'telemetryFresh', passed: false }, ['telemetryFresh'])).toBe('failed')
    expect(checkVerdict({ id: 'mapContextMatches', passed: false }, ['telemetryFresh'])).toBe('notRun')
    expect(checkVerdict({ id: 'batteryInfo', passed: true }, [])).toBe('info')
  })
})

describe('attention queue', () => {
  const summary = (id: string, state: TourSummary['state']) => ({ id, name: id, state, scheduledStartAt: '2026-11-04T02:00:00Z' }) as TourSummary
  it('puts a Tour needing assistance first, then READY, then not-yet-READY Tours', () => {
    const help = { tour: summary('t-run', 'RUNNING'), execution: { operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'NavigationFailed', currentStep: 'NAVIGATING', commandState: 'FAILED' } } as RunningTour
    const items = buildAttention([help], [summary('t-ready', 'READY'), summary('t-new', 'SCHEDULED'), summary('t-done', 'COMPLETED')])
    expect(items.map(item => item.id)).toEqual(['assist-t-run', 'ready-t-ready', 'scheduled-t-new'])
    expect(items[0]).toMatchObject({ tone: 'danger', headline: 'Cần hỗ trợ: Lỗi điều hướng', to: '/staff/live/t-run' })
  })

  it('names an ended Tour whose GoTo the server still reports UNKNOWN, after assistance and before READY', () => {
    const ended = (id: string, needsReconcile: boolean) => ({ ...summary(id, 'CANCELLED'),
      execution: { operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'CommandUnknown', currentStep: 'NAVIGATING', commandState: needsReconcile ? 'UNKNOWN' : 'RECONCILED', needsReconcile } }) as TourSummary
    const items = buildAttention([], [summary('t-ready', 'READY')], [ended('t-held', true), ended('t-closed', false)])
    expect(items.map(item => item.id)).toEqual(['reconcile-t-held', 'ready-t-ready'])
    expect(items[0]).toMatchObject({ tone: 'danger', headline: 'Tour đã kết thúc, còn lệnh chưa rõ kết quả cần đối soát', to: '/staff/live/t-held' })
  })
})

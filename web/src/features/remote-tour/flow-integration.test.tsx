import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { remotePreviewApi as api, resetRemotePreview } from '../../mocks/remote-tour-mock'
import { remoteStaffApi } from '../../mocks/remote-staff-adapter'
import RepresentativePage from './RepresentativePage'
import SessionDetailPage from '../../routes/staff/SessionDetailPage'

function login(role = 'Representative') {
  useAuthStore.getState().setAuth('mock', { userId: 'mock-user-representative', username: 'demo', role })
}
function show(element: React.ReactNode, path: string, pattern = path) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={element} /></Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  resetRemotePreview(); login()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { vi.useRealTimers(); useAuthStore.getState().logout() })

describe('new flow within the existing screens', () => {
  it('shows locked registrations alongside scheduled ones in My registrations', async () => {
    show(<RepresentativePage />, '/visit/bookings')
    expect(await screen.findByRole('heading', { name: 'Buổi tham quan đã chốt' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Khám phá campus trực tuyến' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Hủy đăng ký' })).toHaveLength(1)
    expect(screen.getAllByText(/Chỉ xem thông tin/)).toHaveLength(2)
  })
  it('lets a representative cancel a rejected scheduled registration', async () => {
    const r = (await api.workspace()).registrations[0]
    await api.saveRegistration(r, r.revision)
    login('Admin'); await api.registrationAction(r.id, 2, 'reject', 'Cần sửa danh sách')
    login(); show(<RepresentativePage />, '/visit/bookings')
    fireEvent.click(await screen.findByRole('button', { name: 'Hủy đăng ký' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
    expect(await screen.findByRole('button', { name: 'Đăng ký lại' })).toBeInTheDocument()
  })
  it('keeps the detail layout but gives Admin no robot controls', async () => {
    login('Admin'); show(<SessionDetailPage />, '/staff/tours/tour-3', '/staff/tours/:sessionId')
    expect(await screen.findByRole('heading', { name: 'Điều phối AMR' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dòng thời gian' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hold tại POI' })).not.toBeInTheDocument()
    expect(screen.getByText(/Chỉ xem giám sát/)).toBeInTheDocument()
  })
  it('keeps the selected detail after End Early and requires robot release', async () => {
    login('Staff'); show(<SessionDetailPage />, '/staff/tours/tour-3', '/staff/tours/:sessionId')
    fireEvent.click(await screen.findByRole('button', { name: 'Kết thúc sớm' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Kết thúc thử nghiệm' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }))
    expect(await screen.findByRole('button', { name: 'Xác nhận robot đã dừng' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Khám phá campus trực tuyến', level: 1 })).toBeInTheDocument()
  })
  it('projects the same state to the existing schedule, dashboard and fleet', async () => {
    login('Admin')
    await api.command('tour-1', 1, 'ready')
    expect((await remoteStaffApi.schedule({ status: 'READY' })).map(t => t.sessionId)).toContain('tour-1')
    login('Staff')
    const t = (await api.workspace()).tours.find(t => t.id === 'tour-3')!
    await api.command(t.id, t.revision, 'end-early', true, 'Demo')
    expect((await remoteStaffApi.dashboard()).activeSessions).toEqual([])
    expect((await remoteStaffApi.amrs())[0].operationalState).toBe('Maintenance')
    expect((await remoteStaffApi.schedule({ status: 'CANCELLED' }))[0].sessionId).toBe('tour-3')
  })
  it('creates addressable tours and completes an arrived return without retrying navigation', async () => {
    login('Admin')
    await api.saveTour({ id: undefined, name: 'New tour', scheduledAt: new Date().toISOString(), routeId: 'indoor', description: '' })
    const created = (await api.workspace()).tours.find(t => t.name === 'New tour')!
    expect(created.id).toEqual(expect.any(String))
    expect((await remoteStaffApi.tourSession(created.id)).routeName).toBe('New tour')
    login('Staff'); await api.simulateFault('tour-3', 'return-stream')
    const w = await api.workspace(); const t = w.tours.find(t => t.id === 'tour-3')!
    expect(w.actions[t.id].map(a => a.action)).toContain('complete')
    expect(w.actions[t.id].map(a => a.action)).not.toContain('retry-leg')
    await api.command(t.id, t.revision, 'complete', true)
    expect((await api.student(t.id)).tour.state).toBe('COMPLETED')
  })
})

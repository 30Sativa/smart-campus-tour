import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import TechnicalOverviewPage from '../../routes/technical/TechnicalOverviewPage'
import TechnicalPoiImportPage from '../../routes/technical/TechnicalPoiImportPage'
import TechnicalRouteVersionPage from '../../routes/technical/TechnicalRouteVersionPage'
import { mockTechnicalService, resetTechnicalMock } from '../../mocks/technical-mock'
import { OCCUPANCY_MAPS } from '../administration/pois/map/catalog'
import { useAuthStore } from '../../stores/auth-store'
import { technicalActivePath } from './technical-nav'

function renderAt(path: string, pattern: string, page: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={page} /></Routes></MemoryRouter>
    </QueryClientProvider>,
  )
}

const signIn = (role: string) => useAuthStore.getState().setAuth('t', { userId: role, username: role.toLowerCase(), role })

describe('Technical Staff area', () => {
  beforeEach(() => { resetTechnicalMock(); signIn('TechnicalStaff') })
  afterEach(() => useAuthStore.getState().logout())

  it('confirms a route version only after the operator, every leg and a pass are recorded', async () => {
    renderAt('/technical/confirmations/rv-3', '/technical/confirmations/:id', <TechnicalRouteVersionPage />)
    const form = (await screen.findByRole('region', { name: 'Test cùng người vận hành' }))
    const submit = within(form).getByRole('button', { name: 'Xác nhận kỹ thuật' })
    expect(submit).toBeDisabled()
    fireEvent.change(within(form).getByLabelText('Người vận hành'), { target: { value: 'Nguyễn Văn An' } })
    fireEvent.click(within(form).getByRole('checkbox', { name: /Chặng 1/ }))
    fireEvent.click(within(form).getByRole('radio', { name: 'Đạt' }))
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    expect(await screen.findByRole('region', { name: 'Xác nhận kỹ thuật' })).toHaveTextContent('Nguyễn Văn An')
  })

  it('keeps a version with an unverified POI from being confirmed and says which POI', async () => {
    renderAt('/technical/confirmations/rv-2', '/technical/confirmations/:id', <TechnicalRouteVersionPage />)
    const form = await screen.findByRole('region', { name: 'Test cùng người vận hành' })
    expect(within(form).getByText('POI chưa xác minh: Phòng Robotics')).toBeInTheDocument()
    expect(within(form).getByRole('button', { name: 'Xác nhận kỹ thuật' })).toBeDisabled()
    expect(() => mockTechnicalService.confirm('rv-2', 'thử', 'Nguyễn Văn An')).toThrow(expect.objectContaining({ status: 409 }))
  })

  it('refuses a confirmation from a Staff account (demo acceptance 6)', () => {
    signIn('Staff')
    expect(() => mockTechnicalService.confirm('rv-3', 'Staff thử xác nhận')).toThrow(expect.objectContaining({ status: 403, body: expect.stringContaining('Chỉ nhân viên kỹ thuật') }))
  })

  it('keeps the older confirmed version usable when a newer one needs reconfirmation', async () => {
    const list = await mockTechnicalService.confirmations()
    expect(list.find((item) => item.id === 'rv-2')?.state).toBe('NEEDS_RECONFIRM')
    expect(list.find((item) => item.id === 'rv-1')?.state).toBe('CONFIRMED')
  })

  it('records a POI as passed only with the robot on the spot, a camera angle and a correct frame', async () => {
    expect(() => mockTechnicalService.verifyPoi({ id: 'tp-4', passed: true, arrived: true, framingOk: true, cameraAngle: null, errorCm: 3, note: '' })).toThrow(expect.objectContaining({ status: 409 }))
    await mockTechnicalService.verifyPoi({ id: 'tp-4', passed: true, arrived: true, framingOk: true, cameraAngle: 'FRONT', errorCm: 3, note: '' })
    expect((await mockTechnicalService.pois()).find((poi) => poi.id === 'tp-4')?.state).toBe('VERIFIED')
  })

  it('clears localization when a map is deployed again', async () => {
    const mapKey = OCCUPANCY_MAPS[0].mapKey
    expect(() => mockTechnicalService.recordDeployment({ mapKey, robot: 'AMR-01', checksumMatched: false })).toThrow(expect.objectContaining({ status: 409 }))
    await mockTechnicalService.recordDeployment({ mapKey, robot: 'AMR-01', checksumMatched: true })
    expect((await mockTechnicalService.maps()).find((map) => map.mapKey === mapKey)?.localization).toBeNull()
  })

  it('shows what blocks scheduling on the overview', async () => {
    renderAt('/technical', '/technical', <TechnicalOverviewPage />)
    expect(await screen.findByRole('heading', { name: 'Tổng quan kỹ thuật', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('Đang chặn buổi 30/10 · 09:00')).toBeInTheDocument()
  })

  it('marks only the overview for /technical and the owning page for detail paths', () => {
    expect(technicalActivePath('/technical')).toBe('/technical')
    expect(technicalActivePath('/technical/maps/map2-v2')).toBe('/technical/maps')
    expect(technicalActivePath('/technical/confirmations/rv-2')).toBe('/technical/confirmations')
  })

  it('checks a POI YAML file against the selected map version without saving', async () => {
    const map = OCCUPANCY_MAPS[0]
    renderAt('/technical/poi-import', '/technical/poi-import', <TechnicalPoiImportPage />)
    const yaml = `map_yaml: ${map.sourceYaml}\nmap_key: ${map.mapKey}\nframe_id: ${map.frameId}\npose:\n  x: ${map.origin[0] + 1}\n  y: ${map.origin[1] + 1}\n  yaw: 0\n`
    fireEvent.change(screen.getByLabelText(/File POI/), { target: { files: [new File([yaml], 'poi.yaml')] } })
    expect(await screen.findByText(`poi.yaml: hợp lệ với ${map.mapKey}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu POI' })).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu POI' })).toBeDisabled())
  })
})

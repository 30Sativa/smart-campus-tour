import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import TechnicalConfirmationsPage from '../../routes/technical/TechnicalConfirmationsPage'
import TechnicalPoiImportPage from '../../routes/technical/TechnicalPoiImportPage'
import { mockTechnicalService, resetTechnicalMock } from '../../mocks/technical-mock'
import { OCCUPANCY_MAPS } from '../administration/pois/map/catalog'
import { useAuthStore } from '../../stores/auth-store'

function renderPage(page: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{page}</QueryClientProvider>)
}

const signIn = (role: string) => useAuthStore.getState().setAuth('t', { userId: role, username: role.toLowerCase(), role })

describe('Technical Staff area', () => {
  beforeEach(() => { resetTechnicalMock(); signIn('TechnicalStaff') })
  afterEach(() => useAuthStore.getState().logout())

  it('confirms a version that needs reconfirmation only with a note of what was checked', async () => {
    renderPage(<TechnicalConfirmationsPage />)
    const row = (await screen.findByText('Version mới thêm POI và đổi thứ tự dừng: ảnh hưởng di chuyển.')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Xác nhận' }))
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Xác nhận' })
    expect(confirm).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Đi 4 POI, chạy thử toàn tuyến cùng người vận hành.' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(within(row).getByText('Đã xác nhận')).toBeInTheDocument())
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

  it('checks a POI YAML file against the selected map version without saving', async () => {
    const map = OCCUPANCY_MAPS[0]
    renderPage(<TechnicalPoiImportPage />)
    const yaml = `map_yaml: ${map.sourceYaml}\nmap_key: ${map.mapKey}\nframe_id: ${map.frameId}\npose:\n  x: ${map.origin[0] + 1}\n  y: ${map.origin[1] + 1}\n  yaw: 0\n`
    fireEvent.change(screen.getByLabelText(/File POI/), { target: { files: [new File([yaml], 'poi.yaml')] } })
    expect(await screen.findByText(`poi.yaml: hợp lệ với ${map.mapKey}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu POI' })).toBeDisabled()
  })
})

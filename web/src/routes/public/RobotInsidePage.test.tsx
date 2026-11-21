import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RobotInsidePage from './RobotInsidePage'
import { COMPONENTS, WIRES } from '../../features/landing/robot-inside/wiring'

const renderAt = (path = '/ben-trong-robot') => render(<MemoryRouter initialEntries={[path]}><RobotInsidePage /></MemoryRouter>)
const panel = () => screen.getByRole('complementary', { name: 'Chi tiết' })

describe('RobotInsidePage', () => {
  beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
  afterEach(() => vi.restoreAllMocks())

  it('opens on the wiring drawing under its own title, every part numbered on it', () => {
    renderAt()
    expect(screen.getByRole('heading', { level: 1, name: /Điện chạy từ pin/ })).toBeInTheDocument()
    expect(document.title).toBe('Bên trong robot · CampusTour')
    const drawing = screen.getByRole('group', { name: /Sơ đồ đi dây bên trong robot/ })
    for (const item of COMPONENTS) expect(within(drawing).getByRole('button', { name: `${item.number}. ${item.label}` })).toBeInTheDocument()
    expect(within(panel()).getByRole('heading', { name: 'Chọn một bộ phận' })).toBeInTheDocument()
    expect(within(panel()).getByText(`${COMPONENTS.length} bộ phận · ${WIRES.length} đường dây`)).toBeInTheDocument()
  })

  it('keeps the step-by-step functions and the table of cables below the drawing', () => {
    renderAt()
    expect(screen.getByRole('heading', { level: 2, name: /Dữ liệu chạy từ máy tính/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Di chuyển/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('row').length).toBeGreaterThan(WIRES.length)
  })

  it('opens on the part named in the address, as section 04 links it', () => {
    renderAt('/ben-trong-robot?linh-kien=driver')
    expect(within(panel()).getByRole('heading', { level: 3, name: 'Driver HBS57H ×2' })).toBeInTheDocument()
    expect(within(panel()).getByText(/ALM → PC10 \/ PC11/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7. Driver HBS57H ×2' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('ignores an unknown part in the address', () => {
    renderAt('/ben-trong-robot?linh-kien=khong-co')
    expect(within(panel()).getByRole('heading', { name: 'Chọn một bộ phận' })).toBeInTheDocument()
  })

  it('goes from a part to one of its cables and back, then lets go', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: '5. Mini PC' }))
    expect(within(panel()).getByRole('heading', { level: 3, name: 'Mini PC' })).toBeInTheDocument()
    fireEvent.click(within(panel()).getByRole('button', { name: /USB CDC tới Mạch điều khiển STM32/ }))
    expect(within(panel()).getByRole('heading', { level: 3, name: 'USB CDC' })).toBeInTheDocument()
    expect(within(panel()).getByText('PA11 USB_DM · PA12 USB_DP')).toBeInTheDocument()
    fireEvent.click(within(panel()).getByRole('button', { name: '6. Mạch điều khiển STM32' }))
    expect(within(panel()).getByRole('heading', { level: 3, name: 'Mạch điều khiển STM32' })).toBeInTheDocument()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Bỏ chọn' }))
    expect(within(panel()).getByRole('heading', { name: 'Chọn một bộ phận' })).toBeInTheDocument()
  })

  it('switches a kind of cable off and on', () => {
    renderAt()
    const power = WIRES.filter(item => item.kind === 'power').length
    const chip = screen.getByRole('button', { name: 'Điện động lực 48 V' })
    expect(document.querySelectorAll('.lp3-ri__wire[data-kind="power"]')).toHaveLength(power)
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelectorAll('.lp3-ri__wire[data-kind="power"]')).toHaveLength(0)
    fireEvent.click(chip)
    expect(document.querySelectorAll('.lp3-ri__wire[data-kind="power"]')).toHaveLength(power)
  })

  it('opens a cable from the table on the drawing', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: /TRIG \/ ECHO ×4/ }))
    expect(within(panel()).getByRole('heading', { level: 3, name: 'TRIG / ECHO ×4' })).toBeInTheDocument()
    expect(within(panel()).getByText(/4 sợi giống nhau/)).toBeInTheDocument()
  })

  it('sends the section links of the navigation back to the home page', () => {
    renderAt()
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' })
    expect(within(nav).getByRole('link', { name: 'Công nghệ' })).toHaveAttribute('href', '/#cong-nghe')
    const drives = screen.getAllByRole('link', { name: 'Lái thử robot' })
    expect(drives.length).toBeGreaterThan(0)
    for (const link of drives) expect(link).toHaveAttribute('href', '/lai-thu-robot')
  })
})

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RobotDrivePage from './RobotDrivePage'
import { DriveLoader } from '../../features/landing/robot-explode/DriveLoader'
import { TOUCH_ONLY_QUERY } from '../../features/landing/robot-explode/touch'

describe('RobotDrivePage', () => {
  it('fills the screen without the site navigation, keeping its title and a way back home', () => {
    render(<MemoryRouter initialEntries={['/lai-thu-robot']}><RobotDrivePage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lái robot quanh khuôn viên.')
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/#cong-nghe')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(document.title).toBe('Lái thử robot · CampusTour')
  })

  it('says why when the browser cannot draw the map (jsdom has no WebGL)', () => {
    render(<MemoryRouter><RobotDrivePage /></MemoryRouter>)
    expect(screen.getByRole('status')).toHaveTextContent('Trình duyệt này không hiển thị được bản đồ 3D.')
  })
})

describe('DriveLoader', () => {
  it('shows how much has arrived, or a moving bar before the share is known', () => {
    const { rerender } = render(<DriveLoader label="Đang tải Khuôn viên FPT" progress={42.4} />)
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải Khuôn viên FPT · 42%')
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    rerender(<DriveLoader label="Đang tải trình lái" />)
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải trình lái…')
    rerender(<DriveLoader label="Đang tải trình lái" progress={100} leaving />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false')
  })
})

describe('DriveLoader on a touch screen', () => {
  afterEach(() => vi.restoreAllMocks())

  it('starts with the button tip instead of the keyboard tip', () => {
    const matchMedia = window.matchMedia
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ ...matchMedia(query), matches: query === TOUCH_ONLY_QUERY }))
    render(<DriveLoader />)
    expect(screen.getByRole('status')).toHaveTextContent('chạm các nút W A S D để lái')
    expect(screen.getByRole('status')).not.toHaveTextContent('phím mũi tên')
  })
})

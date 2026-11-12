import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import RobotDrivePage from './RobotDrivePage'

describe('RobotDrivePage', () => {
  it('opens the test drive under its own title, with a way back to the home page', () => {
    render(<MemoryRouter initialEntries={['/lai-thu-robot']}><RobotDrivePage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lái robot quanh khuôn viên.')
    expect(screen.getByRole('link', { name: /Về trang chủ/ })).toHaveAttribute('href', '/#cong-nghe')
    expect(screen.getByRole('status')).toHaveTextContent(/bản đồ 3D|Đang tải bản đồ/)
    expect(document.title).toBe('Lái thử robot · CampusTour')
  })
})

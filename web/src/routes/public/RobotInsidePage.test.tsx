import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RobotInsidePage from './RobotInsidePage'
import PublicHomePage from './PublicHomePage'

describe('RobotInsidePage', () => {
  // jsdom has no SVG path geometry; the home page's motion layer is skipped under reduced motion.
  beforeEach(() => {
    const matchMedia = window.matchMedia
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...matchMedia(query), matches: query === '(prefers-reduced-motion: reduce)' }))
  })
  afterEach(() => vi.restoreAllMocks())

  it('opens on the step-by-step signal flows under its own title', () => {
    render(<MemoryRouter initialEntries={['/ben-trong-robot']}><RobotInsidePage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: /Dữ liệu chạy từ máy tính/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Di chuyển/ })).toHaveAttribute('aria-selected', 'true')
    expect(document.title).toBe('Bên trong robot · CampusTour')
  })

  it('marks itself in the navigation and sends the section links back to the home page', () => {
    render(<MemoryRouter initialEntries={['/ben-trong-robot']}><RobotInsidePage /></MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' })
    expect(within(nav).getByRole('link', { name: 'Bên trong robot' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Công nghệ' })).toHaveAttribute('href', '/#cong-nghe')
  })

  it('is listed in the home navigation after Công nghệ and linked from section 04', () => {
    render(<MemoryRouter><PublicHomePage /></MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' })
    const labels = within(nav).getAllByRole('link').map(link => link.textContent)
    expect(labels.indexOf('Bên trong robot')).toBe(labels.indexOf('Công nghệ') + 1)
    expect(within(nav).getByRole('link', { name: 'Bên trong robot' })).toHaveAttribute('href', '/ben-trong-robot')
    expect(within(nav).getByRole('link', { name: 'Công nghệ' })).toHaveAttribute('href', '#cong-nghe')
    expect(screen.getByRole('link', { name: /Xem dữ liệu chạy bên trong robot/ })).toHaveAttribute('href', '/ben-trong-robot')
    expect(document.getElementById('ben-trong-robot')).toBeNull()
  })
})

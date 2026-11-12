import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { TechDrive } from './TechDrive'
import { ROBOT_DRIVE } from '../landing-content'
import { STORY_CHAPTERS } from '../robot-explode/story'

describe('TechDrive (section 04)', () => {
  it('opens on the first chapter of the scroll story, with the section title for screen readers and the link', () => {
    render(<MemoryRouter><TechDrive /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Công nghệ đứng sau mỗi điểm dừng.')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(`${STORY_CHAPTERS[0].title} ${STORY_CHAPTERS[0].after}`)
    expect(screen.getByText(STORY_CHAPTERS[0].kicker)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải mô hình robot…')
    expect(screen.getByRole('link', { name: /Xem dữ liệu chạy bên trong robot/ })).toHaveAttribute('href', '/ben-trong-robot')
    expect(document.getElementById('cong-nghe')).toHaveAttribute('data-story', 'on')
  })

  it('offers the test drive on its own page once the story has played (reduced motion: straight away)', () => {
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia
    try {
      render(<MemoryRouter><TechDrive /></MemoryRouter>)
      expect(screen.getByRole('link', { name: /Lái thử robot/ })).toHaveAttribute('href', ROBOT_DRIVE.to)
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Công nghệ đứng sau mỗi điểm dừng.')
      expect(document.getElementById('cong-nghe')).toHaveAttribute('data-story', 'off')
    } finally {
      window.matchMedia = matchMedia
    }
  })

  it('no longer lists the four technologies beside the map', () => {
    render(<MemoryRouter><TechDrive /></MemoryRouter>)
    expect(screen.queryByText('Pin & nguồn điện')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})

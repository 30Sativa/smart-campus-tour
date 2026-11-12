import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { TechDrive } from './TechDrive'
import { ROBOT_DRIVE } from '../landing-content'
import { INTRO_CHAPTER_SECONDS, STORY_CHAPTERS } from '../robot-explode/story'

const renderSection = () => render(<MemoryRouter><TechDrive /></MemoryRouter>)
const video = () => document.querySelector('video') as HTMLVideoElement

/** Moves the intro video to `seconds` as if it had played that far. */
function playTo(seconds: number) {
  Object.defineProperty(video(), 'currentTime', { value: seconds, configurable: true, writable: true })
  fireEvent.timeUpdate(video())
}

function withReducedMotion(run: () => void) {
  const matchMedia = window.matchMedia
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia
  try { run() } finally { window.matchMedia = matchMedia }
}

describe('TechDrive (section 04)', () => {
  it('opens on the intro video, its first chapter laid over it, with the links and a way to skip', () => {
    renderSection()
    expect(video()).toHaveAttribute('poster', expect.stringContaining('videos/robot-intro'))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Công nghệ đứng sau mỗi điểm dừng.')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(`${STORY_CHAPTERS[0].title} ${STORY_CHAPTERS[0].after}`)
    expect(screen.getByRole('link', { name: /Xem dữ liệu chạy bên trong robot/ })).toHaveAttribute('href', '/ben-trong-robot')
    expect(screen.getByRole('link', { name: /Lái thử robot/ })).toHaveAttribute('href', ROBOT_DRIVE.to)
    expect(screen.getByRole('button', { name: /Bỏ qua/ })).toBeInTheDocument()
    expect(document.getElementById('cong-nghe')).toHaveAttribute('data-phase', 'intro')
    // The 3D stage underneath is out of reach while the video covers it.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('follows the video through its chapters, and jumps to one from the list', () => {
    renderSection()
    playTo(INTRO_CHAPTER_SECONDS + 0.2)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(`${STORY_CHAPTERS[1].title} ${STORY_CHAPTERS[1].after}`)
    fireEvent.click(screen.getByRole('button', { name: STORY_CHAPTERS[3].kicker }))
    expect(video().currentTime).toBe(INTRO_CHAPTER_SECONDS * 3)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(STORY_CHAPTERS[3].title)
    expect(screen.getByRole('button', { name: STORY_CHAPTERS[3].kicker })).toHaveAttribute('aria-current', 'step')
  })

  it('turns to the robot\'s parts when the video ends, the video one click away', () => {
    renderSection()
    act(() => { fireEvent.ended(video()) })
    expect(document.getElementById('cong-nghe')).toHaveAttribute('data-phase', 'parts')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Công nghệ đứng sau mỗi điểm dừng.')
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải mô hình robot…')
    expect(screen.getByRole('link', { name: /Lái thử robot/ })).toHaveAttribute('href', ROBOT_DRIVE.to)
    fireEvent.click(screen.getByRole('button', { name: 'Xem lại video' }))
    expect(document.getElementById('cong-nghe')).toHaveAttribute('data-phase', 'intro')
  })

  it('skips the video on request', () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: /Bỏ qua/ }))
    expect(document.getElementById('cong-nghe')).toHaveAttribute('data-phase', 'parts')
    expect(screen.getByRole('button', { name: 'Xem lại video' })).toBeInTheDocument()
  })

  it('shows the parts straight away to visitors who ask for reduced motion, the video only on request', () => {
    withReducedMotion(() => {
      renderSection()
      expect(document.getElementById('cong-nghe')).toHaveAttribute('data-phase', 'parts')
      expect(video()).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Xem video giới thiệu' }))
      expect(video()).not.toBeNull()
    })
  })

  it('no longer lists the four technologies beside the map', () => {
    renderSection()
    expect(screen.queryByText('Pin & nguồn điện')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})

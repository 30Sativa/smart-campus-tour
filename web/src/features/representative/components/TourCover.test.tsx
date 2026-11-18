import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TourCoverFigure, TourCoverImg } from './TourCover'

const TOUR_ID = 'e7f145d4-3e04-4540-985a-29d8222d75af'
const SAMPLE = { src: '/images/tours/library.webp', alt: 'Thư viện của trường' }

afterEach(() => { vi.unstubAllEnvs() })

describe('Tour cover on Representative pages', () => {
  it('shows the uploaded cover, and the sample picture with its caption once the upload is missing', () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'demo-cloud')
    render(<TourCoverFigure className="rep-tour-cover" tourId={TOUR_ID} tourName="Tour thư viện" image={SAMPLE} />)
    const uploaded = screen.getByRole('img', { name: 'Ảnh Tour Tour thư viện' })
    expect(uploaded.getAttribute('src')).toContain('/smartcampus/tours/cover/e7f145d43e044540985a29d8222d75af')
    expect(screen.queryByText('Ảnh minh họa')).toBeNull()

    fireEvent.error(uploaded)
    expect(screen.getByRole('img', { name: SAMPLE.alt })).toHaveAttribute('src', SAMPLE.src)
    expect(screen.getByText('Ảnh minh họa')).toBeInTheDocument()
  })

  it('keeps the sample picture when the build has no Cloudinary', () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', '')
    const { container } = render(<TourCoverImg tourId={TOUR_ID} image={SAMPLE} decorative />)
    expect(container.querySelector('img')).toHaveAttribute('src', SAMPLE.src)
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })
})

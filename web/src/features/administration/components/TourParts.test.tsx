import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RegistrationBar, TourJourney } from './TourParts'

describe('RegistrationBar', () => {
  it('shows waiting groups prominently and describes every registration state', () => {
    render(<RegistrationBar counts={{ total: 7, approved: 3, submitted: 2, rejected: 1, cancelled: 1 }} />)

    expect(screen.getByText('2 đoàn chờ duyệt')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '7 đăng ký: 3 đã duyệt · 2 chờ duyệt · 1 từ chối · 1 đã hủy' })).toBeInTheDocument()
    // A distribution of decisions must not imply a timed approval process.
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('removes the waiting indicator when the last group is approved', () => {
    const { rerender } = render(<RegistrationBar counts={{ total: 3, approved: 2, submitted: 1, rejected: 0, cancelled: 0 }} />)
    expect(screen.getByText('1 đoàn chờ duyệt')).toBeInTheDocument()

    rerender(<RegistrationBar counts={{ total: 3, approved: 3, submitted: 0, rejected: 0, cancelled: 0 }} />)
    expect(screen.queryByText(/đoàn chờ duyệt/)).toBeNull()
    expect(screen.getByRole('img', { name: '3 đăng ký: 3 đã duyệt' })).toBeInTheDocument()
  })

  it('explains an empty tour without showing a misleading bar', () => {
    render(<RegistrationBar counts={{ total: 0, approved: 0, submitted: 0, rejected: 0, cancelled: 0 }} />)

    expect(screen.getByText('Chưa có đoàn đăng ký')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByText(/đoàn chờ duyệt/)).toBeNull()
  })
})

describe('TourJourney', () => {
  const base = { readyBlockers: [] as string[], counts: { total: 0, approved: 0, submitted: 0, rejected: 0, cancelled: 0 } }

  it('marks the current step and says what holds it', () => {
    render(<TourJourney tour={{ ...base, state: 'Scheduled', counts: { total: 3, approved: 2, submitted: 1, rejected: 0, cancelled: 0 } }} />)
    const steps = within(screen.getByRole('list', { name: 'Tiến trình chuẩn bị Tour' })).getAllByRole('listitem')
    expect(steps).toHaveLength(4)
    expect(steps[1]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Duyệt nốt 1 đoàn để chốt')).toBeInTheDocument()
  })

  it('moves to finalizing once nothing waits, and to running after READY', () => {
    const { rerender } = render(<TourJourney tour={{ ...base, state: 'Scheduled', readyBlockers: [], counts: { total: 2, approved: 2, submitted: 0, rejected: 0, cancelled: 0 } }} />)
    expect(screen.getAllByRole('listitem')[2]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Đủ điều kiện chốt')).toBeInTheDocument()
    rerender(<TourJourney tour={{ ...base, state: 'Ready', counts: { total: 2, approved: 2, submitted: 0, rejected: 0, cancelled: 0 } }} />)
    expect(screen.getAllByRole('listitem')[3]).toHaveAttribute('aria-current', 'step')
  })
})

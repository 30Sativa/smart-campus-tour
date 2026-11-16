import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RouteScheduledToursList } from './RouteScheduledTours'

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

describe('Tours scheduled on a route (route edit page)', () => {
  it('labels a quick Tour created just now as open for registration', () => {
    const deadline = inMinutes(30)
    render(<MemoryRouter><RouteScheduledToursList tours={[
      { id: 'quick-1', name: 'Tour nhanh', scheduledStartAt: deadline, state: 'SCHEDULED', registrationClosesAt: deadline, isShortNotice: true },
      // An older server sends neither field: the quick flag alone must not fall back to start − 48 h.
      { id: 'quick-2', name: 'Tour nhanh cũ', scheduledStartAt: deadline, state: 'SCHEDULED', isShortNotice: true },
    ]} /></MemoryRouter>)
    expect(screen.getAllByText(/Đang nhận đăng ký/)).toHaveLength(2)
    expect(screen.queryByText(/Đã đóng đăng ký/)).not.toBeInTheDocument()
  })

  it('still closes a Tour on a shift 48 hours before its start', () => {
    render(<MemoryRouter><RouteScheduledToursList tours={[
      { id: 'shift-1', name: 'Tour theo ca', scheduledStartAt: inMinutes(60 * 24), state: 'SCHEDULED' },
    ]} /></MemoryRouter>)
    expect(screen.getByText(/Đã đóng đăng ký/)).toBeInTheDocument()
  })
})

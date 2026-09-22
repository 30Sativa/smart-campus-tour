import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RegistrationBar } from './TourParts'

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

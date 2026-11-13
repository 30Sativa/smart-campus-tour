import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import StudentTourPage from './StudentTourPage'

describe('Student Tour address', () => {
  it.each(['/tour', '/tour/tour-101'])('%s asks for the invitation link and shows no sample Tour', (path) => {
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/tour/:tourId?" element={<StudentTourPage />} /></Routes></MemoryRouter>)
    // Copy changed on purpose (UX review 13/11/2026): say what to open and whom to ask, then offer the home page.
    expect(screen.getByRole('heading', { name: 'Mở link trong email lời mời để vào buổi tham quan' })).toBeInTheDocument()
    expect(screen.getByText('Không thấy email? Hỏi thầy cô hoặc đại diện trường để gửi lại.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

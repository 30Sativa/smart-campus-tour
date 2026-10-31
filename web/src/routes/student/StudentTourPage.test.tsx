import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import StudentTourPage from './StudentTourPage'

describe('Student Tour address', () => {
  it.each(['/tour', '/tour/tour-101'])('%s asks for the invitation link and shows no sample Tour', (path) => {
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/tour/:tourId?" element={<StudentTourPage />} /></Routes></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Không tìm thấy buổi tham quan' })).toBeInTheDocument()
    expect(screen.getByText(/đường link trong email lời mời/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

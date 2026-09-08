import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import PublicHomePage from './PublicHomePage'

describe('PublicHomePage', () => {
  it('renders the app title and a link to the dashboard', () => {
    render(
      <MemoryRouter>
        <PublicHomePage />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: /campustour dt-amr/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /operations dashboard/i }),
    ).toHaveAttribute('href', '/admin')
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TourSeatsAndOperatorPanel } from './TourSeatsAndOperatorPanel'
import type { TourDetails } from './types'

const READY_NOTE = 'Sức chứa chỉ có tác dụng khi mở lại Tour để nhận đăng ký.'

function detail(state: TourDetails['tour']['state']): TourDetails {
  return {
    tour: { id: 'tour-1', name: 'Tour sáng', state, capacity: 20, heldSeats: 12, rowVersion: 'AAAAAAAAB9E=' },
    operator: { userId: 'staff-1', fullName: 'Lan Staff', username: 'lan' },
    permissions: { canChangeCapacity: true, canChangeOperator: false, maxCapacity: 20 },
  } as unknown as TourDetails
}

function mount(state: TourDetails['tour']['state']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><TourSeatsAndOperatorPanel detail={detail(state)} /></QueryClientProvider>)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 })))
})
afterEach(() => vi.unstubAllGlobals())

it('says on a READY Tour that a new capacity only matters once the Tour is reopened, and keeps the field', () => {
  mount('READY')
  expect(screen.getByText(READY_NOTE)).toBeInTheDocument()
  expect(screen.getByRole('spinbutton')).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Lưu sức chứa' })).toBeInTheDocument()
})

it('adds no note while the Tour still takes registrations', () => {
  mount('SCHEDULED')
  expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  expect(screen.queryByText(READY_NOTE)).toBeNull()
})

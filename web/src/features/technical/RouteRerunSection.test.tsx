import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VersionedRoute } from '../administration/routes/versioned-api'
import type { RepresentativeRegistration } from '../representative/api/types'
import { RegistrationRows } from '../representative/components/RegistrationRows'
import { technicalApi } from './api/technical'
import { RouteRerunSection } from './RouteRerunSection'

const route = { routeId: 'r1', revisionId: 'rev1', name: 'testuyen1', revisionNumber: 2, mapKey: 'pilot', stops: [{}, {}] } as unknown as VersionedRoute
const renderSection = (onRecord = vi.fn()) => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouteRerunSection onRecord={onRecord} /></QueryClientProvider>)
  return onRecord
}

afterEach(() => vi.restoreAllMocks())

describe('RouteRerunSection', () => {
  it('lists a route that passed the old way and records a new run from its row', async () => {
    vi.spyOn(technicalApi, 'listRouteRerunQueue').mockResolvedValue([route])
    const onRecord = renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi lần chạy mới testuyen1' }))
    expect(onRecord).toHaveBeenCalledWith(route)
    expect(screen.getByText('Cần chạy lại')).toBeInTheDocument()
  })

  it('shows nothing when no route needs a new run', async () => {
    const list = vi.spyOn(technicalApi, 'listRouteRerunQueue').mockResolvedValue([])
    renderSection()
    await vi.waitFor(() => expect(list).toHaveBeenCalled())
    expect(screen.queryByText('Cần chạy lại')).not.toBeInTheDocument()
  })

  it('says so when the list cannot be read', async () => {
    vi.spyOn(technicalApi, 'listRouteRerunQueue').mockRejectedValue(new Error('offline'))
    renderSection()
    expect(await screen.findByRole('button', { name: 'Tải lại danh sách cần chạy lại' })).toBeInTheDocument()
  })
})

describe('RegistrationRows', () => {
  it('labels an expired row in plain words', () => {
    const registration = { roster: [{ id: 'row', rowNumber: 1, rowType: 'INDIVIDUAL', displayName: 'An', email: 'a@example.test', participationState: 'EXPIRED' }] } as unknown as RepresentativeRegistration
    render(<MemoryRouter><RegistrationRows registration={registration} emailLink={id => id} /></MemoryRouter>)
    expect(screen.getByText('Đã hết hạn')).toBeInTheDocument()
    expect(screen.getByText('Chưa được duyệt trước giờ tham quan 24 giờ nên đã hết hạn.')).toBeInTheDocument()
  })
})

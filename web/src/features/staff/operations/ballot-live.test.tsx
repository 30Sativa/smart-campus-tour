import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { tourKeys } from '../../administration/tours/hooks'
import type { TourDetails } from '../../administration/tours/types'
import { applyBallotSignal, useBallotLive } from './ballot-live'
import { useFleetConnection } from './fleet-telemetry'
import { VotePanel } from './VotePanel'

const ballot = (visit: string, c: number, d: number) => ({
  stopVisitId: visit, open: true, closesAt: '2099-01-01T00:00:00Z', myVote: null, locked: [], decision: null,
  candidates: [{ stopId: 'stop-c', poiId: 'poi-c', name: 'Phòng C', votes: c }, { stopId: 'stop-d', poiId: 'poi-d', name: 'Phòng D', votes: d }],
})

function detail(visit = 'visit-1'): TourDetails {
  return {
    tour: { id: 'tour-1', name: 'Tour sáng', state: 'RUNNING', rowVersion: 'AAAAAAAAB9E=' },
    routeRevision: { viewerChoosesNextStop: true, stops: [{ id: 'stop-c', name: 'Phòng C' }, { id: 'stop-d', name: 'Phòng D' }] },
    execution: { dwellDeadlineAt: '2099-01-01T00:00:00Z' },
    ballot: ballot(visit, 1, 0), leadingStopId: 'stop-c', viewers: { accepted: 10, joined: 6 },
  } as unknown as TourDetails
}

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useBallotLive.setState({ lastVoteAt: {}, seen: {} })
})
afterEach(() => useFleetConnection.setState({ state: 'connecting' }))

const signal = (c: number, d: number, at: string, visit = 'visit-1') =>
  ({ tourId: 'tour-1', ballot: ballot(visit, c, d), leadingStopId: d > c ? 'stop-d' : 'stop-c', votesCast: c + d, viewers: { accepted: 10, joined: 7 }, at })

it('patches the Tour on screen with the pushed counts, leader and turnout', () => {
  client.setQueryData(tourKeys.detail('tour-1'), detail())
  expect(applyBallotSignal(client, signal(1, 3, '2026-11-25T05:00:01Z'))).toBe('patched')
  const tour = client.getQueryData<TourDetails>(tourKeys.detail('tour-1'))!
  expect((tour.ballot as { candidates: { votes: number }[] }).candidates.map(item => item.votes)).toEqual([1, 3])
  expect(tour.leadingStopId).toBe('stop-d')
  expect(tour.viewers).toEqual({ accepted: 10, joined: 7 })
  expect(useBallotLive.getState().lastVoteAt['tour-1']).toBeTypeOf('number')
})

it('ignores an older signal that arrives after a newer one', () => {
  client.setQueryData(tourKeys.detail('tour-1'), detail())
  applyBallotSignal(client, signal(2, 2, '2026-11-25T05:00:05Z'))
  expect(applyBallotSignal(client, signal(1, 0, '2026-11-25T05:00:01Z'))).toBe('ignored')
  expect(((client.getQueryData<TourDetails>(tourKeys.detail('tour-1'))!.ballot) as { candidates: { votes: number }[] }).candidates[0].votes).toBe(2)
})

it('reads the Tour again when the push is for another stop visit, and ignores Tours not on screen or malformed payloads', () => {
  client.setQueryData(tourKeys.detail('tour-1'), detail('visit-0'))
  expect(applyBallotSignal(client, signal(1, 0, '2026-11-25T05:00:01Z'))).toBe('refetch')
  expect(applyBallotSignal(client, { ...signal(1, 0, '2026-11-25T05:00:02Z'), tourId: 'tour-2' })).toBe('ignored')
  expect(applyBallotSignal(client, { tourId: 'tour-1', ballot: null })).toBe('ignored')
  expect(applyBallotSignal(client, 'nope')).toBe('ignored')
})

it('shows the turnout, each share and whether votes arrive live', () => {
  useFleetConnection.setState({ state: 'connected' })
  useBallotLive.setState({ lastVoteAt: { 'tour-1': Date.parse('2026-11-25T05:00:01Z') }, seen: {} })
  const tour = { ...detail(), ballot: ballot('visit-1', 3, 1) }
  render(<QueryClientProvider client={client}><MemoryRouter><VotePanel detail={tour} isOperator now={Date.now()} /></MemoryRouter></QueryClientProvider>)
  expect(screen.getByText('Trực tiếp')).toBeInTheDocument()
  expect(screen.getByLabelText('Lượt bầu')).toHaveTextContent(/4 phiếu · 6\/10 người xem đang vào · phiếu mới lúc/)
  const votes = within(screen.getByRole('table', { name: 'Số phiếu' }))
  expect(votes.getByRole('row', { name: /Phòng C/ })).toHaveTextContent(/Phòng C\s*Đang dẫn đầu\s*3 phiếu\s*75%/)
  expect(votes.getByRole('row', { name: /Phòng D/ })).toHaveTextContent(/1 phiếu\s*25%/)
})

it('says it falls back to polling while the hub is down', () => {
  useFleetConnection.setState({ state: 'reconnecting' })
  render(<QueryClientProvider client={client}><MemoryRouter><VotePanel detail={detail()} isOperator={false} now={Date.now()} /></MemoryRouter></QueryClientProvider>)
  expect(screen.getByText('Cập nhật mỗi 3 giây')).toBeInTheDocument()
})

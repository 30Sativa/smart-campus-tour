import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TourBallot } from '../../tour-vote/vote'
import { StudentBallotBox } from './StudentBallotBox'
import { Student2DMap } from './Student2DMap'
import type { PoiDetail } from '../student-types'
import { buildLiveSnapshot } from '../invitation/student-tour-view'

const start = Date.parse('2026-11-21T03:00:00Z')
const ballot: TourBallot = {
  stopVisitId: 'visit-1', open: true, closesAt: new Date(start + 3_000).toISOString(), myVote: null, locked: [], decision: null,
  candidates: [{ stopId: 'sb', poiId: 'pb', name: 'Phòng B', votes: 0 }, { stopId: 'sc', poiId: 'pc', name: 'Phòng C', votes: 1 }],
}
const mount = (value: TourBallot, shared = false) => render(<QueryClientProvider client={new QueryClient()}>
  <div className="st"><StudentBallotBox tourId="t1" ballot={value} locked={[]} shared={shared} /></div>
</QueryClientProvider>)

describe('StudentBallotBox countdown (ADR-0065)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(start) })
  afterEach(() => vi.useRealTimers())

  it('counts down to closesAt and stops taking votes at zero', () => {
    mount(ballot)
    expect(screen.getByRole('timer')).toHaveTextContent('Còn 0:03 để bầu')
    expect(screen.getByRole('button', { name: /Phòng B/ })).toBeEnabled()
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(screen.getByRole('timer')).toHaveTextContent('Còn 0:01 để bầu')
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(screen.getByRole('timer')).toHaveTextContent('Đã hết giờ bầu, đang chốt kết quả')
    expect(screen.getByRole('button', { name: /Phòng B/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Phòng C/ })).toBeDisabled()
  })

  it('tells a shared screen that the room has one vote', () => {
    mount(ballot, true)
    expect(screen.getByText(/Màn hình xem chung có một phiếu cho cả phòng\./)).toBeInTheDocument()
  })
})

describe('Student2DMap on a voting Tour (ADR-0065)', () => {
  const poi = (id: string, order: number, x: number, progress?: PoiDetail['progress']): PoiDetail =>
    ({ id, title: id, order, x, y: 50, description: '', progress })

  it('draws only the next leg from the current POI, not the StopOrder polyline', () => {
    const pois = [poi('A', 1, 10, 'VISITED'), poi('B', 2, 50, 'CURRENT'), poi('C', 3, 90, 'NEXT')]
    const { container } = render(<Student2DMap pois={pois} currentPoi={pois[1]} nextPoi={pois[2]} robotPose={null} />)
    expect(container.querySelector('polyline')).toBeNull()
    const leg = screen.getByTestId('next-leg')
    expect([leg.getAttribute('x1'), leg.getAttribute('x2')]).toEqual(['500', '900'])
    expect(container.querySelector('[data-progress="VISITED"]')).toHaveAttribute('opacity', '0.5')
  })

  it('moves the next-point marker to the POI the server re-chose when the leg target was locked', () => {
    const info = { tourId: 't', tourName: 'Tour', tourState: 'RUNNING', scheduledStartAt: '', invitationExpiresAt: '', rowType: 'INDIVIDUAL', hasFallbackVideo: false }
    const stop = (order: number, poiId: string, progress: string, lockReason: string | null = null) =>
      ({ order, poiId, name: poiId, description: null, narrationText: null, audioUrl: null, narrationSeconds: null, dwellSeconds: 60, progress, lockReason })
    const snapshot = buildLiveSnapshot(info, {
      stops: [stop(1, 'A', 'VISITED'), stop(2, 'B', 'NEXT'), stop(3, 'C', 'REMAINING', 'Có lớp')],
      progress: { step: 'NAVIGATING', currentPoiId: 'C', lastArrivedPoiId: 'A', needsAssistance: false, isHeld: false },
    })
    const pois = snapshot.pois.map((p, index) => ({ ...p, x: [10, 50, 90][index] }))
    const { container } = render(<Student2DMap pois={pois} currentPoi={snapshot.currentPoi} nextPoi={pois.find(p => p.id === snapshot.nextPoi?.id)}
      robotPose={{ x: 30, y: 50, heading: 0, isStale: false, lastUpdatedAt: '' }} />)
    expect(screen.getByTestId('next-leg').getAttribute('x2')).toBe('500')
    const marker = (progress: string) => container.querySelector(`[data-progress="${progress}"] circle`)
    expect(marker('NEXT')).toHaveAttribute('fill', 'var(--st-stage-ink)')
    expect(marker('REMAINING')).toHaveAttribute('fill', 'var(--st-stage)')
  })

  it('keeps the StopOrder polyline for a fixed-order Tour', () => {
    const pois = [poi('A', 1, 10), poi('B', 2, 50)]
    const { container } = render(<Student2DMap pois={pois} currentPoi={pois[0]} nextPoi={pois[1]} robotPose={null} />)
    expect(container.querySelector('polyline')).not.toBeNull()
    expect(screen.queryByTestId('next-leg')).not.toBeInTheDocument()
  })
})

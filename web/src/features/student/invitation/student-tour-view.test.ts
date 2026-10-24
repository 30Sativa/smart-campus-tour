import { describe, expect, it } from 'vitest'
import { buildLiveSnapshot, isVideoFile, type StudentTourInfo, type StudentTourProgress, type StudentTourView } from './student-tour-view'

const info: StudentTourInfo = { tourId: 't', tourName: 'Tour', tourState: 'RUNNING', scheduledStartAt: '2026-10-20T02:00:00Z',
  invitationExpiresAt: '2026-10-21T02:00:00Z', rowType: 'INDIVIDUAL', fallbackVideoUrl: null }
const stop = (order: number, poiId: string, name: string) =>
  ({ order, poiId, name, description: `${name} mô tả`, narrationText: `${name} thuyết minh`, audioUrl: null, narrationSeconds: null, dwellSeconds: 60 })
const stops = [stop(2, 'b', 'B'), stop(1, 'a', 'A'), stop(3, 'c', 'C')]
const view = (progress: Partial<StudentTourProgress> | null): StudentTourView => ({
  stops,
  progress: progress && { step: null, currentPoiId: null, lastArrivedPoiId: null, needsAssistance: false, isHeld: false, ...progress },
})

describe('buildLiveSnapshot', () => {
  it('orders stops and shows no position before the robot reports progress', () => {
    const s = buildLiveSnapshot(info, view(null))
    expect(s.pois.map(p => p.title)).toEqual(['A', 'B', 'C'])
    expect(s.step).toBe('in_progress')
    expect(s.currentPoi).toBeUndefined()
    expect(s.nextPoi).toBeUndefined()
    expect(s.narration).toBeUndefined()
  })

  it('points at the target while navigating and at the stop while observing', () => {
    const moving = buildLiveSnapshot(info, view({ step: 'NAVIGATING', currentPoiId: 'b', lastArrivedPoiId: 'a' }))
    expect(moving.step).toBe('navigating')
    expect(moving.currentPoi).toBeUndefined()
    expect(moving.nextPoi?.title).toBe('B')

    const observing = buildLiveSnapshot(info, view({ step: 'OBSERVING', currentPoiId: 'b', lastArrivedPoiId: 'b' }))
    expect(observing.step).toBe('narration')
    expect(observing.currentPoi?.title).toBe('B')
    expect(observing.nextPoi?.title).toBe('C')
    expect(observing.narration).toMatchObject({ title: 'B', text: 'B thuyết minh', isPlaying: true })

    expect(buildLiveSnapshot(info, view({ step: 'OBSERVING', currentPoiId: 'b', isHeld: true })).step).toBe('holding')
    expect(buildLiveSnapshot(info, view({ step: 'PREPARING_VIEW', currentPoiId: 'c' })).step).toBe('preparing_head')
    expect(buildLiveSnapshot(info, view({ step: 'RETURNING_TO_END' })).step).toBe('returning')
  })

  it('shows assistance over the step but keeps the position', () => {
    const s = buildLiveSnapshot(info, view({ step: 'OBSERVING', currentPoiId: 'a', needsAssistance: true }))
    expect(s.step).toBe('needs_assistance')
    expect(s.currentPoi?.title).toBe('A')
  })

  it('ignores progress outside RUNNING and maps terminal states', () => {
    expect(buildLiveSnapshot({ ...info, tourState: 'READY' }, view({ step: 'NAVIGATING', currentPoiId: 'a' })).step).toBe('scheduled_waiting')
    expect(buildLiveSnapshot({ ...info, tourState: 'CANCELLED' }, view(null)).tourState).toBe('Cancelled')
    expect(buildLiveSnapshot({ ...info, tourState: 'COMPLETED' }, view(null)).step).toBe('ended_completed')
  })

  it('tolerates a missing or malformed view', () => {
    expect(buildLiveSnapshot(info, null).pois).toEqual([])
    expect(buildLiveSnapshot(info, {} as StudentTourView).pois).toEqual([])
  })

  it('plays only a fallback video file inline', () => {
    expect(buildLiveSnapshot({ ...info, fallbackVideoUrl: 'https://cdn.example.edu/tour.mp4' }, null).videoStreamUrl).toBe('https://cdn.example.edu/tour.mp4')
    expect(buildLiveSnapshot({ ...info, fallbackVideoUrl: 'https://youtube.com/watch?v=x' }, null).videoStreamUrl).toBe('')
    expect(isVideoFile('/videos/a.webm')).toBe(true)
    expect(isVideoFile('//evil.example/a.mp4')).toBe(false)
    expect(isVideoFile('http://cdn.example.edu/a.mp4')).toBe(false)
  })
})

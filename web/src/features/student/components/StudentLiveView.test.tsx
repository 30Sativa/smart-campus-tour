import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { StudentLiveView } from './StudentLiveView'
import { AiChatPanel } from './StudentAiAssistant'
import { useStudentStore } from '../student-store'
import { buildLiveSnapshot } from '../invitation/student-tour-view'

vi.mock('./StudentVideoPlayer', () => ({ StudentVideoPlayer: () => <div>Hình ảnh buổi tham quan</div> }))

const snapshot = buildLiveSnapshot({ tourId: 'tour', tourName: 'Buổi tham quan', tourState: 'RUNNING',
  scheduledStartAt: '2026-11-05T08:00:00Z', invitationExpiresAt: '2026-11-06T08:00:00Z', rowType: 'INDIVIDUAL', hasFallbackVideo: false }, {
  stops: [{ order: 1, poiId: 'library', name: 'Thư viện', description: 'Không gian học tập.', narrationText: null, audioUrl: null, narrationSeconds: null, dwellSeconds: 60 }],
  progress: { step: 'OBSERVING', currentPoiId: 'library', lastArrivedPoiId: 'library', needsAssistance: false, isHeld: false },
})

afterEach(() => useStudentStore.setState({ activeTab: 'stream' }))

describe('Student live workspace navigation', () => {
  it('presents the journey before the video with the current stop identified', () => {
    render(<StudentLiveView snapshot={snapshot} showMap={false} />)
    const journey = screen.getByRole('region', { name: 'Hành trình' })
    const video = screen.getByText('Hình ảnh buổi tham quan')
    expect(journey.compareDocumentPosition(video) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(journey).getByText('Đang xem').closest('p')).toHaveTextContent('Đang xemThư viện')
    const current = journey.querySelector('li[aria-current="step"]')
    expect(current).toHaveTextContent('1. Thư viện: Đang xem')
  })

  it('keeps the journey to one line of where the tour is and what comes next', () => {
    const twoStops = buildLiveSnapshot({ tourId: 'tour', tourName: 'Buổi tham quan', tourState: 'RUNNING',
      scheduledStartAt: '2026-11-05T08:00:00Z', invitationExpiresAt: '2026-11-06T08:00:00Z', rowType: 'INDIVIDUAL', hasFallbackVideo: false }, {
      stops: [
        { order: 1, poiId: 'library', name: 'Thư viện', description: null, narrationText: null, audioUrl: null, narrationSeconds: null, dwellSeconds: 120 },
        { order: 2, poiId: 'lab', name: 'Phòng thí nghiệm', description: null, narrationText: null, audioUrl: null, narrationSeconds: null, dwellSeconds: 180 },
      ],
      progress: { step: 'OBSERVING', currentPoiId: 'library', lastArrivedPoiId: 'library', needsAssistance: false, isHeld: false },
    })
    render(<StudentLiveView snapshot={twoStops} showMap={false} />)
    const journey = screen.getByRole('region', { name: 'Hành trình' })
    expect(journey).toHaveTextContent('1/2')
    expect(within(journey).getByText('Kế tiếp').closest('p')).toHaveTextContent('Kế tiếpPhòng thí nghiệm')
    // Half of the first of three legs (two stops and the way back): one sixth of the way.
    expect(within(journey).getByRole('progressbar', { name: 'Tiến độ hành trình' })).toHaveAttribute('aria-valuenow', '17')
    // Every stop is one segment of the bar plus the way back, named for screen readers only.
    expect(journey.querySelectorAll('ol > li')).toHaveLength(3)
    expect(journey.querySelector('ol > li:nth-child(2)')).toHaveTextContent('2. Phòng thí nghiệm: Sắp tới')
  })

  it('marks the guide tab while a ballot is open there and another tab is shown', () => {
    render(<StudentLiveView snapshot={snapshot} showMap={false} talk={<p>Kênh hướng dẫn viên</p>} talkVoteOpen />)
    expect(screen.getByRole('tab', { name: 'Hướng dẫn viên, đang mở bầu chọn' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Hướng dẫn viên/ }))
    expect(screen.getByRole('tab', { name: 'Hướng dẫn viên', selected: true })).toBeInTheDocument()
  })

  it('moves keyboard focus between available tabs and keeps the right panel associated', () => {
    render(<StudentLiveView snapshot={snapshot} showMap={false} />)
    const narration = screen.getByRole('tab', { name: 'Thuyết minh' })
    narration.focus()
    fireEvent.keyDown(narration, { key: 'ArrowRight' })
    const ai = screen.getByRole('tab', { name: 'Hỏi AI', selected: true })
    expect(ai).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Hỏi AI' })).toHaveAttribute('id', ai.getAttribute('aria-controls'))
    fireEvent.keyDown(ai, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Lộ trình', selected: true })).toHaveFocus()
    expect(screen.queryByRole('tab', { name: 'Bản đồ 2D' })).not.toBeInTheDocument()
  })

  it('preserves the unsent AI question while viewing the route', () => {
    render(<StudentLiveView snapshot={snapshot} showMap={false} ai={<AiChatPanel messages={[]} isTyping={false} askAi={vi.fn()} contextLabel="Thông tin chung" suggestions={[]} />} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Hỏi AI' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Câu hỏi cho Trợ lý AI' }), { target: { value: 'Thư viện mở cửa lúc nào?' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Lộ trình' }))
    expect(screen.getByRole('tabpanel', { name: 'Lộ trình' })).toHaveTextContent('Thư viện')
    fireEvent.click(screen.getByRole('tab', { name: 'Hỏi AI' }))
    expect(screen.getByRole('textbox', { name: 'Câu hỏi cho Trợ lý AI' })).toHaveValue('Thư viện mở cửa lúc nào?')
  })
})

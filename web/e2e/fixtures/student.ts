import type { StudentTourInfo, StudentTourView } from '../../src/features/student/invitation/student-tour-view'
import type { StudentAiAnswer } from '../../src/features/student/ai/student-ai-api'
import { at, NOW, ok, type Handler } from '../support/mock-api'

export const STUDENT_TOUR_ID = '6f1c2a90-4b7e-4c11-9a52-0d3e5f6a7b81'

export const runningTour: StudentTourInfo = {
  tourId: STUDENT_TOUR_ID,
  tourName: 'Tham quan Thư viện và Khu thực hành',
  tourState: 'RUNNING',
  scheduledStartAt: at(-20),
  invitationExpiresAt: at(240),
  rowType: 'INDIVIDUAL',
  // A short local clip stands in for the relay: the e2e run has no WebRTC source.
  fallbackVideoUrl: '/videos/robot-intro-720.mp4',
}

export const runningView: StudentTourView = {
  stops: [
    { order: 1, poiId: 'poi-sanh', name: 'Sảnh chính', description: 'Nơi đón khách và quầy thông tin.', narrationText: 'Chào mừng các bạn tới sảnh chính của campus.', audioUrl: null, narrationSeconds: 40, dwellSeconds: 60 },
    { order: 2, poiId: 'poi-thu-vien', name: 'Thư viện', description: 'Không gian đọc sách bốn tầng.', narrationText: 'Thư viện mở cửa từ 7 giờ sáng tới 9 giờ tối, có khu tự học yên tĩnh.', audioUrl: null, narrationSeconds: 50, dwellSeconds: 90 },
    { order: 3, poiId: 'poi-lab', name: 'Khu thực hành', description: 'Phòng lab robot và điện tử.', narrationText: 'Đây là nơi sinh viên lắp ráp và thử robot.', audioUrl: null, narrationSeconds: 45, dwellSeconds: 90 },
  ],
  progress: { step: 'OBSERVING', currentPoiId: 'poi-thu-vien', lastArrivedPoiId: 'poi-thu-vien', needsAssistance: false, isHeld: false },
}

export const aiAnswer = (questionId: string): StudentAiAnswer => ({
  questionId,
  answer: 'Robot dùng cảm biến LiDAR để đo khoảng cách và một camera để quay hình buổi tham quan.',
  outOfScope: false,
  poi: { id: 'poi-thu-vien', name: 'Thư viện' },
  answeredAt: NOW.toISOString(),
})

const base = `/api/student/tours/${STUDENT_TOUR_ID}`

/** Not signed in yet: no Student cookie, and a wrong code is refused with 400. */
export const wrongCodeHandlers: Handler[] = [
  { method: 'POST', path: `${base}/session`, reply: { status: 401, json: { success: false, message: 'No session', data: null, errors: null } } },
  { method: 'POST', path: `${base}/join`, reply: { status: 400, json: { success: false, message: 'Invalid code', data: null, errors: null } } },
]

/** The first session check never answers. */
export const hangingSessionHandlers: Handler[] = [
  { method: 'POST', path: `${base}/session`, reply: { hang: true } },
]

export const runningHandlers: Handler[] = [
  { method: 'POST', path: `${base}/session`, reply: { json: ok(runningTour) } },
  { method: 'GET', path: `${base}/view`, reply: { json: ok(runningView) } },
  // No relay in e2e: the page may not watch the live stream, so the fallback clip plays.
  { method: 'GET', path: `${base}/stream-access`, reply: { status: 409, json: { success: false, message: 'Stream not available', data: null, errors: { code: 'STREAM_NOT_AVAILABLE' } } } },
  {
    method: 'POST', path: `${base}/questions`,
    reply: (_route, _url, body) => ({ json: ok(aiAnswer((body as { questionId?: string })?.questionId ?? 'q-1')) }),
  },
]

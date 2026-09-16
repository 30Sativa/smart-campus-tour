/**
 * Labelled fixtures for the operations dashboard, used only while
 * `USE_MOCK_API` is on (see `mock-mode.ts`). They implement the same
 * `OperationsApi` contract as the HTTP client, so the feature code is identical
 * in both modes.
 *
 * Every value here is openly fake and the dashboard header says so. Nothing in
 * this file is used to paper over a failed request.
 */
import type {
  AmrStatus,
  Assignment,
  FeedbackFilters,
  FeedbackReport,
  Mission,
  OperationsApi,
  OpsAlert,
  OpsDashboard,
  OpsScheduleItem,
  ScheduleFilters,
  TourSessionDetail,
} from '../api/contracts/operations'
import { mockDelay } from './mock-mode'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

const amrs: AmrStatus[] = [
  { id: 'mock-amr-01', name: 'AMR Lotus-01', operationalState: 'Navigating', connectionState: 'Live', batteryPercent: 78, latitude: 10.77692, longitude: 106.70091, lastSeenAt: minutesAgo(1), telemetryAgeSeconds: 8, sensorHealth: 'Healthy', currentSessionId: 'mock-tour-active', currentSessionStatus: 'InProgress', currentMissionState: 'Navigating', currentPoi: 'Thư viện trung tâm' },
  { id: 'mock-amr-02', name: 'AMR Lotus-02', operationalState: 'Idle', connectionState: 'Live', batteryPercent: 94, latitude: 10.77731, longitude: 106.70155, lastSeenAt: minutesAgo(1), telemetryAgeSeconds: 11, sensorHealth: 'Healthy', currentPoi: 'Trạm sạc A' },
  { id: 'mock-amr-03', name: 'AMR Lotus-03', operationalState: 'Paused', connectionState: 'Stale', batteryPercent: 42, latitude: 10.77584, longitude: 106.69978, lastSeenAt: minutesAgo(4), telemetryAgeSeconds: 241, sensorHealth: 'Warning', currentSessionId: 'mock-tour-paused', currentSessionStatus: 'Paused', currentMissionState: 'Paused', currentPoi: 'Khu thí nghiệm' },
  // Disconnected robot: no battery, no pose. A missing reading stays missing.
  { id: 'mock-amr-04', name: 'AMR Lotus-04', operationalState: 'Offline', connectionState: 'Disconnected', batteryPercent: null, lastSeenAt: minutesAgo(23), telemetryAgeSeconds: 1382, sensorHealth: 'Unknown', currentPoi: null },
]

const alerts: OpsAlert[] = [
  { id: 'mock-alert-01', type: 'ObstacleDetected', severity: 'Critical', message: 'AMR Lotus-03 phát hiện vật cản kéo dài tại Khu thí nghiệm.', amrUnitId: 'mock-amr-03', amrName: 'AMR Lotus-03', tourSessionId: 'mock-tour-paused', createdAt: minutesAgo(5) },
  { id: 'mock-alert-02', type: 'LowBattery', severity: 'Warning', message: 'AMR Lotus-04 mất kết nối, không còn số liệu pin.', amrUnitId: 'mock-amr-04', amrName: 'AMR Lotus-04', createdAt: minutesAgo(19) },
  { id: 'mock-alert-03', type: 'MissionProgress', severity: 'Information', message: 'AMR Lotus-01 đã hoàn thành điểm dừng Thư viện trung tâm.', amrUnitId: 'mock-amr-01', amrName: 'AMR Lotus-01', tourSessionId: 'mock-tour-active', createdAt: minutesAgo(12), acknowledgedAt: minutesAgo(7), acknowledgedBy: 'Nguyễn Minh Anh', resolutionNote: 'Đã theo dõi, mission tiếp tục bình thường.' },
]

const schedule: OpsScheduleItem[] = [
  { sessionId: 'mock-tour-active', bookingId: 'mock-booking-001', startTime: minutesAgo(26), endTime: minutesFromNow(34), routeName: 'Khám phá khuôn viên trọng điểm', visitorName: 'Trần Gia Hân', status: 'InProgress', amrName: 'AMR Lotus-01' },
  { sessionId: 'mock-tour-scheduled', bookingId: 'mock-booking-002', startTime: minutesFromNow(45), endTime: minutesFromNow(105), routeName: 'Hành trình đổi mới sáng tạo', visitorName: 'Lê Quốc Bảo', status: 'Scheduled', amrName: null },
  { sessionId: 'mock-tour-completed', bookingId: 'mock-booking-003', startTime: minutesAgo(145), endTime: minutesAgo(85), routeName: 'Dấu ấn lịch sử đại học', visitorName: 'Phạm Khánh Linh', status: 'Completed', amrName: 'AMR Lotus-02' },
  { sessionId: 'mock-tour-paused', bookingId: 'mock-booking-004', startTime: minutesAgo(55), endTime: minutesFromNow(5), routeName: 'Không gian nghiên cứu mở', visitorName: 'Vũ Thành Nam', status: 'Paused', amrName: 'AMR Lotus-03' },
]

const missions: Record<string, Mission> = {
  'mock-tour-active': { id: 'mock-mission-001', amrUnitId: 'mock-amr-01', state: 'Navigating', progressPercent: 62, currentWaypoint: 'Thư viện trung tâm', nextWaypoint: 'Nhà điều hành', startedAt: minutesAgo(24), correlationId: 'mock-correlation-001' },
  'mock-tour-paused': { id: 'mock-mission-002', amrUnitId: 'mock-amr-03', state: 'Paused', progressPercent: 38, currentWaypoint: 'Khu thí nghiệm', nextWaypoint: null, startedAt: minutesAgo(50), correlationId: 'mock-correlation-002' },
  'mock-tour-completed': { id: 'mock-mission-003', amrUnitId: 'mock-amr-02', state: 'Completed', progressPercent: 100, currentWaypoint: 'Điểm kết thúc', nextWaypoint: null, startedAt: minutesAgo(145), correlationId: 'mock-correlation-003' },
}

const assignments: Record<string, Assignment[]> = {
  'mock-tour-active': [{ id: 'mock-assignment-001', amrUnitId: 'mock-amr-01', amrName: 'AMR Lotus-01', status: 'Active', assignedBy: 'Nguyễn Minh Anh', reason: 'Điều phối theo lịch tour', assignedAt: minutesAgo(31) }],
  'mock-tour-scheduled': [],
  'mock-tour-paused': [{ id: 'mock-assignment-002', amrUnitId: 'mock-amr-03', amrName: 'AMR Lotus-03', status: 'Active', assignedBy: 'Nguyễn Minh Anh', reason: 'Điều phối theo lịch tour', assignedAt: minutesAgo(70) }],
  'mock-tour-completed': [{ id: 'mock-assignment-003', amrUnitId: 'mock-amr-02', amrName: 'AMR Lotus-02', status: 'Closed', assignedBy: 'Nguyễn Minh Anh', reason: 'Điều phối theo lịch tour', assignedAt: minutesAgo(150) }],
}

const feedback: FeedbackReport[] = [
  { bookingId: 'mock-booking-003', routeName: 'Dấu ấn lịch sử đại học', tourDate: minutesAgo(85), bookingStatus: 'Completed', rating: 5, comment: 'Lộ trình rõ ràng, robot hướng dẫn dễ theo dõi.' },
  { bookingId: 'mock-booking-005', routeName: 'Khám phá khuôn viên trọng điểm', tourDate: minutesAgo(320), bookingStatus: 'Completed', rating: 4, comment: 'Trải nghiệm tốt, cần thêm thời gian ở khu thư viện.' },
  { bookingId: 'mock-booking-006', routeName: 'Hành trình đổi mới sáng tạo', tourDate: minutesAgo(750), bookingStatus: 'Completed', rating: 3, comment: 'Có lúc âm thanh hướng dẫn hơi nhỏ.' },
  { bookingId: 'mock-booking-007', routeName: 'Không gian nghiên cứu mở', tourDate: minutesAgo(1140), bookingStatus: 'Completed', rating: null, comment: null },
]

const timelineFor = (item: OpsScheduleItem) => [
  { id: `${item.sessionId}-event-01`, type: 'TourScheduled', detail: 'Phiên tour được tạo từ lịch đặt tour.', occurredAt: minutesAgo(90) },
  { id: `${item.sessionId}-event-02`, type: item.amrName ? 'AMRAssigned' : 'WaitingForAssignment', detail: item.amrName ? `Đã gán ${item.amrName}.` : 'Đang chờ nhân viên điều phối AMR.', occurredAt: minutesAgo(35) },
  ...(item.status === 'InProgress' ? [{ id: `${item.sessionId}-event-03`, type: 'MissionStarted', detail: 'AMR bắt đầu dẫn đoàn theo lộ trình.', occurredAt: minutesAgo(24) }] : []),
]

function findAmr(amrUnitId: string) {
  return amrs.find((amr) => amr.id === amrUnitId)
}

function buildSession(item: OpsScheduleItem): TourSessionDetail {
  return {
    id: item.sessionId,
    bookingId: item.bookingId,
    status: item.status,
    routeName: item.routeName,
    startTime: item.startTime,
    endTime: item.endTime,
    visitorName: item.visitorName,
    amrName: item.amrName,
    mission: missions[item.sessionId] ?? null,
    assignments: assignments[item.sessionId] ?? [],
    timeline: timelineFor(item),
    alerts: alerts.filter((alert) => alert.tourSessionId === item.sessionId),
  }
}

export const mockOperationsApi: OperationsApi = {
  dashboard: () => {
    const open = alerts.filter((alert) => !alert.acknowledgedAt)
    return mockDelay({
      todayTours: schedule.length,
      upcomingTours: schedule.filter((item) => item.status === 'Scheduled').length,
      activeTours: schedule.filter((item) => item.status === 'InProgress').length,
      completedTours: schedule.filter((item) => item.status === 'Completed').length,
      pendingTours: schedule.filter((item) => !item.amrName).length,
      activeAmrs: amrs.filter((amr) => amr.connectionState === 'Live').length,
      offlineAmrs: amrs.filter((amr) => amr.connectionState === 'Disconnected').length,
      activeAlerts: open.length,
      criticalAlerts: open.filter((alert) => alert.severity === 'Critical').length,
      todaySchedule: schedule,
      activeAmrsList: amrs,
      recentAlerts: open,
      activeSessions: schedule
        .filter((item) => item.status === 'InProgress' || item.status === 'Paused')
        .map((item) => ({
          id: item.sessionId,
          status: item.status,
          routeName: item.routeName,
          startTime: item.startTime,
          amrName: item.amrName,
          missionState: missions[item.sessionId]?.state ?? null,
          progressPercent: missions[item.sessionId]?.progressPercent ?? null,
        })),
    } satisfies OpsDashboard)
  },

  schedule: (filters: ScheduleFilters = {}) =>
    mockDelay(schedule.filter((item) => !filters.status || filters.status === 'All' || item.status === filters.status)),

  tourSession: (id) => {
    const item = schedule.find((session) => session.sessionId === id)
    if (!item) return Promise.reject(new Error('Không tìm thấy phiên tour trong dữ liệu mẫu.'))
    return mockDelay(buildSession(item))
  },

  amrs: () => mockDelay(amrs),

  digitalTwin: () => mockDelay(amrs),

  alerts: (acknowledged, severity) =>
    mockDelay(alerts.filter((alert) =>
      (acknowledged === undefined || Boolean(alert.acknowledgedAt) === acknowledged) &&
      (!severity || alert.severity === severity))),

  acknowledgeAlert: (id, resolutionNote) => {
    const alert = alerts.find((item) => item.id === id)
    if (!alert) return Promise.reject(new Error('Không tìm thấy cảnh báo trong dữ liệu mẫu.'))
    alert.acknowledgedAt = new Date().toISOString()
    alert.acknowledgedBy = 'Nhân viên (dữ liệu mẫu)'
    alert.resolutionNote = resolutionNote || null
    return mockDelay(alert)
  },

  assignAmr: (sessionId, amrUnitId, reason) => {
    const item = schedule.find((session) => session.sessionId === sessionId)
    const amr = findAmr(amrUnitId)
    if (!item || !amr) return Promise.reject(new Error('Không tìm thấy phiên tour hoặc AMR trong dữ liệu mẫu.'))
    const assignment: Assignment = { id: `mock-assignment-${Date.now()}`, amrUnitId, amrName: amr.name, status: 'Active', assignedBy: 'Nhân viên (dữ liệu mẫu)', reason: reason || null, assignedAt: new Date().toISOString() }
    assignments[sessionId] = [...(assignments[sessionId] ?? []), assignment]
    item.amrName = amr.name
    return mockDelay(assignment)
  },

  reassignAmr: (sessionId, amrUnitId, reason) => {
    const item = schedule.find((session) => session.sessionId === sessionId)
    const amr = findAmr(amrUnitId)
    if (!item || !amr) return Promise.reject(new Error('Không tìm thấy phiên tour hoặc AMR trong dữ liệu mẫu.'))
    const assignment: Assignment = { id: `mock-assignment-${Date.now()}`, amrUnitId, amrName: amr.name, status: 'Active', assignedBy: 'Nhân viên (dữ liệu mẫu)', reason, assignedAt: new Date().toISOString() }
    assignments[sessionId] = [...(assignments[sessionId] ?? []).map((existing) => ({ ...existing, status: 'Closed', closedAt: new Date().toISOString() })), assignment]
    item.amrName = amr.name
    return mockDelay(assignment)
  },

  commandMission: (sessionId, command, reason) => {
    const mission = missions[sessionId]
    const item = schedule.find((session) => session.sessionId === sessionId)
    if (!mission || !item) return Promise.reject(new Error('Phiên tour mẫu không có mission đang chạy.'))
    const nextState = command === 'pause' ? 'Paused' : command === 'resume' ? 'Navigating' : command === 'recall' ? 'RecallRequested' : 'Cancelled'
    mission.state = nextState
    mission.failureReason = reason || null
    mission.correlationId = `mock-command-${Date.now()}`
    item.status = command === 'cancel' ? 'Cancelled' : command === 'pause' ? 'Paused' : command === 'resume' ? 'InProgress' : item.status
    return mockDelay(mission)
  },

  feedbackReports: (filters: FeedbackFilters = {}) =>
    mockDelay(feedback.filter((report) => !filters.rating || String(report.rating) === filters.rating)),
}

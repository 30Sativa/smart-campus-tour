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

const routeNames = [
  'Dấu ấn lịch sử đại học',
  'Khám phá khuôn viên trọng điểm',
  'Hành trình đổi mới sáng tạo',
  'Không gian nghiên cứu mở',
]

/**
 * Post-tour reports across the last two weeks.
 *
 * `FeedbackFilters` declares `from`/`to` and `FeedbackReport` carries `tourDate`
 * and `bookingStatus`, so a date range is part of the contract. The earlier
 * fixture only held four rows on four scattered days, which made a range
 * query look empty. The spread below is generated from a fixed table rather than
 * from Math.random, so the same request returns the same rows and a chart does
 * not reshuffle itself on every refetch.
 *
 * Openly fake, like everything else in this file, and only ever served while
 * USE_MOCK_API is on.
 */
const feedbackShape: Array<{ completed: number; cancelled: number; ratings: number[] }> = [
  { completed: 4, cancelled: 1, ratings: [5, 4, 4, 5] },
  { completed: 6, cancelled: 0, ratings: [5, 5, 4, 3, 5, 4] },
  { completed: 3, cancelled: 2, ratings: [4, 3, 5] },
  { completed: 7, cancelled: 1, ratings: [5, 4, 5, 5, 4, 4, 3] },
  { completed: 5, cancelled: 0, ratings: [4, 5, 5, 4] },
  { completed: 2, cancelled: 1, ratings: [3, 4] },
  { completed: 6, cancelled: 1, ratings: [5, 5, 4, 4, 5] },
  { completed: 4, cancelled: 0, ratings: [4, 4, 5, 5] },
  { completed: 5, cancelled: 2, ratings: [3, 4, 4, 5, 5] },
  { completed: 3, cancelled: 0, ratings: [5, 4, 4] },
  { completed: 6, cancelled: 1, ratings: [4, 5, 5, 4, 4, 5] },
  { completed: 4, cancelled: 1, ratings: [5, 3, 4, 5] },
  { completed: 5, cancelled: 0, ratings: [4, 4, 5, 5, 5] },
  { completed: 3, cancelled: 1, ratings: [4, 5] },
]

const feedback: FeedbackReport[] = feedbackShape.flatMap((day, index) => {
  // index 0 is the oldest day in the window, the last entry is today.
  const daysAgo = feedbackShape.length - 1 - index
  const at = (slot: number) => {
    const when = new Date()
    when.setDate(when.getDate() - daysAgo)
    when.setHours(9 + slot, 15, 0, 0)
    return when.toISOString()
  }
  const rows: FeedbackReport[] = []
  for (let i = 0; i < day.completed; i += 1) {
    rows.push({
      bookingId: `mock-booking-d${daysAgo}-c${i}`,
      routeName: routeNames[(index + i) % routeNames.length],
      tourDate: at(i),
      bookingStatus: 'Completed',
      rating: day.ratings[i] ?? null,
      comment: day.ratings[i] ? 'Phản hồi mẫu từ khách tham quan.' : null,
    })
  }
  for (let i = 0; i < day.cancelled; i += 1) {
    rows.push({
      bookingId: `mock-booking-d${daysAgo}-x${i}`,
      routeName: routeNames[(index + i + 2) % routeNames.length],
      tourDate: at(day.completed + i),
      bookingStatus: 'Cancelled',
      rating: null,
      comment: null,
    })
  }
  return rows
})

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

  feedbackReports: (filters: FeedbackFilters = {}) => {
    // `from`/`to` are inclusive calendar days, matching how the HTTP client
    // sends them. Honouring them here keeps the mock a faithful stand-in for the
    // contract rather than a list that ignores half of it.
    const after = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null
    const before = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : null
    return mockDelay(
      feedback.filter((report) => {
        const at = new Date(report.tourDate).getTime()
        if (after != null && at < after) return false
        if (before != null && at > before) return false
        if (filters.status && report.bookingStatus !== filters.status) return false
        if (filters.rating && String(report.rating) !== filters.rating) return false
        return true
      }),
    )
  },
}

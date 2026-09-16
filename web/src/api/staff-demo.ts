import { create } from 'zustand'
import type { AmrStatus, Assignment, FeedbackReport, Mission, StaffAlert, StaffDashboard, StaffScheduleItem, TourSessionDetail } from './staff'

export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

export const demoSessionIds = {
  active: 'demo-active-tour-001',
  scheduled: 'demo-scheduled-tour-002',
  completed: 'demo-completed-tour-003',
} as const

const amrs: AmrStatus[] = [
  { id: 'demo-amr-01', name: 'AMR Lotus-01', operationalState: 'Navigating', connectionState: 'Live', batteryPercent: 78, latitude: 10.77692, longitude: 106.70091, lastSeenAt: minutesAgo(1), telemetryAgeSeconds: 8, sensorHealth: 'Healthy', currentSessionId: demoSessionIds.active, currentSessionStatus: 'InProgress', currentMissionState: 'Navigating', currentPoi: 'Thư viện trung tâm' },
  { id: 'demo-amr-02', name: 'AMR Lotus-02', operationalState: 'Idle', connectionState: 'Live', batteryPercent: 94, latitude: 10.77731, longitude: 106.70155, lastSeenAt: minutesAgo(1), telemetryAgeSeconds: 11, sensorHealth: 'Healthy', currentPoi: 'Trạm sạc A' },
  { id: 'demo-amr-03', name: 'AMR Lotus-03', operationalState: 'Paused', connectionState: 'Stale', batteryPercent: 42, latitude: 10.77584, longitude: 106.69978, lastSeenAt: minutesAgo(4), telemetryAgeSeconds: 241, sensorHealth: 'Warning', currentSessionId: 'demo-recovery-tour-004', currentSessionStatus: 'Paused', currentMissionState: 'Paused', currentPoi: 'Khu thí nghiệm' },
  { id: 'demo-amr-04', name: 'AMR Lotus-04', operationalState: 'Offline', connectionState: 'Disconnected', batteryPercent: 18, lastSeenAt: minutesAgo(23), telemetryAgeSeconds: 1382, sensorHealth: 'Unknown', currentPoi: 'Bãi bảo trì' },
]

const baseAlerts: StaffAlert[] = [
  { id: 'demo-alert-critical-01', type: 'ObstacleDetected', severity: 'Critical', message: 'AMR Lotus-03 phát hiện vật cản kéo dài tại Khu thí nghiệm.', amrUnitId: 'demo-amr-03', amrName: 'AMR Lotus-03', tourSessionId: 'demo-recovery-tour-004', createdAt: minutesAgo(5) },
  { id: 'demo-alert-warning-02', type: 'LowBattery', severity: 'Warning', message: 'Pin AMR Lotus-04 dưới ngưỡng vận hành an toàn.', amrUnitId: 'demo-amr-04', amrName: 'AMR Lotus-04', createdAt: minutesAgo(19) },
  { id: 'demo-alert-info-03', type: 'MissionProgress', severity: 'Information', message: 'AMR Lotus-01 đã hoàn thành điểm dừng Thư viện trung tâm.', amrUnitId: 'demo-amr-01', amrName: 'AMR Lotus-01', tourSessionId: demoSessionIds.active, createdAt: minutesAgo(12), acknowledgedAt: minutesAgo(7), acknowledgedBy: 'Nguyễn Minh Anh', resolutionNote: 'Đã theo dõi, mission tiếp tục bình thường.' },
]

const schedule: StaffScheduleItem[] = [
  { sessionId: demoSessionIds.active, bookingId: 'demo-booking-001', startTime: minutesAgo(26), endTime: minutesFromNow(34), routeName: 'Khám phá khuôn viên trọng điểm', visitorName: 'Trần Gia Hân', status: 'InProgress', amrName: 'AMR Lotus-01' },
  { sessionId: demoSessionIds.scheduled, bookingId: 'demo-booking-002', startTime: minutesFromNow(45), endTime: minutesFromNow(105), routeName: 'Hành trình đổi mới sáng tạo', visitorName: 'Lê Quốc Bảo', status: 'Scheduled', amrName: null },
  { sessionId: demoSessionIds.completed, bookingId: 'demo-booking-003', startTime: minutesAgo(145), endTime: minutesAgo(85), routeName: 'Dấu ấn lịch sử đại học', visitorName: 'Phạm Khánh Linh', status: 'Completed', amrName: 'AMR Lotus-02' },
  { sessionId: 'demo-recovery-tour-004', bookingId: 'demo-booking-004', startTime: minutesAgo(55), endTime: minutesFromNow(5), routeName: 'Không gian nghiên cứu mở', visitorName: 'Vũ Thành Nam', status: 'Paused', amrName: 'AMR Lotus-03' },
]

const activeMission: Mission = { id: 'demo-mission-001', amrUnitId: 'demo-amr-01', state: 'Navigating', progressPercent: 62, currentWaypoint: 'Thư viện trung tâm', nextWaypoint: 'Nhà điều hành', startedAt: minutesAgo(24), correlationId: 'demo-correlation-001' }

const activeAssignments: Assignment[] = [{ id: 'demo-assignment-001', amrUnitId: 'demo-amr-01', amrName: 'AMR Lotus-01', status: 'Active', assignedBy: 'Nguyễn Minh Anh', reason: 'Điều phối theo lịch tour', assignedAt: minutesAgo(31) }]

export function getDemoDashboard(acknowledgedAlertIds: string[] = []): StaffDashboard {
  const alerts = getDemoAlerts(acknowledgedAlertIds)
  return {
    todayTours: 8,
    upcomingTours: 3,
    activeTours: 2,
    completedTours: 3,
    pendingTours: 1,
    activeAmrs: 2,
    offlineAmrs: 1,
    activeAlerts: alerts.filter((alert) => !alert.acknowledgedAt).length,
    criticalAlerts: alerts.filter((alert) => !alert.acknowledgedAt && alert.severity === 'Critical').length,
    todaySchedule: schedule,
    activeAmrsList: amrs,
    recentAlerts: alerts.filter((alert) => !alert.acknowledgedAt),
    activeSessions: schedule.filter((item) => item.status === 'InProgress' || item.status === 'Paused').map((item) => ({ id: item.sessionId, status: item.status, routeName: item.routeName, startTime: item.startTime, amrName: item.amrName, missionState: item.status === 'InProgress' ? 'Navigating' : 'Paused', progressPercent: item.status === 'InProgress' ? 62 : 38 })),
  }
}

export function getDemoSchedule(filters: { status?: string; date?: string } = {}) {
  return schedule.filter((item) => !filters.status || item.status === filters.status)
}

export function getDemoAlerts(acknowledgedAlertIds: string[] = []): StaffAlert[] {
  return baseAlerts.map((alert) => acknowledgedAlertIds.includes(alert.id) && !alert.acknowledgedAt
    ? { ...alert, acknowledgedAt: new Date().toISOString(), acknowledgedBy: 'Nhân viên demo', resolutionNote: 'Đã xác nhận trong chế độ dữ liệu mẫu.' }
    : alert)
}

export function getDemoSession(id: string, acknowledgedAlertIds: string[] = []): TourSessionDetail {
  const item = schedule.find((session) => session.sessionId === id) || schedule[0]
  const isActive = item.sessionId === demoSessionIds.active
  const isScheduled = item.sessionId === demoSessionIds.scheduled
  return {
    id: item.sessionId,
    bookingId: item.bookingId,
    status: item.status,
    routeName: item.routeName,
    startTime: item.startTime,
    endTime: item.endTime,
    visitorName: item.visitorName,
    amrName: item.amrName,
    mission: isActive ? activeMission : isScheduled ? null : { ...activeMission, id: 'demo-mission-paused', amrUnitId: 'demo-amr-03', state: item.status === 'Completed' ? 'Completed' : 'Paused', progressPercent: item.status === 'Completed' ? 100 : 38, currentWaypoint: item.status === 'Completed' ? 'Điểm kết thúc' : 'Khu thí nghiệm', nextWaypoint: null },
    assignments: isScheduled ? [] : isActive ? activeAssignments : [{ id: 'demo-assignment-003', amrUnitId: item.status === 'Completed' ? 'demo-amr-02' : 'demo-amr-03', amrName: item.amrName || 'Chưa gán', status: item.status === 'Completed' ? 'Closed' : 'Active', assignedBy: 'Nguyễn Minh Anh', reason: 'Dữ liệu mô phỏng', assignedAt: minutesAgo(70) }],
    timeline: [
      { id: `${item.sessionId}-event-01`, type: 'TourScheduled', detail: 'Phiên tour được tạo từ lịch đặt tour.', occurredAt: minutesAgo(90) },
      { id: `${item.sessionId}-event-02`, type: isScheduled ? 'WaitingForAssignment' : 'AMRAssigned', detail: isScheduled ? 'Đang chờ nhân viên điều phối AMR.' : `Đã gán ${item.amrName}.`, occurredAt: minutesAgo(35) },
      ...(isActive ? [{ id: `${item.sessionId}-event-03`, type: 'MissionStarted', detail: 'AMR bắt đầu dẫn đoàn theo lộ trình.', occurredAt: minutesAgo(24) }] : []),
    ],
    alerts: getDemoAlerts(acknowledgedAlertIds).filter((alert) => alert.tourSessionId === item.sessionId),
  }
}

export function getDemoFeedbackReports(): FeedbackReport[] {
  return [
    { bookingId: 'demo-booking-003', routeName: 'Dấu ấn lịch sử đại học', tourDate: minutesAgo(85), bookingStatus: 'Completed', rating: 5, comment: 'Lộ trình rõ ràng, robot hướng dẫn dễ theo dõi.' },
    { bookingId: 'demo-booking-005', routeName: 'Khám phá khuôn viên trọng điểm', tourDate: minutesAgo(320), bookingStatus: 'Completed', rating: 4, comment: 'Trải nghiệm tốt, cần thêm thời gian ở khu thư viện.' },
    { bookingId: 'demo-booking-006', routeName: 'Hành trình đổi mới sáng tạo', tourDate: minutesAgo(750), bookingStatus: 'Completed', rating: 3, comment: 'Có lúc âm thanh hướng dẫn hơi nhỏ.' },
    { bookingId: 'demo-booking-007', routeName: 'Không gian nghiên cứu mở', tourDate: minutesAgo(1140), bookingStatus: 'Completed', rating: null, comment: null },
  ]
}

export function getDemoAmrs() { return amrs }

export type StaffDemoState = {
  isDemo: boolean
  acknowledgedAlertIds: string[]
  setDemo: (isDemo: boolean) => void
  acknowledgeAlert: (id: string) => void
}

export const useStaffDemoStore = create<StaffDemoState>((set) => ({
  isDemo: false,
  acknowledgedAlertIds: [],
  setDemo: (isDemo) => set({ isDemo, acknowledgedAlertIds: isDemo ? [] : [] }),
  acknowledgeAlert: (id) => set((state) => ({ acknowledgedAlertIds: state.acknowledgedAlertIds.includes(id) ? state.acknowledgedAlertIds : [...state.acknowledgedAlertIds, id] })),
}))

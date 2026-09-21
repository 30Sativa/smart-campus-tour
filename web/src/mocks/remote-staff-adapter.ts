import type { AmrStatus, StaffAlert, StaffApi, StaffScheduleItem, TourSessionDetail } from '../api/contracts/staff'
import type { RemoteTour, Workspace } from '../api/contracts/remote-tour'
import { remotePreviewApi, RemotePreviewError } from './remote-tour-mock'
import { useAuthStore } from '../stores/auth-store'
import { hasOperationalRole } from '../auth/roles'

// Keep the existing dashboard/table view models. All live state comes from the
// same remote preview store as approval, registration and Student join.
const acknowledged = new Map<string, string>()
const localDate = (value: string) => new Date(value).toLocaleDateString('en-CA')
function scheduleRow(t: RemoteTour, w: Workspace): StaffScheduleItem {
  return { sessionId: t.id, bookingId: t.id, routeName: t.name, startTime: t.scheduledAt,
    endTime: new Date(new Date(t.scheduledAt).getTime() + 45 * 60000).toISOString(), status: t.state,
    visitorName: w.registrations.filter(r => r.tourId === t.id && r.state === 'APPROVED').map(r => r.school).join(', '),
    amrName: w.robots.find(r => r.assignedTourId === t.id)?.id }
}
function amrs(w: Workspace): AmrStatus[] {
  return w.robots.map(r => {
    const t = w.tours.find(t => t.id === r.assignedTourId)
    const route = w.routes.find(route => route.id === t?.routeId)
    return { id: r.id, name: `${r.id} · ${r.source}`, connectionState: r.connected ? 'Live' : 'Disconnected',
      operationalState: r.needsInspection ? 'Maintenance' : t?.operation === 'NEEDS_ASSISTANCE' ? 'Fault' : t?.step ?? 'Idle',
      sensorHealth: r.localized ? 'Healthy' : 'Degraded', lastSeenAt: r.updatedAt,
      currentSessionId: t?.id, currentSessionStatus: t?.state,
      currentMissionState: t?.operation === 'NEEDS_ASSISTANCE' ? t.operation : t?.hold ? 'HOLD' : t?.step,
      currentPoi: t?.step === 'RETURNING' ? 'Điểm kết thúc' : route?.pois[t?.poiIndex ?? -1]?.name,
      batteryPercent: null, latitude: null, longitude: null }
  })
}
function alerts(w: Workspace): StaffAlert[] {
  return w.tours.filter(t => t.state === 'RUNNING' && t.operation === 'NEEDS_ASSISTANCE').map(t => {
    const id = `${t.id}:${t.revision}`
    return { id, type: 'RemoteAssistance', severity: 'Critical', message: t.fault === 'restart' ? 'Phiên bị gián đoạn. Cần kết thúc sớm và kiểm tra robot.' : 'Buổi cần hỗ trợ ở bước hiện tại.', tourSessionId: t.id,
      amrName: w.robots.find(r => r.assignedTourId === t.id)?.id,
      createdAt: w.robots.find(r => r.assignedTourId === t.id)?.updatedAt ?? t.scheduledAt,
      acknowledgedAt: acknowledged.get(id) }
  })
}
function detail(t: RemoteTour, w: Workspace): TourSessionDetail {
  const row = scheduleRow(t, w)
  const robot = w.robots.find(r => r.assignedTourId === t.id)
  const route = w.routes.find(r => r.id === t.routeId)
  return { ...row, id: t.id, mission: t.state === 'RUNNING' ? { id: t.id, amrUnitId: robot?.id ?? '',
    state: t.operation === 'NEEDS_ASSISTANCE' ? t.operation : t.hold ? 'HOLD' : t.step,
    progressPercent: route ? Math.round(Math.min(t.poiIndex / route.pois.length, 1) * 100) : 0,
    currentWaypoint: t.step === 'RETURNING' ? 'Điểm kết thúc' : route?.pois[t.poiIndex]?.name,
    nextWaypoint: route?.pois[t.poiIndex + 1]?.name ?? 'Điểm kết thúc' } : null,
    assignments: [], timeline: [], alerts: alerts(w).filter(a => a.tourSessionId === t.id) }
}
const legacyAction = async (): Promise<never> => { throw new RemotePreviewError('Dùng thao tác theo trạng thái trong chi tiết buổi. Không còn lệnh pause/resume/recall hoặc gán lại giữa buổi.') }
export const remoteStaffApi: StaffApi = {
  async schedule(filters = {}) {
    const w = await remotePreviewApi.workspace()
    return w.tours.filter(t => {
      if (filters.date && localDate(t.scheduledAt) !== filters.date) return false
      if (filters.routeId && t.routeId !== filters.routeId) return false
      const s = filters.status?.toUpperCase()
      if (!s || s === 'ALL') return true
      if (s === 'TODAY') return localDate(t.scheduledAt) === localDate(new Date().toISOString())
      if (s === 'UPCOMING') return ['SCHEDULED', 'READY'].includes(t.state)
      if (s === 'ACTIVE') return t.state === 'RUNNING'
      return t.state === s
    }).map(t => scheduleRow(t, w))
  },
  async dashboard(date) {
    const w = await remotePreviewApi.workspace()
    const day = date ?? localDate(new Date().toISOString())
    const today = w.tours.filter(t => localDate(t.scheduledAt) === day)
    const fleet = amrs(w); const issues = alerts(w)
    return { todayTours: today.length, upcomingTours: today.filter(t => ['SCHEDULED', 'READY'].includes(t.state)).length,
      activeTours: w.tours.filter(t => t.state === 'RUNNING').length, completedTours: today.filter(t => t.state === 'COMPLETED').length,
      pendingTours: today.filter(t => t.state === 'SCHEDULED').length, activeAmrs: fleet.filter(r => r.connectionState === 'Live').length,
      offlineAmrs: fleet.filter(r => r.connectionState !== 'Live').length, activeAlerts: issues.filter(a => !a.acknowledgedAt).length,
      criticalAlerts: issues.filter(a => !a.acknowledgedAt && a.severity === 'Critical').length, todaySchedule: today.map(t => scheduleRow(t, w)),
      activeAmrsList: fleet, recentAlerts: issues, activeSessions: w.tours.filter(t => t.state === 'RUNNING').map(t => ({
        id: t.id, status: t.state, routeName: t.name, startTime: t.scheduledAt,
        amrName: fleet.find(r => r.currentSessionId === t.id)?.name, missionState: detail(t, w).mission?.state })) }
  },
  async tourSession(id) { const w = await remotePreviewApi.workspace(); const t = w.tours.find(t => t.id === id); if (!t) throw new RemotePreviewError('Không tìm thấy buổi.'); return detail(t, w) },
  async amrs() { return amrs(await remotePreviewApi.workspace()) },
  async digitalTwin() { return amrs(await remotePreviewApi.workspace()) },
  async alerts(ack, severity) { return alerts(await remotePreviewApi.workspace()).filter(a => (ack === undefined || Boolean(a.acknowledgedAt) === ack) && (!severity || a.severity === severity)) },
  async acknowledgeAlert(id, resolutionNote) {
    if (!hasOperationalRole(useAuthStore.getState().user?.role)) throw new RemotePreviewError('Cần quyền Staff.')
    const a = (await this.alerts()).find(a => a.id === id)
    if (!a) throw new RemotePreviewError('Cảnh báo đã thay đổi. Hãy tải lại.')
    const now = new Date().toISOString(); acknowledged.set(id, now)
    return { ...a, acknowledgedAt: now, resolutionNote }
  },
  assignAmr: legacyAction, reassignAmr: legacyAction, commandMission: legacyAction,
  async feedbackReports() { return [] },
}

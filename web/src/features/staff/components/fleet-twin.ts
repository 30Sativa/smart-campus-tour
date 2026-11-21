import type { RouteStop } from '../../../api/contracts/staff'
import { formatRelative } from '../../../components/ui/date-time'
import type { StatusTone } from '../../../components/ui/status-tone'
import type { TourDetails, TourSummary } from '../../administration/tours/types'
import { mapConfigFor, mapToScenePose } from '../../digital-twin/map-config'
import type { TwinLeg, TwinRobot, TwinRoute } from '../../digital-twin/TwinScene'
import { readNextTarget } from '../../tour-vote/vote'
import { POSE_STALE_SECONDS } from '../attention'
import type { FleetRobot } from '../operations/fleet-telemetry'
import type { RunningTour } from '../operations/hooks'
import { statusInfo } from '../status'

/**
 * The Digital Twin's reading of `/hubs/operations`: only physical robots, as
 * they reported. Simulated robots never enter these values, so they are never
 * counted, never coloured by a real state and never raise anything.
 */
export const TONE_COLOR: Record<StatusTone, string> = { ok: '#2f8f6b', info: '#2f62b8', warn: '#d69412', danger: '#c9534a', muted: '#8a98ac' }
const STALE_COLOR = '#8a98ac'
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

export type RealRobotView = {
  robot: FleetRobot
  /** Age of the pose now, counting the time since the broadcast; null without a pose. */
  ageSeconds: number | null
  stale: boolean
  /** Scene point when the robot's map is calibrated for the NVH V3 model; null otherwise. */
  scenePoint: [number, number, number] | null
  tour: TourSummary | null
  status: { key: string; label: string }
  color: string
}

/** "12 giây trước", then the console's relative wording ("5 phút trước"). */
export function ageText(seconds: number, now: number): string {
  return seconds < 60 ? `${Math.max(0, Math.round(seconds))} giây trước` : formatRelative(now - seconds * 1000, now)
}

function statusOf(robot: FleetRobot, tour: RunningTour | undefined): string {
  if (robot.needsCheck) return 'maintenance'
  if (robot.faultCode) return 'fault'
  if (tour) {
    const status = tour.execution?.operationalStatus
    return status === 'NEEDS_ASSISTANCE' ? 'needsassistance' : status === 'PAUSED' ? 'paused' : 'running'
  }
  return robot.executionStatus || 'idle'
}

export function realRobotViews(robots: FleetRobot[], receivedAt: number | null, now: number, tours: RunningTour[]): RealRobotView[] {
  const elapsed = receivedAt ? Math.max(0, now - receivedAt) / 1000 : 0
  return robots.filter(robot => robot.source === 'Physical').map(robot => {
    const ageSeconds = robot.pose ? (robot.poseAgeSeconds ?? robot.telemetryAgeSeconds) + elapsed : null
    const stale = ageSeconds === null || ageSeconds > POSE_STALE_SECONDS || robot.connectionState !== 'Live'
    const scene = mapConfigFor(robot.mapKey)?.scene
    const placed = robot.pose && scene?.calibrated && scene.modelKey === 'nvh-v3'
    const point = placed ? mapToScenePose({ x: robot.pose!.x, y: robot.pose!.y, yaw: 0 }, scene.transform).position : null
    const running = tours.find(item => same(item.tour.reservation?.robotCode, robot.id))
    const key = statusOf(robot, running)
    const info = statusInfo(key)
    return {
      robot, ageSeconds, stale, scenePoint: point ? [point[0], scene!.groundY ?? 0, point[2]] : null,
      tour: running?.tour ?? null, status: { key, label: info.label }, color: stale ? STALE_COLOR : TONE_COLOR[info.tone],
    }
  })
}

/** The robot the view opens on: `?robot=` when it is a physical robot, else the one with the newest pose. */
export function defaultRobot(views: RealRobotView[], requested: string | null): RealRobotView | null {
  const asked = requested ? views.find(view => same(view.robot.id, requested)) : undefined
  if (asked) return asked
  return views.filter(view => view.ageSeconds !== null).sort((a, b) => a.ageSeconds! - b.ageSeconds!)[0] ?? views[0] ?? null
}

/** "1 robot thật · amr_01 dữ liệu cũ". */
export function fleetSummary(views: RealRobotView[]): string {
  const parts = views.slice(0, 3).map(view => `${view.robot.id} ${!view.robot.pose ? 'chưa gửi vị trí' : view.stale ? 'dữ liệu cũ' : view.status.label.toLowerCase()}`)
  return [`${views.length} robot thật`, ...parts, ...(views.length > 3 ? [`+${views.length - 3}`] : [])].join(' · ')
}

export function realTwinRobots(views: RealRobotView[], selectedId: string | null, now: number): TwinRobot[] {
  return views.flatMap(view => {
    const scene = mapConfigFor(view.robot.mapKey)?.scene
    if (!view.scenePoint || !view.robot.pose || !scene) return []
    return [{
      id: view.robot.id, name: view.robot.id, pose: { x: view.robot.pose.x, y: view.robot.pose.y, yaw: view.robot.pose.yaw },
      transform: scene.transform, scale: scene.robotScale, groundY: scene.groundY, color: view.color, synthetic: false,
      active: !view.stale && view.status.key.toLowerCase() === 'navigating', focused: same(view.robot.id, selectedId), stale: view.stale, headYaw: 0,
      labelNote: view.stale && view.ageSeconds !== null ? `dữ liệu cũ, ${ageText(view.ageSeconds, now)}` : undefined,
    }]
  })
}

/** The running Tour's stops, end point and current target on the NVH model, from the Tour detail. */
export function tourTwinRoute(detail: TourDetails): TwinRoute | null {
  const revision = detail.routeRevision
  const scene = revision ? mapConfigFor(revision.mapKey)?.scene : null
  if (!revision || !scene?.calibrated || scene.modelKey !== 'nvh-v3') return null
  const currentId = detail.execution?.currentRevisionStopId ?? null
  const current = revision.stops.findIndex(stop => same(stop.id, currentId))
  const stops: RouteStop[] = revision.stops.map((stop, index) => ({
    id: stop.id ?? `${revision.revisionId}-${stop.stopOrder}`, name: stop.name, position: { x: stop.x, y: stop.y, yaw: stop.yaw },
    dwellSeconds: stop.dwellSeconds, headSteps: [], visits: 0,
    status: current < 0 ? 'Upcoming' : index < current ? 'Completed' : index === current ? 'Current' : 'Upcoming',
  }))
  const last = revision.stops.at(-1)
  const end = revision.endMode === 'POSE' && revision.endX !== null && revision.endY !== null ? { x: revision.endX, y: revision.endY } : last ? { x: last.x, y: last.y } : { x: revision.startX, y: revision.startY }
  const returning = detail.execution?.currentStep === 'RETURNING_TO_END'
  const route: TwinRoute = {
    stops, endPoint: { name: 'Điểm kết thúc', position: end }, transform: scene.transform, groundY: scene.groundY, markerScale: scene.robotScale,
    targetIndex: current >= 0 && !returning ? current : null, heading: returning ? 'end' : current >= 0 ? 'poi' : 'none',
  }
  return revision.viewerChoosesNextStop ? votingRoute(detail, route, end) : route
}

/**
 * ADR-0065: on a voting Tour the StopOrder says nothing about what was driven or comes next, so the stops are marked and
 * the legs drawn from the server: `stopProgress` (its `order` gives the order driven) and `nextTarget`.
 */
function votingRoute(detail: TourDetails, route: TwinRoute, end: { x: number; y: number }): TwinRoute {
  const revision = detail.routeRevision!
  const execution = detail.execution
  const progress = detail.stopProgress ?? []
  const point = (id: string | null | undefined) => {
    const stop = revision.stops.find(item => same(item.id, id))
    return stop ? { x: stop.x, y: stop.y } : null
  }
  const stops = route.stops.map(stop => {
    const state = progress.find(item => same(item.stopId, stop.id))?.progress
    return state ? { ...stop, status: state === 'VISITED' ? 'Completed' as const : state === 'SKIPPED' ? 'Skipped' as const : state === 'CURRENT' ? 'Current' as const : 'Upcoming' as const } : stop
  })
  // The order driven: the start, then each visited POI by its visit order. A server without `order` gives no order,
  // so nothing driven is drawn and the next leg only from the POI the robot stands at.
  const passed = progress.filter(item => item.progress === 'VISITED')
  const orderKnown = passed.every(item => typeof item.order === 'number')
  const visited = orderKnown ? [...passed].sort((a, b) => a.order! - b.order!).map(item => point(item.stopId)).filter(item => item !== null) : []
  const chain = orderKnown ? [{ x: revision.startX, y: revision.startY }, ...visited] : []
  const step = execution?.currentStep
  const here = point(execution?.currentRevisionStopId)
  // At a POI the robot stands at the current stop, which may not be marked VISITED yet.
  const lastPoint = chain.at(-1)
  if (step === 'OBSERVING' && here && !(lastPoint && lastPoint.x === here.x && lastPoint.y === here.y)) chain.push(here)
  const legs: TwinLeg[] = chain.slice(1).map((to, index) => ({ from: chain[index], to, kind: 'visited' }))
  const target = readNextTarget(detail.nextTarget)
  const to = step === 'RETURNING_TO_END' ? end : step === 'NAVIGATING' ? here
    : target ? target.kind === 'END' ? end : point(target.stopId) : null
  const from = chain.at(-1)
  if (from && to && step) legs.push({ from, to, kind: 'next' })
  return { ...route, stops, legs }
}

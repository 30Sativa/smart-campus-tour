import type { RealtimeConnectionState } from '../../api/contracts/staff-realtime'
import { POSE_STALE_SECONDS } from '../staff/attention'
import { mapConfigFor, mapToScenePose, type MapConfig, type MapPose } from './map-config'

/** Browser view model only. Future operations projections must map to this;
 * this does not define or approve a fleet/operations wire payload. */
export type RobotObservation = {
  robotId: string
  mapKey: string
  frameId: 'map'
  streamId: string
  seq: number
  capturedAt: string
  pose: MapPose
}

export type RobotTelemetrySource = {
  subscribe(onObservation: (value: unknown) => void, onState: (state: RealtimeConnectionState) => void): () => void
}

export function acceptObservation(previous: RobotObservation | null, value: unknown, now: number): RobotObservation | null {
  if (!value || typeof value !== 'object') return previous
  const sample = value as Partial<RobotObservation>
  const captured = typeof sample.capturedAt === 'string' ? Date.parse(sample.capturedAt) : NaN
  if (![sample.robotId, sample.mapKey, sample.streamId].every((id) => typeof id === 'string' && id.trim().length > 0) ||
      sample.frameId !== 'map' || !Number.isSafeInteger(sample.seq) || (sample.seq ?? 0) < 1 ||
      !Number.isFinite(captured) || captured > now + 5000 || !sample.pose ||
      ![sample.pose.x, sample.pose.y, sample.pose.yaw].every((number) => typeof number === 'number' && Number.isFinite(number))) return previous
  if (previous && (previous.robotId !== sample.robotId || captured < Date.parse(previous.capturedAt) ||
      (previous.streamId === sample.streamId && (sample.seq! <= previous.seq || previous.mapKey !== sample.mapKey)) ||
      (previous.streamId !== sample.streamId && captured <= Date.parse(previous.capturedAt)))) return previous
  // Own the accepted sample; a transport mutating its object cannot alter displayed state.
  return { robotId: sample.robotId!, mapKey: sample.mapKey!, frameId: 'map', streamId: sample.streamId!, seq: sample.seq!, capturedAt: sample.capturedAt!, pose: { ...sample.pose } }
}

export function observationView(sample: RobotObservation | null, connection: RealtimeConnectionState, now: number, config: MapConfig | null = mapConfigFor(sample?.mapKey)) {
  const ageSeconds = sample ? Math.max(0, (now - Date.parse(sample.capturedAt)) / 1000) : null
  const stale = connection !== 'connected' || ageSeconds === null || ageSeconds > POSE_STALE_SECONDS
  const calibrated = Boolean(config && config.mapKey === sample?.mapKey && config.scene.calibrated)
  return { ageSeconds, stale, calibrated, scenePose: sample && calibrated && config ? mapToScenePose(sample.pose, config.scene.transform) : null }
}

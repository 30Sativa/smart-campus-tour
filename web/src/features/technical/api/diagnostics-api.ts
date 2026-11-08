import { apiClient } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'
import type { FleetPose } from '../../staff/operations/fleet-telemetry'

export type TechnicalKpiSummary = {
  totalRobots: number
  connectedRobots: number
  awaitingDataRobots: number
  disconnectedRobots: number
  unconfirmedRobots: number
  heldForInspectionCount: number
  pendingPoiVerificationsCount: number
  pendingRouteTestsCount: number
  routeRerunsCount?: number
  activeMapVersionsCount: number
}

export type TechnicalActionItem = {
  type: 'HELD_ROBOT' | 'MAP_MISMATCH' | 'POI_QUEUE' | 'ROUTE_QUEUE' | string
  severity: 'DANGER' | 'WARNING' | 'INFO' | string
  title: string
  description: string
  targetId: string | null
  linkUrl: string | null
}

export type TechnicalRobotSummary = {
  id: string
  robotCode: string
  displayName: string | null
  connectionStatus: 'CONNECTED' | 'AWAITING_DATA' | 'DISCONNECTED' | 'UNCONFIRMED' | string
  syncFresh: boolean
  lastSeenAt: string | null
  batteryPercent: number | null
  assignedMapKey: string | null
  assignedFrameId: string | null
  latestDeployedMapKey: string | null
  latestDeployedFrameId: string | null
  latestDeploymentPassed: boolean | null
  contextMismatch: boolean
  localized: boolean | null
  motionReady: boolean | null
  needsInspection: boolean
  currentTourId: string | null
  currentTourName: string | null
  currentTourState: string | null
  rowVersion: string
  hasDiagnostics: boolean
  diagnosticsFresh: boolean
  cpuPercent: number | null
  cpuTemperatureCelsius: number | null
  lidarStatus: string | null
  imuStatus: string | null
}

export type TechnicalDashboard = {
  collectedAt: string
  kpis: TechnicalKpiSummary
  actionItems: TechnicalActionItem[]
  robots: TechnicalRobotSummary[]
}

export type MemoryMetric = {
  totalBytes: number
  availableBytes: number
  usedBytes: number
  usedPercent: number
}

export type GpuMetric = {
  supported: boolean
  utilizationPercent: number | null
  temperatureCelsius: number | null
  memoryUsedPercent: number | null
  modelName: string | null
}

export type DiskMetric = {
  mountPoint: string
  totalBytes: number
  availableFreeBytes: number
  usedPercent: number
}

export type MiniPcResourcesReport = {
  cpuPercent: number | null
  memory: MemoryMetric | null
  gpu: GpuMetric | null
  disk: DiskMetric | null
  cpuTemperatureCelsius: number | null
}

export type Ros2NodeStatus = {
  nodeName: string
  state: 'ACTIVE' | 'INACTIVE' | 'UNRESPONSIVE' | string
  rateHz: number | null
}

export type Ros2SystemReport = {
  middlewareStatus: 'OK' | 'DEGRADED' | 'ERROR' | string
  nodes: Ros2NodeStatus[]
  tfValid: boolean | null
  nav2State: 'IDLE' | 'NAVIGATING' | 'ARRIVED' | 'FAILED' | 'UNKNOWN' | string | null
}

export type SensorStatus = {
  status: 'OK' | 'WARN' | 'ERROR' | 'STALE' | 'UNKNOWN' | 'NOT_EQUIPPED' | string
  message: string | null
  rateHz: number | null
  lastValidAt: string | null
}

export type ImuSensorStatus = {
  status: 'OK' | 'WARN' | 'ERROR' | 'STALE' | 'UNKNOWN' | string
  message: string | null
  yawValid: boolean | null
  firmwareRearmCount: number | null
  firmwareResetSeenCount: number | null
  outages: number
  lastValidAt: string | null
}

export type SensorHealthReport = {
  lidar: SensorStatus
  imu: ImuSensorStatus
  odometry: SensorStatus
  depthCamera: SensorStatus
}

export type RobotDiagnosticsDetail = {
  robotCode: string
  displayName: string | null
  connectionStatus: 'CONNECTED' | 'AWAITING_DATA' | 'DISCONNECTED' | 'UNCONFIRMED' | string
  assignedMapKey: string | null
  assignedFrameId: string | null
  assignedAreaName: string | null
  assignedVersionNumber: number | null
  latestDeployedMapKey: string | null
  latestDeployedFrameId: string | null
  latestDeploymentPassed: boolean | null
  needsInspection: boolean
  currentTourName: string | null
  currentTourState: string | null
  lastSeenAt: string | null
  telemetryFresh: boolean
  pose: FleetPose | null
  batteryPercent: number | null
  operationalStatus: string | null
  localized: boolean | null
  motionReady: boolean | null
  faultCode: string | null
  lastDiagnosticsReceivedAt: string | null
  diagnosticsFresh: boolean
  miniPc: MiniPcResourcesReport | null
  ros2: Ros2SystemReport | null
  sensors: SensorHealthReport | null
}

export const diagnosticsApi = {
  getDashboard: () =>
    apiClient<ApiResponse<TechnicalDashboard>>('/api/technical/dashboard').then(res => {
      if (!res.data) throw new Error(res.message || 'Không thể tải dữ liệu bảng điều khiển kỹ thuật.')
      return res.data
    }),

  getRobotDiagnostics: (robotCode: string) =>
    apiClient<ApiResponse<RobotDiagnosticsDetail>>(`/api/technical/robots/${encodeURIComponent(robotCode)}/diagnostics`).then(res => {
      if (!res.data) throw new Error(res.message || 'Không thể tải dữ liệu chẩn đoán robot.')
      return res.data
    }),
}

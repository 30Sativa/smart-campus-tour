import { apiClient } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'

export type HostMemoryMetrics = {
  totalBytes: number
  availableBytes: number
  usedBytes: number
  usedPercent: number
  swapTotalBytes: number | null
  swapUsedBytes: number | null
  swapUsedPercent: number | null
}

export type HostDiskMetrics = {
  mountPoint: string
  driveFormat: string
  totalBytes: number
  availableFreeBytes: number
  usedBytes: number
  usedPercent: number
  status: 'HEALTHY' | 'WARNING' | 'DANGER' | 'UNAVAILABLE' | string
}

export type NetworkInterfaceMetrics = {
  name: string
  description: string
  status: string
  bytesReceived: number
  bytesSent: number
}

export type HostSystemMetrics = {
  machineName: string
  osDescription: string
  osArchitecture: string
  processorCount: number
  cpuPercent: number | null
  loadAverages: number[] | null
  memory: HostMemoryMetrics
  disk: HostDiskMetrics
  network: NetworkInterfaceMetrics[]
  hostUptimeSeconds: number | null
  status: 'HEALTHY' | 'WARNING' | 'DANGER' | string
}

export type BackendRuntimeMetrics = {
  frameworkVersion: string
  environment: string
  processUptimeSeconds: number
  workingSetBytes: number
  gcTotalMemoryBytes: number
  threadCount: number
}

export type DatabaseHealthMetrics = {
  status: 'ONLINE' | 'DEGRADED' | 'UNAVAILABLE' | string
  canConnect: boolean
  latencyMs: number | null
  provider: string
  error: string | null
}

export type ContainerMetrics = {
  name: string
  state: string
  health: string
  restarts: number
  memoryUsageBytes: number | null
}

export type DockerStackMetrics = {
  status: 'ONLINE' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | string
  message: string | null
  totalContainers: number
  runningContainers: number
  unhealthyContainers: number
  containers: ContainerMetrics[]
}

export type BackupHealthMetrics = {
  status: 'HEALTHY' | 'WARNING' | 'STALE' | 'NOT_RECORDED' | string
  lastBackupTimestamp: string | null
  ageHours: number | null
  target: string | null
  sizeBytes: number | null
  message: string | null
}

export type InfrastructureHealth = {
  collectedAt: string
  host: HostSystemMetrics
  runtime: BackendRuntimeMetrics
  database: DatabaseHealthMetrics
  docker: DockerStackMetrics
  backup: BackupHealthMetrics
}

export async function getInfrastructureHealth(): Promise<InfrastructureHealth> {
  const response = await apiClient<ApiResponse<InfrastructureHealth>>('/api/admin/infrastructure/health')
  if (!response.data) {
    throw new Error(response.message || 'Không thể tải dữ liệu giám sát hạ tầng.')
  }
  return response.data
}

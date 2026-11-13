import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Layers,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { KpiRow, KpiTile } from '../../components/ui/Charts'
import { PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, SkeletonRows } from '../../features/administration/AdminUi'
import {
  getInfrastructureHealth,
  type InfrastructureHealth,
} from '../../features/administration/infrastructure/infrastructure-api'
import { ToneBadge } from '../../features/technical/TechnicalUi'
import { stamp } from '../../features/technical/technical-format'

function formatBytes(bytes: number | null | undefined, decimals = 1): string {
  if (bytes === null || bytes === undefined || isNaN(bytes) || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return '0 giây'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d} ngày`)
  if (h > 0) parts.push(`${h} giờ`)
  if (m > 0) parts.push(`${m} phút`)
  if (parts.length === 0 || s > 0) parts.push(`${s} giây`)
  return parts.slice(0, 2).join(' ')
}

export default function AdminInfrastructurePage() {
  const [autoRefresh, setAutoRefresh] = useState(true)

  const healthQuery = useQuery<InfrastructureHealth>({
    queryKey: ['admin', 'infrastructure-health'],
    queryFn: getInfrastructureHealth,
    refetchInterval: autoRefresh ? 15_000 : false,
  })

  const data = healthQuery.data
  const memory = data?.host.memory ?? null
  const diskKnown = data?.host.disk.status !== 'UNAVAILABLE'

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Giám sát"
        title="Hạ tầng máy chủ"
        description="Theo dõi tài nguyên phần cứng máy chủ AWS EC2, tiến trình API ASP.NET Core, cơ sở dữ liệu SQL Server và hệ thống Docker."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={buttonClass(autoRefresh ? 'primary' : 'secondary', 'sm')}
              onClick={() => setAutoRefresh((v) => !v)}
              title={autoRefresh ? 'Tự động làm mới mỗi 15 giây' : 'Tự động làm mới đang tắt'}
            >
              <Activity size={14} aria-hidden="true" />
              {autoRefresh ? 'Tự làm mới (15s)' : 'Tự làm mới: Tắt'}
            </button>
            <button
              type="button"
              className={buttonClass('secondary', 'sm')}
              disabled={healthQuery.isFetching}
              onClick={() => void healthQuery.refetch()}
            >
              <RefreshCw
                size={14}
                className={healthQuery.isFetching ? 'animate-spin' : ''}
                aria-hidden="true"
              />
              {healthQuery.isFetching ? 'Đang tải…' : 'Làm mới ngay'}
            </button>
          </div>
        }
      />

      {healthQuery.isPending ? (
        <section className={panelClass} aria-label="Đang tải dữ liệu hạ tầng">
          <SkeletonRows rows={8} label="Đang tải dữ liệu hạ tầng máy chủ…" />
        </section>
      ) : healthQuery.isError && !data ? (
        <AdminErrorPanel
          title="Không thể kết nối đến API giám sát hạ tầng"
          description="Máy chủ backend có thể đang khởi động lại hoặc không phản hồi. Kiểm tra lại kết nối mạng."
          onRetry={() => void healthQuery.refetch()}
        />
      ) : !data ? null : (
        <div className="space-y-4">
          {healthQuery.isError && (
            <div
              role="alert"
              className="flex items-center gap-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4 text-[13px] text-[#92400e]"
            >
              <ShieldAlert size={20} className="shrink-0" aria-hidden="true" />
              <p>
                Không cập nhật được số liệu mới. Các số bên dưới là lần đo thành công gần nhất lúc{' '}
                <strong>{stamp(data.collectedAt)}</strong>, không phải trạng thái hiện tại.
              </p>
            </div>
          )}
          {/* KPI Headline Tiles */}
          <KpiRow label="Tổng quan hạ tầng">
            <KpiTile
              label="CPU máy chủ"
              value={data.host.cpuPercent !== null ? `${data.host.cpuPercent}%` : '-'}
              note={
                data.host.cpuPercent !== null
                  ? `${data.host.processorCount} vCPUs`
                  : 'Chưa đo được (lần đo đầu hoặc không hỗ trợ)'
              }
              tone={
                (data.host.cpuPercent ?? 0) > 85
                  ? 'danger'
                  : (data.host.cpuPercent ?? 0) > 70
                    ? 'warn'
                    : 'plain'
              }
            />
            <KpiTile
              label="Bộ nhớ RAM"
              value={memory ? `${memory.usedPercent}%` : '-'}
              note={memory ? `${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}` : 'Không đo được'}
              tone={!memory ? 'plain' : memory.usedPercent > 90 ? 'danger' : memory.usedPercent > 75 ? 'warn' : 'plain'}
            />
            <KpiTile
              label="Dung lượng ổ đĩa"
              value={diskKnown ? `${data.host.disk.usedPercent}%` : '-'}
              note={diskKnown ? `Còn trống ${formatBytes(data.host.disk.availableFreeBytes)}` : 'Không đo được'}
              tone={!diskKnown ? 'plain' : data.host.disk.usedPercent > 90 ? 'danger' : data.host.disk.usedPercent > 80 ? 'warn' : 'plain'}
            />
            <KpiTile
              label="Cơ sở dữ liệu"
              value={data.database.canConnect ? 'Hoạt động' : 'Không khả dụng'}
              note={data.database.latencyMs !== null ? `${data.database.latencyMs} ms latency` : 'Mất kết nối'}
              tone={data.database.canConnect ? 'plain' : 'danger'}
            />
          </KpiRow>

          {/* Database Alert if degraded */}
          {!data.database.canConnect && (
            <div
              role="alert"
              className="flex items-center gap-3 rounded-xl border border-[#f5c8c2] bg-[#fff4f2] p-4 text-[13px] text-[#9d3428]"
            >
              <ShieldAlert size={20} className="shrink-0 text-[#b23e31]" aria-hidden="true" />
              <div>
                <p className="font-bold">Cảnh báo: Cơ sở dữ liệu SQL Server không thể truy cập!</p>
                <p className="mt-0.5 text-xs text-[#b23e31]">{data.database.error ?? 'Không thể kết nối đến máy chủ SQL.'}</p>
              </div>
            </div>
          )}

          {/* Grid Layout: Host System & Runtime */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Host System Info */}
            <section className={panelClass} aria-label="Thông tin máy chủ EC2">
              <PanelHead
                title="Máy chủ AWS EC2"
                description={`Uptime: ${formatDuration(data.host.hostUptimeSeconds)} · Giờ máy chủ: ${stamp(data.collectedAt)}`}
                action={
                  <ToneBadge tone={data.host.status === 'HEALTHY' ? 'ok' : 'warn'}>
                    {data.host.status === 'HEALTHY' ? 'Bình thường' : 'Tải cao'}
                  </ToneBadge>
                }
              />
              <div className="p-4 space-y-3">
                <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-2 text-[13px]">
                  <dt className="text-[#64748b]">Tên máy chủ</dt>
                  <dd className="font-mono font-medium text-[#0f172a] break-all">{data.host.machineName}</dd>
                  <dt className="text-[#64748b]">Hệ điều hành</dt>
                  <dd className="text-[#334155]">{data.host.osDescription} ({data.host.osArchitecture})</dd>
                  <dt className="text-[#64748b]">Số lõi vi xử lý</dt>
                  <dd className="text-[#334155]">{data.host.processorCount} vCPUs</dd>
                  {data.host.loadAverages && (
                    <>
                      <dt className="text-[#64748b]">Tải trung bình</dt>
                      <dd className="font-mono text-[#334155]">
                        {data.host.loadAverages.map((l) => l.toFixed(2)).join(' · ')} (1, 5, 15 phút)
                      </dd>
                    </>
                  )}
                  {memory && memory.swapTotalBytes !== null && memory.swapTotalBytes > 0 && (
                    <>
                      <dt className="text-[#64748b]">Bộ nhớ Swap</dt>
                      <dd className="text-[#334155]">
                        {formatBytes(memory.swapUsedBytes)} / {formatBytes(memory.swapTotalBytes)} ({memory.swapUsedPercent}%)
                      </dd>
                    </>
                  )}
                  <dt className="text-[#64748b]">Ổ đĩa chính</dt>
                  <dd className="text-[#334155]">
                    {data.host.disk.mountPoint} ({data.host.disk.driveFormat}) · Đã dùng {formatBytes(data.host.disk.usedBytes)} / {formatBytes(data.host.disk.totalBytes)} ({data.host.disk.usedPercent}%)
                  </dd>
                </dl>
              </div>
            </section>

            {/* Backend Runtime & Process */}
            <section className={panelClass} aria-label="Tiến trình Backend API">
              <PanelHead
                title="Tiến trình API Backend (.NET)"
                description={`Chạy liên tục: ${formatDuration(data.runtime.processUptimeSeconds)}`}
                action={<ToneBadge tone="info">{data.runtime.environment}</ToneBadge>}
              />
              <div className="p-4 space-y-3">
                <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-2 text-[13px]">
                  <dt className="text-[#64748b]">Runtime .NET</dt>
                  <dd className="font-medium text-[#0f172a]">{data.runtime.frameworkVersion}</dd>
                  <dt className="text-[#64748b]">Bộ nhớ Working Set</dt>
                  <dd className="font-mono text-[#334155]">{formatBytes(data.runtime.workingSetBytes)}</dd>
                  <dt className="text-[#64748b]">Bộ nhớ Managed (GC)</dt>
                  <dd className="font-mono text-[#334155]">{formatBytes(data.runtime.gcTotalMemoryBytes)}</dd>
                  <dt className="text-[#64748b]">Số luồng xử lý (Threads)</dt>
                  <dd className="text-[#334155]">{data.runtime.threadCount} threads</dd>
                  <dt className="text-[#64748b]">Provider Database</dt>
                  <dd className="text-[#334155] font-mono text-xs">{data.database.provider}</dd>
                  <dt className="text-[#64748b]">Độ trễ truy vấn DB</dt>
                  <dd className="text-[#334155] font-semibold">
                    {data.database.latencyMs !== null ? `${data.database.latencyMs} ms` : 'Không phản hồi'}
                  </dd>
                </dl>
              </div>
            </section>
          </div>

          {/* Docker & Containers */}
          <section className={panelClass} aria-label="Docker và Container">
            <PanelHead
              title="Docker & Container Stack"
              description="Trạng thái các container phục vụ dịch vụ CampusTour trên máy chủ."
              action={
                <ToneBadge tone={data.docker.status === 'ONLINE' ? 'ok' : 'muted'}>
                  {data.docker.status === 'ONLINE'
                    ? 'Khả dụng'
                    : data.docker.status === 'NOT_MONITORED'
                      ? 'Không giám sát từ API'
                      : 'Không đọc được'}
                </ToneBadge>
              }
            />
            <div className="p-4">
              {data.docker.status !== 'ONLINE' ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3 text-[13px] text-[#64748b]">
                  <Layers size={16} className="mt-0.5 shrink-0 text-[#94a3b8]" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-[#334155]">Thông tin container không khả dụng từ môi trường này.</p>
                    <p className="mt-0.5 text-xs">{data.docker.message ?? 'Không có nguồn dữ liệu container.'}</p>
                  </div>
                </div>
              ) : data.docker.containers.length === 0 ? (
                <p className="text-sm text-[#64748b]">Không có container nào đang chạy thuộc dự án campustour.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left">
                    <thead className="border-b border-[#e2e8f0]">
                      <tr>
                        <th className={thClass}>Tên Container</th>
                        <th className={thClass}>Trạng thái</th>
                        <th className={thClass}>Sức khỏe</th>
                        <th className={thClass}>Khởi động lại</th>
                        <th className={thClass}>Bộ nhớ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef1f4]">
                      {data.docker.containers.map((c) => (
                        <tr key={c.name} className={rowClass}>
                          <td className={`${tdClass} font-mono font-medium text-[#0f172a]`}>{c.name}</td>
                          <td className={tdClass}>
                            <span className="capitalize">{c.state}</span>
                          </td>
                          <td className={tdClass}>
                            <ToneBadge tone={c.health === 'healthy' ? 'ok' : c.health === 'unhealthy' ? 'danger' : 'muted'}>
                              {c.health}
                            </ToneBadge>
                          </td>
                          <td className={`${tdClass} font-mono text-xs`}>{c.restarts}</td>
                          <td className={`${tdClass} font-mono text-xs text-[#64748b]`}>{formatBytes(c.memoryUsageBytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* Network Activity & Backup Status */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Network interfaces */}
            <section className={panelClass} aria-label="Giao diện mạng">
              <PanelHead title="Lưu lượng mạng" description="Các giao diện mạng hoạt động trên máy chủ." />
              <div className="p-4">
                {data.host.network.length === 0 ? (
                  <p className="text-sm text-[#64748b]">Không có thông tin giao diện mạng.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[#e2e8f0]">
                        <tr>
                          <th className={thClass}>Giao diện</th>
                          <th className={thClass}>Trạng thái</th>
                          <th className={thClass}>Dữ liệu nhận</th>
                          <th className={thClass}>Dữ liệu gửi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eef1f4]">
                        {data.host.network.map((net) => (
                          <tr key={net.name} className={rowClass}>
                            <td className={`${tdClass} font-mono font-medium`}>{net.name}</td>
                            <td className={tdClass}>
                              <ToneBadge tone={net.status === 'Up' ? 'ok' : 'muted'}>{net.status}</ToneBadge>
                            </td>
                            <td className={`${tdClass} font-mono text-[#64748b]`}>{formatBytes(net.bytesReceived)}</td>
                            <td className={`${tdClass} font-mono text-[#64748b]`}>{formatBytes(net.bytesSent)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {/* Backup status */}
            <section className={panelClass} aria-label="Trạng thái sao lưu">
              <PanelHead
                title="Bản sao lưu cơ sở dữ liệu"
                description="Ghi nhận từ tiến trình sao lưu tự động hàng ngày."
                action={
                  <ToneBadge
                    tone={
                      data.backup.status === 'HEALTHY'
                        ? 'ok'
                        : data.backup.status === 'STALE'
                          ? 'warn'
                          : 'muted'
                    }
                  >
                    {data.backup.status === 'HEALTHY'
                      ? 'Đạt'
                      : data.backup.status === 'STALE'
                        ? 'Cũ (>26h)'
                        : data.backup.status === 'INVALID'
                          ? 'Bằng chứng không hợp lệ'
                          : 'Chưa xác nhận được'}
                  </ToneBadge>
                }
              />
              <div className="p-4 space-y-3 text-[13px]">
                <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-2">
                  <dt className="text-[#64748b]">Lần sao lưu gần nhất</dt>
                  <dd className="font-mono text-[#0f172a]">
                    {data.backup.lastBackupTimestamp ?? 'Chưa ghi nhận'}
                  </dd>
                  <dt className="text-[#64748b]">Thời gian trôi qua</dt>
                  <dd className="text-[#334155]">
                    {data.backup.ageHours !== null ? `${data.backup.ageHours} giờ trước` : '-'}
                  </dd>
                  <dt className="text-[#64748b]">Nơi lưu trữ</dt>
                  <dd className="font-mono text-xs text-[#334155] break-all">
                    {data.backup.target ?? '-'}
                  </dd>
                  <dt className="text-[#64748b]">Kích thước bản sao</dt>
                  <dd className="font-mono text-[#334155]">
                    {data.backup.sizeBytes !== null ? formatBytes(data.backup.sizeBytes) : '-'}
                  </dd>
                </dl>
                {data.backup.message && (
                  <p className="text-xs text-[#64748b] pt-1 border-t border-[#eef1f4]">
                    {data.backup.message}
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </AdminPage>
  )
}

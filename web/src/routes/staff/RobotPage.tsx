import { Cpu } from 'lucide-react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import type { ApiResponse } from '../../api/contracts/shared'
import { LoadingPanel, PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { formatDateTime } from '../../components/ui/date-time'
import { EmptyState } from '../../components/ui/EmptyState'
import { buttonClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import type { PhysicalRobotConnectionStatus } from '../../features/technical/api/technical'
import { connectionStatusLabel, errorText } from '../../features/technical/technical-format'

type StaffRobot = { id: string; robotCode: string; displayName: string | null; connectionStatus: PhysicalRobotConnectionStatus; lastSyncReceivedAt: string | null }

const REFETCH_MS = 15_000

/**
 * The physical robots and their connection, as the backend reports them. Telemetry has no read API here yet.
 * Staff has no robot detail page (diagnostics are Technical Staff's), so a row is plain text, not something to click.
 */
export default function RobotPage() {
  const robots = useQuery({ queryKey: ['staff', 'physical-robots'], refetchInterval: REFETCH_MS,
    queryFn: () => apiClient<ApiResponse<StaffRobot[]>>('/api/staff/physical-robots').then(response => response.data ?? []) })
  const data = robots.data ?? []

  return (
    <StaffPage>
      <PageHeader eyebrow="Vận hành" title="Robot & thiết bị" description="Robot chưa kết nối thì báo Kỹ thuật kiểm tra."
        action={<Link to="/staff/digital-twin" className={buttonClass('secondary', 'md')}><Cpu size={15} aria-hidden="true" />Mô phỏng 3D Digital Twin</Link>} />
      <section className={panelClass} aria-label="Danh sách robot">
        {robots.isPending ? <div className="p-4"><LoadingPanel /></div>
          : robots.isError ? <div className="p-4"><ErrorPanel error={new Error(errorText(robots.error))} onRetry={() => void robots.refetch()} /></div>
          : data.length === 0 ? <EmptyState variant="empty" title="Chưa có robot vật lý nào được đăng ký." />
          : <div className="overflow-x-auto"><table className="w-full text-left" aria-label="Danh sách robot">
            <thead className="border-b border-[#e2e8f0]"><tr>{['Robot', 'Mã robot', 'Kết nối', 'Lần đồng bộ gần nhất'].map(label => <th key={label} scope="col" className={thClass}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#eef1f4]">{data.map(robot => <tr key={robot.id}>
              <td className={`${tdClass} font-semibold text-[#0f172a]`}>{robot.displayName ?? '-'}</td>
              <td className={`${tdClass} font-mono text-xs`}>{robot.robotCode}</td>
              <td className={tdClass}>{connectionStatusLabel(robot.connectionStatus)}</td>
              <td className={`${tdClass} text-xs text-muted tabular-nums`}>{formatDateTime(robot.lastSyncReceivedAt)}</td>
            </tr>)}</tbody>
          </table></div>}
      </section>
    </StaffPage>
  )
}

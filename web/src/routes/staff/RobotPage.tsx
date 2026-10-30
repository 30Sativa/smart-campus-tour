import { Cpu } from 'lucide-react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import type { ApiResponse } from '../../api/contracts/shared'
import { KpiRow, KpiTile } from '../../components/ui/Charts'
import { LoadingPanel, PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { EmptyPanel, ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import type { PhysicalRobotConnectionStatus } from '../../features/technical/api/technical'
import { connectionStatusLabel, errorText, stamp } from '../../features/technical/technical-format'

type StaffRobot = { id: string; robotCode: string; displayName: string | null; connectionStatus: PhysicalRobotConnectionStatus; lastSyncReceivedAt: string | null }

const REFETCH_MS = 15_000

/** The physical robots and their connection, as the backend reports them. Telemetry has no read API here yet. */
export default function RobotPage() {
  const robots = useQuery({ queryKey: ['staff', 'physical-robots'], refetchInterval: REFETCH_MS,
    queryFn: () => apiClient<ApiResponse<StaffRobot[]>>('/api/staff/physical-robots').then(response => response.data ?? []) })
  const data = robots.data ?? []
  const connected = data.filter(robot => robot.connectionStatus === 'CONNECTED').length

  return (
    <StaffPage>
      <PageHeader eyebrow="Điều hành" title="Robot & Thiết bị" description="Các robot vật lý đã đăng ký và kết nối gần nhất của chúng."
        action={<Link to="/staff/digital-twin" className={buttonClass('secondary', 'md')}><Cpu size={15} aria-hidden="true" />Mô phỏng 3D Digital Twin</Link>} />
      <KpiRow label="Tổng hợp robot">
        <KpiTile label="Robot đã đăng ký" value={robots.data ? data.length : '-'} />
        <KpiTile label="Đang kết nối" value={robots.data ? connected : '-'} />
        <KpiTile label="Chưa kết nối" value={robots.data ? data.length - connected : '-'} tone={data.length - connected ? 'danger' : 'plain'} />
      </KpiRow>
      <section className={`${panelClass} mt-4`} aria-label="Danh sách robot">
        {robots.isPending ? <div className="p-4"><LoadingPanel /></div>
          : robots.isError ? <div className="p-4"><ErrorPanel error={new Error(errorText(robots.error))} onRetry={() => void robots.refetch()} /></div>
          : data.length === 0 ? <div className="p-4"><EmptyPanel>Chưa có robot vật lý nào được đăng ký.</EmptyPanel></div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left" aria-label="Danh sách robot">
            <thead className="border-b border-[#e2e8f0]"><tr>{['Robot', 'Mã robot', 'Kết nối', 'Lần đồng bộ gần nhất'].map(label => <th key={label} scope="col" className={thClass}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#eef1f4]">{data.map(robot => <tr key={robot.id} className={rowClass}>
              <td className={`${tdClass} font-semibold text-[#0f172a]`}>{robot.displayName ?? '-'}</td>
              <td className={`${tdClass} font-mono text-xs`}>{robot.robotCode}</td>
              <td className={tdClass}>{connectionStatusLabel(robot.connectionStatus)}</td>
              <td className={`${tdClass} text-xs text-[#64748b]`}>{robot.lastSyncReceivedAt ? stamp(robot.lastSyncReceivedAt) : '-'}</td>
            </tr>)}</tbody>
          </table></div>}
      </section>
    </StaffPage>
  )
}

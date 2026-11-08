import { PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import type { VersionedRoute } from '../administration/routes/versioned-api'
import { errorText } from './technical-format'
import { useRouteRerunQueue } from './technical-hooks'

/** Routes that passed before dwell time was measured. They stay out of scheduling until a new run is recorded. */
export function RouteRerunSection({ onRecord }: { onRecord: (route: VersionedRoute) => void }) {
  const queue = useRouteRerunQueue()
  if (queue.isError) return <div role="alert" className="mb-3 space-y-2 rounded-2xl border border-[#f5c8c2] bg-[#fff4f2] p-4 text-[13px] text-[#b23e31]"><p>{errorText(queue.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void queue.refetch()}>Tải lại danh sách cần chạy lại</button></div>
  if (!queue.data?.length) return null
  return <section className={`${panelClass} mb-3`} aria-label="Cần chạy lại">
    <PanelHead title="Cần chạy lại" description="Lần chạy đạt của các tuyến này đo theo cách cũ nên chưa xếp lịch được. Ghi một lần chạy mới, tính cả thời gian dừng." />
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[560px] text-left">
        <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Tuyến</th><th className={thClass}>Bản đồ</th><th className={thClass}>Điểm dừng</th><th className={thClass}><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody className="divide-y divide-[#eef1f4]">
          {queue.data.map(route => <tr key={route.revisionId} className={rowClass}>
            <td className={tdClass}><span className="font-semibold text-[#0f172a]">{route.name}</span><p className="text-[11.5px] text-[#64748b]">Phiên bản {route.revisionNumber}</p></td>
            <td className={`${tdClass} font-mono text-xs`}>{route.mapKey}</td>
            <td className={`${tdClass} text-xs text-[#64748b]`}>{route.stops.length} điểm</td>
            <td className={`${tdClass} text-right`}><button type="button" className={buttonClass('primary', 'sm')} aria-label={`Ghi lần chạy mới ${route.name}`} onClick={() => onRecord(route)}>Ghi lần chạy mới</button></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>
}

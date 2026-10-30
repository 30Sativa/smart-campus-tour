import { Link } from 'react-router'
import { MapPinOff, MapPinPlus, Plus } from 'lucide-react'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminPage, SkeletonRows } from '../../../features/administration/AdminUi'
import { ToneBadge } from '../../../features/technical/TechnicalUi'
import { useMapVersions, usePoiProposals } from '../../../features/technical/technical-hooks'
import { mapCheckLabel, poiStatus, yawDegrees } from '../../../features/technical/poi-labels'

export default function StaffManagePoisPage() {
  const proposals = usePoiProposals()
  const maps = useMapVersions()
  const mapItems = maps.data ?? []
  const eligibleCount = mapItems.filter(item => item.canUseForPoiPreparation).length
  const blocked = !maps.isPending && !maps.error && eligibleCount === 0
  const mapName = (mapVersionId: string, fallback: string) => {
    const found = mapItems.find(item => item.map.id === mapVersionId)?.map
    return found ? `${found.areaName} · v${found.versionNumber}` : fallback
  }

  return <AdminPage>
    <PageHeader eyebrow="Chuẩn bị Tour" title="Điểm tham quan (POI)" description="Đánh dấu các điểm robot sẽ dừng trên bản đồ rồi gửi kỹ thuật viên kiểm chứng. Chỉ điểm đã đạt mới dùng được khi tạo tuyến."
      action={blocked
        ? <span title="Cần ít nhất một bản đồ đạt kiểm tra kỹ thuật"><button type="button" disabled className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo điểm mới</button></span>
        : <Link to="/staff/manage/pois/new" className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo điểm mới</Link>} />
    <section className={`${panelClass} overflow-hidden`} aria-label="Danh sách điểm tham quan">
      {proposals.isPending ? <SkeletonRows rows={4} /> : proposals.error ? <p className="p-4 text-sm text-[#b42318]" role="alert">Không tải được danh sách điểm tham quan.</p> : !proposals.data?.length ? (
        blocked ? <div className="px-6 py-10 text-center">
          <MapPinOff size={28} className="mx-auto text-[#b7791f]" aria-hidden="true" />
          <h2 className="mt-3 text-[15px] font-semibold text-[#0f172a]">Chưa thể tạo điểm tham quan</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#64748b]">Cần ít nhất một bản đồ đã được kỹ thuật viên kiểm tra đạt. Hãy liên hệ kỹ thuật viên để kiểm tra các bản đồ bên dưới.</p>
          {mapItems.length > 0 && <ul className="mx-auto mt-4 max-w-md divide-y divide-[#eef1f4] rounded-xl border border-[#e2e8f0] text-left text-sm">
            {mapItems.map(item => <li key={item.map.id} className="flex items-center justify-between gap-3 px-3 py-2"><span className="text-[#334155]">{item.map.areaName} · v{item.map.versionNumber}</span><ToneBadge tone={item.technicalCheckStatus === 'FAILED' ? 'danger' : 'warn'}>{mapCheckLabel(item.technicalCheckStatus)}</ToneBadge></li>)}
          </ul>}
          {mapItems.length === 0 && <p className="mt-3 text-sm text-[#64748b]">Hệ thống chưa có bản đồ nào được tải lên.</p>}
        </div> : <div className="px-6 py-10 text-center">
          <MapPinPlus size={28} className="mx-auto text-[#2d719e]" aria-hidden="true" />
          <h2 className="mt-3 text-[15px] font-semibold text-[#0f172a]">Chưa có điểm tham quan nào</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#64748b]">Có {eligibleCount} bản đồ sẵn sàng. Tạo điểm đầu tiên bằng cách chọn vị trí trên bản đồ.</p>
          <Link to="/staff/manage/pois/new" className={`${buttonClass('primary')} mt-4`}><Plus size={16} aria-hidden="true" />Tạo điểm mới</Link>
        </div>
      ) :
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-[#e2e8f0] text-xs text-[#64748b]"><tr><th className="p-3 font-semibold">Điểm</th><th className="p-3 font-semibold">Bản đồ</th><th className="p-3 font-semibold">Trạng thái</th><th className="p-3 font-semibold">Vị trí</th><th className="p-3"><span className="sr-only">Thao tác</span></th></tr></thead>
          <tbody>{proposals.data.map(({ id, currentRevision, revision }) => {
            const state = poiStatus(revision)
            return <tr key={id} className="border-t border-[#eef1f4]">
              <td className="p-3"><b className="text-[#0f172a]">{revision.name}</b><p className="text-xs text-[#64748b]">{revision.purpose}</p></td>
              <td className="p-3">{mapName(revision.mapVersionId, revision.mapKey)}</td>
              <td className="p-3"><ToneBadge tone={state.tone}>{state.label}</ToneBadge><p className="mt-0.5 text-xs text-[#64748b]">Phiên bản {currentRevision}</p></td>
              <td className="p-3 font-mono text-xs text-[#334155]">{revision.x.toFixed(2)}, {revision.y.toFixed(2)} · {yawDegrees(revision.yaw)}°</td>
              <td className="p-3 text-right"><Link to={`/staff/manage/pois/${id}`} className={buttonClass('secondary', 'sm')}>Mở</Link></td>
            </tr>
          })}</tbody>
        </table></div>}
    </section>
  </AdminPage>
}

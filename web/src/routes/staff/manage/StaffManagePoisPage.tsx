import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminPage, Notice, SkeletonRows } from '../../../features/administration/AdminUi'
import { usePoiProposals } from '../../../features/technical/technical-hooks'

const status = (value: string) => value === 'PASS' ? 'Đã kiểm chứng' : value === 'FAIL' ? 'Không đạt · cần sửa' : 'Chưa kiểm chứng'

export default function StaffManagePoisPage() {
  const proposals = usePoiProposals()
  return <AdminPage>
    <PageHeader eyebrow="Chuẩn bị Tour · POI" title="Đề xuất POI" description="Tạo và gửi revision gắn với một phiên bản map. Chỉ Technical Staff mới ghi nhận kiểm chứng; submit không đồng nghĩa PASS."
      action={<Link to="/staff/manage/pois/new" className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo đề xuất</Link>} />
    <div className="mb-4"><Notice tone="info">Đây là luồng proposal/versioned. POI chưa được kỹ thuật kiểm chứng không đủ làm bằng chứng cho tuyến; scheduling vẫn phụ thuộc đợt chuyển đổi riêng.</Notice></div>
    <section className={`${panelClass} overflow-hidden`} aria-label="Danh sách đề xuất POI">
      {proposals.isPending ? <SkeletonRows rows={4} /> : proposals.error ? <p className="p-4 text-sm text-[#b42318]" role="alert">Không tải được đề xuất POI.</p> : !proposals.data?.length ?
        <p className="p-8 text-center text-sm text-[#64748b]">Chưa có đề xuất. Tạo đề xuất mới từ một phiên bản map đã upload.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr><th className="p-3">POI</th><th className="p-3">Map version</th><th className="p-3">Revision</th><th className="p-3">Trạng thái</th><th className="p-3">Tọa độ</th><th className="p-3"></th></tr></thead>
          <tbody>{proposals.data.map(({ id, currentRevision, revision }) => <tr key={id} className="border-t border-[#e2e8f0]">
            <td className="p-3"><b>{revision.name}</b><p className="text-xs text-[#64748b]">{revision.purpose}</p></td>
            <td className="p-3 font-mono text-xs">{revision.mapKey}</td><td className="p-3">r{currentRevision}</td>
            <td className="p-3">{status(revision.navigationStatus)}{revision.isSubmitted ? ' · đã gửi' : ' · bản nháp'}</td>
            <td className="p-3 font-mono text-xs">{revision.x}, {revision.y}, {revision.yaw}</td>
            <td className="p-3 text-right"><Link to={`/staff/manage/pois/${id}`} className={buttonClass('secondary', 'sm')}>Mở</Link></td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </AdminPage>
}

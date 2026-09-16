import { Cuboid } from 'lucide-react'
import { useOpsTwin } from '../../features/operations/operations-hooks'
import { ErrorPanel, LoadingPanel, PageHeader, panelClass, StatusPill } from '../../features/operations/OperationsUi'
import { DigitalTwinCanvas } from '../../three/DigitalTwinCanvas'

export default function DigitalTwinPage() {
  const twin = useOpsTwin()
  return <div className="min-h-full bg-[#f1f6fe] px-4 py-5 sm:px-6 lg:px-8 lg:py-7"><div className="mx-auto w-full max-w-[1500px]">
    <PageHeader icon={<Cuboid size={14} />} title="Digital Twin (chỉ đọc)" description="Nhân viên chỉ xem trạng thái mô phỏng. Không có thao tác tạo, sửa, chạy, duyệt, áp dụng hoặc xuất bản kịch bản Digital Twin ở khu vực này." />
    <section className={`${panelClass} mb-5`}><div className="border-b border-[#edf2fa] px-5 py-4"><h3 className="font-bold text-[#40546f]">Khung nhìn 3D</h3><p className="mt-1 text-xs text-[#8a98ac]">Khung dựng hình R3F. Chưa gắn mô hình khuôn viên và pose thật — chưa có contract backend → browser cho twin.</p></div><DigitalTwinCanvas /></section>
    <section className={panelClass}><div className="border-b border-[#edf2fa] px-5 py-4"><h3 className="font-bold text-[#40546f]">Trạng thái twin / AMR</h3><p className="mt-1 text-xs text-[#8a98ac]">Khu vực vận hành an toàn, tất cả thao tác được kiểm soát bằng RBAC.</p></div>
      {twin.isPending ? <div className="p-5"><LoadingPanel /></div> : twin.isError ? <div className="p-5"><ErrorPanel error={twin.error} /></div> : twin.data.length === 0 ? <p className="p-10 text-center text-sm font-medium text-[#8a98ac]">Chưa có dữ liệu Digital Twin.</p> : <div className="divide-y divide-[#edf2fa]">{twin.data.map((amr) => <div key={amr.id} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="text-sm font-bold text-[#40546f]">{amr.name}</p><p className="mt-1 text-xs text-[#71819a]">POI {amr.currentPoi || 'Không có'} · {amr.latitude != null && amr.longitude != null ? `${amr.latitude.toFixed(4)}, ${amr.longitude.toFixed(4)}` : 'Không có tọa độ'}</p></div><div className="flex flex-wrap items-center justify-end gap-2"><StatusPill value={amr.operationalState} /><StatusPill value={amr.connectionState} /></div></div>)}</div>}
    </section>
  </div></div>
}

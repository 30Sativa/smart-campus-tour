import { useStaffTwin } from '../../features/staff/staff-hooks'
import { ErrorPanel, LoadingPanel, PageHeader, panelClass, StatusBadge } from '../../features/staff/StaffUi'
import { SimulatorPreview } from '../../features/digital-twin/SimulatorPreview'

export default function DigitalTwinPage() {
  const twin = useStaffTwin()
  return <div className="min-h-full bg-[#eef2f8] px-4 py-5 sm:px-6 lg:px-8 lg:py-7"><div className="mx-auto w-full max-w-[1500px]">
    <PageHeader eyebrow="Vận hành tour" title="Simulator robot" description="Xem trước chuyển động robot trong không gian 3D. Phát thử tuyến demo và theo dõi vị trí trước khi kết nối robot thật." />
    <SimulatorPreview />
    <section className={panelClass}><div className="border-b border-[#edf2fa] px-5 py-4"><h3 className="font-bold text-[#40546f]">Danh sách AMR</h3><p className="mt-1 text-xs text-[#8a98ac]">Dữ liệu danh sách từ hệ thống vận hành, tách biệt với robot minh họa phía trên.</p></div>
      {twin.isPending ? <div className="p-5"><LoadingPanel /></div> : twin.isError ? <div className="p-5"><ErrorPanel error={twin.error} onRetry={twin.refetch} /></div> : twin.data.length === 0 ? <p className="p-10 text-center text-sm font-medium text-[#8a98ac]">Chưa có dữ liệu Digital Twin.</p> : <div className="divide-y divide-[#edf2fa]">{twin.data.map((amr) => <div key={amr.id} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="text-sm font-bold text-[#40546f]">{amr.name}</p><p className="mt-1 text-xs text-[#71819a]">POI {amr.currentPoi || 'Không có'} · {amr.latitude != null && amr.longitude != null ? `${amr.latitude.toFixed(4)}, ${amr.longitude.toFixed(4)}` : 'Không có tọa độ'}</p></div><div className="flex flex-wrap items-center justify-end gap-2"><StatusBadge value={amr.operationalState} /><StatusBadge value={amr.connectionState} /></div></div>)}</div>}
    </section>
  </div></div>
}

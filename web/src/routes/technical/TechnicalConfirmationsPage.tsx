import { LoadingPanel, PageHeader } from '../../components/ui/ConsolePrimitives'
import { useRouteConfirmations } from '../../features/technical/technical-hooks'
import { Notice, RouteBoard, TechnicalPage } from '../../features/technical/TechnicalUi'

/**
 * Version-bound technical confirmation (SRS v1.9 §3.2.b, demo acceptance 6).
 * A confirmation covers exactly one map–POI–route version. A new
 * movement-affecting version starts unconfirmed and cannot be scheduled until
 * reconfirmed; older confirmed versions stay usable as tested.
 */
export default function TechnicalConfirmationsPage() {
  const list = useRouteConfirmations()
  return (
    <TechnicalPage>
      <PageHeader eyebrow="Kỹ thuật" title="Xác nhận tuyến" description="Staff soạn tuyến. Nhân viên kỹ thuật chạy thử cùng người vận hành rồi xác nhận cho đúng bộ version map–POI–tuyến. Staff chỉ xếp lịch được version đã xác nhận." />
      {list.isPending ? <LoadingPanel label="Đang tải version tuyến…" /> : (
        <div className="space-y-4">
          <RouteBoard routes={list.data ?? []} />
          <div className="grid gap-3 md:grid-cols-2">
            <Notice tone="danger"><strong>Thay đổi ảnh hưởng di chuyển</strong> (thêm/bớt điểm dừng, đổi thứ tự, đổi map) không thừa hưởng xác nhận cũ và bị chặn xếp lịch.</Notice>
            <Notice tone="ok"><strong>Chỉ sửa thuyết minh</strong> thì giữ xác nhận, không cần chạy lại navigation.</Notice>
          </div>
        </div>
      )}
    </TechnicalPage>
  )
}

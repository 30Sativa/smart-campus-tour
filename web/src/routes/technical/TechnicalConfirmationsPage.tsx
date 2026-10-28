import { PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { Note, TechnicalPage } from '../../features/technical/TechnicalUi'

/** Route certification has no backend use case yet; keep this screen non-mutating until that contract exists. */
export default function TechnicalConfirmationsPage() {
  return <TechnicalPage>
    <PageHeader eyebrow="Tuyến" title="Xác nhận toàn tuyến" description="Việc thử và xác nhận toàn tuyến cần được triển khai sau khi contract route certification được chốt." />
    <section className={panelClass} aria-label="Route certification đang chờ">
      <PanelHead title="Chưa có API xác nhận tuyến" description="Không ghi hoặc hiển thị xác nhận mẫu như trạng thái production." />
      <p className="px-3.5 py-3 text-[13px] leading-6 text-[#475569]">SRS yêu cầu Kỹ thuật phối hợp với operator để thử toàn tuyến và chỉ cho phép lên lịch khi xác nhận gắn với đúng phiên bản map, POI và route. Backend hiện mới lưu kiểm chứng từng POI. Route certification vẫn pending; màn này không cung cấp thao tác xác nhận giả.</p>
    </section>
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <Note tone="danger"><b>Thay đổi ảnh hưởng di chuyển</b> (thêm, bớt, đổi thứ tự điểm dừng, đổi map) không thừa hưởng xác nhận cũ.</Note>
      <Note tone="ok"><b>Chỉ sửa thuyết minh</b> thì giữ xác nhận, không cần chạy lại navigation.</Note>
    </div>
  </TechnicalPage>
}

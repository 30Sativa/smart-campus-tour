import { PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { Note, TechnicalPage } from '../../features/technical/TechnicalUi'

/** Contract status is informational here; this screen is not yet wired to route test-run actions. */
export default function TechnicalConfirmationsPage() {
  return <TechnicalPage>
    <PageHeader eyebrow="Tuyến" title="Xác nhận toàn tuyến" description="Backend đã có API queue và test-run để ghi nhận kiểm chứng thủ công; màn hình này chưa được nối đầy đủ với contract đó." />
    <section className={panelClass} aria-label="Route certification đang chờ">
      <PanelHead title="Màn hình chưa kết nối thao tác test-run" description="Contract backend đã tồn tại; workspace này chưa ghi nhận kết quả kiểm chứng." />
      <p className="px-3.5 py-3 text-[13px] leading-6 text-[#475569]">Backend hỗ trợ đọc queue tuyến và ghi nhận test-run thủ công theo revision. API chỉ lưu dữ liệu bằng chứng do người vận hành gửi, không chứng minh robot đã chạy thật; việc có API hoặc bản ghi test-run cũng không tự làm tuyến READY. SRS yêu cầu kiểm chứng đúng phiên bản map, POI và route trước khi đủ điều kiện lên lịch. Màn này hiện không cung cấp thao tác xác nhận.</p>
    </section>
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <Note tone="danger"><b>Thay đổi ảnh hưởng di chuyển</b> (thêm, bớt, đổi thứ tự điểm dừng, đổi map) không thừa hưởng xác nhận cũ.</Note>
      <Note tone="ok"><b>Chỉ sửa thuyết minh</b> thì giữ xác nhận, không cần chạy lại navigation.</Note>
    </div>
  </TechnicalPage>
}

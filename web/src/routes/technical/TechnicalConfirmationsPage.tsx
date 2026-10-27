import { PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { TechnicalPage } from '../../features/technical/TechnicalUi'

/** Route certification has no backend use case yet; keep this screen non-mutating until that contract exists. */
export default function TechnicalConfirmationsPage() {
  return <TechnicalPage>
    <PageHeader eyebrow="Kỹ thuật" title="Xác nhận toàn tuyến" description="Việc thử và xác nhận toàn tuyến cần được triển khai sau khi contract route certification được chốt." />
    <section className={panelClass} aria-label="Route certification đang chờ">
      <PanelHead title="Chưa có API xác nhận tuyến" description="Không ghi hoặc hiển thị xác nhận mẫu như trạng thái production." />
      <p className="p-5 text-sm leading-6 text-[#475569]">SRS yêu cầu Kỹ thuật phối hợp với operator để thử toàn tuyến và chỉ cho phép lên lịch khi xác nhận gắn với đúng phiên bản map, POI và route. Backend hiện mới lưu kiểm chứng từng POI. Route certification vẫn pending; màn này không cung cấp thao tác xác nhận giả.</p>
    </section>
  </TechnicalPage>
}

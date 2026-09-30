# ADR-0011: Chỉ dùng dữ liệu học sinh cho đăng ký và thống kê Tour

- Ngày: 30/09/2026.
- Trạng thái: **nhóm chấp nhận**; GVHD xem lại ở Review 2; chưa triển khai.
- Phạm vi: dữ liệu trong Excel phục vụ đăng ký, gửi/quản lý lời mời và thống kê vận hành Tour. V1 không dùng để liên hệ tuyển sinh sau Tour, không xây CRM hoặc quy trình quản lý đồng ý tuyển sinh.
- ADR này thay thế bản nháp ADR-0011 trước đó về liên hệ tuyển sinh, đồng ý riêng và thời hạn 90 ngày. Bản nháp đó chưa được triển khai.

## Context

Nhóm xác nhận mục tiêu của dữ liệu học sinh là tổ chức lượt tham quan và biết mức sử dụng hệ thống trong buổi Tour. Nhu cầu này không kéo theo mục đích tiếp thị/tuyển sinh sau Tour. Thống kê lời mời vào phòng là số lượt cấp quyền theo dòng đã duyệt, không chứng minh danh tính, số người trong phòng xem chung, mức quan tâm tuyển sinh hay attendance thực tế.

## Decision

- Excel giữ thông tin tối thiểu đã cần cho lời mời: loại dòng (`CA_NHAN` hoặc `DIEM_XEM_CHUNG`), họ tên/tên điểm xem, email và lớp tùy chọn. Email dùng gửi mã và hỗ trợ quyền truy cập trong Tour.
- Một dòng `DIEM_XEM_CHUNG` đại diện một máy chiếu/phòng xem và một session; không yêu cầu danh sách học sinh chỉ xem chung, không suy số người trong phòng từ dòng này.
- Dữ liệu không được dùng để liên hệ tuyển sinh sau Tour, gửi marketing, chấm điểm học sinh hoặc xây hồ sơ tuyển sinh. Không thêm checkbox đồng ý tuyển sinh, màn quyền dữ liệu từng dòng, chức năng rút consent hay CRM vào V1.
- Thống kê cơ sở giữ đúng các số đã chốt trong scope: Tour `COMPLETED`/`CANCELLED`, kết quả gửi email mà dịch vụ trả về (chấp nhận gửi/gửi lỗi), và lời mời đã vào phòng thành công tính một lần cho mỗi dòng đã duyệt; phân biệt cá nhân với điểm xem chung. Không suy attendance, số người xem chung, email đã nhận/đã đọc hoặc mức quan tâm tuyển sinh.
- Không bổ sung `active sessions`, `peak concurrent sessions` hay các số liệu mới khác trong quyết định này. Có thể xem số browser/câu hỏi đồng thời như kết quả của bài kiểm thử tải riêng, không mặc định là analytics nghiệp vụ hoặc P1.
- Dữ liệu danh tính/lời mời chỉ được giữ trong thời gian cần cho đăng ký, quyền truy cập và hỗ trợ Tour theo cấu hình vận hành. Sau khi các mục đích này hết hạn, xóa hoặc khử định danh bản sao vận hành khi phù hợp; giữ thống kê tổng hợp không nhận diện cá nhân và audit kỹ thuật không chứa email, mã truy cập hay roster. Thời hạn vận hành cụ thể phải được xác định trước khi dùng dữ liệu thật; V1 không đặt hạn tuyển sinh 90 ngày.
- Trước khi dùng dữ liệu thật, nhóm/đơn vị vận hành xác nhận quyền cung cấp và cách xử lý dữ liệu phù hợp với hoàn cảnh triển khai. Demo dùng dữ liệu giả hoặc dữ liệu được cung cấp phù hợp.

## Consequences

Không cần workflow consent/tuyển sinh, công cụ rút consent, xử lý yêu cầu xóa chuyên biệt, màn quản lý quyền theo từng dòng hoặc backup-erasure workflow trong V1. Các luồng Excel, invitation, email, quyền truy cập và thống kê cơ sở vẫn nằm trong scope. Nếu sau này cần liên hệ tuyển sinh, phải có quyết định scope và đánh giá riêng trước khi thu thập/dùng dữ liệu cho mục đích đó.

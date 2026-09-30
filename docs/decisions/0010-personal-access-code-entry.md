# ADR-0010: Link trang Tour, mã truy cập riêng và session browser

- Ngày: 30/09/2026.
- Trạng thái: **nhóm chấp nhận**; GVHD sẽ xem lại ở Review 2; chưa triển khai.
- Thay thế: lựa chọn link bí mật vào trực tiếp trong ADR-0009. Giữ các quyết định khác của ADR-0009.
- Phạm vi: nghiệp vụ và tích hợp `backend/`–`web/`; chưa thay schema hoặc công bố API mới.

## Context

Nhóm muốn giữ Excel do đại diện gửi để tổ chức đăng ký và cấp mã riêng cho từng lời mời; cách dùng dữ liệu được giới hạn thêm tại ADR-0011. Cần phân biệt buổi Tour với session browser, và phân biệt gửi lại thư bị mất với thu hồi mã bị lộ. Link bí mật tự cấp quyền ở quyết định trước không còn là luồng được chọn.

Một số hệ thống bảo vệ email quét URL trước khi thư được giao, như [Microsoft Safe Links](https://learn.microsoft.com/en-us/defender-office-365/safe-links-about). Rủi ro thiết kế suy ra: **nếu** backend tự cấp/chiếm session ngay khi mở URL bí mật, lượt quét có thể chiếm phiên trước học sinh. Vì vậy, mở link trang Tour không tạo session; cần thao tác gửi mã hợp lệ. Đây là tránh rủi ro cấp phiên do mở URL tự động, không khẳng định mọi bộ lọc thư đều chiếm phiên hoặc mọi thiết kế magic link đều mắc lỗi này.

## Decision

### Luồng chính

```text
Đại diện gửi Excel → Admin duyệt
→ Mỗi email đã duyệt nhận link trang Tour + access code riêng
→ Mở link → nhập mã → server kiểm tra → cấp session
→ Phòng chờ nếu chưa Start / live nếu RUNNING
```

- Excel giữ `LoaiDong` (`CA_NHAN`/`DIEM_XEM_CHUNG`), `HoTen`, `Email` bắt buộc; `Lop` tùy chọn. Đây là mẫu mục tiêu, chưa phải parser đã có.
- **Tour** là buổi tham quan; **lời mời** gắn dòng Excel đã duyệt với Tour; **access code** là bí mật riêng để xin quyền; **session** là phiên truy cập browser do server cấp. Không thêm một mã phòng chung làm điều kiện vào.
- Link chỉ mở trang Tour, không chứa mã bí mật hoặc tự cấp quyền. Email gồm lịch, link, mã, hạn dùng và hướng dẫn hỗ trợ. Cho sao chép/dán mã; không nhập lại email/tên/lớp, không account Student hoặc OTP bổ sung.
- Trong email và giao diện Student, thống nhất nhãn **“Mã truy cập”**, không in mã đoàn hoặc dùng nhiều tên cho cùng ô nhập. Tài liệu kỹ thuật có thể gọi là access code; đây vẫn là mã riêng của từng lời mời. Không đưa dữ liệu cá nhân vào URL.
- Gửi ngay sau duyệt; mã dùng lại trong hạn lời mời, không hết hiệu lực chỉ vì đã nhập một lần hoặc mở trước ngày. Mã hợp lệ vẫn phải kiểm tra đúng Tour, approval, trạng thái, hạn và thu hồi tại server.
- Session hợp lệ: reload/quay lại/reconnect không nhập mã lại. Logout/hết session: nhập lại mã còn hiệu lực. Mất mạng giữ session trong khoảng hữu hạn; đóng tab không đồng nghĩa logout.
- Mỗi lời mời tối đa một session browser đang hoạt động. Giữ phiên trước, từ chối browser cạnh tranh; tab chung session không là người mới. Việc cấp phiên đồng thời phải nhất quán tại server.
- Staff Start từ giờ công bố như ADR-0009. Mở sớm vào phòng chờ, không live/AI. Sau kết thúc chỉ video cho Tour đã Start rồi End Early tới hạn lời mời chưa bị thu hồi; không mở lại live/AI.

### Gửi lại và thu hồi/cấp mới

| Trường hợp | Xử lý |
|---|---|
| Thất lạc email nhưng mã vẫn còn hiệu lực | Gửi lại **cùng mã hiện hành** tới email đã duyệt; giữ session đang xem |
| Nghi lộ mã, người khác đang dùng hoặc không truy cập được phiên cũ | Thu hồi mã và session cũ; cấp mã mới cho cùng lời mời, gửi email đã duyệt |
| Gửi thư mới lỗi | Mã cũ vẫn bị thu hồi; gửi lại mã mới hiện hành, không xoay mã thêm mỗi lần retry |
| Email sai | Admin sửa đúng dòng khi SCHEDULED; READY phải Mở lại; RUNNING chặn sửa. Thu hồi/cấp mới đúng dòng theo ADR-0009 |

Đại diện đã đăng nhập hỗ trợ registration APPROVED thuộc đoàn mình; Admin hỗ trợ toàn hệ thống. Staff-only hướng dẫn liên hệ, không mặc nhiên cấp mã. Gửi lại/cấp mới trong SCHEDULED/READY/RUNNING và hạn lời mời hiện hành; không phải Mở lại/dừng Tour. Thu hồi được phép cả khi chỉ còn video dự phòng. Cấp mới không gia hạn, không hồi sinh quyền đã hết hạn hoặc mở live/AI của Tour terminal.

Ghi actor, thời điểm, lời mời, thao tác/kết quả; không ghi access code/token. Giữ ID lời mời khi cấp mới, không nhân số người/lượt vào thành công. Giới hạn thử sai tại server; không để mã trong URL/log/analytics. Thiết kế lưu mã để gửi lại an toàn, độ dài mã, thời hạn và API/DB là công việc triển khai tiếp, không suy đã tồn tại trong schema hiện tại.

### Dữ liệu và điểm xem chung

Excel là nguồn dữ liệu cá nhân; nhập mã chỉ liên kết lượt vào với dòng đã duyệt. Một dòng `DIEM_XEM_CHUNG` đủ quyền cho một máy chiếu, nhận một mã và một session; không phải một học sinh hay số người trong phòng.

Điểm xem chung chỉ có thông tin người phụ trách; không cần thêm dòng cá nhân cho học sinh chỉ xem máy chiếu. Dữ liệu trong Excel chỉ phục vụ đăng ký, lời mời và thống kê Tour theo [ADR-0011](0011-student-data-use-for-tour.md); không dùng mã/lời mời để suy ra attendance hoặc liên hệ tuyển sinh sau Tour.

## Consequences

- Thêm một thao tác nhập mã ở lần đầu; session giảm thao tác lặp khi quay lại. Mã và link trong cùng email không phải xác thực hai yếu tố.
- Người cầm mã bị chia sẻ vẫn có thể vào trước chủ email; một session không chứng minh danh tính thật hoặc attendance. Không hứa chống mạo danh tuyệt đối.
- Phải thiết kế/kiểm chứng cấp session đồng thời, revoke tức thời, gửi lại không ngắt phiên, gửi sai Tour, hạn quyền, phân quyền hỗ trợ và audit. Tiêu chí ở scope R1-01–05, R1-16–17, R1-21–22; chưa có kết quả PASS chức năng.
- Backend hiện chưa có mô hình invitation/code/session; frontend mock group-code + tên/lớp không đáp ứng quyết định này. Khi triển khai phải cập nhật contract ở `docs/architecture.md` cùng schema/API/tests.

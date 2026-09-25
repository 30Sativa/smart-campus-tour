# Khu vực Đại diện trường (`/dai-dien/*`)

Nguồn: CampusTour screen flow & user flow (21/09/2026) §4, §7, §10; scope 19/09/2026 §3.
Role `Representative` (tài khoản mẫu `daidien/daidien`). Admin không vào khu vực này và không tải roster thay đại diện (V1).

## Màn hình

| Route | Màn | Nội dung |
|---|---|---|
| `/dai-dien` | Available Tours | Buổi đang nhận đăng ký (SCHEDULED) và buổi khác chỉ xem; CTA Đăng ký / Xem đăng ký / lý do không đăng ký |
| `/dai-dien/buoi/:tourId` | Tour Detail | Thông tin buổi, lộ trình, trạng thái đăng ký của đoàn, nút Đăng ký hoặc lý do bị khóa |
| `/dai-dien/buoi/:tourId/dang-ky` | Register | 3 bước: thông tin đoàn → danh sách (tải mẫu, import, lỗi dòng/cột, preview) → xác nhận. Dùng cho đăng ký mới và đăng ký lại sau khi hủy |
| `/dai-dien/dang-ky` | My Registrations | Mỗi buổi một dòng, trạng thái và việc cần làm tiếp |
| `/dai-dien/dang-ky/:id` | My Registration | Trạng thái, lý do từ chối, lời mời (link + mã đoàn + lời nhắn copy), danh sách, lịch sử, thao tác hợp lệ, hủy có xác nhận |
| `/dai-dien/dang-ky/:id/sua` | Edit | Sửa (SUBMITTED), sửa và gửi lại (REJECTED), thay danh sách (APPROVED → SUBMITTED) |

## Quy tắc thể hiện

- Mọi thay đổi chỉ khi Tour SCHEDULED; READY/RUNNING/terminal chỉ xem, nút ẩn và hiện lý do.
- Một đại diện một đăng ký cho một Tour; gửi lại/đăng ký lại cập nhật cùng bản ghi.
- Excel: `HoTen` bắt buộc, `Lop` tùy chọn; bỏ dòng trống; không gộp trùng; lỗi một dòng thì không nhập gì; thay toàn bộ roster. Giới hạn preview 2 MB / 1.000 dòng. Nhận .xlsx và .csv, đọc trên trình duyệt (`features/representative/xlsx-lite.ts`, không thêm dependency).
- APPROVED không đổi email/thông tin đoàn tại đây (flow §10.2 chưa chốt) → hướng dẫn liên hệ Admin.
- Mutation bị từ chối (StaleData/NotAllowed) → hiện lý do, tải lại dữ liệu, không lưu một phần.
- Lời mời hiện khi APPROVED và Tour chưa kết thúc; “email đã gửi” là thời điểm dịch vụ nhận, không phải đã đọc.

## Dữ liệu

`api/contracts/representative.ts` (HTTP chưa nối) → `mocks/representative-mock.ts` → `mocks/representative-sim.ts`, dùng chung world với Admin/Staff: đoàn gửi ở đây xuất hiện trong hàng chờ duyệt của Admin.

# ADR-0009: Chốt nghiệp vụ Tour sau Review 1

- Ngày: 30/09/2026.
- Trạng thái: **nhóm chấp nhận để triển khai**; GVHD giao nhóm tự quyết theo thông tin nhóm cung cấp và sẽ xem lại ở Review 2. Không ghi nhận GVHD đã duyệt từng thay đổi.
- Phạm vi: quyết định nghiệp vụ cho `backend/` và `web/`, liên quan điều phối Tour trong `docs/architecture.md`. ADR không xác nhận code hoặc phần cứng đã đáp ứng.

## Context

Review 1 yêu cầu làm rõ cách vào Tour, giá trị tương tác với robot, quyền vận hành và xử lý sự cố. Nhóm chọn link bí mật gửi trực tiếp qua email sau duyệt, dùng lại trong hạn; không account Student, mã phòng hoặc OTP. Một lời mời giữ tối đa một phiên browser hoạt động, giữ phiên trước và từ chối phiên khác đến sau. Reload/reconnect nhận lại phiên theo chính sách giữ kết nối hữu hạn. Link vẫn có thể bị chuyển tiếp; đây không phải xác minh danh tính hay điểm danh.

Mục tiêu là phục vụ cả người xem riêng và cả lớp xem qua máy chiếu mà không thu danh sách cá nhân không cần thiết. Các quyết định dưới đây thay quy tắc cũ bắt thay cả roster khi sai một email, đăng ký riêng cho hình thức trình chiếu và cấu hình nội dung hoàn toàn bằng seed. Nghiên cứu, benchmark và telemetry contract không thay đổi trong ADR này.

## Decision

### 1. Một danh sách cấp lời mời cho cá nhân và điểm xem chung

File Excel có thể có các dòng mời cá nhân và một dòng được ghi rõ **“Điểm xem chung”** cho phòng/máy chiếu. Dòng xem chung dùng email người phụ trách. Nhóm chưa chốt tên cột hoặc cấu trúc parser; khi triển khai phải nhận diện rõ dòng xem chung, không suy đoán từ tên học sinh.

| Cách tham gia | Dữ liệu cần gửi |
|---|---|
| Cả lớp chỉ xem qua một máy chiếu | Một dòng điểm xem chung và email người phụ trách; **không cần danh sách hay email từng học sinh ngồi xem** |
| Mỗi học sinh vào trên thiết bị riêng | Một dòng cá nhân với email riêng cho mỗi người |
| Một máy chiếu và 5 học sinh muốn hỏi riêng trên điện thoại | Một dòng điểm xem chung và 5 dòng cá nhân; không cần danh sách các em chỉ xem máy chiếu |

Một đăng ký có thể chứa dòng cá nhân và dòng điểm xem chung. Cả hai dùng chung cơ chế invitation/link/phiên, không có cơ chế xác thực trình chiếu riêng. Mỗi điểm xem chung nhận một link, một phiên; AI hiển thị trên màn hình đó là nội dung chung. Không tính điểm xem chung là một học sinh hoặc suy ra số người trong phòng. Giữ kiểm thử máy chiếu. Email không trùng trong cùng Tour; đại diện dùng chính lời mời đã có hoặc lời mời điểm xem chung mình phụ trách, không lấy link của học sinh hoặc cấp thêm lời mời trùng email.

### 2. Admin sửa riêng email khi SCHEDULED

Admin sửa đúng dòng và xác nhận; kiểm tra định dạng/email trùng và lưu audit. READY phải Mở lại về SCHEDULED trước; RUNNING không sửa người nhận. Với dòng đã duyệt, giữ định danh dòng và approval, thu hồi link/phiên cũ rồi cấp link mới tới email đã sửa; không ảnh hưởng các dòng khác. Với dòng chưa duyệt, chỉ sửa dữ liệu, không gửi lời mời trước approval. Admin xác nhận là bước duyệt việc đổi email của dòng đó.

Đây không phải quyền sửa toàn bộ thông tin người tham gia hoặc loại dòng. Thay cả file vẫn là thao tác riêng: cảnh báo, thu hồi quyền cũ của đoàn và duyệt lại. Đại diện gửi lại/thu hồi/cấp lại trong đoàn cả khi RUNNING tới email đã duyệt, không được dùng thao tác này để đổi email. Gửi thư lỗi không hoàn tác approval hoặc khôi phục link cũ; cho gửi lại riêng.

### 3. Form nội dung POI ở P1

Kỹ thuật nạp sẵn tọa độ, đường nối và nhánh bằng seed/script sau chạy thử. Admin chọn tuyến/bật nhánh và sửa tên hiển thị, mô tả, upload audio thuyết minh bằng form ở **P1**. Form không sửa mã định danh/tọa độ hoặc tự vẽ tuyến. P1 vẫn là việc phải làm trong V1, chỉ làm sau luồng P0.

Khóa sửa POI/asset dùng chung khi bất kỳ Tour READY/RUNNING nào sử dụng, kể cả POI thuộc nhánh được phép. Khi đổi audio, hiện thời lượng và cảnh báo nếu dài hơn dwell được cấu hình ở các nơi sử dụng; không cần tối ưu thời gian tự động. Người cấu hình phải xử lý chênh lệch bằng nội dung/thời gian hợp lệ trước READY; backend kiểm tra lại khi Chốt và báo rõ nếu chưa đạt. Không dùng Hold trong lúc live để thay bước chuẩn bị này; không ghi đè nội dung làm mất truy vết Tour đã kết thúc.

### 4. Đổi nhánh có giới hạn

Đại diện đăng nhập tài khoản riêng, gửi từ My Registration cho đoàn APPROVED của mình. Xem live bằng lời mời của chính mình hoặc điểm xem chung mình phụ trách. Yêu cầu áp dụng cho điểm phân nhánh hiện tại nếu đang dừng và còn được chọn, hoặc điểm phân nhánh sắp tới. Staff chỉ Accept tại đúng điểm khi robot dừng và lượt còn mở.

Yêu cầu không Hold/reset dwell. Staff dùng Hold nếu cần xem lâu hơn; không thêm yêu cầu “ở lại thêm”. Backend đóng cửa sổ Accept và cho PENDING hết hạn ngay khi chốt rời điểm, trước FRONT/phát lệnh, không đợi robot chuyển động. Accept/Next/Hold/timer phải phân xử nhất quán. Accept cập nhật tuyến còn lại, không tự bỏ Hold hoặc phát chặng.

Mỗi Tour tối đa **một lần đổi nhánh được chấp nhận**, kể cả Staff chọn trực tiếp; yêu cầu bị từ chối/hết hạn không tiêu lượt, retry không tính thêm. Sau khi chốt, không nhận thay đổi nhánh mới. Chỉ dùng nhánh đã kiểm chứng, không đổi giữa chặng. Voting ngoài V1.

### 5. Staff Start từ giờ công bố

Học sinh được mở link vào phòng chờ sớm. Staff chỉ Start từ giờ công bố trở đi; server kiểm tra giờ, READY, quyền, readiness và quyền giữ robot độc quyền cho một Tour. Đủ giờ không tự Start. Nếu đổi lịch, Admin cập nhật khi SCHEDULED và thông báo các bên bị ảnh hưởng; READY phải Mở lại rồi Chốt lại. Không có nút bỏ qua giờ công bố.

### 6. Video dự phòng

Khi RUNNING mà live lỗi, được xem video dự phòng có nhãn ghi sẵn; không làm giả pose hay kết quả robot. Sau kết thúc, chỉ Tour **đã Start rồi End Early** (CANCELLED) được xem tiếp video tới hạn lời mời, với quyền chưa bị thu hồi. COMPLETED và hủy trước Start không có quyền này. Không mở lại live/AI. Robot chưa xác nhận dừng không được giải phóng cho Tour khác.

### 7. Thống kê cơ sở và audit

Thống kê ở P1: Tour hoàn thành/hủy; email được dịch vụ chấp nhận gửi/gửi lỗi; lời mời đã vào phòng thành công. Số email tính theo lần gửi có kết quả (retry là lần gửi mới), không phải số người. Lời mời vào phòng đếm một lần cho cùng dòng đã duyệt, kể cả reload/reconnect hoặc cấp lại link; phân biệt cá nhân/điểm xem chung, không gọi là số học sinh tham dự. Mở URL đơn thuần không đủ: chỉ ghi khi backend cấp/khôi phục quyền vào phòng thành công, không dùng theo dõi mở email.

Audit chỉ ghi thêm: API/UI không sửa/xóa, tài khoản DB của ứng dụng không có quyền UPDATE/DELETE log; không tuyên bố chống sửa bởi quản trị DB đặc quyền. Lưu actor, thời gian, Tour/robot và tham chiếu lệnh/thao tác, không ghi link/token bí mật. Audit lệnh thuộc P0, không đợi trang thống kê P1.

Ba mốc lệnh là các bản ghi liên quan cùng lệnh: **đã quyết định gửi → đã gửi → robot đã phản hồi**. Quyết định và thay đổi dữ liệu liên quan ghi trong cùng giao dịch backend; gửi ra ngoài không nằm trong giao dịch đó. Chỉ ghi mốc gửi/phản hồi khi có bằng chứng tương ứng; nếu lỗi hoặc chưa rõ thì ghi lỗi/chưa rõ, không tạo đủ ba mốc giả. Phản hồi chấp nhận lệnh không đồng nghĩa hoàn thành; lưu đúng loại/kết quả nhận được. Với email chỉ ghi “dịch vụ chấp nhận gửi” hoặc “gửi lỗi” khi có kết quả; đang chờ/chưa rõ không được suy thành thành công, không ghi “đã nhận/đã đọc”.

## Consequences

- Cách xem chung giảm dữ liệu cần thu và dùng lại invitation hiện có. Người chỉ xem máy chiếu không có Q&A riêng trên điện thoại nếu chưa đăng ký lời mời cá nhân.
- Sửa email tăng một thao tác Admin nhưng tránh bắt cả đoàn nhận lại link vì một lỗi gõ.
- Form POI và thống kê là công việc P1 bắt buộc; hình học tuyến vẫn seed, không coi form nội dung là đã đáp ứng toàn bộ quản lý route/POI trong phiếu. Báo rõ giới hạn này ở Review 2.
- Cần kiểm chứng quyền, sửa email riêng, khóa POI dùng chung, audio/READY, Start sớm, nhánh đồng thời, video trước/sau Start, máy chiếu và thống kê không đếm lặp khi triển khai. ADR không phải bằng chứng các kiểm thử đã đạt.
- Dữ liệu địa điểm còn mở: khảo sát **tầng 6 NVH**, Start/End/POI/nhánh thực và vùng được vận hành. Trước diễn tập còn phải cấu hình hạn link/phiên, dwell và tải thử; không tự coi chỉ khảo sát xong là hệ thống đã hoàn thành.

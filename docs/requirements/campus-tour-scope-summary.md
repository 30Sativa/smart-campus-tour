# CampusTour DT-AMR — Scope tóm tắt sau Review 1

**Nhóm chốt nghiệp vụ 30/09/2026 • GVHD giao nhóm tự quyết và sẽ xem lại ở Review 2 • Chưa xác nhận GVHD duyệt từng thay đổi hoặc chức năng đã triển khai.** ADR: `docs/decisions/0009-review-1-tour-business-scope.md` và cập nhật truy cập `docs/decisions/0010-personal-access-code-entry.md`; chi tiết/backlog tại đặc tả Review 1.

**Vấn đề.** Học sinh cần khám phá campus từ xa; hệ thống phải thể hiện giá trị của robot live qua khả năng điều chỉnh hành trình có kiểm soát, bên cạnh nội dung giới thiệu và hỏi đáp.

**Trải nghiệm chính.** Email sau duyệt gồm link trang Tour và mã riêng. Mở link → nhập mã → server cấp session → phòng chờ/live. Quay lại khi session hợp lệ không nhập lại; logout/hết session thì dùng lại mã còn hạn. Xem live/map 2D/narration, hỏi AI riêng text/voice tiếng Việt; không account Student/OTP bổ sung. Một lời mời giữ một phiên, từ chối browser cạnh tranh. Mã bị chia sẻ vẫn có thể bị dùng trước, không xác minh danh tính/attendance.

**Actor và luồng.** Admin tạo lịch/chọn tuyến → đại diện gửi Excel → Admin duyệt/gửi email link + mã → READY → Staff kiểm tra/Start từ giờ công bố → robot đi → kết thúc. Một dòng điểm xem chung đủ cấp quyền máy chiếu; chỉ có dữ liệu người phụ trách. Muốn lưu thông tin từng học sinh để liên hệ phải thêm dòng cá nhân, kể cả chỉ xem máy chiếu, không ép mở điện thoại. Người hỏi riêng cần mã riêng. Mất thư: đại diện đúng đoàn/Admin gửi lại mã hiện hành, không ngắt session. Nghi lộ: thu hồi mã/session cũ, cấp mã mới tới email đã duyệt, giữ hạn và định danh lời mời. Staff-only hướng dẫn, không cấp mã. Admin sửa email riêng khi SCHEDULED (READY phải Mở lại), thu hồi/cấp lại đúng dòng và audit. Đại diện dùng account riêng để yêu cầu nhánh; xem bằng lời mời của mình/điểm mình phụ trách.

**Phạm vi vật lý.** Một campus đích của trường F; demo **tầng 6 NVH**, một robot thật, ít nhất **3 POI và 2 chặng thật**, khoảng 30 phút trở xuống. Cần khảo sát Start/End/POI/nhánh và vùng được vận hành; phân biệt điểm thật với điểm bố trí. Staff dùng Twin 3D vùng chạy để xem kết nối/tiến độ/độ mới pose, quyết định Start, nhánh và xử lý lỗi; backend vẫn kiểm tra điều kiện.

**Tương tác robot.** Yêu cầu cho điểm phân nhánh hiện tại còn mở hoặc điểm sắp tới → Staff Accept/Reject khi robot dừng tại đó → UI đổi tuyến → robot thật đi nhánh đã thử. Mỗi Tour tối đa một lần đổi nhánh được chấp nhận; từ chối/hết hạn không tiêu lượt. Ví dụ A → B → C → End hoặc A → D → C → End; A–D chưa là POI khảo sát. Yêu cầu không tự Hold/reset dwell; Staff Hold khi cần xem lâu hơn, không có yêu cầu gia hạn riêng. PENDING hết hạn khi backend đóng lượt, trước FRONT/phát lệnh. Video tương tác cũng chọn nhánh được; giá trị cần kiểm chứng là hình ảnh hiện tại và thực thi trên robot.

**Sự cố.** Khi RUNNING mà live lỗi, dùng video ghi rõ “ghi sẵn”; map dùng telemetry thật hoặc báo cũ. Sau kết thúc, chỉ Tour đã Start rồi End Early (CANCELLED) được xem tiếp video tới hạn lời mời chưa bị thu hồi; không áp dụng COMPLETED/hủy trước Start, không mở live/AI. Không tự resume sau restart; chưa xác nhận robot dừng thì không giao cho Tour khác.

**Quản trị.** Kỹ thuật seed tọa độ/đường nối/nhánh đã thử. Form P1 cho Admin sửa tên hiển thị, mô tả/upload audio POI; khóa khi có Tour READY/RUNNING dùng, gồm nhánh. Hiện thời lượng/cảnh báo audio dài hơn dwell; xử lý chênh lệch trước READY, backend kiểm tra. Thống kê P1: Tour hoàn thành/hủy, kết quả dịch vụ gửi email theo lần gửi, lời mời vào phòng thành công tính một lần cho cùng dòng (reload/cấp lại không tăng), phân biệt điểm xem chung, không attendance. Audit append-only từ P0: quyết định gửi, đã gửi, robot phản hồi ghi riêng khi có bằng chứng; lỗi/chưa rõ không tạo thành công giả. Không ghi email đã nhận/đã đọc.

**Multi-tour.** Demo phần mềm: Tour A ↔ Emulator A và Tour B ↔ Emulator B chạy đồng thời; gây lỗi A, chứng minh B tiếp tục và command/progress/Q&A không lẫn. Media mẫu phải ghi nhãn. Bài này không chứng minh fleet vật lý tránh va chạm hoặc thay nghiên cứu chính thức.

**Trong V1:** đăng ký/mã/session tối thiểu; robot/head/live/narration; Student 2D, Staff Twin 3D; AI riêng một ngôn ngữ; nhánh qua Staff; fallback; hai Tour emulator; thử tải viewer/AI. Đánh giá trải nghiệm so với video là đề xuất chờ GVHD xác nhận. **Future:** voting, Student 3D, feedback/rating (không có FR trong phiếu v1.2). **Ngoài V1:** nhiều campus, nhiều robot thật chạy đồng thời, nhiều robot/Tour, tiếp quản giữa Tour, free navigation, vẽ tuyến tự do, Student lái robot, VR/360°, 3D toàn campus, multilingual.

**Kịch bản trình bày.** Mở link/nhập mã → session → Start → robot tới A → đại diện yêu cầu D, Staff chấp nhận → UI đổi và robot đi D → C → End; trình diễn riêng ca lỗi/video dự phòng và hai Tour emulator. Phần chính tập trung Tour–Robot–Twin.

**Còn mở:** dữ liệu khảo sát tầng 6 NVH (Start, End, POI, nhánh/vùng chạy). Bảy quyết định nghiệp vụ đã chốt trong nhóm; GVHD xem lại ở Review 2. Trước diễn tập còn phải cấu hình hạn mã/phiên, dwell và tải thử; chốt scope không có nghĩa hệ thống đã hoàn thành.

**Giới hạn lượt sửa:** bỏ qua research paper/benchmark/chỉ số nghiên cứu ngày 30/09 theo yêu cầu nhóm; phần nghiên cứu của đặc tả chi tiết giữ nguyên, không coi là đã rà soát trong lượt này.

# CampusTour DT-AMR — Scope tóm tắt sau Review 1

**Nhóm chốt nghiệp vụ 30/09/2026 • GVHD giao nhóm tự quyết và sẽ xem lại ở Review 2 • Chưa xác nhận GVHD duyệt từng thay đổi hoặc chức năng đã triển khai.** ADR: `docs/decisions/0009-review-1-tour-business-scope.md`, cập nhật truy cập `docs/decisions/0010-personal-access-code-entry.md` và giới hạn dữ liệu tại `docs/decisions/0011-student-data-use-for-tour.md`; chi tiết/backlog tại đặc tả Review 1.

**Vấn đề.** Học sinh cần khám phá campus từ xa; hệ thống phải thể hiện giá trị của robot live qua khả năng điều chỉnh hành trình có kiểm soát, bên cạnh nội dung giới thiệu và hỏi đáp.

**Trải nghiệm chính.** Email sau duyệt gồm link trang Tour và mã riêng. Mở link → nhập mã → server cấp session → phòng chờ/live. Quay lại khi session hợp lệ không nhập lại; logout/hết session thì dùng lại mã còn hạn. Xem live/map 2D/narration, hỏi AI riêng text/voice tiếng Việt; không account Student/OTP bổ sung. Một lời mời giữ một phiên, từ chối browser cạnh tranh. Mã bị chia sẻ vẫn có thể bị dùng trước, không xác minh danh tính/attendance.

**Actor và luồng.**

- **Luồng chính:** Admin tạo lịch/tuyến → đại diện gửi Excel → Admin duyệt/email link + mã → READY → Staff Start từ giờ công bố → robot đi/kết thúc. Một dòng điểm xem chung đủ quyền máy chiếu; người vào riêng dùng dòng riêng.
- **Hỗ trợ mã:** đại diện đúng đoàn/Admin gửi lại mã hiện hành nếu mất thư; nghi lộ thì thu hồi mã/session cũ, cấp mới tới email đã duyệt, giữ hạn và ID lời mời. Staff-only hướng dẫn. Admin sửa email riêng khi SCHEDULED (READY phải Mở lại), audit đúng dòng.
- **Yêu cầu đổi nhánh:** đại diện dùng account riêng để gửi; mọi tài khoản đang hoạt động có role STAFF được quyết định/vận hành mọi Tour tại điểm hợp lệ; V1 không phân công Staff theo Tour (ADR-0012). Đại diện xem bằng lời mời của mình/điểm mình phụ trách.

**Dữ liệu học sinh.** Theo ADR-0011, Excel chỉ phục vụ đăng ký, lời mời và thống kê vận hành Tour; không liên hệ tuyển sinh sau Tour, không CRM hay consent workflow. Một dòng điểm xem chung chỉ đại diện một máy chiếu/session, không cho biết số người trong phòng. Demo dùng dữ liệu giả hoặc dữ liệu được cung cấp phù hợp.

**Phạm vi vật lý.** Một campus đích của trường F; demo **tầng 6 NVH**, một robot thật, ít nhất **3 POI và 2 chặng thật**, khoảng 30 phút trở xuống. Cần khảo sát Start/End/POI/nhánh và vùng được vận hành; phân biệt điểm thật với điểm bố trí. Staff dùng Twin 3D vùng chạy để xem kết nối/tiến độ/độ mới pose, quyết định Start, nhánh và xử lý lỗi; backend vẫn kiểm tra điều kiện.

**Tương tác robot.** Yêu cầu cho điểm phân nhánh hiện tại còn mở hoặc điểm sắp tới → Staff Accept/Reject khi robot dừng tại đó → UI đổi tuyến → robot thật đi nhánh đã thử. Mỗi Tour tối đa một lần đổi nhánh được chấp nhận; từ chối/hết hạn không tiêu lượt. Ví dụ A → B → C → End hoặc A → D → C → End; A–D chưa là POI khảo sát. Yêu cầu không tự Hold/reset dwell; Staff Hold khi cần xem lâu hơn, không có yêu cầu gia hạn riêng. Đóng lượt chỉ làm hết hạn PENDING của đúng điểm phân nhánh đó; rời POI trung gian giữ yêu cầu cho điểm sắp tới. Các sự kiện hết hạn toàn Tour theo ADR-0009 §4. Video tương tác cũng chọn nhánh được; giá trị cần kiểm chứng là hình ảnh hiện tại và thực thi trên robot.

**Sự cố.** Khi RUNNING mà live lỗi, dùng video ghi rõ “ghi sẵn”; map dùng telemetry thật hoặc báo cũ. Sau kết thúc, chỉ Tour đã Start rồi End Early (CANCELLED) được xem tiếp video tới hạn lời mời chưa bị thu hồi; không áp dụng COMPLETED/hủy trước Start, không mở live/AI. Không tự resume sau restart. Staff kiểm tra và xác nhận robot sẵn sàng; backend chỉ release khi nhiệm vụ cũ đã kết thúc, robot dừng và đủ readiness. Tour mới vẫn phải qua điều kiện Start; ADR-0009 §6.

**Quản trị.** Theo ADR-0012, kỹ thuật chuẩn bị và kiểm chứng Route geometry/đường nối/nhánh cùng dwell cố định; Admin không chỉnh dwell theo từng Tour. Admin POI Management theo ADR-0014 tạo POI inactive, sửa nội dung và kích hoạt/vô hiệu hóa; chỉ POI chưa có RouteStop/lịch sử mới cho Admin chỉnh MapKey/MapFrame/x/y/yaw. Pose được cảnh báo chưa xác minh bằng robot thật; không có map picker trước khi calibrate transform. Không hard delete; mọi thay đổi bị khóa khi Tour READY/RUNNING sử dụng POI. Audio upload, dwell warning và snapshot lịch sử vẫn là P1 riêng. Thống kê P1: Tour hoàn thành/hủy, kết quả dịch vụ gửi email theo lần gửi, lời mời vào phòng thành công tính một lần cho cùng dòng (reload/cấp lại không tăng), phân biệt điểm xem chung, không attendance. Audit append-only từ P0: quyết định gửi, đã gửi, robot phản hồi ghi riêng khi có bằng chứng; lỗi/chưa rõ không tạo thành công giả. Không ghi email đã nhận/đã đọc.

**Multi-tour.** Demo phần mềm: Tour A ↔ Emulator A và Tour B ↔ Emulator B chạy đồng thời; gây lỗi A, chứng minh B tiếp tục và command/progress/Q&A không lẫn. Media mẫu phải ghi nhãn. Bài này không chứng minh fleet vật lý tránh va chạm hoặc thay nghiên cứu chính thức.

**Trong V1:** đăng ký/mã/session tối thiểu; robot/head/live/narration; Student 2D, Staff Twin 3D; AI riêng một ngôn ngữ; nhánh qua Staff; fallback; hai Tour emulator; thử tải viewer/AI. Đánh giá trải nghiệm so với video là đề xuất chờ GVHD xác nhận. **Future:** voting, Student 3D, feedback/rating (không có FR trong phiếu v1.2). **Ngoài V1:** nhiều campus, nhiều robot thật chạy đồng thời, nhiều robot/Tour, tiếp quản giữa Tour, free navigation, vẽ tuyến tự do, Student lái robot, VR/360°, 3D toàn campus, multilingual.

**Kịch bản trình bày.** Mở link/nhập mã → session → Start → robot tới A → đại diện yêu cầu D, Staff chấp nhận → UI đổi và robot đi D → C → End; trình diễn riêng ca lỗi/video dự phòng và hai Tour emulator. Phần chính tập trung Tour–Robot–Twin.

**Còn mở:** dữ liệu khảo sát tầng 6 NVH (Start, End, POI, nhánh/vùng chạy). Bảy quyết định nghiệp vụ đã chốt trong nhóm; GVHD xem lại ở Review 2. Trước diễn tập còn phải cấu hình hạn mã/phiên, dwell và tải thử; chốt scope không có nghĩa hệ thống đã hoàn thành.

**Giới hạn lượt sửa:** bỏ qua research paper/benchmark/chỉ số nghiên cứu ngày 30/09 theo yêu cầu nhóm; phần nghiên cứu của đặc tả chi tiết giữ nguyên, không coi là đã rà soát trong lượt này.

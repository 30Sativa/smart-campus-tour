# CampusTour Screen Flow và User Flow cho web

<!-- document-purpose -->
> **Loại tài liệu:** Luồng màn hình và luồng người dùng web.
> **Gửi agent khi:** Thiết kế UI, wireframe hoặc triển khai flow web; gửi kèm đặc tả phạm vi/nghiệp vụ khi cần quy tắc hệ thống.
> **Mốc nội dung:** Bản 21/09, cập nhật nghiệp vụ 30/09/2026 theo scope Review 1; không xác nhận chức năng đã triển khai.
> **Bản canonical trong repo:** `docs/requirements/campus-tour-ui-flow.md`; tên file nguồn: `CampusTour-screen-user-flow-reviewed-2026-09-21.md`.
<!-- /document-purpose -->

Bản luồng màn hình được cập nhật 30/09/2026. Mô tả hành vi cần thiết kế, chưa phải xác nhận code đã chạy hoặc GVHD đã duyệt.

Nguồn đối chiếu: bản đặc tả Review 1 ngày 28/09 cập nhật nghiệp vụ 30/09 và phần nghiệp vụ/giới hạn của phiếu FA26SE184 v1.2 ngày 19/09 trong file `FA26SE184_SRS_CampusTour-DT-AMR_v0.1.pdf`. Nghiệp vụ được nhóm chốt ngày 30/09 tại `docs/decisions/0009-review-1-tour-business-scope.md`; GVHD sẽ xem lại ở Review 2, chưa ghi nhận duyệt từng thay đổi. Feedback/rating không có FR trong phiếu v1.2, ngoài core. Không sửa phần research paper/benchmark trong lượt này.

## 1. Actor và cách biểu diễn

| Actor | Trách nhiệm | Nhóm giao diện |
|---|---|---|
| Admin | Chuẩn bị buổi, duyệt đoàn, gửi lời mời, chốt/mở lại/hủy trước Start | Tour, registration, lời mời, quyền truy cập và lịch sử |
| School Representative / Đại diện | Đăng ký/roster của đoàn mình; hỗ trợ lời mời kể cả RUNNING; gửi yêu cầu nhánh | Available Tours, My Registrations, My Registration với panel Lời mời/Yêu cầu đổi nhánh |
| Student | Tham quan từ xa và hỏi AI riêng | Join, phòng chờ, live, kết thúc |
| Staff (Tour Operator / Campus Staff) | Kiểm tra, Start, giám sát và xử lý sự cố | Dashboard/Twin, kiểm tra trước Start, log |

Admin, Staff và đại diện dùng cơ chế đăng nhập hiện có hoặc account demo được tạo sẵn. Student dùng quyền browser tạm, không có account, mật khẩu hoặc OTP. Account có thể mang cả Admin và Staff, nhưng quyền và điều kiện nghiệp vụ vẫn được kiểm tra riêng.

Khi vẽ, phân biệt:

- **Screen:** trang hoặc trạng thái màn hình, ví dụ Live Tour.
- **Component:** vùng trong screen, ví dụ map 2D, AI, panel lời mời.
- **Action:** thao tác trên màn, ví dụ Approve, Hold, Next.
- **Decision:** nhánh có điều kiện, ví dụ Tour có đang RUNNING không.
- **System event:** sự kiện backend/robot làm UI cập nhật, ví dụ Tour bắt đầu hoặc kết thúc.

Mũi tên giữa actor biểu diễn bàn giao dữ liệu/sự kiện, không phải người dùng chuyển sang màn có quyền của actor khác. Không cần mỗi component hoặc action thành một page.

Robot/Bridge không có screen web. Nếu Use Case Diagram lấy web/backend làm ranh giới, Robot/Bridge có thể là external actor. Nếu ranh giới bao gồm toàn hệ thống CampusTour và robot, nó là thành phần nội bộ.

## 2. User Flow tổng thể

```text
Admin cấp account đại diện/Staff theo cơ chế hệ thống
  → Tạo Tour SCHEDULED, chọn route/nhánh đã chuẩn bị
  → Đại diện chọn buổi, đăng ký đoàn, upload Excel các dòng cá nhân và/hoặc điểm xem chung
      ├─ Cá nhân: một dòng/email riêng cho mỗi người cần vào web
      └─ Điểm xem chung: một dòng/email người phụ trách mỗi máy chiếu
         Không cần tên/email từng học sinh ngồi xem; được trộn hai loại dòng
  → Admin xem dữ liệu → Reject + lý do hoặc Approve
  → Sau Approve: gửi link riêng tới từng email đã duyệt
      ├─ Thư lỗi: giữ APPROVED, cho gửi lại riêng
      └─ Student bấm link → đúng trang Tour
           ├─ SCHEDULED/READY → Hiện lịch/phòng chờ
           └─ RUNNING → Live với tiến độ hiện tại

Admin kiểm tra nội dung/đăng ký → Chốt READY
  → Staff kiểm tra robot/video/pose/FRONT → Start
  → Backend chuyển RUNNING → Trang Student cập nhật live
  → Robot tự đi POI theo điều phối backend
      ├─ Đại diện yêu cầu nhánh từ My Registration
      │    → Staff Accept/Reject tại lượt điểm phân nhánh hợp lệ
      │    → Cập nhật phần tuyến còn lại; đi tiếp theo Hold/Next/dwell
      ├─ Đi hết tuyến hợp lệ, về và dừng điểm cuối → COMPLETED
      └─ Lỗi không phục hồi → Staff End Early → CANCELLED
  → Đóng live/AI; nếu End Early, có video dự phòng tới hạn link
  → Admin/Staff xem History/Log theo quyền
```

Approve cấp quyền tham gia, không tự READY hoặc Start. Email và READY không có thứ tự cứng: gửi lỗi không đổi approval hoặc chặn READY. Student có thể xem lịch trước READY và dùng lại cùng link. Giờ trên lịch không tự Start; nhóm chốt Staff chỉ Start từ giờ công bố, server kiểm tra cùng readiness và quyền giữ robot.

## 3. Admin

### 3.1 Screen Flow

```text
Login → Tour List
          ├─ Create Tour Form → Lưu → Tour Detail (SCHEDULED)
          └─ Chọn Tour → Tour Detail
                          ├─ Edit (SCHEDULED)
                          ├─ Registrations → Registration Detail
                          │                    ├─ Xem roster
                          │                    ├─ Approve / Reject + lý do
                          │                    ├─ Sửa email đúng dòng (SCHEDULED) → Xác nhận
                          │                    └─ Invitation panel
                          ├─ Điều kiện READY → Chốt buổi
                          ├─ Mở lại (READY → SCHEDULED, trước Start)
                          ├─ Hủy buổi trước Start + lý do
                          └─ History / Log
```

### 3.2 Screen và component

| Màn/khối | Nội dung và thao tác |
|---|---|
| Tour List | Tên, giờ, route, state, số registration theo state; tạo buổi |
| Tour Form | Tên, giờ dự kiến, mô tả, chọn route có sẵn |
| Tour Detail | Thông tin buổi, state, đoàn; sửa/chốt/mở lại/hủy đúng điều kiện |
| Registration List/Detail | Đoàn, đại diện, email, roster, state, lý do từ chối |
| Invitation panel | Trạng thái gửi theo lời mời; gửi lại, thu hồi/cấp lại tới email đã duyệt, có audit; Admin sửa email riêng bằng action/xác nhận riêng khi SCHEDULED, không dùng nút gửi lại để đổi người nhận |
| READY conditions panel | Điều kiện đã đạt/chưa đạt và lý do bị chặn; không phải module checklist riêng |
| History / Log | Các mốc Tour, thao tác Staff, lỗi và lý do kết thúc; audit chỉ ghi thêm theo §3.4 |
| POI Content (P1) | Admin sửa tên hiển thị, mô tả, upload audio; thời lượng/cảnh báo, khóa dữ liệu đang dùng |
| Thống kê cơ sở (P1) | Tour hoàn thành/hủy; kết quả gửi email; lời mời vào phòng thành công, phân biệt loại dòng |

Admin chỉ duyệt/từ chối registration SUBMITTED khi Tour SCHEDULED. Admin không upload cả roster thay đại diện trong V1; được sửa riêng email khi SCHEDULED theo §4.2, không mặc nhiên có quyền Start.

### 3.3 READY và lời mời

Chốt READY cần Tour SCHEDULED, tên/giờ hợp lệ, route/nhánh/nội dung đủ cấu hình, ít nhất một đoàn APPROVED có một dòng lời mời hợp lệ (một điểm xem chung là đủ), thời lượng audio/dwell đã xử lý, không còn SUBMITTED. Nếu chưa đạt, giữ state và nêu lý do.

READY khóa nội dung/route và đăng ký; không nhận đăng ký mới hoặc sửa/hủy/duyệt registration. Không yêu cầu robot online, stream đang phát hoặc email đã gửi để READY. Kiểm tra thiết bị thuộc bước Start.

Mở lại READY → SCHEDULED chỉ trước Start; giữ APPROVED của đoàn chưa sửa. Thay cả roster đưa đoàn đó về SUBMITTED; Admin sửa riêng email và xác nhận thì giữ approval của đoàn, không gửi lại link các dòng khác. Nếu state đã đổi bởi thao tác khác, báo không thực hiện được và cập nhật màn.

Sau duyệt, hệ thống gửi link riêng tới từng học sinh hoặc người phụ trách trình chiếu. Admin/đại diện sở hữu đoàn được gửi lại/cấp lại khi registration APPROVED và Tour SCHEDULED/READY/RUNNING; không sửa người nhận, approval hoặc roster. Thu hồi được phép cả khi chỉ còn quyền video dự phòng. Thư lỗi giữ APPROVED; dịch vụ chấp nhận thư không chứng minh đã đọc. Gửi lại không tạo thêm quyền/đá phiên cũ. Đổi giờ cập nhật trang và gửi thông báo, giữ link còn hiệu lực.

### 3.4 Chức năng quản trị ngoài luồng live

Phiếu cập nhật còn nêu quản lý quyền truy cập operator/đại diện, nội dung tour được chuẩn bị và lịch sử vận hành. Phải ghi cách đáp ứng trong thiết kế:

- Quyền truy cập: dùng cơ chế account/role hiện có; có thể tạo sẵn account demo. Chi tiết màn quản trị tài khoản phụ thuộc cơ chế đã chọn, không tự thêm permission builder hoặc quy trình đăng ký tài khoản mới.
- Nội dung V1 đã chốt: kỹ thuật seed map/frame/tọa độ, tuyến/đường nối/nhánh sau kiểm chứng. Admin chọn tuyến/bật nhánh/dwell hợp lệ; form P1 sửa tên hiển thị/mô tả/upload audio, không sửa ID/tọa độ. Khóa khi bất kỳ Tour READY/RUNNING dùng POI/asset, kể cả nhánh. Hiện thời lượng/cảnh báo audio dài hơn dwell; người cấu hình chỉnh nội dung hoặc dwell hợp lệ trước READY, backend chặn Chốt nếu chưa xử lý và kiểm tra khóa khi ghi. Giữ lịch sử nội dung Tour đã kết thúc. Không editor vẽ tuyến tự do.
- Lịch sử: History/Log lưu actor/thời điểm/Tour/robot/tham chiếu/thao tác, không token bí mật. Audit append-only từ P0, API/UI và tài khoản DB app không UPDATE/DELETE; không tuyên bố chống DBA. Quyết định gửi cùng giao dịch DB; đã gửi và robot phản hồi là các dòng riêng khi có bằng chứng, tương quan cùng lệnh. Lỗi/chưa rõ giữ đúng, không tạo đủ ba mốc giả; nhận lệnh không phải hoàn thành.
- Thống kê P1: số Tour COMPLETED/CANCELLED; số lần gửi email dịch vụ chấp nhận/gửi lỗi (retry là lần gửi mới); số lời mời đã vào phòng thành công, một lần cho cùng dòng đã duyệt kể cả reload/reconnect/cấp lại. Phân biệt cá nhân/điểm xem chung, không attendance hay số người trong phòng. Chỉ đếm vào phòng sau backend cấp/khôi phục quyền thành công, không mở URL/email. Email đang chờ/chưa rõ không coi thành công; không ghi đã nhận/đã đọc.

## 4. School Representative / Đại diện

### 4.1 Screen Flow

```text
Login bằng account Representative
 ├─ Available Tours → Tour Detail → Register nếu SCHEDULED
 └─ My Registrations → My Registration của đúng đoàn
      ├─ SCHEDULED → Sửa/hủy/gửi lại đăng ký theo RegistrationState
      ├─ APPROVED → Panel Lời mời: trạng thái gửi, gửi lại, thu hồi/cấp lại
      │              (có cả trong READY/RUNNING, không đổi email)
      ├─ RUNNING + APPROVED → Panel Yêu cầu đổi nhánh
      │    → Xem POI hiện tại, điểm phân nhánh được phép, lựa chọn
      │    → Gửi → PENDING → ACCEPTED / REJECTED / EXPIRED
      └─ COMPLETED/CANCELLED → Xem kết quả; không mở lại live

Register / Edit
 → Thông tin trường/nhóm/người liên hệ
 → Upload Excel cá nhân và/hoặc điểm xem chung → Preview loại dòng/lỗi/email
   Chỉ xem chung: một dòng/điểm, không cần danh sách học sinh ngồi xem
 → Xác nhận thay thế khi có dữ liệu cũ → SUBMITTED → Admin duyệt lại
```

### 4.2 Quyền và dữ liệu

Một đại diện có thể có nhiều đăng ký cho các phòng/nhóm riêng trong cùng Tour; mỗi đăng ký có tên nhóm rõ. Gửi lại/hủy rồi đăng ký lại cùng đoàn cập nhật bản ghi đó, không nhân bản vì bấm lặp. Server kiểm tra owner, Tour và state; không tin registration ID truyền từ UI.

Excel phải biểu diễn rõ dòng cá nhân và dòng “Điểm xem chung”; email cá nhân hoặc email người phụ trách là đích nhận lời mời. Nhóm chưa chốt tên cột/cấu trúc parser. Ít nhất một dòng, bỏ dòng trống, báo loại dòng/email sai/thiếu/trùng trong Tour; không suy đoán điểm xem chung từ tên người. Không đòi roster học sinh nếu chỉ xem máy chiếu; hỗn hợp được dùng trong cùng đăng ký. Import toàn bộ hoặc không nhập, không ghép file; giới hạn dung lượng/số dòng theo cấu hình.

Thay roster, đăng ký mới/hủy/gửi lại/duyệt chỉ khi SCHEDULED; READY phải Mở lại. Thay cả file cảnh báo thu hồi lời mời/phiên cũ toàn đoàn, duyệt/gửi lại; không matching tên. **Sửa riêng email:** Admin chọn đúng dòng → sửa → kiểm tra email trùng/định dạng → xác nhận → audit. Dòng APPROVED giữ định danh/approval, thu hồi link/phiên cũ của dòng đó, cấp/gửi link mới; các dòng khác giữ nguyên. Dòng chưa duyệt chỉ sửa dữ liệu, chờ approve mới gửi. Email mới gửi lỗi cho retry riêng, không phục hồi link cũ. RUNNING chặn sửa email, không cho đổi loại dòng hoặc mọi thông tin qua form này.

SUBMITTED/APPROVED/REJECTED có thể hủy khi SCHEDULED. REJECTED sửa và CANCELLED đăng ký lại về SUBMITTED. Hủy Tour không buộc đổi từng registration nhưng quyền luôn kiểm tra TourState.

### 4.3 Hỗ trợ link trong lúc Tour đang chạy

Đại diện đã đăng nhập mở My Registration → Lời mời → chọn đúng học sinh → gửi lại hoặc thu hồi/cấp lại tới email đã duyệt. Thu hồi vô hiệu link và phiên cũ; cấp lại tạo link mới trong hạn hiện hành. Chỉ registration APPROVED, chỉ đoàn thuộc đại diện. Không yêu cầu Mở lại, không dừng Tour, không sửa email. Có log và thông báo kết quả; bấm lặp không tạo thêm quyền.

Đại diện xem live bằng lời mời của chính mình hoặc điểm xem chung mình phụ trách, không dùng link của học sinh. Nếu email đã có lời mời thì dùng lời mời đó, không cấp thêm trùng email. Role Representative không tự cấp phiên Student hoặc xem chat riêng; không cần mở live để gửi yêu cầu. Staff không mặc nhiên được hỗ trợ lời mời.

### 4.4 Yêu cầu đổi nhánh

Panel chỉ cho gửi khi Tour RUNNING, registration APPROVED và có điểm phân nhánh đang dừng hoặc kế tiếp chưa đi qua. Hiện nhánh hợp lệ và thời lượng dự kiến đã cấu hình, không ETA động. Mỗi đại diện tối đa một PENDING cho Tour/lượt phân nhánh; thao tác lặp không tạo yêu cầu mới. Mỗi Tour tối đa một lần đổi nhánh được chấp nhận, kể cả Staff chọn trực tiếp; REJECTED/EXPIRED không tiêu lượt, retry không tăng. Sau khi chốt khóa yêu cầu đổi tiếp.

Gửi yêu cầu không tự Hold. Staff chỉ Accept tại đúng điểm khi robot dừng, lượt còn mở và đủ điều kiện. Khi đóng lượt rời điểm, đã chốt nhánh khác, End Early hoặc vào NEEDS_ASSISTANCE, yêu cầu PENDING hết hạn; UI cập nhật EXPIRED và lý do. Đại diện không có nút lái robot, Next hoặc yêu cầu gia hạn thời gian riêng. Muốn xem lâu hơn Staff dùng Hold.

## 5. Student

### 5.1 Screen Flow

```text
Link cá nhân trong email → Kiểm tra lời mời/phiên hiện hành
 ├─ Link sai/hết hạn/bị thu hồi → Thông báo + liên hệ đại diện
 ├─ Phiên khác đang hoạt động → Giữ phiên trước, từ chối browser đến sau
 └─ Quyền hợp lệ → Cùng trang Tour
      ├─ SCHEDULED/READY → Lịch/phòng chờ → Staff Start → Live
      ├─ RUNNING → Live, nhận tiến độ hiện tại
      ├─ COMPLETED → Đã hoàn thành, không live/AI
      └─ CANCELLED → Đã hủy/kết thúc sớm
           → Nếu đã Start rồi End Early: video dự phòng tới hạn link

Đóng trang/đăng xuất → Mở cùng link còn hiệu lực → Kiểm tra lại như trên
Mất mạng ngắn → Reconnect, kiểm tra quyền và nhận snapshot mới
```

Không nhập mã phòng/email/OTP/họ tên; không account Student. Một trang đổi nội dung theo state, không bắt bấm xin vào qua nhiều phòng. Vào muộn xem thời điểm hiện tại, không replay hành trình. Link chỉ thuộc đúng Tour; không chuyển quyền sang buổi mới.

### 5.2 Lời mời, phiên và phòng chờ

Quyền gắn lời mời cá nhân, Tour và registration APPROVED hiện hành. Một phiên browser độc quyền còn hiệu lực hoặc trong khoảng giữ kết nối hữu hạn là phiên đang hoạt động; tab chung phiên không tính thêm người. Đăng xuất kết thúc phiên, không thu hồi lời mời. Reload/reconnect nhận lại phiên; đóng tab không được khóa mãi hoặc đồng nghĩa server biết đã đăng xuất.

Thay cả roster thu hồi lời mời/phiên cũ và duyệt lại; sửa riêng email chỉ thu hồi/cấp lại dòng đó sau Admin xác nhận; không đối chiếu lại theo tên. Student nhận lỗi chung và hướng dẫn, không thấy lý do Reject nội bộ hoặc roster. Token còn hạn không bỏ qua thu hồi/state server. Kết quả AI tới sau khi thu hồi bị chặn.

Phòng chờ hiển thị tên/lịch hiện hành, hướng dẫn kiểm tra âm thanh; chưa cấp live/AI. Link mở trước ngày vẫn dùng lại được. Khi Staff Start, trang tự cập nhật giao diện live; autoplay âm thanh theo browser, không hứa tự phát mọi thiết bị.

Khi End Early sau Start, Tour CANCELLED cho xem video dự phòng tới đúng hạn link, miễn lời mời/registration chưa bị thu hồi. Không quyền sau kết thúc này cho COMPLETED hoặc hủy trước Start. Không tự mở lại live/AI. Giới hạn phiên áp dụng web; nếu media dùng URL công khai thì không tuyên bố ngăn được xem trực tiếp URL.

Đây là cấp quyền theo lời mời, không xác minh danh tính hoặc attendance; link chuyển tiếp vẫn có thể bị dùng trước. V1 chấp nhận giới hạn, hỗ trợ thu hồi/cấp lại qua đại diện.

### 5.3 Các màn và khối Live

| Screen | Component / nội dung |
|---|---|
| Join | Mở link riêng, kiểm tra quyền tự động; không form nhập mã/tên; thông báo lỗi có hướng dẫn |
| Waiting Room | Tên/lịch Tour, test âm thanh/thiết bị, chờ Staff Start; cùng trang tham quan |
| Live | Video chung, map 2D, POI hiện tại/đích, narration, AI text/voice, trạng thái kết nối |
| End | Hoàn thành hoặc hủy; video dự phòng sau End Early trong hạn link; live/AI đã đóng, không form feedback core |

Map 2D hiển thị robot, hướng thân, tuyến và POI. Dữ liệu pose cũ giữ vị trí cuối và báo stale; không diễn robot di chuyển giả. Hướng camera không phải hướng thân robot. Không thêm ETA động, chọn POI đích hoặc điều khiển camera.

Live responsive: desktop có thể chia vùng; mobile xếp dọc hoặc dùng tab cho map/AI. Component không bắt buộc là route/page riêng.

### 5.4 Nhãn trạng thái Student

| Điều kiện | Nhãn và hành vi |
|---|---|
| SCHEDULED / READY và quyền hợp lệ | Đang chờ buổi tham quan bắt đầu |
| Roster thay thế hoặc lời mời bị thu hồi | Quyền cũ đã hết, hướng dẫn nhận link mới sau duyệt; không giữ quyền bằng matching tên |
| RUNNING + NORMAL + navigation | Đang di chuyển tới [POI] |
| Chuẩn bị góc nhìn | Đang chuẩn bị góc nhìn tại [POI] |
| Quan sát / narration | Đang giới thiệu [POI] |
| Hold tại POI | Đang giữ để quan sát [POI] |
| FRONT | Đang chuẩn bị di chuyển |
| Return leg | Đang về điểm kết thúc |
| RUNNING + NEEDS_ASSISTANCE | Tạm gián đoạn; Staff đang hỗ trợ |
| Mất kết nối trạng thái | Đang kết nối lại; chưa biết trạng thái hiện tại |
| COMPLETED / CANCELLED | Buổi đã hoàn thành / Buổi đã hủy |

NEEDS_ASSISTANCE dừng narration chung nhưng AI riêng vẫn được dùng nếu quyền còn hợp lệ và Tour RUNNING. Khi mất kết nối trạng thái, dừng narration đến khi có snapshot mới. Không hiển thị nhãn lỗi robot chỉ vì một player bị lỗi.

### 5.5 Narration, AI và lỗi browser

- Có nút bật âm thanh, nghe/nghe lại narration hiện tại và tắt tiếng. Autoplay bị chặn thì hướng dẫn bấm nghe.
- Vào muộn/reconnect lấy POI hiện tại và nút nghe; không replay backlog hoặc hứa khôi phục đúng giây đang phát.
- Đổi lượt/đi tiếp/kết thúc thì dừng narration cũ; không phát sự kiện cũ tới muộn.
- AI text và mic → STT → AI → TTS trả riêng browser; dùng một ngôn ngữ của dự án, không cần bộ chọn ngôn ngữ.
- Khi TTS phát, giảm/tạm dừng narration riêng browser đó. Tour và các Student khác vẫn tiếp tục.
- Mic bị từ chối hoặc STT lỗi: thông báo có thể xử lý, cho dùng text. AI/TTS lỗi: hiển thị lỗi và lựa chọn thử lại phù hợp, giữ câu trả lời text nếu đã có.
- Câu hỏi giữ ngữ cảnh POI lúc gửi; nếu Tour đã sang điểm khác, kết quả thể hiện POI liên quan khi cần. AI không hiểu trực tiếp video và không điều khiển robot.
- Khi Tour kết thúc: đóng live/narration/AI, bỏ câu trả lời muộn; chỉ giữ video dự phòng sau End Early theo 5.2. Khi lời mời/registration bị thu hồi thì chặn cả quyền dự phòng; không tự phát TTS muộn.
- Phân biệt lỗi player, mất backend, robot offline và pose stale; lỗi một browser không làm cả Tour chuyển trạng thái lỗi.

Student không có Start/Hold/Next, điều khiển robot/head, chọn điểm đến, xem roster hoặc xem AI chat người khác.

## 6. Staff

### 6.1 Screen Flow

```text
Login → Operations Dashboard → Chọn Tour → Kiểm tra trước Start
  ├─ Chưa READY / điều kiện chưa đạt → Hiện lý do; không Start
  └─ READY + kiểm tra đạt → Start
       ├─ Backend từ chối → Giữ READY, hiện lý do, cập nhật dữ liệu
       └─ Thành công → RUNNING + NORMAL → Operations / Twin
            ├─ Tự động qua các POI → Về điểm cuối → Backend nhận kết quả hợp lệ, xác nhận đủ điều kiện → COMPLETED (system event)
            ├─ Yêu cầu nhánh → Accept/Reject ở điểm hợp lệ → Cập nhật tuyến còn lại
            ├─ Hold tại POI → Giữ quan sát → Next hợp lệ → Tiếp tục tuyến
            ├─ NEEDS_ASSISTANCE → Kiểm tra → Recovery phù hợp / End Early
            └─ End Early + xác nhận/lý do → CANCELLED
  → Chi tiết / Log phiên
```

### 6.2 Dashboard và điều kiện thao tác

Dashboard có Twin 3D vùng chạy tầng 6, video preview, Tour/robot, thông tin đoàn/readiness, tiến độ/POI/bước hiện tại, độ mới dữ liệu, lệnh đang chờ, lỗi và panel Yêu cầu đổi nhánh. Staff dùng để kiểm tra Start, quyết định nhánh và xử lý hỗ trợ; marker không chứng minh đã dừng. Phạm vi roster theo quyền vận hành, không cho xem chat riêng.

| Action | Điều kiện và phản hồi |
|---|---|
| Start | READY; Staff xác nhận định vị/nguồn/FRONT/stream; server kiểm tra readiness và atomically giữ robot cho duy nhất một Tour, còn đoàn APPROVED; ghi audit. Server chặn Start trước giờ công bố theo quyết định scope 4.1 |
| Accept/Reject nhánh | Đúng Tour được phụ trách, yêu cầu PENDING, đúng điểm dừng/lượt còn mở, chưa rời điểm, NORMAL/readiness đạt; Accept kiểm tra Tour chưa dùng lượt đổi nhánh, chốt nhánh và cập nhật UI, không tự bỏ Hold/dispatch; đóng các yêu cầu cạnh tranh; Reject ghi lý do |
| Hold | Tại POI, lượt còn mở và đúng bước cho phép; ngăn tự Next; khi robot đang di chuyển nút Hold bị disabled, kèm lý do |
| Next | RUNNING + NORMAL, đúng lượt/bước; đóng lượt, xóa Hold, yêu cầu FRONT; chỉ navigation khi FRONT hoàn tất |
| Thử lại chặng | NEEDS_ASSISTANCE ở chặng; xác nhận robot dừng và lệnh cũ đã kết thúc/hủy |
| Chạy lại POI | NEEDS_ASSISTANCE khi chuẩn bị/quan sát tại POI; khởi tạo lượt mới |
| Thử lại FRONT | NEEDS_ASSISTANCE ở bước FRONT; hoàn tất mới chuyển chặng |
| Hoàn tất sau hỗ trợ | Chặng về đã thành công nhưng đang giữ do lỗi stream; Staff xác nhận đủ điều kiện, backend kiểm tra rồi COMPLETED |
| End Early | RUNNING; xác nhận ngắn và lý do; kết thúc nghiệp vụ, yêu cầu hủy nhiệm vụ |

Chỉ nhận quyền dùng robot lúc Start; một robot không được hai Tour giữ cùng lúc. Kiểm tra này thuộc luồng cơ sở, không đợi demo emulator. Start thất bại không gửi chặng. Action có lý do disabled và phản hồi rõ, backend kiểm tra lại mọi điều kiện/quyền; log quyết định/lệnh/kết quả.

Yêu cầu không tự dừng dwell. Hết dwell không Hold thì đi tuyến đang có hiệu lực. Đóng lượt trước FRONT/dispatch là hạn Accept; yêu cầu PENDING hết hiệu lực, không đợi robot lăn bánh. Accept/Next/Hold/timer phân xử nhất quán: không đổi mục tiêu sau khi đã đóng lượt, không phát hai chặng. End Early/NEEDS_ASSISTANCE đóng yêu cầu liên quan; reconnect không hồi sinh.

Hold vẫn NORMAL, không đồng nghĩa NEEDS_ASSISTANCE và không phải E-stop. Khi muốn rời POI đang Hold, Staff bấm Next; không thêm Resume timer. Nếu Next đã đóng lượt trước khi Hold tới, UI báo đã chuyển bước.

### 6.3 Luồng tự động và hoàn thành

```text
GoTo → Đến POI và dừng → Quay góc đầu → Chờ ổn định
  → Kích hoạt narration/dwell và chuỗi góc theo cấu hình
  → Đủ thời gian, không Hold → Đóng lượt → FRONT hoàn tất → GoTo kế tiếp
  → Hết POI → Navigation về điểm kết thúc → Dừng, đủ điều kiện → COMPLETED
```

Staff không bấm Next ở mỗi POI trong luồng bình thường. Hết narration, hết POI cuối hoặc hết thời lượng dự kiến chưa tự COMPLETED. UI có bước “Đang về điểm kết thúc”. Nếu lỗi chặng về, chuyển xử lý hỗ trợ; không báo hoàn thành chỉ vì đã giới thiệu xong.

Twin hiển thị nhãn nguồn Physical/Gazebo/Emulator rõ ràng. Các nguồn giả phục vụ kiểm tra riêng; không được chọn nhầm robot Emulator cho buổi thật. Chạy Tour trên Gazebo thuộc môi trường kiểm thử, cần contract/backend xác nhận trước khi bật điều khiển.

### 6.4 Recovery theo tình huống

| Tình huống | Hành động phù hợp sau kiểm tra |
|---|---|
| Lỗi giữa chặng | Xác nhận robot dừng và chặng cũ kết thúc/hủy → Thử lại chặng hiện tại |
| Đã dừng tại POI, lỗi chuẩn bị góc/hình/quan sát | Chạy lại POI từ góc đầu với narration/dwell mới |
| Lỗi FRONT khi rời POI | Thử lại FRONT; hoàn tất mới tiếp tục bước chuyển chặng đang chờ |
| Chặng về đã thành công nhưng giữ do lỗi stream | Xử lý lỗi, xác nhận đủ điều kiện để hoàn tất; không chạy lại chặng về |
| Không xác định được bước/vị trí hoặc không thể khắc phục | End Early |
| Backend restart giữa Tour | Giữ RUNNING + NEEDS_ASSISTANCE → Staff kiểm tra → End Early; V1 không resume |

Không có nút chỉ xóa lỗi/đổi NORMAL rồi tiếp tục timer cũ. Không mở mọi nút Retry đồng thời hoặc tự đổi robot tiếp quản.

Mất nguồn stream chung khi đang navigation, nếu kênh robot còn mới và navigation bình thường, chặng hiện tại có thể hoàn tất rồi giữ; không suy robot đã dừng từ lỗi video. Staff xác nhận nguồn và chọn phục hồi phù hợp. Lỗi robot/mất trạng thái điều khiển áp dụng policy dừng riêng.

End Early → CANCELLED, đóng live/AI và yêu cầu Cancel; Student có video dự phòng tới hạn link theo §5.2. CANCELLED không chứng minh robot dừng; giữ robot cần kiểm tra cho tới xác nhận phù hợp. Không gọi End Early là E-stop, không tự chạy về điểm cuối khi lỗi.

Tour terminal không mở lại để chạy lần hai. Sau restart/End Early, tổ chức lại phải tạo Tour mới → registration/Excel → approve → lời mời mới → Student vào lại → READY/Start. Không tự chuyển quyền hoặc dùng lại link cũ để tiếp tục live.

## 7. Ma trận trạng thái dùng khi vẽ

TourState và RegistrationState là hai lifecycle độc lập. NORMAL/NEEDS_ASSISTANCE là OperationalStatus trong RUNNING; Hold là cờ vận hành, không thêm chúng làm TourState.

| TourState | Admin | Đại diện | Student | Staff |
|---|---|---|---|---|
| SCHEDULED | Sửa/duyệt/gửi lại/thu hồi/cấp lại/chốt/hủy | Đăng ký/sửa/hủy; hỗ trợ lời mời APPROVED | Lịch/phòng chờ nếu đủ quyền | Preview theo quyền, chưa Start |
| READY | Gửi lại/thu hồi/cấp lại, mở lại/hủy trước Start | Xem đăng ký, hỗ trợ lời mời; không sửa roster | Phòng chờ nếu đủ quyền | Kiểm tra và Start |
| RUNNING | Xem/log và hỗ trợ lời mời, vận hành cần role Staff | Gửi yêu cầu nhánh; gửi lại/thu hồi/cấp lại trong đoàn; không sửa roster/email | Live/AI nếu đủ quyền | Accept/Reject, Hold/Next/Recovery/End Early theo state |
| COMPLETED | Xem lịch sử | Xem kết quả | Màn hoàn thành, đóng live/AI | Xem log, tình trạng robot |
| CANCELLED | Xem lịch sử/lý do, thu hồi quyền còn hiệu lực | Xem kết quả, thu hồi lời mời còn hiệu lực | Màn hủy; nếu End Early có video dự phòng tới hạn link | Log, kiểm tra và giải phóng robot khi đủ bằng chứng |

## 8. Bộ màn đề xuất để bắt đầu wireframe

| Nhóm | Screen chính | Component/dialog có thể gộp |
|---|---|---|
| Dùng chung | Login theo cơ chế hiện có | Hết phiên, không đủ quyền, đăng xuất |
| Admin | Tour List, Tour Form/Detail, Registration Detail, History, POI Content và thống kê P1 | Danh sách đoàn, roster, lời mời, điều kiện READY, Reject/Cancel |
| Đại diện | Available Tours, Tour Detail/Register, My Registrations / My Registration | Import, panel lời mời hỗ trợ khi live, yêu cầu nhánh, hủy |
| Student | Join, Waiting Room, Live, End | Map, video, POI, narration, AI, cảnh báo kết nối/quyền |
| Staff | Operations Dashboard/Twin, Chi tiết/Log | Preflight, panel yêu cầu nhánh, tiến độ/độ mới pose, fault/recovery, End Early |

Số page thực tế tùy cách gộp form/tab/dialog, không chốt số lượng từ số feature. Nhóm Admin và Staff có thể dùng chung app/sidebar và log nhưng menu/action theo quyền.

Feedback/rating không có FR trong phiếu v1.2 đã đối chiếu, giữ Future. Không thêm Student Profile, attendance, camera cá nhân hoặc route/scenario editor tự do. Form nội dung POI và thống kê cơ sở đã chốt P1; audit lệnh có từ P0. Hình học tuyến vẫn seed, không xếp toàn bộ quản trị vào Future. Các đầu ra nghiên cứu riêng không đồng nghĩa phải có màn web riêng.

## 9. Checklist review bản vẽ

- Mỗi node được phân biệt là screen, component, action, decision hoặc system event.
- Nhánh qua actor đúng thứ tự đăng ký → duyệt → lời mời; READY không bắt buộc đứng trước phòng chờ.
- Mỗi action quan trọng ghi role, TourState/RegistrationState và kết quả thất bại.
- Join muộn, hết hạn, reconnect, roster sửa/thu hồi quyền có đường ra rõ.
- READY tách khỏi kiểm tra thiết bị trước Start; gửi email không là điều kiện READY.
- Hold/Next/Recovery/End Early đúng bước; có trạng thái chờ kết quả và lý do disabled.
- Hoàn thành có bước về điểm cuối; CANCELLED không bị trình bày như xác nhận robot đã dừng.
- AI/audio có fallback, quản lý tiếng riêng browser và dừng khi Tour kết thúc.
- Log có quyền Admin và Staff; cơ chế quản trị account/content được ghi nhận, không bỏ ngầm.
- Phiên bản tài liệu nguồn và các điểm PENDING được ghi rõ trước khi freeze SRS.


## 10. Quyết định sau review và tình trạng triển khai FE

### 10.1 Quyết định áp dụng cho thiết kế

- Published tour trong flow hiện tại là buổi SCHEDULED được hiển thị cho đại diện; không thêm nút Publish hay state mới.
- Đại diện xem kết quả Reject và lý do trong My Registration. Chưa thêm email từ chối.
- Mọi mutation bị từ chối do dữ liệu/quyền/state đã đổi phải hiển thị thông báo, tải lại dữ liệu và cho người dùng kiểm tra trước khi thử lại. Áp dụng cả Approve, READY, Hủy/Start và sửa roster.
- Hoàn thành bình thường: backend giải phóng robot sau bằng chứng tới điểm cuối, dừng và sẵn sàng. UI hiển thị trạng thái robot mới; không cần Staff bấm hoàn tất mỗi buổi.
- Sau End Early/lỗi: Dashboard hiện robot cần kiểm tra. Action “Xác nhận robot sẵn sàng” yêu cầu Staff xác nhận thực tế; backend phải đối chiếu nhiệm vụ cũ đã kết thúc/hủy, robot đã dừng và đủ điều kiện trước khi giải phóng. Không phải nút gỡ khóa vô điều kiện. Đây là lựa chọn thiết kế bổ sung; hợp đồng với robot/backend chưa triển khai.
- Dùng quản trị account tối thiểu để Admin tạo/cấp quyền Staff/đại diện và khóa/mở. Demo dùng account trong bộ nhớ, không thay thế xác thực thật. Không thêm đăng ký account Student.

### 10.2 Điểm còn mở và giới hạn cập nhật

- Dữ liệu địa điểm còn mở: khảo sát Start/End/POI/nhánh thực trên tầng 6 NVH; Staff chỉ Start từ giờ công bố đã chốt, không còn là câu hỏi nghiệp vụ.
- Nhóm chốt theo ADR-0009; GVHD xem lại các thay đổi tại Review 2. Form nội dung P1 không đồng nghĩa đã làm toàn bộ quản lý hình học route/POI của phiếu.
- Quyền đại diện và luật nhánh đã được mô tả trong scope/UI-FLOW; implementation vẫn phải chốt data/API và kiểm chứng concurrency, không suy từ bản vẽ.
- Sửa email riêng do Admin khi SCHEDULED theo §4.2; không phải gửi lại link trong RUNNING. Email liên hệ đại diện là dữ liệu khác, chưa thêm luồng sửa ngoài quy tắc đăng ký.
- Contract readiness/stop/release, head và media phải được các phần tích hợp kiểm chứng. Không sửa research paper/benchmark trong lượt này.
- Không audit lại toàn bộ frontend trong lượt sửa tài liệu 30/09; mục 10.3 là ghi nhận lịch sử của bản preview 21/09, không khẳng định luồng mới đã có code.

### 10.3 Phạm vi bản xem trước FE — ghi nhận lịch sử ngày 21/09

FE bổ sung flow Admin, đại diện và Student riêng; Student vào bằng link không account. Tour/state/action và roster được mô phỏng trong lớp API mẫu, dữ liệu không lưu lâu dài. Import Excel đọc file thật để preview nhưng chỉ dùng roster giả khi thử. Tạo account, gửi email, điều phối và release robot chỉ mô phỏng; màn hình ghi rõ. Video/audio/voice thực chưa có nguồn nên không giả đang phát hoặc đang nhận giọng nói. Giới hạn file 2 MB/1.000 dòng và quyền browser hai giờ là cấu hình preview, chưa phải ngưỡng đã được pilot xác nhận.

Bản flow cập nhật dùng cho thiết kế và đối chiếu implementation; các mục còn mở ở 10.2 ngăn việc gọi toàn bộ SRS/contract đã freeze. Chưa thay code, gửi email thật hoặc cập nhật file trong Project ngoài máy này.

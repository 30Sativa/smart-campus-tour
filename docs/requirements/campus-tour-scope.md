# CampusTour DT-AMR — Phạm vi và nghiệp vụ chốt trong nhóm sau Review 1

> Ngày biên soạn: 28/09/2026; chốt nghiệp vụ trong nhóm: 30/09/2026, cập nhật phạm vi dữ liệu sau Review 1. GVHD giao nhóm tự quyết theo thông tin nhóm cung cấp và sẽ xem lại ở Review 2; chưa xác nhận GVHD đã duyệt từng thay đổi hoặc chức năng đã triển khai. Quyết định được lưu tại `docs/decisions/0009-review-1-tour-business-scope.md`, `docs/decisions/0010-personal-access-code-entry.md` và `docs/decisions/0011-student-data-use-for-tour.md`.
>
> Căn cứ: phạm vi 19/09/2026; ảnh ghi chú Review 1; phiếu FA26SE184 có lịch sử cập nhật v1.2 ngày 19/09/2026 trong file `FA26SE184_SRS_CampusTour-DT-AMR_v0.1.pdf` (tên file khác phiên bản nội dung); UI-FLOW 21/09 cập nhật cùng lượt này; `docs/architecture.md` đọc lại ngày 30/09. Đã đối chiếu phần nghiệp vụ, vai trò và giới hạn của phiếu, không suy thành bằng chứng GVHD đã duyệt mọi điều chỉnh.
>
> **Giới hạn lượt sửa 30/09:** theo yêu cầu của nhóm, bỏ qua research paper/benchmark/chỉ số nghiên cứu; giữ nguyên các đoạn nghiên cứu từ bản trước, không coi chúng là kết luận được rà soát trong lượt này.
>
> Đây là **baseline nghiệp vụ của nhóm**, tách khỏi đặc tả kỹ thuật dài ngày 19/09. Bản gốc giữ để truy vết; dùng bảng mục 13 khi cập nhật đặc tả cũ, không ghép hai bộ quy tắc mâu thuẫn. Lượt này đồng bộ tài liệu và ADR trong repo; không triển khai code, không sửa phiếu đăng ký hoặc phần nghiên cứu.

> **Quyết định phạm vi của nhóm:** giữ video dự phòng, hướng kiểm chứng nhiều Tour và phạm vi map đã đề xuất; loại nhiều robot cùng một Tour khỏi kế hoạch V1. Email sau duyệt gồm link trang Tour và access code riêng cho từng lời mời; một phòng xem qua máy chiếu chỉ cần một dòng **“Điểm xem chung”** và email người phụ trách, không bắt danh sách cá nhân chỉ để cấp quyền máy chiếu. Dữ liệu Excel chỉ phục vụ đăng ký, lời mời và thống kê vận hành Tour; V1 không liên hệ tuyển sinh sau Tour theo ADR-0011. Người cần vào trên thiết bị riêng hoặc hỏi AI riêng cần lời mời cá nhân. Học sinh nhập access code khi chưa có phiên hợp lệ; không nhập thêm mã phòng/email/OTP hoặc tạo tài khoản Student riêng. Mỗi lời mời giữ tối đa một phiên hoạt động, có thu hồi/cấp lại; chấp nhận giới hạn mã có thể bị chuyển tiếp. Địa điểm demo nhóm xác nhận là **tầng 6 của NVH**. Đây là quyết định của nhóm cho bản scope, chưa phải xác nhận GVHD đã duyệt hoặc cho phép vận hành tại địa điểm. Chọn nhánh có đại diện/Staff là phương án cơ sở; nhóm xếp voting vào Optional/Future, không lên kế hoạch code V1.

## 1. Kết luận đánh giá

Nhóm cụ thể hóa góp ý Review 1 thành phạm vi có thể trình diễn: cách tham gia, điều chỉnh nhánh qua Staff, phục vụ nhiều đoàn và trải nghiệm khi thiết bị lỗi. Giá trị của live so với video cần được đánh giá, không mặc định robot tạo trải nghiệm tốt hơn.

Không nên đưa mọi ví dụ trong ghi chú thành tính năng bắt buộc. Đặc biệt, nhiều robot trong cùng một tour, đi đến vị trí bất kỳ và bản đồ 3D toàn campus có thể tạo thêm những bài toán độc lập. Cần tiếp thu mục tiêu của góp ý và giới hạn cách thực hiện.

| Góp ý trong ảnh | Cách nhóm xử lý | Điều chỉnh đề xuất |
|---|---|---|
| Một mã học sinh, một thiết bị; chặn người vào sau khi lộ mã | Tiếp thu, nhưng phải diễn đạt đúng giới hạn | Mỗi lời mời cá nhân có tối đa một phiên browser đang hoạt động; giữ phiên trước, từ chối phiên mới. Không nhận diện chắc chắn thiết bị vật lý hoặc chủ sở hữu |
| Một mã cho cả trường/khối; cân nhắc mã trường và mã cá nhân | Tiếp thu có phân loại | Mã đoàn chỉ để quản lý; học sinh nhận mã cá nhân qua email cùng link trang Tour. Mã trình chiếu dành cho một phòng xem chung, không phát cho cả khối dùng trên nhiều điện thoại |
| Tuyến lặp lại khác gì video quay sẵn? | Tiếp thu mạnh | Bổ sung quyền đại diện yêu cầu thay đổi phần tham quan còn lại trong phạm vi cho phép; đo trải nghiệm với tình huống cụ thể. Q&A trên tài liệu cũng làm được với video, không dùng riêng AI để biện minh robot |
| Robot hỏng khi live thì hỗ trợ video | Tiếp thu | Chuẩn bị video dự phòng, gắn nhãn ghi sẵn, giữ đường xem nội dung thay thế; xử lý robot và kết quả tour độc lập |
| Nhiều tour, nhiều trường, nhiều robot, nhiều người hỏi cùng lúc | Tiếp thu yêu cầu làm rõ kịch bản | Một robot thật cho demo; nhiều đoàn cùng Tour. Đề xuất bài kiểm chứng hai Tour độc lập với hai robot emulator, tách dữ liệu và tiến độ; nhiều người xem/AI có bài tải riêng |
| Nhiều robot cùng một tour | Nhóm loại khỏi V1 | Giữ một Tour–một robot; ranh giới một AMR thật phù hợp LI-02. Không suy LI-02 cấm mọi kịch bản nhiều robot giả |
| Đại diện muốn khám phá góc khác, có hoặc chưa có điểm visit | Tiếp thu phần có kiểm soát | Cho yêu cầu POI/nhánh đã kiểm chứng trước; điểm mới phải được khảo sát, bổ sung và thử trước buổi sau. Chưa cho click bất kỳ trên map để lái robot |
| Nên có map 3D/sa bàn | Tiếp thu có giới hạn | Giữ Twin 3D cho Staff; Student dùng 2D rõ ràng. Sa bàn 3D chỉ đọc cho Student là phần mở rộng tận dụng mô hình hiện có, không bắt buộc làm thêm bản đồ 3D toàn trường |
| Ghi rõ làm cho trường F, Admin cấu hình tuyến thế nào | Tiếp thu | Demo vật lý tại tầng 6 của NVH theo nhóm; còn cần gắn nội dung campus với POI thực tế. Admin chọn tuyến/biến thể đã được kiểm chứng, đội kỹ thuật quản lý tọa độ và vùng chạy |

## 2. Mục tiêu sản phẩm và giới hạn địa điểm

**CampusTour DT-AMR hỗ trợ học sinh tìm hiểu một campus từ xa qua hình ảnh trực tiếp từ robot, theo dõi vị trí và hỏi đáp riêng; đại diện đoàn có thể đề nghị điều chỉnh hành trình trong những lựa chọn đã được kiểm chứng, còn Staff chịu trách nhiệm vận hành.**

**Địa điểm demo đã được nhóm xác nhận: tầng 6 của NVH.** Giữ nguyên tên viết tắt NVH theo thông tin được cung cấp, không tự mở rộng thành tên cơ sở hoặc địa chỉ. “Trường F” là đối tượng trong ghi chú Review 1; địa điểm demo không tự chứng minh toàn bộ campus được robot tham quan hoặc mô hình hóa.

| Dữ liệu địa điểm | Trạng thái |
|---|---|
| Tầng/khu demo | Đã chọn: tầng 6 của NVH; robot chỉ chạy trong vùng được khảo sát trên tầng này |
| Start và End | Chưa có vị trí thực tế được cung cấp; cần chọn và đánh dấu trên map |
| POI mặc định và nhánh thay thế | Chưa có danh sách thực tế; cần ít nhất 3 POI trong hành trình demo và một lựa chọn thay thế đã thử |
| Map, vùng được đi, đường nối, người hỗ trợ và điều kiện quay/chạy | Cần khảo sát/xác nhận trước vận hành; chọn địa điểm chưa đồng nghĩa đã được phép hoặc đã kiểm chứng an toàn |
| Quan hệ với nội dung campus | Cần ghi rõ POI thực hay điểm bố trí mô phỏng nội dung campus; nếu bố trí mô phỏng thì công khai trong demo/báo cáo |

Trước Review 2, hoàn thiện mô tả cụ thể: **NVH, tầng 6 → Start thực → các POI thực/điểm demo được gắn nhãn → End thực**, kèm nhánh thay thế. Các tên A–D ở mục 6 chỉ là ví dụ logic, chưa phải địa điểm đã xác nhận trên tầng 6.

- Một campus đích, một khu vực trong nhà giới hạn, một tầng hoặc vùng liền mạch đã kiểm chứng; không tuyên bố phủ toàn trường.
- Một robot thật, demo ít nhất 3 POI phân biệt và ít nhất 2 chặng navigation thực giữa POI; mục tiêu khoảng 30 phút trở xuống. Video ghi sẵn hoặc quay đầu tại chỗ không thay chặng thật.
- Nhiều đoàn, có thể từ nhiều trường THPT, cùng tham gia một Tour. Nhiều trường nguồn không có nghĩa hệ thống vận hành nhiều campus đích.
- Một ngôn ngữ cho narration và STT/LLM/TTS, mặc định tiếng Việt. English chỉ là lựa chọn thay thế nếu nhóm chủ động đổi; không mở lại multilingual trong lần review này.
- Một nguồn hình/góc nhìn chung cho mỗi Tour; Student không lái robot hoặc điều khiển đầu quay.
- Quest là nguồn hình ưu tiên theo bản cũ; phương án camera RGB/UVC vẫn cần thử và ghi nhận nếu thay. Chưa xác nhận thiết bị nào đã đạt.

## 3. Giá trị so với video quay sẵn

Video quay sẵn có ưu điểm về độ ổn định và khả năng xem lại. Nếu demo chỉ cho robot đi đúng một vòng, phát narration cố định và chatbot tra cứu tài liệu, phản biện “mở video cũng được” là có cơ sở. Live tự nó chưa chứng minh trải nghiệm tốt hơn.

Giá trị cần chứng minh nằm ở ba hành vi:

1. **Quan sát trực tiếp:** học sinh xem khu vực đang diễn ra ở thời điểm tour, biết robot đang ở đâu và đang xem điểm nào. Không hứa AI hiểu mọi cảnh trong video.
2. **Tác động có giới hạn tới buổi tham quan:** đại diện yêu cầu đổi sang nhánh hợp lệ; Staff phản hồi và thực hiện khi phù hợp với toàn buổi. Muốn quan sát lâu hơn, Staff dùng Hold tại POI; V1 không có loại yêu cầu gia hạn thời gian riêng của đại diện.
3. **Tìm hiểu riêng:** mỗi học sinh có thể hỏi về nội dung trường/POI mà không gián đoạn người khác. Đây là giá trị của hệ thống phục vụ tham quan; không phải bằng chứng riêng rằng robot tốt hơn video.

Bài đánh giá trải nghiệm dùng cùng nội dung campus và thời lượng tương đương cho video và tour live: giao nhiệm vụ tìm hiểu một POI, tìm câu trả lời và đề nghị khám phá thêm một lựa chọn hợp lệ. Ghi khả năng hoàn thành nhiệm vụ, độ dễ theo dõi và cảm nhận hữu ích. Nếu thử cả hai với cùng nhóm nhỏ, đổi thứ tự giữa các nhóm khi có thể và công khai số người/cách chọn mẫu. Không suy một demo nhỏ chứng minh tăng tuyển sinh hoặc hiệu quả bán hàng.

Đây là bài đánh giá trải nghiệm sản phẩm được đề xuất thêm; không thay câu hỏi nghiên cứu chính trong phiếu và không tự kích hoạt tính năng rating/feedback trong app.

Với vài nhánh định sẵn, video tương tác cũng cho phép chọn nhánh. Nhóm không tuyên bố lựa chọn nhánh tự nó làm robot tốt hơn video: hệ thống chứng minh hình ảnh tại thời điểm đang diễn ra và chuỗi yêu cầu → Staff quyết định → robot thật đổi đường. Mức hữu ích đối với học sinh là điều cần đánh giá ở R1-15, không phải kết luận có sẵn. Bài đánh giá trải nghiệm là đề xuất bổ sung cần GVHD xác nhận, chưa là gate bắt buộc.

## 4. Vai trò và luồng tham gia

| Vai trò | Trách nhiệm |
|---|---|
| Admin | Tạo lịch, chọn tuyến/biến thể hợp lệ, duyệt đăng ký, cấp hoặc thu hồi lời mời, chốt nội dung |
| Đại diện đoàn | Đăng ký danh sách cấp lời mời; hỗ trợ gửi lại/thu hồi/cấp lại trong đoàn kể cả RUNNING; gửi yêu cầu nhánh. Sửa email riêng do Admin thực hiện khi SCHEDULED theo mục 5.2 |
| Student | Xem trực tiếp hoặc nội dung dự phòng, theo dõi map, hỏi AI riêng khi có quyền |
| Staff | Kiểm tra trước Start, vận hành, quyết định yêu cầu thay đổi, xử lý lỗi và kết thúc buổi |
| Người hỗ trợ tại chỗ | Kiểm tra robot/vùng chạy và can thiệp vật lý khi cần; có thể kiêm Staff nếu điều kiện buổi thử cho phép |
| Đội kỹ thuật | Khảo sát và kiểm chứng map/POI/đường nối; nạp hình học tuyến/nhánh bằng seed/script ngoài web. Admin sửa nội dung qua form P1; không có editor tọa độ tự do |

Đại diện đăng nhập bằng tài khoản vai trò **Representative**, được cấp qua cơ chế account/role của hệ thống như hướng UI-FLOW; mã/phiên Student không cấp quyền quản lý đoàn. Tại **My Registration/Đăng ký của tôi**, khối **Lời mời** hỗ trợ truy cập; khi Tour RUNNING có khối **Yêu cầu đổi nhánh** hiển thị POI hiện tại, điểm phân nhánh được phép yêu cầu, lựa chọn hợp lệ và trạng thái yêu cầu. Backend kiểm tra tài khoản sở hữu đúng registration APPROVED của Tour, không tin ID do browser gửi. Đây là đặc tả cần triển khai/kiểm chứng, không khẳng định màn/API đã tồn tại.

Đại diện xem live bằng lời mời cá nhân của chính mình hoặc lời mời điểm xem chung mình phụ trách; không dùng mã của học sinh. Vai trò Representative không tự tạo Student session. Không cần mở live để gửi yêu cầu từ My Registration. Mọi tài khoản đang hoạt động có role STAFF được xử lý mọi Tour trên dashboard; V1 không phân công Staff theo Tour (ADR-0012).

Luồng chính:

```text
Admin tạo Tour + chọn tuyến/biến thể
→ Đại diện gửi Excel cấp lời mời: cá nhân và/hoặc điểm xem chung
→ Admin duyệt → gửi link trang Tour + mã riêng tới từng email đã duyệt
  (lớp chỉ xem máy chiếu không cần danh sách học sinh)
→ Admin Chốt: READY
→ Người xem mở link → nhập mã → server cấp/khôi phục session → phòng chờ
→ Staff kiểm tra + Start
→ Robot đi tuyến, trình chiếu live/map/narration; học sinh hỏi riêng
→ Đại diện có thể yêu cầu thay đổi hợp lệ → Staff chấp nhận/từ chối
→ Hoàn tất hoặc kết thúc sớm; có nội dung dự phòng nếu buổi bị gián đoạn
```

Giữ các trạng thái Tour `SCHEDULED → READY → RUNNING → COMPLETED/CANCELLED`; cho Mở lại `READY → SCHEDULED` trước Start. Registration giữ `SUBMITTED/APPROVED/REJECTED/CANCELLED`. Giờ dự kiến không tự kích hoạt robot.

`OperationalStatus = NORMAL | NEEDS_ASSISTANCE` là trạng thái vận hành bên trong Tour RUNNING, không thêm vào TourState. Hold là cờ ngăn tự rời POI, không phải pause chuyển động hoặc một TourState mới.

### 4.1 Quyền Start và giờ công bố — quyết định của nhóm

Giữ phân công hiện tại: Admin quản lý lịch/duyệt/chốt buổi; Staff có role hợp lệ kiểm tra robot, nguồn hình và vùng chạy rồi bấm Start; mọi Staff được vận hành mọi Tour, không có quyền sở hữu buổi riêng. Không chuyển Start sang Admin chỉ vì Admin là người duyệt danh sách. Một người có thể kiêm cả hai vai nếu được cấp quyền, nhưng quyền quản trị không tự bỏ qua điều kiện vận hành.

**Nhóm quyết định V1:** cho vào phòng chờ và kiểm tra thiết bị trước giờ; chỉ bắt đầu hành trình chính thức từ giờ đã công bố trở đi. Ví dụ lịch 09:00: 08:45 Staff chuẩn bị, học sinh xem lịch/kiểm tra âm thanh; từ 09:00 Staff được Start khi Tour READY và hệ thống đủ điều kiện. Đủ giờ không tự chạy robot, thiếu readiness vẫn không được Start. Đã đến giờ mà chưa Start thì trang tiếp tục báo chưa bắt đầu, không hiển thị live giả hoặc vòng chờ không giải thích.

Mục đích là tránh học sinh đến đúng lịch nhưng đã bỏ lỡ phần đầu. Không cần thêm quy trình Admin duyệt mỗi lần Staff Start, không buộc mọi học sinh phải có mặt và không lấy số browser online làm bằng chứng cả đoàn đồng ý đi sớm.

Nếu cần đổi giờ sớm hơn, Admin thống nhất với các đại diện bị ảnh hưởng, Mở lại buổi chưa Start về SCHEDULED nếu cần, cập nhật lịch, gửi thông báo thay đổi tới người tham gia và Chốt lại. Đổi giờ đơn thuần giữ lời mời/mã hiện có; cập nhật thời hạn liên quan nếu cần, không coi là đổi roster để cấp lại toàn bộ mã. Staff vẫn là người Start theo lịch mới khi đủ điều kiện. V1 không có nút bỏ qua giờ công bố để chạy sớm ngay lập tức.

Kiểm chứng bắt buộc: Start trước giờ bị chặn ở server; đúng giờ nhưng chưa READY/robot chưa sẵn sàng vẫn bị chặn; Start lặp không tạo hai lần chạy; đổi lịch đồng thời với Start cho một kết quả nhất quán và người xem nhận lịch mới.

## 5. Email gồm link trang Tour và access code riêng

**Quyết định chốt tại ADR-0010:** Đại diện gửi Excel → Admin duyệt → gửi email gồm link trang Tour và access code riêng → học sinh mở link, nhập mã → server kiểm tra và tạo session → phòng chờ/live. Đây là cập nhật thay lựa chọn cũ bấm link bí mật để vào trực tiếp. Không yêu cầu nhập lại email, họ tên/lớp, mã phòng, OTP bổ sung hoặc tạo tài khoản Student.

Gửi ngay sau duyệt, không chờ sát giờ. Access code dùng lại trong hạn lời mời, không phải mã chỉ dùng một lần hay OTP hết hạn vài phút sau duyệt. Link chỉ định vị trang Tour và không chứa bí mật cấp quyền; biết link hoặc email không đủ để vào phòng. Session hợp lệ giúp reload/quay lại không cần nhập mã lại.

Ví dụ đoàn 100 học sinh có 100 dòng/email đã duyệt và 100 mã riêng. An và Bình dùng mã của mình đều vào được, dù khác thời điểm. Chỉ khi browser khác dùng cùng mã của An trong lúc phiên An đang hoạt động thì bị từ chối; không có giới hạn một người cho cả đoàn.

### 5.1 Tour, lời mời, mã và session

| Khái niệm | Ý nghĩa và giới hạn |
|---|---|
| Tour | Buổi tham quan có lịch và trạng thái SCHEDULED/READY/RUNNING/COMPLETED/CANCELLED |
| Link trang Tour | Mở đúng buổi, có thể dùng chung; bản thân URL không cấp quyền live/AI |
| Mã đoàn | Tra cứu/nhận diện đoàn, không cấp quyền xem cá nhân |
| Lời mời | Gắn một dòng Excel đã duyệt với đúng Tour; giữ định danh khi gửi lại hoặc cấp lại mã |
| Access code cá nhân | Bí mật riêng gắn với lời mời của học sinh và email đã duyệt; nhập để xin session |
| Access code điểm xem chung | Cùng cơ chế với cá nhân; một mã gửi tới email người phụ trách, một phiên máy chiếu |
| Session | Phiên browser do server cấp sau kiểm tra mã hoặc khôi phục phiên hợp lệ; không phải một Tour khác hay mã học sinh phải tự nhập |

Một khối xem bằng một máy chiếu dùng một dòng điểm xem chung. Người cần đồng thời xem/hỏi riêng trên điện thoại cần dòng cá nhân và mã riêng. AI trên máy chiếu là nội dung chung. Không phát mã trình chiếu cho nhiều điện thoại rồi vẫn tuyên bố một lời mời chỉ một phiên.

**Dữ liệu học sinh:** theo ADR-0011, Excel chỉ phục vụ đăng ký, gửi/quản lý lời mời và thống kê vận hành Tour. V1 không liên hệ tuyển sinh sau Tour, không xây CRM, consent workflow hoặc hồ sơ học sinh. Mã chỉ liên kết lượt vào với dòng đã duyệt, không xác minh danh tính hay attendance. Điểm xem chung chỉ có dữ liệu người phụ trách; không suy số người trong phòng và không bắt roster người chỉ xem chung.

Một đăng ký có thể trộn hai loại dòng; một đại diện có nhiều đăng ký/nhóm cho cùng Tour. Đây là danh sách cấp lời mời, không mặc định đầy đủ mọi người hiện diện. Không xây thêm cây tổ chức trường–khối–lớp hoặc loại dòng mới chỉ để thu dữ liệu.

### 5.2 Đăng ký và phân phối

- Excel giữ `LoaiDong` (`CA_NHAN` hoặc `DIEM_XEM_CHUNG`), `HoTen`, `Email` bắt buộc; `Lop` tùy chọn. `HoTen` là tên cá nhân hoặc điểm xem chung. Kiểm tra loại dòng, email thiếu/sai/trùng trong Tour trước duyệt; không đoán loại từ tên, không coi định dạng email là xác minh chủ hộp thư. Mẫu này là yêu cầu mục tiêu, parser chưa được triển khai.
- Backend tạo định danh dòng/lời mời; sau duyệt cấp mã riêng cho từng dòng. Hai người trùng tên/lớp nhưng email khác vẫn có mã riêng. Gửi từng thư riêng, không lộ roster hoặc mã người khác qua thư chung.
- Chỉ để cấp quyền một máy chiếu, một dòng `DIEM_XEM_CHUNG` là đủ, không bắt roster học sinh hoặc số người. Máy chiếu + 5 em muốn hỏi riêng: một dòng điểm xem chung + 5 dòng cá nhân. Không thu dòng cá nhân chỉ nhằm liên hệ tuyển sinh sau Tour. Một email không nhận hai lời mời trùng trong cùng Tour; đại diện dùng lời mời của chính mình hoặc điểm mình phụ trách.
- Email gồm tên/lịch Tour, nút “Mở trang tham gia”, nhãn **“Mã truy cập”**, hạn dùng và hướng dẫn hỗ trợ/không chia sẻ mã. Không in mã đoàn trong email/giao diện Student; mọi chỗ người xem nhập hoặc nhận mã đều dùng cùng nhãn này theo ADR-0010. Student mở trang, sao chép/dán mã và bấm “Tham gia”. Không nhúng mã hoặc dữ liệu cá nhân vào URL.
- Form đăng ký và email mời nêu dữ liệu cần cho đăng ký/lời mời và đầu mối hỗ trợ quyền truy cập. Không có checkbox đồng ý tuyển sinh hoặc quy trình liên hệ sau Tour trong V1. Trước khi dùng dữ liệu thật, đơn vị vận hành xác nhận quyền cung cấp và thời gian giữ dữ liệu phù hợp; xem ADR-0011.
- Approval và kết quả gửi thư độc lập: thư lỗi không chuyển APPROVED thành REJECTED. Admin/đại diện được gửi lại riêng; dịch vụ chấp nhận gửi không chứng minh thư tới inbox/được đọc. Hướng dẫn kiểm tra spam và vào phòng chờ sớm.
- **Gửi lại** khi thất lạc thư: gửi đúng mã hiện hành còn hiệu lực tới email đã duyệt, không đổi mã, tạo thêm lời mời hoặc đá phiên đang xem. **Thu hồi/cấp mới** khi nghi lộ mã hay cần vô hiệu phiên cũ: thu hồi mã và session cũ, tạo mã mới cho cùng lời mời, gửi tới email đã duyệt. Nếu gửi thư mới lỗi, mã cũ vẫn bị thu hồi; retry gửi mã mới hiện hành, không xoay mã liên tục.
- Mã phải khó đoán, có hạn và thu hồi được; giới hạn thử sai ở server. Không ghi mã/token vào log, URL, analytics hoặc prompt AI; không đưa roster vào prompt AI. Cách lưu/phân phối mã để hỗ trợ gửi lại phải được thiết kế an toàn khi triển khai; chưa chốt schema/API hoặc độ dài mã trong scope này.
- Thay cả roster trước READY phải cảnh báo thu hồi lời mời/mã/phiên cũ toàn đoàn và duyệt lại; không gán lại theo tên trùng. READY phải Mở lại về SCHEDULED trước thay đổi đăng ký.
- **Sửa riêng email:** chỉ Admin khi SCHEDULED, chọn đúng dòng, kiểm tra định dạng/trùng và xác nhận/audit. Dòng APPROVED giữ định danh/approval, thu hồi mã/phiên cũ rồi cấp mã mới tới email đã sửa; không ảnh hưởng dòng khác. Dòng chưa duyệt chỉ sửa dữ liệu, chờ approve mới gửi. READY phải Mở lại; RUNNING không đổi người nhận. Thư mới lỗi không khôi phục mã cũ. Đây không phải quyền sửa mọi thuộc tính/loại dòng.
- READY cần ít nhất một đăng ký APPROVED với một dòng hợp lệ; một điểm xem chung đủ về quyền truy cập, không chứng minh đã thu đủ thông tin mọi học sinh. Gửi thư lỗi không chặn READY.

### 5.3 Một phiên hoạt động và hỗ trợ mã

**Phiên đang hoạt động** là phiên browser do server giữ độc quyền cho một lời mời, chưa đăng xuất/bị thu hồi/hết hạn, còn trong thời gian hoạt động hoặc khoảng giữ kết nối hữu hạn. Tab chung phiên không tính thêm người; đóng tab không phải tín hiệu đăng xuất chắc chắn.

Hai browser nhập cùng mã gần đồng thời: server chỉ cấp một phiên; giữ phiên trước, browser sau nhận “Mã này đang được sử dụng trên trình duyệt khác” và hướng dẫn liên hệ đại diện. Không tự đẩy phiên trước ra. Giới hạn theo lời mời, không theo Tour/đoàn; không tuyên bố nhận diện thiết bị vật lý.

Reload/reconnect hoặc mở lại trên browser còn session hợp lệ: khôi phục session, không nhập mã lại. Mất mạng giữ phiên trong khoảng hữu hạn đã cấu hình. Đăng xuất kết thúc session nhưng không thu hồi mã; khi hết session/đăng xuất, nhập lại mã còn hiệu lực để xin phiên mới. Phiên cũ phải hết quyền trước khi cấp phiên độc quyền khác.

Đổi thiết bị: đăng xuất browser cũ, mở link trên browser mới và nhập mã. Nếu không truy cập được phiên cũ hoặc nghi lộ mã, nhờ đại diện/Admin thu hồi và cấp mới. Người chỉ cầm mã không được giành phiên trước hoặc tự đổi email nhận mã. Có ca kiểm chứng mã/session cũ quay lại sau khi cấp mới.

| Người hỗ trợ | Quyền |
|---|---|
| Đại diện đã đăng nhập | Gửi lại/thu hồi/cấp mới cho registration APPROVED thuộc đoàn mình, tới đúng email đã duyệt |
| Admin | Hỗ trợ toàn hệ thống; sửa email theo mục 5.2 là thao tác riêng |
| Staff chỉ có role vận hành | Hướng dẫn liên hệ đại diện/Admin; không mặc nhiên có quyền cấp mã |

Gửi lại/cấp mới được thực hiện khi Tour SCHEDULED, READY hoặc RUNNING và lời mời còn hạn, không cần Mở lại hay dừng Tour. Thu hồi được phép cả khi chỉ còn quyền video dự phòng. Không hồi sinh lời mời hết hạn, kéo dài hạn vì cấp mới hoặc mở lại live/AI cho Tour terminal. Ghi actor, thời điểm, lời mời, thao tác và kết quả; không ghi mã bí mật. Bấm lặp không tạo thêm quyền.

**Giới hạn đã chấp nhận:** mã bị chia sẻ/lộ vẫn có thể bị người khác dùng trước chủ email. Một session không chứng minh danh tính hoặc attendance. Link và mã cùng một email không phải xác thực hai yếu tố. V1 không thêm OTP, account Student hoặc fingerprint phần cứng.

Q&A gắn session và từng request, không dùng conversation chung theo mã đoàn. Kiểm tra quyền hiện hành tại API, realtime/reconnect và khi trả kết quả; token còn hạn không bỏ qua revoke. Video qua URL công khai có thể bị mở trực tiếp ngoài web: phải công khai giới hạn hoặc chọn cơ chế bảo vệ media trước khi tuyên bố kiểm soát cả stream.

### 5.4 Mở sớm, thoát ra và quay lại

Cùng một trang Tour đổi nội dung theo trạng thái. Khi chưa có session hợp lệ, hiện ô mã và nút “Tham gia”; chỉ mở link không được tính là vào phòng. Sau mã hợp lệ hoặc khôi phục session, áp dụng:

| Tình huống | Hành vi |
|---|---|
| Chưa tới ngày hoặc Staff chưa Start | Lịch/phòng chờ, kiểm tra âm thanh; chưa live/AI. Có thể đóng và quay lại sau |
| Đang ở phòng chờ khi Staff Start | Chuyển sang live, không nhập mã/xin vào lại; âm thanh theo quyền browser |
| Quay lại khi RUNNING, session còn hợp lệ | Khôi phục phiên và tiến độ hiện tại, không nhập mã hoặc replay từ đầu |
| Đã đăng xuất/hết session hoặc dùng browser mới | Nhập lại mã còn hiệu lực; vẫn kiểm tra một phiên theo mục 5.3 |
| Tour COMPLETED hoặc CANCELLED | Báo kết thúc/hủy; chỉ nội dung dự phòng đủ điều kiện mục 7, không live/AI |
| Mã sai/sai Tour/hết hạn/đã thu hồi | Không cấp session; báo mã không hợp lệ/không còn hiệu lực và hướng dẫn hỗ trợ, không lộ roster |

Đóng tab không thu hồi mã. Một lần xem lịch trước nhiều ngày không khóa phiên tới ngày Tour; khoảng giữ kết nối phải hữu hạn. Server kiểm tra đúng Tour, approval, hạn và revoke khi vào/reconnect, kể cả phiên đã có. Mã đúng không bỏ qua trạng thái buổi.

Kiểm chứng trước ngày/quay lại đúng ngày, đăng xuất/nhập lại, reconnect đúng lúc Start, vào muộn, kết thúc, mã sai và browser cạnh tranh. Độ dài/hạn mã, hạn session, khoảng giữ kết nối và giới hạn thử sai là thông số phải chốt trước diễn tập, không tự gán số trong tài liệu này.

### 5.5 Mục đích và vòng đời dữ liệu

Áp dụng ADR-0011. Họ tên/email trong Excel dùng để tổ chức đăng ký, cấp quyền lời mời và hỗ trợ buổi Tour; thống kê chỉ giữ số liệu tổng hợp không nhận diện cá nhân. V1 không dùng dữ liệu để liên hệ tuyển sinh sau Tour, không lưu lịch sử AI Q&A thành hồ sơ và không xây màn consent/yêu cầu dữ liệu.

Chỉ giữ dữ liệu cá nhân trong thời gian cần cho đăng ký, quyền truy cập và hỗ trợ Tour theo cấu hình vận hành; xác định cấu hình trước khi dùng dữ liệu thật. Khi các mục đích này hết hạn, xóa/khử định danh dữ liệu cá nhân khi phù hợp; audit không ghi email/mã/roster và không được xóa log để thay việc xử lý dữ liệu nguồn. Demo dùng dữ liệu giả hoặc dữ liệu được cung cấp phù hợp.

## 6. Tuyến linh hoạt và quyền cấu hình của Admin

### 6.1 Chuẩn bị trước Tour

**Cập nhật theo ADR-0012 (30/09/2026):** nhóm chọn dwell cố định theo tuyến trong seed và mọi Staff vận hành mọi Tour; không thêm bảng dwell theo Tour hoặc phân công operator. Đây là quyết định thiết kế, chưa xác nhận backend/UI đã triển khai.

Đội kỹ thuật tạo POI và các tuyến/nhánh có đường nối đã thử, kèm map, điểm dừng, hướng quan sát, narration và thời lượng dự kiến. Admin chọn một tuyến và các biến thể được phép, xem trước POI/thời lượng rồi chốt buổi. Admin có thể sửa mô tả buổi khi SCHEDULED; thay đổi cấu hình ảnh hưởng đường chạy phải qua kiểm chứng kỹ thuật.

**Cách nạp V1 đã chốt:** đội kỹ thuật dùng seed/script có kiểm soát nạp map/frame, tọa độ và hướng quan sát, tuyến/thứ tự POI/Start/End, đường nối/nhánh đã thử và giới hạn thời lượng vào DB. DB là nguồn điều phối, không sửa hình học giữa Tour. Admin trên web chọn tuyến, bật/tắt nhánh và xem thời gian dừng cố định theo tuyến. Dwell do kỹ thuật seed và kiểm chứng; V1 không có cấu hình dwell riêng theo Tour (ADR-0012). **Form P1** cho Admin sửa tên hiển thị, mô tả và upload/thay audio thuyết minh của POI; không sửa ID/tọa độ, không vẽ tuyến. P1 vẫn thuộc V1 bắt buộc, thực hiện sau luồng P0. Phạm vi quản lý hình học tuyến vẫn thu hẹp so với phiếu; form nội dung không đồng nghĩa đã làm toàn bộ CRUD route/POI.

Không cần editor vẽ đường tự do. Admin cũng không được tùy ý đảo mọi POI chỉ vì các POI riêng lẻ đã hợp lệ: đường nối và thứ tự mới có thể chưa được kiểm chứng. Nếu UI cho chọn thứ tự thì chỉ chấp nhận những tổ hợp đã được phê chuẩn.

READY khóa tuyến cơ sở **và tập biến thể cho phép**. Chọn một biến thể trong lúc RUNNING là thao tác vận hành đã được dự liệu, không sửa map/tọa độ hoặc nội dung dùng chung sau Chốt.

**Phân biệt tạo buổi với tạo tuyến:** Admin tạo một buổi mới bằng cách chọn một tuyến có sẵn. Việc thêm một tuyến chạy hoàn toàn mới chưa phải chức năng editor của V1; đội kỹ thuật chuẩn bị và kiểm chứng cấu hình để Admin có thêm lựa chọn. Người cấu hình kỹ thuật có thể cùng là Admin ngoài đời, nhưng quyền sửa tọa độ không nằm trong màn hình vận hành thường ngày.

Ví dụ cấu hình minh họa:

```text
Tuyến mặc định: A → B → C → Điểm kết thúc
Biến thể:      A → D  → C → Điểm kết thúc
Điểm cho chọn: A
Lựa chọn:      B hoặc D
```

Hai nhánh đều phải được thử đường chạy, có nội dung và thời lượng phù hợp. Có sẵn tọa độ của D chưa đủ để khẳng định mọi đường tới đó đều đã được kiểm chứng.

| Trên màn hình tạo/sửa buổi, Admin có thể | Giới hạn V1 |
|---|---|
| Nhập tên, lịch dự kiến, mô tả buổi | Sửa khi SCHEDULED; giờ đến không tự Start |
| Chọn tuyến từ danh sách và xem map/thứ tự POI | Ví dụ chọn tuyến mặc định ở trên; không tự kéo điểm tới tọa độ mới |
| Bật/tắt lựa chọn nhánh đã chuẩn bị cho buổi | Ví dụ cho phép chọn D tại A, hoặc giữ tuyến mặc định |
| Xem thời gian dừng cố định theo tuyến | Kỹ thuật seed và chạy thử dwell cùng narration/góc quay, trong giới hạn buổi đã công bố; Admin không chỉnh dwell theo Tour |
| Xem lại và Chốt nội dung | READY khóa cấu hình. Thay nhánh hợp lệ lúc chạy do Staff xử lý, không phải mở editor sửa tuyến |

Thêm POI/tọa độ/map/đường nối thuộc chuẩn bị kỹ thuật. Form nội dung có phân quyền Admin, khóa khi bất kỳ Tour READY/RUNNING dùng POI/asset đó, gồm cả nhánh cho phép; backend kiểm tra lại lúc ghi để tránh đổi đồng thời với READY. Giữ truy vết nội dung buổi đã kết thúc: mỗi lần upload audio tạo asset/URL mới, giữ asset cũ còn cần cho lịch sử; khi kích hoạt narration ghi snapshot AudioUrl, NarrationText và NarrationSeconds đã dùng trong TourEvents theo ADR-0012. Khi đổi audio, hiện thời lượng và cảnh báo nếu dài hơn dwell tại các cấu hình đang dùng; Admin phải chỉnh audio cho phù hợp dwell cố định trước Chốt READY. Nếu cần đổi dwell, kỹ thuật sửa cấu hình seed và kiểm chứng lại, không sửa cấu hình đang được Tour READY/RUNNING dùng. Chưa xử lý thì backend chặn READY kèm lý do. Không cần tự tối ưu thời gian hoặc dùng Hold trong live để thay việc chuẩn bị.

### 6.2 Yêu cầu đổi nhánh trong buổi

1. Đại diện đăng nhập, mở My Registration của đoàn APPROVED, chọn nhánh hợp lệ cho điểm phân nhánh đang dừng hoặc điểm kế tiếp chưa đi qua trên hành trình hiện hành. Mỗi yêu cầu gắn đúng Tour, lượt điểm phân nhánh và nhánh trong tập đã chốt. Student không gửi lệnh navigation.
2. Staff xem yêu cầu, **thời lượng dự kiến đã cấu hình sẵn** và các đoàn cùng xem, rồi Accept/Reject với lý do ngắn. Không tính ETA động. Staff cũng có thể chọn trực tiếp nhánh hợp lệ; voting là Future.
3. Chỉ Accept khi registration gửi yêu cầu vẫn APPROVED và quyền còn hợp lệ, đúng lượt điểm phân nhánh đang mở, robot đã dừng, chưa bắt đầu bước rời điểm, telemetry còn mới, không có chặng chưa rõ kết quả và đủ điều kiện vận hành. Yêu cầu giữa chặng chờ tới điểm dừng tương ứng; không bẻ tuyến giữa đường.
4. Accept chốt phần tuyến còn lại và cập nhật viewer, ghi người quyết định/tuyến trước–sau. **Accept không tự cho robot đi hoặc bỏ Hold**; rời điểm vẫn theo Next/dwell hợp lệ. ACCEPTED không chứng minh robot đã tới POI.
5. Trước đi phải đóng lượt cũ, hoàn tất FRONT và kiểm tra vận hành. Mỗi Tour tối đa một lần đổi nhánh được chấp nhận, kể cả Staff chọn trực tiếp; REJECTED/EXPIRED không tiêu lượt, retry không tính thêm. Sau khi chốt không nhận thay đổi nhánh mới, không đổi đi đổi lại.

**Quyền cuối cùng:** đại diện gửi yêu cầu; mọi tài khoản đang hoạt động có role STAFF được quyết định trên mọi Tour; Admin cấu hình trước buổi, không dùng màn sửa tuyến để đổi hành trình RUNNING. Backend kiểm tra quyền/state trước thực thi. Muốn quan sát lâu hơn Staff dùng Hold tại POI, không có loại yêu cầu gia hạn thời gian từ đại diện.

**Luật yêu cầu:** `PENDING → ACCEPTED / REJECTED / EXPIRED`. Mỗi đại diện có tối đa một yêu cầu PENDING cho cùng Tour/lượt phân nhánh; gửi lặp không tạo bản mới. Khi một nhánh được chấp nhận và dùng lượt đổi duy nhất, mọi yêu cầu PENDING còn lại của Tour đóng EXPIRED với lý do hết lượt đổi nhánh. Đây là trạng thái của yêu cầu nghiệp vụ, không thêm TourState hoặc lệnh ROS; quyết định gốc ở ADR-0009 §4.

**Luật timer:** gửi yêu cầu không tự Hold/đặt lại dwell. Nếu cần thêm thời gian xử lý, Staff bấm Hold khi đang quan sát và lượt còn mở. Hết dwell không Hold thì đi tiếp theo tuyến có hiệu lực. Khi đóng lượt rời điểm, **chỉ** các PENDING gắn với đúng lượt điểm phân nhánh vừa đóng hết hạn, trước FRONT/dispatch. Yêu cầu cho điểm phân nhánh sắp tới vẫn PENDING khi robot rời một POI trung gian. End Early hoặc NEEDS_ASSISTANCE làm hết hạn mọi PENDING của Tour; mất quyền registration chỉ làm hết hạn các yêu cầu của registration đó. Không đợi bánh xe chuyển động mới đóng hạn Accept tại điểm tương ứng.

Accept, Next, timer và Hold cạnh tranh phải được phân xử nhất quán tại server. RowVersion chỉ là token; backend phải dùng ghi có điều kiện, xử lý conflict và chỉ phát lệnh từ quyết định đã commit thắng cạnh tranh: hoặc nhánh mới được chốt trước và được dùng, hoặc lượt đã đóng thì Accept bị từ chối. Callback/reconnect không hồi sinh yêu cầu. Demo phải có một nhánh thay thế được thực hiện thật; không chỉ đổi marker.

Nhiều đoàn cùng Tour xem chung hành trình sau thay đổi. Muốn tuyến độc lập cần hai Tour với hai robot khả dụng hoặc hai khung giờ; một robot không thực hiện hai hành trình đồng thời.

### 6.3 Điểm chưa có POI

Tiếp thu nhu cầu khám phá mới nhưng chưa thực hiện tức thời trong V1. Staff có thể ghi nhận đề nghị; đội kỹ thuật khảo sát vùng đi, bổ sung tọa độ/nội dung và kiểm chứng đường nối cho buổi sau. Không cam kết AI sinh route, click tọa độ bất kỳ, điều khiển từ browser hoặc đi vào khu vực chưa có map chỉ vì đại diện yêu cầu.

Phản biện có thể trình bày: “Nhóm hỗ trợ linh hoạt trong vùng đã kiểm chứng. Khám phá tự do là bài toán navigation và vận hành khác; nhóm ghi nhận điểm mới để chuẩn bị cho buổi sau, thay vì hứa robot đi mọi nơi ngay trong buổi live.”

### 6.4 Bình chọn nhánh — Optional/Future, ngoài kế hoạch V1

Nhóm quyết định: giữ ý tưởng voting làm hướng mở rộng, không code hoặc lấy làm gate Review 2. Chỉ mở lại khi có yêu cầu được nhóm/GVHD chốt cùng nguồn lực; hoàn thành tuyến linh hoạt qua đại diện/Staff không phụ thuộc voting.

Nếu mở lại, phải thiết kế riêng quyền bỏ phiếu, hạn đóng, phiếu trùng, reconnect, hòa phiếu và xung đột với Next. Không mặc định các quy tắc đó là nghĩa vụ V1. Hiện tại một yêu cầu từ đại diện và một quyết định của Staff đã đủ tạo thay đổi hành trình quan sát được.

### 6.5 Kịch bản demo tuyến linh hoạt

**Một câu mô tả:** tại POI được phép phân nhánh, đại diện yêu cầu đổi nhánh, Staff chấp nhận, người xem thấy tuyến còn lại cập nhật và robot thật đi theo lựa chọn đó.

Ví dụ logic (phải thay bằng các điểm khảo sát trên tầng 6 NVH): mặc định **A → B → C → End**; thay thế **A → D → C → End**.

1. Chuẩn bị hai hành trình đã thử, nội dung từng POI và hiển thị tuyến mặc định. Giữ robot tại điểm phân nhánh trong lúc trình diễn quyết định để timer không tự cho đi trước khi Staff xử lý.
2. Đại diện của đoàn đang tham gia yêu cầu D. Trước khi Staff chấp nhận, robot và tuyến có hiệu lực chưa tự đổi.
3. Staff chấp nhận khi robot đang dừng và đủ điều kiện. Mọi viewer của Tour thấy phần còn lại đổi sang D → C → End; các Tour khác không bị ảnh hưởng.
4. Robot thật đi nhánh đã chọn, tới đúng POI, phát đúng narration rồi hoàn tất phần còn lại. Không dùng video/mock marker để thay bằng chứng robot đổi hành trình.
5. Ghi bằng chứng yêu cầu, người quyết định, tuyến trước/sau và chặng thực tế. Thử bổ sung yêu cầu ngoài danh sách hoặc thao tác lặp phải bị chặn/không phát hai chặng. Demo đạt vẫn cần ít nhất 3 POI và 2 chặng navigation thực.

## 7. Video dự phòng và kết quả buổi tham quan

Chuẩn bị video đã duyệt cho các POI hoặc một video giới thiệu tổng quan, phát qua đường media phù hợp. Không phải thu lại toàn bộ mỗi Tour hoặc xây kho video/DRM trong V1.

| Tình huống | Trải nghiệm xem | Xử lý vận hành |
|---|---|---|
| Một browser lỗi | Báo lỗi, cho tải lại; có thể mở video dự phòng riêng | Không tự coi cả Tour lỗi |
| Nguồn live chung lỗi, navigation còn được xác nhận bình thường | Staff bật thông báo/video dự phòng | Giữ policy bản cũ: chỉ cho chặng hiện tại hoàn tất rồi giữ, không tự phát chặng mới |
| Robot/head lỗi hoặc mất liên lạc điều khiển | Báo buổi live gián đoạn, cung cấp nội dung thay thế | `NEEDS_ASSISTANCE`, chặn tiến bước; robot phải dừng/inhibit theo cơ chế cục bộ thích hợp, không suy gửi Cancel là đã dừng |
| Lỗi có thể xử lý trong phiên | Video ghi sẵn trong lúc chờ | Staff kiểm tra, phục hồi theo một bước hợp lệ; chỉ trở về live khi xác nhận nguồn live và robot sẵn sàng |
| Không thể tiếp tục, End Early | Trang thông báo kèm video dự phòng | Tour `CANCELLED`; robot chưa rõ trạng thái vẫn không được coi là rảnh |
| Backend restart | Thông báo khi browser có thể kết nối lại; video chỉ dùng được nếu đường phục vụ còn hoạt động | Giữ policy không tự resume: Staff kiểm tra rồi End Early. Không hứa fallback hoạt động khi mọi hạ tầng/mạng cùng hỏng |

Player luôn ghi **“Video ghi sẵn — buổi trực tiếp đang gián đoạn/đã kết thúc sớm”**. Dừng narration live để không chồng tiếng. Khi Tour còn RUNNING, Q&A có thể tiếp tục nhưng mỗi câu phải giữ POI và nguồn nội dung tại lúc hỏi; video tổng quan không có POI thì dùng ngữ cảnh campus chung. Khi quay về live, câu trả lời tới muộn vẫn ghi ngữ cảnh cũ, không giả là đang nói về POI mới. Khi Tour kết thúc, áp dụng giới hạn quyền ở dưới.

Map tiếp tục thể hiện telemetry thật nếu còn mới; nếu mất dữ liệu thì giữ vị trí cuối và báo không còn cập nhật. Tiến độ video không làm robot chạy trên bản đồ và không phát sinh sự kiện đã tới POI.

**Tách quyền sau kết thúc:** End Early đóng live, realtime của Tour và Q&A. Với Tour đã Start rồi kết thúc sớm thành CANCELLED, lời mời chưa bị thu hồi chỉ xem video dự phòng **tới đúng hạn hết hiệu lực của lời mời/mã**, không có TTL video riêng. Giới hạn phiên web vẫn áp dụng; thu hồi lời mời/registration chặn xem. Không áp dụng quyền sau kết thúc này cho COMPLETED hoặc buổi hủy trước Start, không cấp lại live/AI hay quyền Tour mới. Video khi Tour còn RUNNING là fallback trong phiên, không phải ngoại lệ quyền sau kết thúc.

Chỉ `COMPLETED` khi robot hoàn tất hành trình thực được Staff chấp nhận, gồm biến thể hợp lệ nếu đã chọn, và dừng ở điểm cuối. Nếu kết thúc phần live bằng End Early thì vẫn là `CANCELLED` dù người xem đã xem hết video. Báo cáo tách “hành trình robot” và “nội dung đã cung cấp”.

**Giải phóng robot sau End Early/lỗi:** theo ADR-0009 §6 và `docs/architecture.md` §3.2, Staff kiểm tra thực tế rồi bấm “Xác nhận robot sẵn sàng”. Backend đối soát Tour cũ đã terminal, nhiệm vụ/lệnh cũ đã kết thúc/hủy, robot đã dừng và trạng thái mới đủ readiness trước khi bỏ khóa điều phối, ghi audit. Chưa đủ bằng chứng thì giữ khóa và nêu lý do; một báo cáo IDLE hoặc gửi Cancel thành công không đủ. Sau giải phóng, Tour mới được Start khi đạt đầy đủ điều kiện riêng; không mở lại Tour cũ, không tự Start. Nếu còn phục hồi trong Tour RUNNING thì dùng luồng recovery, không release để giao robot cho Tour khác.

## 8. Nhiều đoàn, nhiều Tour và nhiều robot

| Kịch bản | Mức đề xuất | Điều cần chứng minh |
|---|---|---|
| Nhiều đoàn của một/nhiều trường cùng Tour, một robot thật | Bắt buộc demo | Chung hình/tiến độ; roster và quyền quản lý đoàn tách nhau; Q&A riêng |
| Một khối xem chung qua máy chiếu | Hình thức tham gia hỗ trợ | Một phiên máy chiếu; không thống kê số người trong phòng thành số browser hoặc số người đã xác thực |
| Hai Tour độc lập, mỗi Tour một robot, cùng thời điểm | Bài kiểm chứng phần mềm được đề xuất bổ sung | Hai robot emulator đi qua cùng contract; mỗi Tour có tiến độ/điều khiển riêng, không nhận nhầm trạng thái hoặc câu AI |
| Một robot bị hai Tour yêu cầu Start đồng thời | Bắt buộc kiểm tra ràng buộc | Chỉ một Tour giữ robot thành công; Tour còn lại báo chưa có robot khả dụng, không phát lệnh chồng |
| Hai robot thật chạy đồng thời trong cùng khu vực | Không cam kết nghiệm thu ở bản này | Cần thiết bị và bài kiểm chứng phối hợp vật lý; emulator không chứng minh né nhau |
| Nhiều robot cùng một Tour hoặc thay robot giữa Tour | Ngoài V1 | Giới hạn một AMR thật theo LI-02; tự đổi robot giữa phiên bị loại theo LI-06. Nhiều robot cùng một Tour không thuộc thiết kế điều phối đã chọn |

Tại Start: một Tour có tối đa một robot được giao, một robot có tối đa một Tour đang giữ; robot chưa xác nhận dừng không được cấp cho Tour khác. Lịch chồng nhau với một robot phải được báo để Admin/Staff đổi giờ hoặc ghép đoàn vào cùng Tour; chưa triển khai tối ưu scheduling tự động.

Bài hai Tour dùng emulator phải có người xem của cả hai Tour, câu hỏi đồng thời và thử lỗi một Tour trong khi Tour kia tiếp tục. Không chỉ mở hai marker trên Twin rồi coi là đã hoàn thành nghiệp vụ nhiều Tour. Stream giả/video mẫu dùng cho test phải ghi nhãn, không báo là hai livestream robot thật.

Tải có ba trục riêng: số robot/Tour, số browser xem media và số request AI đồng thời. Bài thử hai Tour là kiểm tra chức năng; không tự chứng minh phục vụ cả trường. Nhóm phải công bố tải thử và mức đạt, không suy từ số dòng Excel.

### 8.1 Kịch bản demo hai Tour độc lập

| Bước | Thao tác | Bằng chứng mong đợi |
|---|---|---|
| Chuẩn bị | Tour A gắn Emulator A, Tour B gắn Emulator B; mỗi Tour có viewer và dữ liệu POI dễ phân biệt | Hai tiến độ riêng trên Staff Twin, viewer chỉ thuộc đúng Tour; media thử nghiệm có nhãn giả lập |
| Chạy đồng thời | Start cả hai Tour hợp lệ; gửi câu hỏi riêng từ các viewer của A và B | Cả hai tiến triển; lệnh, nội dung POI và câu trả lời không lẫn Tour hoặc người hỏi |
| Gây lỗi riêng A | Dùng khả năng mô phỏng của emulator/script thử nghiệm để báo lỗi A, giữ B kết nối bình thường | A hiện NEEDS_ASSISTANCE và ngừng tự chuyển chặng; B vẫn tiếp tục theo tiến độ của mình |
| Kiểm tra cách ly | Staff xử lý hoặc End Early riêng A; thử viewer A truy cập tài nguyên cần quyền của B | Thao tác A không dừng B; truy cập chéo bị từ chối; B có thể hoàn tất độc lập |
| Kết luận | Thu log có Tour/Robot/Leg ID và ghi màn hình của hai viewer/Twin | Chứng minh điều phối và cách ly ở mức phần mềm; không tuyên bố hai robot thật né nhau hoặc hai livestream vật lý |

Đây là kịch bản cần triển khai/kiểm chứng, không khẳng định emulator hiện tại đã có đủ chức năng. Không thêm scenario editor để làm bài này và không coi hai robot emulator là mức tải benchmark nghiên cứu đã chốt.

Mức tối thiểu của emulator cho demo chức năng: hai định danh robot, nhận GoTo/Cancel theo contract đã chốt, tạo pose/tiến độ giả và kết quả tới đích/hủy sau thời gian cấu hình với ID đúng, một cách bật lỗi bằng script/config. Không Nav2, tự tìm đường, vật lý hoặc tránh va chạm. Head/pan chỉ giả lập theo contract head riêng khi đã thống nhất; navigation contract hiện tại không tự có lệnh head. Bài chạy POI đầy đủ phải ghi head được giả lập ở lớp thử nghiệm hay đã tích hợp; không tự thêm field/lệnh vào DTO chỉ để chạy demo.

## 9. Bản đồ 2D, Twin 3D và sa bàn

- **Student:** mặc định 2D nhẹ, dễ thấy vị trí robot, điểm đang giới thiệu và phần tuyến còn lại. Hiển thị rõ mất/stale dữ liệu.
- **Staff:** Twin 3D vận hành, hiển thị robot, Tour, trạng thái và điều khiển có quyền; dùng cùng nguồn pose với 2D, có transform được kiểm chứng.
- **Sa bàn cho Student:** phần mở rộng tùy nguồn lực, ưu tiên tái sử dụng mô hình đã có, chỉ đọc; không bắt người dùng tải 3D để vào live. Việc có mô hình demo chưa chứng minh đó là campus được đo đúng.

Map 3D giúp hình dung không gian nếu có chú thích và vị trí đáng tin cậy. Nó không tự chứng minh hệ thống có mô phỏng vật lý, dự báo, tối ưu dispatch hoặc năng lực Digital Twin nghiên cứu. Không cam kết mô hình chi tiết toàn trường hoặc VR/360° chỉ để có hình đẹp.

Twin phản ánh pose, kết nối, tiến độ, bước đang chạy và độ mới dữ liệu để Staff kiểm tra trước Start, Accept nhánh, Hold/Next hoặc xử lý NEEDS_ASSISTANCE. Backend vẫn kiểm tra quyền/state; marker không thay bằng chứng robot đã dừng/tới nơi. Cảnh 3D demo là vùng chạy tầng 6 NVH từ map khảo sát, kiểm tra tỷ lệ và transform; chưa tuyên bố mô hình hiện có đã đạt độ chính xác đó.

## 10. Phạm vi bắt buộc, mở rộng và phần cần bảo lưu

| Mức | Nội dung |
|---|---|
| Giữ từ baseline | Đăng ký/duyệt/email/READY; một robot thật, 3 POI và 2 chặng thật; flow bình thường tự động; đầu xoay/nguồn hình; narration; Student 2D, Staff 3D; AI riêng STT/LLM/TTS một ngôn ngữ; phục hồi có giới hạn và dừng cục bộ |
| Cách vào đã được nhóm chọn | Mỗi học sinh vào riêng có dòng/email cá nhân → Admin duyệt → email gồm link trang Tour + mã riêng → nhập mã → session; một phiên hoạt động, thu hồi/cấp lại; không OTP bổ sung hoặc account Student. Chỉ xem qua máy chiếu dùng một dòng “Điểm xem chung” và email người phụ trách, không cần roster học sinh |
| Bổ sung sau Review 1 | Nhóm giữ trong V1: điểm xem chung, video dự phòng, yêu cầu đổi nhánh có Staff duyệt, hai Tour emulator độc lập. Đánh giá trải nghiệm live so với video vẫn là đề xuất chờ GVHD xem lại; không phải gate bắt buộc |
| Mở rộng sau khi phần bắt buộc đạt | Sa bàn 3D cho Student; tiện ích quản trị ngoài form nội dung POI cơ sở, nếu phát sinh |
| Optional/Future, không lên kế hoạch V1 | Voting của học sinh; chỉ mở lại khi nhóm/GVHD chốt nhu cầu và nguồn lực, không là gate Review 2 |
| Không cam kết trong V1 | Nhiều robot thật cùng vận hành, nhiều robot cùng Tour, tiếp quản robot giữa Tour, khám phá điểm bất kỳ, multi-campus, editor vẽ tuyến tự do, VR/360°, mỗi học sinh điều khiển góc riêng, đa ngôn ngữ |
| Nhóm đã chốt, trình GVHD xem lại ở Review 2 | Mã cá nhân qua email (ADR-0010); điểm xem chung trong Excel; sửa riêng email; form nội dung P1; một lần đổi nhánh; Start từ giờ công bố; fallback; thống kê/audit — mục 10.1 và ADR-0009 |

Các giới hạn đã có trong phiếu v1.2 không phải nghĩa vụ mới xin bỏ: LI-02 giới hạn một AMR thật/không điều phối giao thông fleet vật lý; LI-05 loại sensor mirror đầy đủ; LI-06 loại pause/resume tùy ý và tự đổi robot trong phiên; LI-07 loại thanh toán/SSO; LI-08 giới hạn indoor một tầng; LI-09 một ngôn ngữ; LI-11 loại AI camera tracking. LI-11 không có nghĩa loại mọi chức năng camera hoặc POI. Feedback/rating không có FR trong v1.2 được đối chiếu, xếp Future trong V1 này; không cần tiếp tục treo là FR bắt buộc của bản cũ. Scenario editor/what-if/ETA động không được mô tả như FR riêng trong v1.2; phạm vi thu gọn đã nêu không thay nghĩa vụ quản trị vẫn có trong phiếu.

Lời mời, yêu cầu nhánh và quyền mới ảnh hưởng tích hợp backend/web và dữ liệu/contract ứng dụng. Không cần tự thay transport ROS để sửa scope, nhưng không được gọi đây là chỉ sửa chữ, không ảnh hưởng API/DB. Khi code phải cập nhật `docs/architecture.md` và review public contract.

Đối chiếu hiện tại: `docs/architecture.md` đã mô tả Student từ xa, một ngôn ngữ, backend sở hữu tiến độ và transport fleet SignalR được chọn với cổng kiểm chứng Python. Vì vậy không dùng lại bảng hiện trạng ngày 19/09 để kết luận repo còn mặc định multilingual hoặc transport chưa chọn. Tài liệu kiến trúc không chứng minh các tính năng này đã chạy.

Về nghiên cứu, kiến trúc hiện tại hoãn implementation/benchmark tới sau khi đường Remote Tour end-to-end chạy được, đồng thời giữ nguyên nghĩa vụ nghiên cứu chính thức. Bản Review 1 này **không chốt lại A/B, telemetry rate, latency target, fleet size nghiên cứu hoặc lịch benchmark cũ**. Bài hai Tour chức năng ở mục 8 không thay benchmark hay nghiên cứu DT-first. Nhóm cần thống nhất kế hoạch với GVHD riêng nếu có mâu thuẫn với phiếu.

### 10.1 Đối chiếu nghiệp vụ với phiếu v1.2

Nguồn: phiếu FA26SE184 v1.2, mục 3.2(b)–(d), trang 2–4 và 3.2(h), trang 6. Bảng này chỉ xử lý nghiệp vụ; phần nghiên cứu giữ nguyên theo giới hạn lượt sửa.

| Nội dung trong phiếu | Bản V1 sau Review 1 | Tình trạng cần ghi nhận |
|---|---|---|
| Student vào bằng mã đoàn + tên/lớp; đại diện chia sẻ lời mời | Excel cấp lời mời qua email gồm link trang Tour + mã cá nhân; phòng xem chung dùng một dòng “Điểm xem chung” và email người phụ trách | Nhóm chốt; GVHD xem lại Review 2. Không cần roster cá nhân của lớp chỉ xem máy chiếu; hỗ trợ mã truy cập khi RUNNING |
| Admin quản lý routes, POIs, narration assets | Kỹ thuật seed hình học tuyến/nhánh; Admin chọn tuyến và sửa tên/mô tả/audio bằng form P1 | Nhóm chốt form nội dung; vẫn công khai giới hạn quản lý hình học, không coi đã đáp ứng toàn bộ CRUD route/POI |
| Admin xem system-wide analytics | P1: Tour hoàn thành/hủy; email dịch vụ chấp nhận gửi/gửi lỗi; lời mời vào phòng thành công | Mức cơ sở nhóm chốt; không BI, tracking đọc email hoặc attendance. Chi tiết đếm ở mục 10.2 |
| Immutable audit trails cho lệnh vận hành | Log chỉ ghi thêm; quyết định gửi, đã gửi, robot phản hồi ghi riêng theo bằng chứng | API/UI và tài khoản DB app không sửa/xóa; không tuyên bố chống quản trị DB đặc quyền. Log lệnh thuộc P0, mục 10.2 |
| Registration, Student remote và Staff vận hành đã có trong phiếu | Đại diện có account/role, gửi yêu cầu từ My Registration; Staff xử lý trên dashboard | Account Student/booking cá nhân cũ không còn là FR phải xin bỏ. Quyền yêu cầu nhánh là bổ sung sau Review 1 |
| Fleet emulator và khả năng nhiều Tour đã có trong định hướng phiếu | Kịch bản hai Tour và lỗi độc lập là tiêu chí chức năng cụ thể hóa | Không gọi toàn bộ emulator là feature mới ngoài phiếu |
| Chưa nêu riêng trình chiếu chung, đổi nhánh theo yêu cầu, video dự phòng hoặc so sánh trải nghiệm video | Giữ các bổ sung trong scope; riêng đánh giá trải nghiệm R1-15 là đề xuất chờ GVHD xác nhận | Không tự gọi là nghĩa vụ nguyên văn phiếu, không thêm rating app |

### 10.2 Thống kê và audit đã chốt

- Thống kê cơ sở: số Tour COMPLETED/CANCELLED; số lần gửi email dịch vụ chấp nhận/gửi lỗi (retry là lần gửi mới, không phải số người); số lời mời đã vào phòng thành công. Lời mời tính một lần cho cùng dòng đã duyệt, reload/reconnect/cấp lại mã không tăng, phân biệt cá nhân/điểm xem chung. Backend phải cấp/khôi phục quyền vào phòng thành công; mở URL đơn thuần không đủ. Đây không phải attendance hoặc thống kê đọc email.
- Audit chỉ append; API/UI không sửa/xóa, tài khoản DB ứng dụng không có quyền UPDATE/DELETE log. Không tuyên bố bất biến trước DBA đặc quyền. Ghi actor, thời điểm, Tour/robot, thao tác, tham chiếu và kết quả; không access code/token bí mật.
- Mỗi lệnh có các mốc riêng: **đã quyết định gửi → đã gửi → robot đã phản hồi**. Quyết định và thay đổi DB liên quan cùng giao dịch; gửi tới robot không nằm trong giao dịch đó. Ghi gửi/phản hồi khi thực sự có bằng chứng, tương quan cùng lệnh; lỗi/chưa rõ giữ đúng trạng thái, không tạo đủ ba mốc giả. Phản hồi nhận lệnh không phải hoàn thành; ghi đúng kết quả robot cung cấp.
- Email chỉ ghi “dịch vụ chấp nhận gửi” hoặc “gửi lỗi” khi có kết quả; đang chờ/chưa rõ không suy thành thành công. Mỗi lần gửi có CorrelationId riêng: append EMAIL_SEND_REQUESTED/PENDING rồi dòng EMAIL_SEND_RESULT cùng ID khi có kết quả ACCEPTED/FAILED/UNKNOWN; không UPDATE dòng cũ. Retry gửi là attempt mới, thống kê kết quả xác nhận theo attempt, không đếm lặp các dòng log. Không ghi “đã nhận/đã đọc”. Form thống kê thuộc P1; phát sinh audit vận hành phải có từ P0.

## 11. Tiêu chí nghiệm thu bổ sung

Các hàng sau là yêu cầu kiểm chứng tương lai, chưa có kết quả PASS. Chúng bổ sung các tiêu chí robot/media/voice và dừng cục bộ từ baseline, không hạ ngưỡng phần cứng.

| Mã | Bài kiểm chứng | Kết quả cần có |
|---|---|---|
| R1-01 | Hai browser nhập cùng mã cá nhân gần như đồng thời | Chỉ một phiên hợp lệ; phiên mới không đẩy phiên cũ ra; từ chối cả request và subscription không có quyền |
| R1-02 | Reload, nhiều tab cùng browser, rớt mạng rồi reconnect | Nhận lại đúng phiên theo policy; không tự tạo hai quyền độc lập hoặc chặn nhầm chỉ vì đổi kết nối realtime mới |
| R1-03 | Đại diện thu hồi/cấp lại mã trong RUNNING, browser cũ gửi AI/reconnect; thử thao tác với đoàn khác | Chỉ đúng đoàn được hỗ trợ, không sửa roster/email hoặc dừng Tour; mã/phiên cũ bị chặn kể cả nội dung riêng tới muộn; mã mới gửi đúng email đã duyệt, có audit |
| R1-04 | Email sai: Admin sửa một dòng APPROVED khi SCHEDULED; thử READY/RUNNING và email trùng; thay cả file riêng | Sửa đúng dòng thu hồi mã/phiên cũ, giữ approval/dòng khác, gửi mã mới và audit; READY phải mở lại, RUNNING bị chặn. Thay cả file vẫn cảnh báo/duyệt lại |
| R1-05 | Một khối chỉ xem máy chiếu; thêm vài người xem bằng điện thoại | Một dòng điểm xem chung đủ đăng ký/duyệt/READY/xem, không đòi roster học sinh; các dòng cá nhân nhận mã riêng. Không attendance giả, chat trên máy chiếu là nội dung chung |
| R1-06 | Hai đoàn cùng xem, hai học sinh hỏi khác nhau | Chung live/map, câu trả lời riêng; đại diện không xem/sửa đoàn khác |
| R1-07 | Đại diện gửi nhánh từ My Registration, Staff Accept/Reject trên dashboard | Chỉ đúng đoàn/điểm/nhánh; ACCEPTED cập nhật tuyến, không tự bỏ Hold; robot thật thực hiện biến thể khi Next/dwell hợp lệ |
| R1-08 | Gửi trước yêu cầu cho điểm phân nhánh B rồi rời POI trung gian A; Accept giữa chặng/sau đóng B; Accept/Next/Hold/timer đồng thời; yêu cầu đổi lần hai | Rời A giữ yêu cầu B; đóng lượt B mới làm PENDING của B hết hạn trước FRONT/dispatch. End Early/NEEDS_ASSISTANCE hoặc dùng hết lượt đóng mọi PENDING của Tour; mất quyền đoàn chỉ đóng yêu cầu đoàn đó. Chỉ Accept tại điểm hợp lệ; không tự Hold, không phát hai chặng/hồi sinh yêu cầu |
| R1-09 | Mất nguồn live chung | Video ghi sẵn có nhãn; narration không chồng; không đổi vị trí robot theo video; policy chặng hiện tại được giữ đúng |
| R1-10 | End Early sau Start; mở lại video trong hạn/thu hồi; Staff xác nhận sẵn sàng khi thiếu và đủ bằng chứng; thử Start Tour mới | Tour CANCELLED; video chỉ trong hạn, không áp cho COMPLETED/hủy trước Start, không live/AI. Thiếu bằng chứng dừng/kết thúc nhiệm vụ thì giữ khóa. Xác nhận hợp lệ mới release/audit; xác nhận lặp không gây cấp trùng. Tour mới Start được khi đủ điều kiện, Tour cũ không mở lại |
| R1-11 | Khôi phục nguồn live hoặc backend restart | Không tự chạy lại robot; phục hồi có xác nhận; restart giữ policy kết thúc sau kiểm tra, không hồi sinh timer |
| R1-12 | Hai Tour–hai emulator; một Tour lỗi | Không lẫn command, tiến độ, subscription/media được gán hoặc AI; Tour kia tiếp tục độc lập |
| R1-13 | Hai Tour tranh cùng robot | Chỉ một Start nhận robot; Tour còn lại có phản hồi rõ ràng |
| R1-14 | Tải viewer và AI đã khai báo trước | Báo số browser, số câu hỏi đồng thời, độ trễ/lỗi và điều kiện mạng; quá tải phản hồi rõ, không chờ vô hạn hoặc ảnh hưởng điều khiển robot |
| R1-15 | Đề xuất so sánh trải nghiệm live với video, chờ GVHD xác nhận | Có nhiệm vụ, nhóm thử, dữ liệu và giới hạn kết luận; không mặc định live tốt hơn, chưa là gate bắt buộc |
| R1-16 | Excel hai loại dòng: thiếu/sai/trùng email; trùng tên nhưng email khác; duyệt danh sách hợp lệ | Báo lỗi trước cấp lời mời, không gộp người theo tên; link trang Tour + mã riêng đúng email cá nhân/người phụ trách; nhập mã hợp lệ để vào phòng chờ/live; không OTP, không đòi danh sách học sinh ở điểm xem chung |
| R1-17 | Một thư gửi lỗi; gửi lại thư; mã hết hạn/đã thu hồi/sai Tour | Báo lỗi và gửi lại riêng; không tạo thêm quyền hoặc ngắt phiên hiện có vì gửi lại thư; mã không hợp lệ bị chặn và có hướng dẫn hỗ trợ |
| R1-18 | Start trước/đúng giờ; readiness thiếu; Start lặp/đổi lịch đồng thời | Server chặn trước giờ hoặc thiếu điều kiện, giữ robot độc quyền; không tự chạy khi đủ giờ, không phát chặng hai lần |
| R1-19 | Admin/role khác sửa POI; POI dùng chung/nhánh của Tour READY/RUNNING; audio dài hơn dwell | Chỉ Admin khi không bị khóa; backend phân xử với READY. Hiện thời lượng/cảnh báo và chặn READY tới khi xử lý chênh lệch; không mất lịch sử |
| R1-20 | Retry email, reload/reconnect/cấp lại mã; điểm xem chung; lệnh lỗi/mất phản hồi; thử sửa/xóa audit | Thống kê đúng đơn vị, không đếm lặp lời mời hay suy attendance/đọc email; log chỉ ghi bằng chứng có thật, tài khoản app không sửa/xóa |
| R1-21 | Mở link không có session; nhập mã sai/sai Tour; nhập mã đúng trước ngày; quay lại còn session hoặc sau logout | Link không cấp quyền; mã sai không tạo session; mã đúng tới phòng chờ, không live/AI sớm; session còn hạn không nhập lại, logout phải nhập mã; server giới hạn thử sai |
| R1-22 | Mất thư rồi gửi lại; nghi lộ mã rồi cấp mới; thử bằng Staff-only và đại diện đoàn khác | Gửi lại đúng mã hiện hành không ngắt phiên; cấp mới vô hiệu mã/phiên cũ, giữ ID lời mời và hạn; chỉ gửi email đã duyệt; role không đủ bị chặn, có audit không chứa mã |

Trước diễn tập phải điền: Start/End/POI/vùng chạy tầng 6 NVH; tải browser và AI mục tiêu; giới hạn request AI; hạn phiên và khoảng giữ khi mất mạng; hạn lời mời/mã (cũng là hạn video sau End Early); tuyến/nhánh và thời gian dwell đã thử; người phụ trách xử lý lỗi. Đây là thông số cần chọn/đo, không tự gán số chưa có cơ sở.

Khi triển khai code, chạy `scripts/verify` theo hướng dẫn repo; bài navigation, đầu xoay, stream và stop phải có bằng chứng tích hợp/phần cứng tương ứng. Một bản sửa scope không chứng minh hệ thống đã đạt các tiêu chí trên.

## 12. Thứ tự thực hiện và nội dung trao đổi lại

1. Hoàn thiện khảo sát tầng 6 NVH đã chọn: Start/End, POI và nhánh thực tế. Triển khai theo giới hạn nhóm đã chốt (một robot thật, hai Tour emulator, các nhánh đã thử) và trình GVHD xem lại ở Review 2; không coi các điểm khảo sát thực địa là lựa chọn nghiệp vụ còn chờ. Nêu rõ phần thu gọn so với phiếu khi trình bày.
2. Hoàn thành đường Tour cơ sở end-to-end theo kiến trúc hiện tại; chuẩn bị dữ liệu campus, video dự phòng và các lựa chọn tuyến có thể kiểm chứng.
3. Triển khai Excel có email, gửi link trang Tour và mã cá nhân trực tiếp và giới hạn phiên theo lựa chọn đã chốt; hỗ trợ gửi lại/thu hồi/cấp lại và hình thức trình chiếu chung; tích hợp fallback có quyền riêng sau kết thúc. Đây là thay đổi nghiệp vụ và tích hợp, không chỉ đổi màn hình login/player.
4. Thêm yêu cầu thay đổi hành trình và quyết định của Staff; kiểm thử xung đột với timer/Next, sau đó thử biến thể trên robot thật.
5. Chạy bài hai Tour emulator, bài tải viewer/AI và diễn tập sự cố; tiếp đó đánh giá trải nghiệm nếu GVHD giữ R1-15. Benchmark nghiên cứu theo kế hoạch được phê duyệt riêng.

### 12.1 Backlog P0/P1/P2 dự thảo cho Review 2

Đây là thứ tự đề xuất từ scope, không phải audit code hiện có hoặc cam kết thời lượng. **P0** là nền và luồng demo ưu tiên trước; **P1** là phần tiếp theo vẫn phải hoàn thành để đạt toàn bộ V1 đã chọn; **P2** là mở rộng ngoài cam kết V1, không tự triển khai. Không dùng nhãn P1 để bỏ STT/TTS, nhiều Tour hoặc nghĩa vụ nghiên cứu. Bảy quyết định nghiệp vụ đã chốt trong nhóm tại ADR-0009, luồng truy cập cập nhật tại ADR-0010; dữ liệu địa điểm và thông số thực thi còn phải hoàn thiện ở mục 12.3.

| Mức / mã | Đầu việc | Điều kiện nhận / phụ thuộc |
|---|---|---|
| P0-01 | Khảo sát tầng 6 NVH, chốt Start/End, ít nhất 3 POI và nhánh thay thế | Có map/vùng chạy và liên hệ hỗ trợ; phân biệt POI thật với điểm demo mô phỏng nội dung; trước chạy robot phải đủ điều kiện tại chỗ |
| P0-02 | Đường robot–backend–viewer/Twin, Start từ giờ công bố và dừng cục bộ | R1-13, R1-18; giữ robot độc quyền, audit quyết định/gửi/phản hồi theo bằng chứng từ P0; không tự resume khi mất kết nối/restart |
| P0-03 | Tour cơ sở tự động: navigation, head, live và narration | Ít nhất 3 POI, 2 chặng thật, điểm cuối; Student 2D/Staff 3D cùng pose; cảnh 3D giới hạn vùng chạy tầng 6 được khảo sát |
| P0-04 | Excel cá nhân/điểm xem chung → approve → email link + mã riêng → nhập mã → một phiên → revoke/cấp lại; Admin sửa email riêng | R1-01–05, R1-16–17, R1-21–22; cùng cơ chế invitation cho hai loại dòng; không nền tảng tài khoản mới |
| P0-05 | Yêu cầu đổi nhánh qua đại diện/Staff | Phụ thuộc account/quyền mục 4, dữ liệu nạp mục 6.1 và luật timer mục 6.2; demo 6.5, R1-07–08; Hold dùng thao tác Staff hiện có, không thêm yêu cầu gia hạn |
| P0-06 | Sự cố, video dự phòng và xác nhận robot sẵn sàng sau End Early/lỗi | R1-09–11; Staff kiểm tra/xác nhận, backend đối soát nhiệm vụ cũ đã kết thúc và robot dừng/sẵn sàng mới release/audit; thiếu bằng chứng giữ khóa. Tour mới phải qua điều kiện Start; video ghi nhãn, không báo hoàn thành giả |
| P0-07 | Q&A riêng bằng chữ, nội dung campus đã duyệt | R1-06, cách ly người hỏi và POI; text chỉ là bước tích hợp, chưa thay voice hoàn chỉnh |
| P1-01 | TTS/STT một ngôn ngữ | Học sinh nói → STT → AI → TTS riêng; không thay bằng narration đã ghi sẵn |
| P1-02 | Hai Tour–hai emulator độc lập | Mục 8.1, R1-12–13; R1-13 đã triển khai/kiểm tra từ P0-02 và thử lại với hai Tour; giới hạn emulator như 8.1, không đợi voting |
| P1-03a | Kiểm chứng trải nghiệm máy chiếu và xem hỗn hợp | R1-05; không xây loại invitation riêng, không cần roster của người chỉ xem chung |
| P1-03b | Kiểm thử tải viewer/AI | R1-14; ghi tải thực đã thử, không suy từ roster/emulator |
| P1-03c | Đề xuất đánh giá trải nghiệm | R1-15; chỉ trở thành việc bắt buộc khi GVHD chốt giữ, không làm app rating |
| P1-04 | Form Admin sửa nội dung POI và thống kê cơ sở | Mục 6.1, 10.2, R1-19–20; tên/mô tả/upload audio, khóa POI dùng chung, cảnh báo thời lượng/kiểm tra READY; thống kê và History/Log, không hoãn audit P0 |
| P1-05 | Chạy đầy đủ hồi quy, diễn tập và thu bằng chứng | Các tiêu chí V1 đã chốt ở mục 11 và phần cứng/voice; R1-15 chỉ bắt buộc nếu GVHD chốt giữ; không cắt kiểm tra quyền/dừng robot để kịp Review 2 |
| P2-01 | Voting; sa bàn Student 3D; công cụ vẽ tuyến trên bản đồ; phân tích vượt mức cơ sở | Optional/Future; form nội dung POI và thống kê cơ sở đã thuộc P1 của V1 |

Nghiên cứu chính thức là luồng công việc bắt buộc riêng theo phạm vi GVHD duyệt và thứ tự kiến trúc hiện hành; không đẩy vào P2 hoặc dùng demo hai emulator thay kết quả nghiên cứu. Phạm vi Review 2 cụ thể cần đối chiếu tiêu chí của thầy, không suy mọi mục P1 phải hoàn thành tại mốc chưa được cung cấp.

Thứ tự P0: nhánh robot 01 → 02 → 03 → 05; phần lỗi/an toàn 06 đi cùng từng bước trước chạy thật. Invitation 04 và AI chữ 07 có thể làm song song, ghép vào demo trước nghiệm thu. Xác nhận quyền cung cấp dữ liệu và cấu hình thời gian giữ trước khi dùng dữ liệu thật theo ADR-0011; đây là điều kiện vận hành, không phải module P0 riêng. Đây là tổ chức công việc, không hạ yêu cầu chức năng.

### 12.2 Giới hạn implementation invitation

Giữ đúng mục tiêu **Excel → duyệt → email link trang Tour + mã riêng → nhập mã → session đúng Tour → ngăn dùng đồng thời → thu hồi/cấp lại**. Dùng lại mã còn hạn, khôi phục session/reconnect cơ bản, hạn quyền, kiểm tra Tour/registration và lỗi gửi email thuộc luồng tối thiểu vì ảnh hưởng trực tiếp trải nghiệm/quyền, không phải phần trang trí có thể bỏ.

Hoãn các tiện ích chưa cần: dashboard phân tích email đã mở, quản lý thiết bị đầy đủ, đồng bộ lịch sử chat qua thiết bị, self-service khôi phục phức tạp hoặc nền tảng xác thực riêng. Không thêm OTP/SSO/profile Student. Admin có trạng thái gửi và thao tác gửi lại đơn giản là đủ; không dùng việc hoãn tiện ích để bỏ kiểm soát mã/phiên đã thu hồi.

Kịch bản trình bày chỉ minh họa một lượt mở link/nhập mã và một ca dùng lại/thu hồi; phần lớn thời gian demo dành cho robot thật, thay nhánh, Twin và xử lý sự cố. Thứ tự demo không phải lý do bỏ các kiểm thử invitation phía sau.

### 12.3 Phần còn mở và việc triển khai tiếp

- Nhóm đã chốt bảy quyết định ở ADR-0009, mã truy cập ở ADR-0010 và giới hạn dữ liệu đăng ký/thống kê Tour ở ADR-0011; không còn chờ chọn giữa form nội dung và seed, hoặc chờ chọn luật Start. GVHD sẽ xem lại tại Review 2, chưa ghi nhận đã duyệt từng thay đổi.
- Dữ liệu địa điểm còn mở: khảo sát tầng 6 NVH, Start/End, POI thật/điểm bố trí, đường nối/nhánh và vùng được vận hành; ví dụ A–D không phải dữ liệu đo đạc.
- Trước diễn tập vẫn phải điền các thông số mục 11 và chuyển nghiệp vụ thành data/API/test. Chốt nghiệp vụ không chứng minh đã triển khai hoặc chỉ còn khảo sát là xong hệ thống.
- Phần nghiên cứu nằm ngoài lượt rà soát 30/09 theo yêu cầu nhóm; các đoạn giữ lại chưa được giải quyết bởi bảng sửa này.

### 12.4 Nội dung trao đổi với thầy

Đề xuất phản hồi với thầy:

> Nhóm đã chốt email gồm link trang Tour và mã riêng; nhập mã để tạo session; một dòng điểm xem chung đủ quyền máy chiếu nhưng chỉ lưu thông tin người phụ trách. Dữ liệu Excel chỉ phục vụ đăng ký, lời mời và thống kê Tour; không liên hệ tuyển sinh sau Tour. Admin sửa riêng email khi SCHEDULED; form nội dung POI và thống kê cơ sở ở P1, hình học tuyến vẫn do kỹ thuật chuẩn bị. Đại diện yêu cầu, Staff chấp nhận tối đa một lần đổi nhánh tại điểm hợp lệ; Staff chỉ Start từ giờ công bố. Video dự phòng dùng lúc live lỗi và sau End Early theo hạn lời mời, không làm giả kết quả robot. Nhóm trình các quyết định này để GVHD xem lại ở Review 2; không coi emulator là bằng chứng nhiều robot thật.

## 13. Bảng thay thế nội dung bản 19/09 khi cập nhật đặc tả chi tiết

| Mục cũ | Nội dung cần thay/cập nhật | Căn cứ mới |
|---|---|---|
| Đọc trong 5 phút; 1–2; 3.2, 3.4, 3.5; UC-05; 17.1 | Bỏ quyền vào chỉ bằng mã đoàn + matching tên/lớp; gửi link trang Tour + mã riêng tới email học sinh/người phụ trách; nhập mã để tạo session, không OTP bổ sung | Mục 4–5 |
| 3.2, 3.3, UC-02, UC-04, UC-06; 5.2 | Excel phân biệt cá nhân/điểm xem chung, email người nhận; chỉ xem máy chiếu không cần roster học sinh; Admin sửa riêng email khi SCHEDULED, chỉ cấp lại đúng dòng; thay cả file vẫn duyệt lại. Một đại diện có nhiều đăng ký/Tour | Mục 5.2 |
| 6; 8.6–8.8; 10.3, 10.8; 11.1 | Bổ sung ý nghĩa lời mời, phiên độc quyền, quyền thu hồi, ngữ cảnh nội dung live/ghi sẵn; tên field/API phải được thiết kế riêng | Mục 5 và 7 |
| 3.1; 4.2; 5.2; 11.3; 21.2 | Seed hình học; form nội dung POI P1 và khóa dữ liệu dùng chung; kiểm tra audio trước READY; Staff chỉ Start từ giờ công bố, tối đa một lần đổi nhánh được chấp nhận | Mục 4.1 và 6 |
| 4.6; 5.1; 12; 20.4–20.5 | Quyền nội dung dự phòng tách live/AI; hoàn tất theo hành trình thực được chọn hợp lệ; End Early vẫn CANCELLED | Mục 7 |
| 1.1, 1.5, 1.6; 13.2; 14 | Tách nhiều đoàn chung Tour, nhiều Tour độc lập, nhiều robot thật và nhiều robot/Tour; đề xuất bài hai Tour emulator | Mục 8 và 10 |
| 11; 14 | Giữ Staff 3D, Student 2D; Student 3D chỉ là mở rộng, không thêm nghĩa vụ dựng toàn campus | Mục 9 |
| 13; 15; 17.2; 19 | Giữ truy vết nghĩa vụ nghiên cứu; cập nhật đối chiếu kiến trúc và không áp lại lịch/benchmark cũ khi chưa thống nhất | Mục 10 và 12 |
| 16; 20–22 | Thêm tiêu chí quyền truy cập, fallback, biến thể tuyến, hai Tour, tải và đánh giá trải nghiệm | Mục 11 |

Đồng bộ UI-FLOW 21/09 trong cùng lượt sửa: §3.3 email từng cá nhân hoặc người phụ trách điểm xem chung và panel quyền; §3.4 seed hình học và form nội dung P1 đã chốt; §4 nhiều đăng ký/Tour, Excel `LoaiDong`/`HoTen`/`Email`, sửa email riêng, yêu cầu nhánh và hỗ trợ mã truy cập trong RUNNING; §5 mở link, nhập mã, khôi phục session/video dự phòng; §6 Staff Accept/Reject và hạn yêu cầu; §7 ma trận quyền tương ứng. Cấu trúc Excel là mẫu nghiệp vụ mục tiêu, parser chưa được triển khai; các thay đổi tài liệu không xác nhận frontend đã triển khai. Bản canonical trong repo là `docs/requirements/campus-tour-ui-flow.md`; bản sao trong thư mục đồ án được đồng bộ từ bản canonical này.

Các chi tiết kỹ thuật không bị thay ở trên, như tương quan command/leg, chống callback trùng, quay FRONT trước navigation, phân biệt lỗi media với lỗi điều khiển và local stop, vẫn cần giữ khi hợp nhất. Không dùng bản scope này để tự đổi ROS interface hoặc tự khẳng định client/bridge/media đã được kiểm chứng.

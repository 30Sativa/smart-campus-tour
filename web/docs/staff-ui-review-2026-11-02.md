# Rà soát giao diện Staff — 02/11/2026

Đây là nhận xét và đề xuất thiết kế từ mã nguồn hiện tại, không thay thế yêu cầu nghiệp vụ hoặc xác nhận chức năng đã triển khai. Phạm vi gồm shell, điều hướng, 22 thành phần trang trong `web/src/routes/staff/`, các thành phần dùng chung, biểu mẫu tạo Tour và drawer xét duyệt.

Chưa kiểm tra trực quan trong trình duyệt: tại thời điểm rà soát không có tab ứng dụng hoặc phiên Staff để sử dụng, và không thấy dịch vụ lắng nghe tại các cổng phát triển thường dùng 5173/5174/7092/5000/5001. Nhận xét responsive bên dưới suy ra từ breakpoint và thứ tự DOM; cần xác nhận bằng render thực tế trước khi nghiệm thu.

## 1. Kết luận thiết kế

Giữ nền sáng, thẻ trắng, xanh navy/xanh lam hiện có. Giao diện đã có nhiều thành phần hữu ích: bộ lọc, tìm kiếm, phân trang, kiểm tra trước khi bắt đầu, lý do khóa thao tác, xác nhận hành động và lịch sử phiên bản. Nên ưu tiên sửa tính chính xác của thông tin và thứ tự đọc, sau đó mới tinh chỉnh hình thức.

Mỗi trang cần giúp Staff trả lời ba câu: **Đang có việc gì? Vì sao cần chú ý? Làm gì tiếp theo?** Thông tin quan trọng phải thấy ngay; chi tiết kỹ thuật và biểu đồ có thể mở khi cần.

## 2. Các vấn đề cần sửa trước

### P1 — Nhãn nguồn dữ liệu không khớp nội dung

`web/src/features/staff/StaffShell.tsx:54` chỉ coi các đường dẫn manage, intercom và profile là trang không mô phỏng. Vì vậy lịch, lịch sử và robot vẫn nhận nhãn mô phỏng dù các trang này gọi API thật. Ngược lại, hồ sơ có thẻ ca làm dùng `useTours` mô phỏng nhưng lại ẩn nhãn. Shell còn đăng ký kênh mô phỏng và hiển thị chuông xuyên suốt khu vực.

Đề xuất: gắn nhãn đúng phạm vi dữ liệu: “Dữ liệu hệ thống”, “Mô phỏng vận hành”, “Mô phỏng cục bộ”, “Chưa có dữ liệu”. Trang có nhiều nguồn nên ghi nhãn tại từng khối. Không dùng một trạng thái kết nối mô phỏng để đại diện cho độ mới của dữ liệu API thật. Hàng chờ chưa tải được cần giữ là chưa biết, tránh diễn đạt thành không có việc.

### P1 — Hồ sơ mô tả sai quyền và chức năng hiện có

`web/src/routes/staff/StaffProfilePage.tsx:23` còn ghi tạo lịch, duyệt đăng ký, tuyến và POI thuộc Admin; các chức năng này đã nằm trong khu vực chuẩn bị của Staff. Trang còn nói mọi Staff vận hành mọi buổi, trong khi target hiện hành là Operator được phân công; mục đổi nhánh được ghi như quyền đã dùng được dù chức năng còn pending.

Đề xuất: mô tả riêng các khả năng hiện có và trách nhiệm Operator theo yêu cầu hiện hành. Chỉ hiển thị quyền thao tác thực tế từ dữ liệu quyền của hệ thống khi có; sửa câu chữ không đồng nghĩa đã triển khai phân quyền Operator. Giữ phần Admin ở quản lý tài khoản và quản trị hệ thống.

### P1 — Cảnh báo tuyến đã lỗi thời

`web/src/routes/staff/manage/StaffManageRouteCatalogPage.tsx:36` luôn ghi lập lịch từ phiên bản tuyến chưa hỗ trợ. Form tuyến cũng có thông báo tương tự, và `StaffManageRouteDetailsPage.tsx:64` luôn cảnh báo chưa thể xếp lịch. Trong khi `web/src/features/administration/tours/CreateTourForm.tsx` đã chọn tuyến chạy thử đạt, robot, Operator và giờ trống qua API.

Đề xuất: đối chiếu từng cảnh báo với khả năng API hiện tại, hiển thị điều kiện thiếu cụ thể của đúng phiên bản thay cho cảnh báo cố định. Không suy ra đã đủ điều kiện chỉ từ một nhãn PASS; dùng kết quả khả dụng từ hệ thống. READY vẫn là chức năng riêng và chưa được triển khai trên luồng thật hiện tại.

### P1 — Số đã duyệt bị diễn đạt thành người đang xem

`web/src/routes/staff/LiveOperationsPage.tsx:106` ghi “học sinh đang xem”, nhưng số lấy từ `groupSummary` chỉ cộng `studentCount` của đăng ký đã duyệt. Đây không phải số kết nối trực tiếp hay bằng chứng tham dự. Một dòng điểm xem chung cũng không đại diện cho danh sách học sinh đang xem màn chiếu.

Đề xuất: ghi đúng “theo đăng ký đã duyệt”; với luồng xét duyệt thật dùng “dòng lời mời” và loại cá nhân/điểm xem chung. Chỉ thêm số người/kết nối đang xem khi có nguồn dữ liệu phù hợp và định nghĩa đo rõ ràng.

### P2 — POI bản nháp bị tính vào “Chờ kỹ thuật”

`web/src/routes/staff/manage/StaffManagePoisPage.tsx:16` gộp mọi kết quả ngoài PASS/FAIL thành WAIT, kể cả chưa gửi. KPI và bộ lọc lại gọi nhóm này là “Chờ kỹ thuật”.

Đề xuất: phân biệt bản nháp, đã gửi chờ kiểm chứng, đạt và không đạt cần sửa bằng trạng thái sẵn có. Mỗi nhóm có hành động tiếp theo: hoàn thiện/gửi, chờ kỹ thuật, dùng tạo tuyến hoặc sửa tạo phiên bản mới.

### P2 — Điều khiển trực tiếp xuống dưới khung 3D trên laptop

`web/src/routes/staff/LiveOperationsPage.tsx:126` chỉ chia hai cột từ 1440px. Ở 1366px, Twin cao ít nhất 340px nằm trước controls, trong khi còn header, thanh nguồn và cảnh báo. Khả năng phải cuộn tới nút cần dùng là rủi ro bố cục cần kiểm tra bằng trình duyệt.

Đề xuất: trên laptop, đưa trạng thái thiết yếu và điều khiển chính lên trước Twin hoặc tạo bố cục phù hợp từ khoảng 1200–1280px sau khi đo vùng nội dung thực tế. Trên màn hình nhỏ, dùng một khối thao tác dễ tiếp cận, có khoảng đệm tránh che nội dung. Giữ xác nhận và lý do khóa từ server.

### P2 — Lịch theo robot thiếu ngữ cảnh thời gian và có thể làm khuất Tour

`web/src/routes/staff/SchedulePage.tsx` vẽ thanh theo 07:00–19:00 nhưng không có trục giờ nhìn thấy. `RobotDay` chỉ nhận Tour có reservation, nên Tour cũ không giữ robot không xuất hiện trong chế độ ngày. Nút trước/sau luôn nhảy 7 ngày kể cả khi đang xem ngày. Phần trăm ngày ở lịch tuần cộng thời gian giữ của nhiều robot nhưng chia cho một ngày của một robot.

Đề xuất: có trục giờ, nhãn bắt đầu/kết thúc, hàng “Chưa có giữ chỗ robot”, chuyển ±1 ngày ở chế độ ngày và ±7 ngày ở chế độ tuần. Ưu tiên ghi tổng giờ giữ robot; chỉ gọi là tỷ lệ sử dụng khi có mẫu số phù hợp và nguồn định nghĩa chính thức.

## 3. Đề xuất theo toàn bộ màn hình

| Thành phần trang | Điều chỉnh bố cục và thông tin |
|---|---|
| Tổng quan vận hành | Thứ tự: cảnh báo cần xử lý → buổi đang chạy/kế tiếp → KPI → danh sách trong ngày → thống kê. Đưa biểu đồ 7 ngày xuống dưới hoặc vào phần mở rộng. Hiển thị robot, bước/POI hiện tại và hành động tiếp theo theo nguồn sẵn có. |
| Buổi hôm nay | Giữ danh sách theo giờ và inspector đã có. Cho thấy ngay buổi trễ giờ, lý do chưa bắt đầu, robot và giờ kết thúc dự kiến. Inspector ghim cạnh bên khi đủ chỗ, dialog ở màn hình nhỏ. |
| Lịch buổi | Giữ ba chế độ tuần/ngày/danh sách; bổ sung trục giờ, bộ lọc robot và hàng chưa có reservation. Chỉ đưa Operator vào bộ lọc khi API danh sách cung cấp dữ liệu tương ứng. |
| Chi tiết vận hành | Tóm tắt trạng thái, robot, tuyến, thời gian và bước tiếp theo ở đầu trang. Nhóm nội dung thành Tổng quan/Đoàn/Lộ trình/Nhật ký để tránh trang dài; giữ lý do kết thúc dễ thấy. |
| Kiểm tra trước khi bắt đầu | Tách rõ kiểm tra hệ thống và ba xác nhận tại chỗ. Hiển thị số điều kiện còn thiếu, lý do khóa và nguồn camera. Robot xem trước phải là robot hệ thống dự kiến dùng; không lấy robot bất kỳ chỉ vì assignable. |
| Điều hành trực tiếp | Trạng thái bước hiện tại, POI, độ mới vị trí, lệnh chờ và điều khiển phải dễ thấy. Giữ Twin là khung chính; nhật ký gần nhất và lộ trình ở dưới dạng tab đã có. Phần phục hồi chỉ mở rộng khi cần hỗ trợ. |
| Robot & thiết bị | Từ API hiện có: tên/mã, kết nối và lần đồng bộ gần nhất; bổ sung “cách đây …” và thời điểm trang vừa tải. Pin, lỗi, Tour hiện tại cần API phù hợp; chưa có thì ghi chưa cung cấp. |
| Đàm thoại Quest | Gom trạng thái kết nối, mic và loa trong một khối rõ ràng. Nút bật/tắt mic thể hiện trạng thái hiện tại. Hiển thị liên kết mở trang phía kính, chuyển hướng dẫn cấu hình xuống phần trợ giúp; không tự thêm chọn nhiều kính vì luồng hiện chỉ thử nghiệm một kính. |
| Lịch sử | Thêm lọc khoảng ngày bằng tham số API hiện có, bộ lọc kết quả và nút xóa lọc. Dùng reservation để hiện robot nếu có. Lý do kết thúc và giờ thực tế có trong chi tiết; xem qua panel hoặc trang chi tiết, tránh tải riêng từng dòng. |
| Hồ sơ | Sửa quyền và nhãn nguồn trước. Ưu tiên tên đăng nhập, vai trò, tài khoản do Admin quản lý; ca hôm nay chỉ là phần phụ. Không mô tả lịch cả đội thành lịch được phân công cho cá nhân. |
| Digital Twin | Tách tab hoặc chế độ “Mô phỏng cục bộ” và “Chuẩn bị robot vật lý”. Thay khung cao cố định 820px bằng chiều cao theo viewport đã kiểm tra. Đưa kịch bản, xuất dữ liệu và thông số thử nghiệm vào panel phụ. |
| Tổng quan chuẩn bị | Ưu tiên hàng chờ đăng ký, POI cần sửa/chưa gửi và Tour sắp diễn ra cần hoàn thiện. Giữ cách lấy tổng từ metadata API; tránh thêm nhiều KPI không có hành động đi kèm. |
| Danh sách Tour | Giữ tìm kiếm/phân trang. Bổ sung robot và khoảng giữ chỗ từ reservation sẵn có; phân biệt rõ nhóm thời gian và trạng thái để người dùng biết đang lọc theo gì. Giữ tìm kiếm, trang và bộ lọc khi quay lại. |
| Chi tiết Tour chuẩn bị | Đầu trang có thời gian, robot, Operator, phiên bản tuyến và trạng thái. Thêm lối mở đăng ký của Tour bằng tourId đã hỗ trợ. Phân biệt rõ các số đoàn và lời mời theo đơn vị API; không dùng thay nhau. Giải thích điều kiện khóa sửa/hủy khi cần. |
| Tạo Tour | Chia nhóm: Thông tin → Tuyến/robot/Operator → Ngày/giờ. Giữ xem lại thời lượng, giữ robot, đóng đăng ký đã có; bổ sung tên Tour, tuyến, robot và Operator vào tóm tắt. Hiện lý do nút tạo chưa dùng được ngay cạnh nút; thêm thử lại từng nguồn lỗi. |
| Sửa Tour | Tách trường sửa được khỏi trường chỉ xem, ghi lý do khóa tại nhóm tương ứng. Với luồng versioned Tour, diễn đạt đúng giới hạn phải hủy/tạo lại khi đổi cấu hình đã khóa. Bổ sung cảnh báo rời trang khi còn thay đổi chưa lưu. |
| Đăng ký đoàn và drawer | Giữ duyệt từng dòng, chọn nhiều dòng và xác nhận đã có. Đưa trường/đoàn, Tour, người liên hệ và số dòng theo trạng thái lên đầu drawer. Nút “Xem & duyệt” đổi thành “Xem chi tiết” khi bản ghi không còn xét duyệt được. Tách rõ số dòng lời mời với số học sinh. |
| Danh sách POI | Tách trạng thái nháp/chờ/đạt/không đạt; hiển thị tên khu vực và v bản đồ thay cho mã rút gọn làm thông tin chính. Ở laptop dùng Danh sách/Bản đồ hoặc chế độ xem cạnh nhau khi đủ chỗ; hiện tại hai cột chỉ bật từ 1600px. |
| Tạo/sửa POI | Giữ click đặt vị trí và hướng, tọa độ thủ công mở rộng đã có. Tách nội dung thuyết minh, vị trí và lịch sử; cho thấy rõ lần lưu tạo phiên bản mới và thay đổi nào cần kiểm chứng lại theo kết quả hệ thống. Thanh lưu/gửi dễ tiếp cận trên màn hình nhỏ. |
| Danh mục tuyến | Thêm tìm kiếm và lọc kiểm chứng khi API hỗ trợ; nếu chỉ lọc trang hiện tại phải ghi đúng phạm vi. Card nên hiện thứ tự/tên POI, phiên bản, trạng thái, thời gian dừng và điều kiện thiếu cụ thể. Lịch sử phiên bản tiếp tục thu gọn. |
| Chi tiết tuyến | Tách trạng thái kiểm chứng với khả năng tạo Tour. Hiện checklist điều kiện còn thiếu thay cảnh báo cố định; phân biệt tổng thời gian dừng, thời gian chạy thử và thời lượng dự kiến. Giữ thông tin kỹ thuật trong phần mở rộng. |
| Tạo phiên bản tuyến | Nhóm thành thông tin/bản đồ → chọn và sắp xếp POI → vị trí đầu/cuối → xem lại. Bổ sung cách chọn điểm trên bản đồ thay cho chỉ nhập X/Y/yaw khi có thể tái sử dụng picker; không tự đặt quy tắc chuyển frame. Giữ mũi tên đổi thứ tự để dùng bằng bàn phím. |

## 4. Quy tắc trình bày chung

- Nội dung chính khoảng 14px; dữ liệu trong bảng 13–14px; chú thích 12–13px. Hạn chế 11px cho thông tin cần đọc thường xuyên. Tăng độ đậm màu chữ phụ, đặc biệt các vùng đang dùng `#94a3b8`/`#859bad` trên trắng; đo tương phản khi triển khai.
- Tiêu đề trang 24–28px, tiêu đề khối 16–18px; không dùng font đậm cho mọi dữ liệu. Dùng khoảng cách theo nhịp 8/12/16/24px.
- Dùng một ánh xạ nhãn và màu thống nhất giữa lịch, danh sách, chi tiết và inspector. Hiện SCHEDULED/CANCELLED có màu khác nhau giữa trang quản lý và lịch.
- Thống nhất thuật ngữ Tour/buổi/phiên theo ngữ cảnh; điểm tham quan (POI) và tuyến ở lần xuất hiện đầu. Mã và UUID là thông tin phụ; hạn chế chữ Start, backend, rev, yaw trong luồng công việc thông thường.
- Mỗi trang có một hành động chính rõ ràng. Hành động rủi ro có xác nhận, lý do và trạng thái đang gửi; lý do khóa luôn đọc được, không chỉ nằm trong tooltip của nút disabled.
- Mỗi danh sách có tìm kiếm phù hợp, số kết quả, bộ lọc đang áp dụng, xóa lọc và trạng thái tải/lỗi/rỗng phân biệt. Bộ lọc quan trọng nên được giữ trong URL.
- Với lỗi 401/403 giữ đúng loại lỗi và hướng xử lý. Một số trang hiện bọc `ApiError` thành `new Error(...)`, làm `ErrorPanel` không còn nhận biết mã HTTP. Tránh yêu cầu thử lại vô ích khi thiếu quyền.
- Bảng dài có header ghim nếu bố cục cuộn cho phép. Màn hình nhỏ ưu tiên thẻ thông tin; nếu cần cuộn ngang phải giữ định danh và lối mở chi tiết rõ ràng.

## 5. Thứ tự thực hiện và giới hạn dữ liệu

1. **Đợt 1 — Thông tin đúng:** nhãn nguồn dữ liệu, quyền ở hồ sơ, cảnh báo tuyến, số đã duyệt/đang xem, trạng thái POI và đơn vị đoàn/lời mời.
2. **Đợt 2 — Công việc dễ thao tác:** đưa cảnh báo/buổi hiện tại lên trước biểu đồ; chỉnh responsive live; hoàn thiện lịch; nối Tour với danh sách đăng ký; tóm tắt form và giữ bộ lọc.
3. **Đợt 3 — Đồng bộ hình thức:** cỡ chữ, tương phản, màu trạng thái, khoảng cách, bảng/card và màn hình nhỏ.

Các trường đã có có thể sắp xếp lại ngay: reservation/robot trong Tour list, Operator trong Tour detail, thông tin xét duyệt trong drawer, trạng thái gửi/kiểm chứng POI và lần đồng bộ robot. Không cần thêm API chỉ để đổi bố cục.

Các đề xuất như số đang xem, pin/lỗi/pose robot thật, nhật ký vận hành thật, lọc Tour theo Operator và tổng hợp điều kiện liên nguồn cần xác nhận hợp đồng hoặc bổ sung dữ liệu riêng. Không suy diễn từ fixture, số dòng lời mời hoặc số đã duyệt. Không thêm thao tác READY, đổi nhánh hay điều khiển robot thật chỉ từ thay đổi giao diện.

Trước khi nghiệm thu thay đổi: render tại 1366×768, 1440×900, 1920×1080, tablet và điện thoại; kiểm tra tên dài/nhiều dữ liệu, tải/lỗi/rỗng, Tab/Escape/focus, lý do khóa, xác nhận hành động và phân biệt mô phỏng với API. Chạy các test phù hợp và `scripts/verify web` khi triển khai mã. Bản rà soát này chỉ thêm tài liệu, chưa sửa giao diện hoặc chạy bộ kiểm thử ứng dụng.

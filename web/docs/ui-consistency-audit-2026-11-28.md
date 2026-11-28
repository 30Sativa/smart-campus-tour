# Rà soát đồng bộ giao diện, 28/11/2026

Trạng thái: **đã sửa cả 4 đợt** trên nhánh `feature/claude/fe-ui-consistency` (28/11/2026). Xem mục "Kết quả" ở cuối.

## Cách rà

- Chụp 50 màn hình bằng dữ liệu e2e mock, mỗi màn ở 1366px và 375px (100 ảnh).
  Các khu được chụp: Public, Học sinh, Đại diện, Vận hành, Chuẩn bị Tour, Quản trị, Kỹ thuật.
- Không trang nào tràn ngang và không trang nào có lỗi JS.
- Bốn lượt rà song song theo khu. Các điểm quan trọng được đối chiếu lại với ảnh và mã nguồn.
- Đã loại hai kết luận sai:
  - Trang chi tiết đăng ký của Đại diện trên mobile vẫn xếp một cột ổn.
  - Lịch Tour có tiêu đề h1.

## Chuẩn đang có (lấy làm gốc)

`PageHeader` trong `src/components/ui/ConsolePrimitives.tsx` gồm 3 phần:

- dòng nhóm (eyebrow) xanh 12px;
- tiêu đề bold 24/28px màu `#0f172a`;
- mô tả 14px màu `#64748b`, nút thao tác bên phải.

Đã dùng đúng ở: Quản trị (7 trang), Kỹ thuật (8 trang), và các trang Vận hành sau:

- Robot & thiết bị, Digital Twin;
- Lịch sử, Phân tích tương tác, Hồ sơ;
- Đăng ký đoàn, Danh mục tuyến.

Đã đồng bộ tốt, không cần đụng:

- sidebar, menu tài khoản, nút (`buttonClass`), ô nhập (`inputClass`), bảng;
- bộ lọc (`FilterChips`), trạng thái rỗng (`EmptyState`), toast, hộp xác nhận.

## Danh sách nên sửa

### Ưu tiên cao: đầu trang lệch chuẩn

Các trang dưới đây tự dựng tiêu đề riêng, nên cỡ chữ, màu và khoảng cách khác hẳn các trang bên cạnh.

| # | Màn hình | Hiện tại | File |
|---|---|---|---|
| H1 | Tổng quan (`/staff`) | Tự dựng h1, không có dòng nhóm, cách nội dung `mb-4` | `routes/staff/OverviewPage.tsx:100` |
| H2 | Lịch Tour (`/staff/schedule`) | h1 nhỏ hơn (20/24px), màu `#2d3748`, không có dòng nhóm, không có mô tả | `routes/staff/SchedulePage.tsx:154` |
| H3 | Quản lý POI (`/staff/manage/pois`) | Như H2. Hai nút "Chạy thử thuyết minh", "Tạo điểm mới" nằm dưới mô tả thay vì bên phải | `routes/staff/manage/StaffManagePoisPage.tsx:110` |
| H4 | Tạo Tour (`/staff/manage/tours/new`) | Có link "← Lịch Tour" ở trên, h1 28px semibold (không bold) do CSS riêng | `StaffManageTourCreatePage.tsx:51`, `tours/create-tour.css:26` |
| H5 | Tạo/sửa POI | h1 dùng màu `--poi-ink` riêng | `StaffManagePoiFormPage.tsx:252` |
| H6 | Điều hành trực tiếp (một Tour) | h1 22px kèm badge trạng thái. Đây là màn hình điều khiển, nên **giữ cỡ gọn**, chỉ thống nhất màu và khoảng cách | `routes/staff/LiveOperationsPage.tsx:112` |

**Dòng nhóm (eyebrow) đặt tên tự do.** Hiện có 12 cách viết khác nhau, ví dụ:

- "Chuẩn bị", "Chuẩn bị Tour", "Chuẩn bị Tour · POI";
- "Tour & đăng ký", "Tuyến", "Quản lý POI", "Nội dung tham quan".

Đề xuất: dòng nhóm = đúng **tên nhóm trên sidebar** chứa trang đó, khớp với chữ đầu của breadcrumb.

### Ưu tiên vừa: nút thao tác chính

| # | Màn hình | Hiện tại |
|---|---|---|
| A1 | Lịch Tour "+ Tạo Tour", Quản trị "+ Tạo tài khoản" | Kiểu ghost (chữ xanh, không nền), nhạt hơn cả nút phụ bên cạnh |
| A2 | Quản lý POI "Tạo điểm mới" | Nền xanh nhạt. Nút phụ "Chạy thử thuyết minh" lại có viền, nổi hơn nút chính |
| A3 | Tổng quan "Xem lịch" / "+ Tạo Tour" | Nút phụ có viền, nút chính ghost: thứ bậc bị ngược |

Đề xuất quy tắc:

- Mỗi trang có **tối đa một nút chính** `buttonClass('primary')` ở ô thao tác của `PageHeader`.
- Nút phụ dùng `secondary`.
- Nhãn theo dạng "Tạo <danh từ>". Riêng "Đăng ký robot" giữ nguyên vì đó là động từ nghiệp vụ.

### Ưu tiên vừa: khung trang

| # | Vấn đề | File |
|---|---|---|
| F1 | Chiều rộng tối đa: Quản trị và Vận hành 1440px, Kỹ thuật 1360px. Đề xuất cả ba dùng 1440px | `technical/TechnicalUi.tsx:8` |
| F2 | Đệm trên: Quản trị `py-4`, Kỹ thuật `py-5`. Đề xuất `py-4 lg:py-6` | `technical/TechnicalUi.tsx:8` |
| F3 | Thẻ POI dùng bo góc 15px và bóng riêng thay vì `cardClass` | `StaffManagePoisPage.tsx:59` |

### Ưu tiên vừa: khu Đại diện trường

Khu này cố ý dùng khung khác (tab ngang trên cùng, không sidebar) vì người dùng là giáo viên ngoài trường. **Đề xuất giữ khung**, chỉ đồng bộ phần "vật liệu":

| # | Vấn đề | File |
|---|---|---|
| R1 | Thẻ `.rep-card` không viền, bóng riêng. Các console khác dùng viền `#e2e8f0` + `shadow-xs` | `features/representative/representative.css` |
| R2 | Tiêu đề trang `.rep-title` không cố định cỡ, giữa các trang Đại diện chênh nhau | `RepUi.tsx:24`, `representative.css` |
| R3 | Màu tab đang chọn dùng `--rep-green` riêng, không phải màu nhấn chung | `representative.css` |

### Ưu tiên thấp

| # | Vấn đề | File |
|---|---|---|
| L1 | Trang 404: nút "Về trang chủ" bo tròn đen, tự viết class | `routes/public/NotFoundPage.tsx:30` |
| L2 | Đăng ký đoàn: nút chuyển "Chờ duyệt / Tất cả đăng ký" tự dựng bằng nút primary/ghost. Nên dùng `FilterChips` hoặc `StageTabs` có sẵn | `StaffManageRegistrationsPage.tsx:50` |
| L3 | Đánh dấu trường bắt buộc chưa thống nhất: Tạo Tour ghi "(không bắt buộc)", form tuyến dùng dấu `*`. Đề xuất chỉ ghi "(không bắt buộc)" cho trường tùy chọn | `CreateTourForm`, `RouteStopsEditor` |
| L4 | `PageHeader` còn prop `scale` không dùng tới | `ConsolePrimitives.tsx:31` |
| L5 | Trạng thái làm mới mỗi khu đặt một chỗ: Vận hành có chấm "Cập nhật trực tiếp" trên thanh đầu, Kỹ thuật có "Tự làm mới 15s" cạnh tiêu đề. Hai nguồn dữ liệu khác nhau (SignalR vs polling), nên **giữ**, chỉ ghi lại lý do | - |

## Kế hoạch sửa

Làm theo đợt. Mỗi đợt là một nhánh và một PR riêng, để duyệt từng phần.

### Đợt 1: Đầu trang (H1 đến H6, eyebrow, L4)

1. Thêm vào `PageHeader` một prop tùy chọn `back={{ to, label }}` để vẽ link quay lại phía trên dòng nhóm.
   Dùng cho Tạo Tour, sửa Tour, chi tiết tuyến, form POI.
   Bỏ prop `scale` thừa.
2. Chuyển H1 đến H5 sang `PageHeader`:
   - Lịch Tour và Quản lý POI có thêm mô tả một dòng.
   - Nút đưa vào ô `action`.
   - Xóa CSS tiêu đề riêng trong `create-tour.css`.
3. H6 Điều hành trực tiếp: giữ bố cục gọn. Chỉ đổi màu và khoảng cách về chuẩn, không ép cỡ 28px.
4. Đổi toàn bộ eyebrow theo tên nhóm sidebar.
5. Kiểm: cập nhật test có tìm theo heading, chạy verify, chụp lại 12 màn bị đụng ở 375/1366px.

### Đợt 2: Nút thao tác (A1 đến A3)

1. Đổi nút tạo chính sang `primary`, nút phụ sang `secondary`, trên các trang đã liệt kê.
2. Kiểm tra lại toàn bộ các trang có ô `action` để chắc mỗi trang chỉ có một nút chính.
3. Chụp lại để so.

### Đợt 3: Khung trang và Đại diện (F1 đến F3, R1 đến R3)

1. Thống nhất chiều rộng và đệm trên của `TechnicalPage`.
2. Thẻ POI dùng `cardClass`.
3. Khu Đại diện: map biến `--rep-*` (viền, bóng, màu nhấn, cỡ tiêu đề) về giá trị chung của console. Khung tab ngang giữ nguyên.
4. Chụp lại toàn bộ khu Đại diện và Kỹ thuật.

### Đợt 4: Việc lặt vặt (L1 đến L3)

Có thể gộp vào đợt 3 nếu bạn muốn ít PR hơn.

## Ngoài phạm vi đợt này

Dời 2791 mã màu hex sang token (`web/docs/design-tokens.md`) là việc lớn, đụng gần như mọi file. Nên tách riêng sau khi bốn đợt trên xong.

## Kết quả

Cả bốn đợt gộp vào một PR, mỗi đợt một commit.

- **Đợt 1.**
  - H1 đến H5 dùng `PageHeader`. `PageHeader` có thêm `back` và `badge`, bỏ `scale`.
  - Năm link quay lại tự dựng (Tạo Tour, form POI, chạy thử thuyết minh, chi tiết/form tuyến, tương tác một Tour) về chung một kiểu.
  - Mọi dòng nhóm là tên nhóm trên sidebar. Riêng trang của một Tour vẫn ghi tên hoặc trạng thái Tour đó.
  - `nav-page-titles.test.ts` giờ kiểm cả Lịch Tour và Quản lý POI.
  - H6 giữ cỡ gọn như đề xuất.
- **Đợt 2.**
  - Nguyên nhân thật của A1 đến A3 không nằm ở từng trang. Lớp `softConsoleMain` ghi đè mọi nút `primary` thành nền nhạt, ở cả Vận hành, Quản trị và Kỹ thuật. Đã bỏ lớp ghi đè đó, nên nút chính có nền đặc ở mọi console.
  - Nút bật/tắt "Tự làm mới" ở Hạ tầng và Giám sát trước đây đổi sang kiểu nút chính khi bật. Giờ nó dùng kiểu phụ kèm chấm trạng thái, như trang Tổng quan Kỹ thuật.
  - "Tạo điểm mới" đổi thành "Tạo điểm tham quan", khớp với tiêu đề form.
- **Đợt 3.**
  - `TechnicalPage` dùng 1440px và `py-4 lg:py-6`.
  - Thẻ POI dùng `cardClass`.
  - Khu Đại diện:
    - thẻ bo 15px với bóng của console;
    - nút chính nền xanh đặc (`--rep-primary`);
    - tab đang chọn chữ xanh nhấn, đậm 600.
  - Sửa lại một ý trong bản rà: thẻ console thực ra **không viền**, vì `softConsoleMain` làm viền trong suốt. Nên R1 khớp theo cái đang hiển thị (không viền), không thêm viền `#e2e8f0`.
  - Thẻ Học sinh đọc cùng biến bo góc và bóng nên đổi theo. Nút Học sinh vẫn đọc `--rep-accent` nên không đổi.
  - R2: cỡ h1 Đại diện vốn đã là 28px, và 24px trên màn hẹp, đúng như console. Chỉ tiêu đề trong khung chi tiết đăng ký nhỏ hơn (23px), vì nó là tiêu đề trong thẻ, nên giữ.
- **Đợt 4.**
  - Trang 404 dùng `buttonClass`.
  - Nút chuyển "Chờ duyệt / Tất cả đăng ký" dùng `FilterChips`.
  - Bỏ dấu `*`, chỉ ghi "(không bắt buộc)" cho trường tùy chọn. Đã áp cho form POI và bước 1 đăng ký của Đại diện. Form tuyến (`RouteStopsEditor`) vốn không có dấu `*`, nên L3 ở đó không cần sửa.

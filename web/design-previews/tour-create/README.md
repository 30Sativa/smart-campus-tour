# Bố cục Tạo Tour đã duyệt

Người dùng duyệt và yêu cầu áp dụng ngày 18/11/2026. Mã triển khai nằm trong:

- web/src/routes/staff/manage/StaffManageTourCreatePage.tsx
- web/src/features/administration/tours/CreateTourForm.tsx
- web/src/features/administration/tours/create-tour.css
- web/src/features/administration/tours/tour-preparation-ux.test.tsx

Biểu mẫu chia thành Thông tin Tour, Tuyến & vận hành, Lịch & sức chứa, Ảnh & video. Cột phải tóm tắt dữ liệu đang nhập và tuyến, giữ vị trí khi cuộn trên desktop. Trên điện thoại, phần xem lại đứng trước nút tạo cả trong giao diện và thứ tự DOM. Giữ màu xanh console, Be Vietnam Pro và khung Staff hiện có.

Trang Tạo Tour mở thẳng biểu mẫu, mặc định Tour theo ca khi URL không chỉ định loại hợp lệ; màn hình chọn loại riêng và nút Đổi loại đã được bỏ theo yêu cầu. Bộ chọn ở đầu form giữ dữ liệu đã nhập khi chuyển loại. Query params, hook dữ liệu, điều kiện tuyến/robot/ca, validation, request id chống tạo trùng, tải ảnh sau khi tạo và video dự phòng được giữ nguyên. Ghi chú đầy đủ của Tour nhanh nằm trong phần Điều kiện bắt đầu và giữ robot; giờ, hạn và khoảng giữ thực tế vẫn lấy từ máy chủ.

HTML trong thư mục này là bản mẫu tham chiếu, không kết nối API. Từ repo chạy node web/design-previews/tour-create/serve.mjs, mở http://127.0.0.1:5185/?sample=1; thêm kind=quick để xem Tour nhanh. Dữ liệu mẫu được ghi rõ; không thay cho dữ liệu ứng dụng.

Ảnh Tour vẫn tùy chọn, khung ngang 16:9, khuyến nghị 1200×675 và tối đa 10 MB. Video dự phòng giữ component và giới hạn hiện có. Không thêm ảnh trang trí hoặc thư viện mới.

Kiểm tra giao diện thực tế: React page được render bằng API fixture tách biệt ở cả desktop và điện thoại; 8 kích thước 320–1920 px không tràn ngang. Đã kiểm tra căn hộp chọn, tóm tắt sticky, thứ tự mobile, độ tương phản khi theme toàn cục tối, mở điều kiện Tour nhanh và chuyển loại giữ dữ liệu. Hallmark: 0 FAIL, 0 REFLEX, 0 WARN; giữ màu mực Staff hiện có được giải trình ở gate 74.

Bộ scripts/verify web chạy trong bản sao nguồn tách biệt vì các server đang mở giữ native module trên Windows. Bốn tệp triển khai được đối chiếu SHA-256 với workspace. Kết quả cuối: scripts/verify web PASS (npm ci, maps:check, typecheck, lint, toàn bộ test suite, build).

Sau khi bỏ bước chọn loại riêng: scripts/verify web PASS trên bản sao nguồn đã đối chiếu; đã kiểm tra mở form trực tiếp, đổi loại giữ dữ liệu và link kind=short.

 Test Files  175 passed (175)
      Tests  1459 passed | 1 skipped | 1 todo (1461)

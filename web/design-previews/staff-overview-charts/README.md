# Mẫu cũ Staff, bổ sung biểu đồ

Mở bản xem trước: <http://localhost:5173/design-previews/staff-overview-charts/index.html#report-addition> khi Vite đang chạy từ `web/` bằng `npm run dev`.

Giữ nguyên toàn bộ mẫu `web/design-previews/staff-overview/`: bố cục, màu, font, sidebar, sơ đồ Tour, các bảng và thao tác sẵn có. Bốn tệp `preview.css`, `preview.js`, `tokens.css`, `base.css` được sao chép nguyên byte. HTML chỉ thêm liên kết stylesheet/module và khu báo cáo nằm sau hai biểu đồ cũ, trước bảng Tour hôm nay. Không sửa trang ứng dụng `/staff`.

Phần thêm gồm biểu đồ cột số Tour theo tháng hoặc ngày và thanh phân bố hoàn thành/hủy/chưa kết thúc. Có chọn năm/tháng; chọn nhãn tháng trên biểu đồ mở chế độ theo ngày. Phạm vi “Tôi vận hành” ở thanh công cụ cũ áp dụng cho cả phần báo cáo mới. Bộ lọc báo cáo lưu trong URL riêng, không ghi đè bộ lọc cũ.

Lịch hôm nay và 7 ngày vẫn dùng dữ liệu kiểm thử cũ. Riêng báo cáo theo kỳ dùng dữ liệu giả lập có nhãn rõ ràng, mốc 13/11/2026 để khớp đồng hồ bản mẫu. Năm 2025 có mẫu đủ năm. Kỳ tương lai hiện dấu gạch. Không có số liệu thực tế hoặc kết nối API báo cáo. Tỷ lệ hoàn thành tính trong số Tour đã kết thúc: hoàn thành / (hoàn thành + hủy).

Kiểm tra: TypeScript nghiêm ngặt và ESLint cho hai module mới đạt; Hallmark tĩnh/render đạt 0 FAIL, 0 REFLEX, 0 WARN (một ghi nhận giữ token màu cũ). Đã đối chiếu bốn tệp nguyên byte và toàn bộ HTML cũ sau khi loại ba phần thêm; thử bộ lọc năm/tháng, phạm vi, chọn tháng, tải lại URL, trạng thái trống và 7 chiều rộng 320/375/700/1000/1280/1440/1920 px. Không tràn ngang trang hoặc lỗi JavaScript. Đây là kiểm tra bản demo độc lập, không phải xác nhận toàn bộ ứng dụng.

# Demo Tổng quan Staff và báo cáo Tour

Bản demo ngày 25/11/2026, tách riêng khỏi ứng dụng. Không thay đổi trang `/staff`, API, quyền truy cập hoặc dữ liệu máy chủ.

Mở khi Vite đang chạy: <http://localhost:5173/design-previews/staff-reports/index.html>. Nếu cần khởi động, chạy `npm run dev` từ `web/`.

## Thiết kế

Giữ Be Vietnam Pro, màu xanh và điều hướng Staff. Đầu trang có lịch hôm nay, đường dẫn đến Tour đang chạy và đăng ký chờ duyệt. Phần báo cáo gồm bộ lọc năm/quý/tháng, phạm vi tất cả Tour hoặc Tour được phân công cho mình, chỉ số tổng/hoàn thành/hủy/tỷ lệ hoàn thành, biểu đồ cột đối chiếu cùng kỳ, thanh phân bố trạng thái và bảng chi tiết. Chọn nhãn tháng trên biểu đồ hoặc trong bảng để mở báo cáo theo ngày.

Bộ lọc được lưu trong URL; tải lại và nút quay lại của trình duyệt khôi phục lựa chọn. CSV xuất dữ liệu mẫu đúng theo bộ lọc, có tiêu đề ghi rõ dữ liệu minh họa. Trên điện thoại, biểu đồ và bảng cuộn ngang với hướng dẫn hiện trên giao diện; cột kỳ trong bảng được giữ cố định.

## Dữ liệu minh họa

Toàn bộ số liệu trong bản demo là dữ liệu tổng hợp giả lập, không phải thống kê thực tế. Tên robot và các điểm dừng lấy theo mẫu hiện có trong `web/e2e/fixtures/staff.ts`; không dùng tên trường, tên khách hàng, doanh thu hoặc số người tham dự giả.

Nguồn mẫu duy nhất nằm trong `report-data.ts`: năm 2025 đủ năm, năm 2026 đến ngày 25/11. Báo cáo năm 2026 có 221 Tour: 200 hoàn thành, 18 hủy, 3 chưa kết thúc. Ba Tour ngày 25/11 gồm một đang diễn ra, một đã chốt và một chưa chốt, đều được phân công cho tài khoản mẫu. Đăng ký chờ duyệt là một tình huống mẫu riêng.

Chọn kỳ theo ngày bắt đầu dự kiến, giờ Việt Nam. Tỷ lệ trong mẫu = hoàn thành / (hoàn thành + hủy); không có Tour đã kết thúc thì hiện dấu gạch. Tổng kỳ bao gồm các trạng thái chưa kết thúc. So sánh cùng kỳ sử dụng đúng các ngày lịch đã trôi qua của năm trước; tháng 11/2026 chỉ đối chiếu đến 25/11/2025. Kỳ tương lai hiện “Chưa đến kỳ”, không được coi là số 0 đã quan sát. Năm 2025 tắt so sánh do chưa có mẫu năm 2024.

## Trạng thái và kiểm tra

Dùng các liên kết cuối trang hoặc `?state=loading|empty|error` để xem trạng thái tải/trống/lỗi. Nút thử lại trở về dữ liệu mẫu; đây không phải yêu cầu API. Khi tắt JavaScript, phần tổng quan và giải thích mẫu vẫn hiển thị. Các liên kết chức năng Staff mở ứng dụng hiện tại trong tab riêng và cần đăng nhập.

Hallmark kiểm tra tĩnh và render: 0 FAIL, 0 REFLEX, 0 WARN. Rà soát thiết kế độc lập đã nêu bốn vấn đề; đã sửa kích thước chữ biểu đồ điện thoại, đưa việc cần xử lý lên đầu, thêm hướng dẫn cuộn bảng và phân biệt kỳ tương lai. Bản cũ giữ được ưu điểm ưu tiên vận hành trong ngày; bản demo giữ đường dẫn xử lý ngay trên báo cáo.

Chi tiết kiểm tra tương tác và kiểm tra dự án nằm trong `.hallmark/validation.md`. Ảnh trước/sau ở `.hallmark/compare.html`; ảnh “trước” là bản mẫu Tổng quan Staff trước đây, không phải ảnh của phiên đăng nhập hiện tại.

## Sau khi duyệt thiết kế

Nguồn cần bổ sung là báo cáo lịch sử Tour đầy đủ từ máy chủ. Khi áp dụng, cần API tổng hợp theo kỳ và phạm vi phân công, có mốc chốt dữ liệu; không suy số liệu năm từ danh sách hiện tại chỉ bao gồm hôm nay và 7 ngày sắp tới. Thống nhất công thức tỷ lệ theo nghiệp vụ trước khi triển khai. Các số mẫu chỉ dùng trong demo và không làm dữ liệu dự phòng khi API lỗi.

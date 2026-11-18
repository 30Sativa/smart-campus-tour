# Bản xem trước Tổng quan Staff

Thiết kế Hallmark cho màn hình `/staff`, ngày 18/11/2026. Bản xem trước độc lập dùng dữ liệu mẫu. Trang React đã áp dụng kiểu sơ đồ ngang và đọc dữ liệu từ API Staff.

Chạy từ `web/`: `node design-previews/staff-overview/serve.mjs`, mở `http://127.0.0.1:5186/`.

Giữ font Be Vietnam Pro, màu xanh console và các đích điều hướng Staff. Các liên kết mở trang ứng dụng sử dụng server local port 5173 và cần phiên đăng nhập Staff riêng. Không mô phỏng thao tác tạo, duyệt, mở hay điều khiển robot thành công.

Dữ liệu hiển thị lấy từ `web/e2e/fixtures/staff.ts` và đồng hồ kiểm thử tại `web/e2e/support/mock-api.ts`, ngày 13/11/2026 09:00 giờ Việt Nam. Có 3 Tour hôm nay: đang chạy lúc 08:40, Tour nhanh chưa chốt lúc 10:30, đã chốt lúc 14:00. Một Tour chưa chốt ngày 17/11 do Staff khác vận hành. Một đăng ký chờ 26 giờ; AMR-01 đang báo cáo. Không tự thêm lịch sử, tỷ lệ hoàn thành, lượt tham dự hoặc xu hướng.

Biểu đồ cột đếm Tour theo ngày, trục bắt đầu từ 0. Thanh phân bố trạng thái đếm ba Tour trong ngày. Sơ đồ tuyến có ba kiểu xem ngay dưới Tour đang chạy: ngang, dọc (`?diagram=vertical`) và theo tọa độ (`?diagram=map`). Kiểu tọa độ đặt các điểm theo vị trí mẫu trong fixture. Nét nối biểu diễn thứ tự điểm dừng. Các trạng thái đều có nhãn chữ.

Bộ lọc cập nhật URL `?view=RUNNING|READY|SCHEDULED`; phạm vi `?mine=1` bỏ Tour của người khác khỏi biểu đồ 7 ngày. Cả ba Tour hôm nay thuộc Nguyễn Minh Anh nên bảng ngày không đổi khi đổi phạm vi. Các trạng thái bổ sung: `?state=empty|error|loading`. Nội dung mẫu đầy đủ vẫn đọc được khi tắt JavaScript.

Trang React dùng các query hiện tại của OverviewPage, DayTours và WorkQueue. Sơ đồ lấy thứ tự từ phiên bản tuyến và đánh dấu theo trạng thái Tour của máy chủ. Biểu đồ hiện số liệu khi các danh sách nguồn trả đủ dữ liệu.

Kiểm tra bản mẫu: Hallmark static và render đạt 0 FAIL, 0 REFLEX, 0 WARN; gate 74 được ghi nhận giữ màu mực Staff. Rà soát độc lập: ship, không còn lỗi hình ảnh. Đã kiểm tra 8 chiều rộng 320/375/600/768/1000/1280/1440/1920 px, font, ảnh, lọc trạng thái và khôi phục URL, lọc người vận hành, menu mobile/Escape, ba trạng thái tải/trống/lỗi, nội dung khi tắt JavaScript. Không tràn ngang, ảnh hỏng hay lỗi JavaScript.

Kiểm tra dự án: scripts/verify web PASS trong bản sao nguồn tách biệt (npm ci, maps:check, typecheck, lint, 175 test files PASS, 1455 tests PASS, 1 skipped, production build PASS). Bảy tệp bản mẫu được đối chiếu SHA-256 với bản sao trước khi hoàn tất kiểm tra. Không chỉnh các tệp ứng dụng hiện có.


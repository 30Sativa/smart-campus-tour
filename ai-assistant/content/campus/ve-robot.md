---
id: ve-robot
title: Về robot hướng dẫn
kind: campus
poiId:
priority: 1
status: approved
reviewedBy: Quản Bá Thành
reviewedAt: 2026-10-13
---
<!-- Nguồn: README.md, docs/architecture.md §2, ADR-0001, ADR-0007, campus-tour-scope.md. Chỉ ghi điều đã có trong tài liệu dự án. -->

## Robot là gì

- Robot là một AMR (Autonomous Mobile Robot – robot di động tự hành): robot tự đi theo tuyến đã được chuẩn bị, không cần người lái bằng tay.
- Buổi demo dùng một robot thật, chạy trong vùng đã được khảo sát ở tầng 6 NVH.
- Robot có camera để truyền hình ảnh trực tiếp và một phần đầu xoay để hướng camera về phía điểm tham quan.

## Robot di chuyển thế nào

- Robot dùng cảm biến LiDAR (cảm biến quét laser đo khoảng cách) làm cảm biến chính để định vị và tránh vật cản. Camera Astra Pro chỉ là cảm biến hỗ trợ.
- Phần mềm robot chạy trên ROS 2 (Robot Operating System, bộ phần mềm phổ biến cho robot) và Nav2 (bộ công cụ dẫn đường của ROS 2).
- Robot không tự lùi khi đang tự hành; khi cần xử lý tình huống, nhân viên vận hành sẽ can thiệp.
- Robot chỉ đi tới các điểm và nhánh đã được kiểm chứng trước. Robot không tự tạo tuyến mới và không đi vào khu vực chưa có bản đồ.

## Ai điều khiển robot

- Nhân viên vận hành (Staff) theo dõi robot qua bản sao số 3D (Digital Twin) và quyết định bắt đầu, giữ lại, đi tiếp hoặc kết thúc buổi tham quan.
- Học sinh và trợ lý AI không điều khiển robot.
- Đại diện đoàn có thể đề nghị đổi sang một nhánh tham quan khác trong các lựa chọn đã được kiểm chứng; Staff là người duyệt đề nghị đó.

## Dự án

- Đây là dự án CampusTour DT-AMR: tham quan campus từ xa bằng robot tự hành kết hợp bản sao số (Digital Twin).

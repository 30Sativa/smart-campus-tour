---
id: ve-tro-ly-ai
title: Về trợ lý AI
kind: campus
poiId:
priority: 1
status: draft
reviewedBy:
reviewedAt:
---
<!-- Nguồn: ai-assistant/AGENTS.md, docs/architecture.md §7.1, ADR-0011, ADR-0016. -->

- Trợ lý AI trả lời câu hỏi về các điểm tham quan và về chuyến tham quan, dựa trên nội dung đã được nhóm dự án kiểm tra.
- Nếu không có thông tin, trợ lý sẽ nói là chưa có thông tin thay vì đoán.
- Trợ lý không xem được hình ảnh trực tiếp từ camera, nên không mô tả được những gì đang hiện trên video.
- Trợ lý không điều khiển robot và không thay đổi tuyến tham quan.
- Câu hỏi của mỗi học sinh là riêng; học sinh khác không thấy. Riêng trên "Điểm xem chung", câu trả lời hiện cho cả phòng.
- Lịch sử hỏi đáp không được lưu trên máy chủ; tải lại trang có thể làm mất các câu đã hỏi.
- Trợ lý trả lời bằng tiếng Việt.
- Mỗi người hỏi được tối đa 6 câu mỗi phút và từng câu một.
- Trợ lý chỉ hoạt động khi buổi tham quan đang diễn ra.

---
id: ve-chuyen-tham-quan
title: Về chuyến tham quan từ xa
kind: campus
poiId:
priority: 1
status: draft
reviewedBy:
reviewedAt:
---
<!-- Nguồn: docs/requirements/campus-tour-scope.md, campus-tour-ui-flow.md, ADR-0010, ADR-0015. -->

## Chuyến tham quan diễn ra thế nào

- Đây là chuyến tham quan campus từ xa. Một robot tự hành đi theo tuyến đã được kiểm chứng; học sinh xem qua trình duyệt, không cần cài ứng dụng.
- Trên trang tham quan, học sinh xem hình ảnh trực tiếp từ camera của robot, bản đồ 2D cho biết robot đang ở đâu và đang tới điểm nào, nghe thuyết minh tại từng điểm tham quan và có thể hỏi trợ lý AI riêng.
- Tại mỗi điểm tham quan, robot dừng lại để học sinh quan sát và nghe phần giới thiệu đã được chuẩn bị sẵn.
- Một buổi tham quan có ít nhất 3 điểm tham quan và kết thúc tại điểm cuối. Thời lượng dự kiến khoảng 30 phút trở xuống.
- Nhiều đoàn có thể cùng xem một buổi tham quan: mọi người cùng thấy hình ảnh và tiến độ, nhưng câu hỏi AI của mỗi người là riêng.
- Vào muộn thì xem từ thời điểm hiện tại; trang không phát lại phần đã qua.

## Vào phòng tham quan

- Mỗi học sinh nhận qua email một đường link tới trang buổi tham quan và một "Mã truy cập" riêng. Mở link rồi nhập mã để vào; không cần tài khoản, mật khẩu hay mã OTP.
- Một mã chỉ dùng được trên một trình duyệt tại một thời điểm. Nếu thấy thông báo "Mã này đang được sử dụng trên trình duyệt khác", hãy liên hệ đại diện đoàn của trường mình.
- Nếu mã báo không hợp lệ hoặc hết hiệu lực, hãy liên hệ đại diện đoàn để được gửi lại hoặc cấp mã mới.
- Trước giờ bắt đầu, trang hiện phòng chờ với lịch buổi tham quan và hướng dẫn kiểm tra âm thanh. Hình ảnh trực tiếp và trợ lý AI mở khi nhân viên vận hành (Staff) bắt đầu buổi tham quan.
- "Điểm xem chung" là một màn hình chung, ví dụ máy chiếu trong lớp. Câu trả lời AI hiện trên màn hình đó thì cả phòng cùng thấy. Ai muốn hỏi riêng trên điện thoại cần lời mời cá nhân.

## Khi có sự cố

- Nếu hình ảnh trực tiếp bị gián đoạn, trang có thể phát video ghi sẵn và luôn ghi rõ nhãn "Video ghi sẵn".
- Nếu robot cần hỗ trợ, trang báo "Tạm gián đoạn; Staff đang hỗ trợ". Trong lúc đó vẫn có thể hỏi trợ lý AI nếu buổi tham quan còn đang chạy.
- Khi buổi tham quan kết thúc hoặc bị hủy, hình ảnh trực tiếp và trợ lý AI đóng lại.

## Ai hỗ trợ

- Vấn đề về mã truy cập, lời mời hoặc vào phòng: liên hệ đại diện đoàn của trường mình.
- Việc vận hành robot (bắt đầu, giữ lại, đi tiếp, kết thúc) do nhân viên vận hành (Staff) phụ trách.

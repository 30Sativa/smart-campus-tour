# Kế hoạch landing page CampusTour (theo cấu trúc template Himon)

Bản xem trước: `web/public/landing-preview/index.html`
Chạy: `cd web && npm run dev` rồi mở `http://localhost:5173/landing-preview/index.html`.
File tự chứa (HTML + CSS + JS thuần, không thư viện). Ảnh lấy từ `web/public/images/` bằng đường dẫn tương đối `../images/...`.

## 1. Ánh xạ section: Himon → CampusTour

| # | Section Himon | Section CampusTour | Nội dung (nguồn: scope 19/09/2026) | Hình ảnh |
|---|---|---|---|---|
| 0 | Header (trong suốt → nền trắng) | Header | Logo, 5 anchor, nút "Vào phiên tham quan" → `/login` | Logo SVG |
| 1 | Hero | Hero | "Khuôn viên trường, tới tận lớp học." + 3 chỉ số mục tiêu (≥3 POI, ≈30 phút, 0 tài khoản) | `hero-campus.jpg` |
| 2 | Intro + Stats (3) | Giới thiệu | Định vị sản phẩm; 3 stat: ≥3 POI, 1 luồng livestream, ≈30′ | `login-bg.jpg` |
| 3 | Services (05) | Trải nghiệm (05) | Livestream · Robot tự hành qua POI · Giá xoay nguồn hình · Thuyết minh + hỏi AI · Map 2D + Digital Twin | `autonomous robot.avif`, `robot.avif`, `tro-chuyen.avif`, `images.jpg`, `digital-twin.jpg` |
| 4 | Solution (4 thẻ động) | Giải pháp | Điều phối tự động · Trạng thái realtime (SignalR) · Góc nhìn pan trái/phải · Mô phỏng Gazebo/emulator | Đồ hoạ CSS động |
| 5 | Text reveal + nền sticky | Tuyên bố | "CampusTour kết nối học sinh, nhà trường…" | `ai-fleet-management-…webp` |
| 6 | Ticker | Ticker | THAM QUAN TỪ XA · ROBOT TỰ HÀNH · … | |
| 7 | How we work (4 bước) | Quy trình | Đăng ký đoàn (Excel) → Admin duyệt/gửi mã → Staff Start, robot đi POI → Học sinh xem live + hỏi AI | `booking-app.avif`, `robot_mission_…webp`, **SVG tuyến 3 POI có robot chạy**, `ai-assistant.avif` |
| 8 | Who we are (xe tải + 4 thông số) | Robot | Số lớn "30 phút/buổi"; 4 thông số: ROS 2/Nav2, nguồn hình trên giá xoay, fleet_bridge, an toàn | `smartbus-robot.jpg` (trượt vào khi cuộn) |
| 9 | Partnership (logo đối tác) | Nền tảng & công nghệ | 5 khối hệ thống; marquee tên công nghệ (chữ, không dùng logo thương hiệu) | `hero-campus.jpg` làm nền |
| 10 | Insights (2 nổi bật + 3 thường) | Góc kỹ thuật | Tách backend/ROS · Bài thử Quest 3 · Gazebo/emulator · NEEDS_ASSISTANCE · Mã đoàn không cần tài khoản | Ảnh sẵn có + **SVG sơ đồ TourState** |
| 11 | FAQs (5) | Hỏi đáp | Tài khoản · Điều khiển robot · AI riêng · Sự cố · Đăng ký | |
| 12 | Footer (parallax + CTA + brand) | Footer | CTA vào phiên, sơ đồ trang, tài nguyên, chữ "CampusTour" khổng lồ | `login-bg.jpg` |

## 2. Hiệu ứng giữ lại từ Himon

- Tiêu đề trồi lên từng ký tự khi vào khung nhìn (`data-split`).
- Header trong suốt trên Hero, đổi nền trắng mờ sau Hero, ẩn khi cuộn xuống và hiện khi cuộn lên.
- Nút pill: icon mũi tên trượt từ phải sang trái khi hover; link chữ có chấm tròn phóng to.
- Ảnh Hero zoom-out khi tải và parallax khi cuộn; ảnh Intro zoom khi xuất hiện.
- Stats đếm số; đường kẻ chia section chạy ngang.
- Danh sách Services mở rộng khi hover (desktop) hoặc chạm (mobile).
- 4 thẻ Solution có đồ hoạ động: elip xoay, vòng lan, mũi tên + camera pan, lưới chấm.
- Đoạn chữ sáng dần từng từ theo cuộn trên nền ảnh sticky (Solution và Partnership).
- Ticker và marquee chạy vô hạn.
- Quy trình: thanh tiến trình chạy theo cuộn, đánh dấu bước hiện tại.
- Robot trượt vào từ trái theo cuộn (thay cho xe tải).
- Thẻ bài viết: ảnh zoom + nút "Đọc thêm" hiện khi hover.
- FAQ accordion; Footer ảnh parallax + tên thương hiệu cỡ lớn.
- Tôn trọng `prefers-reduced-motion`; responsive tới 390px, không tràn ngang.

## 3. Việc cần làm tiếp

1. Thay ảnh minh hoạ bằng ảnh thật của robot, giá xoay và khu vực tham quan khi có (giữ tên file hoặc sửa `src`).
2. Thay email giả `campustour@example.edu.vn` bằng email nhóm.
3. Gắn link thật cho 5 thẻ "Góc kỹ thuật" (đang là `#`).
4. Kiểm tra lại các chỉ số ở Hero/Intro nếu nhóm đổi ngưỡng demo (hiện ghi là mục tiêu, chưa phải kết quả đã chạy).
5. Khi thiết kế được duyệt: port sang `web/src/features/landing` (React + Tailwind + GSAP), giữ copy trong `landing-content.ts`.

# quest-stream: Meta Quest 3 → miniPC (NUC) → trang tour học sinh

Phát hình trực tiếp từ kính Meta Quest 3 (cắm USB vào miniPC robot) lên web
Smart Campus Tour, không cần VLC, không cần ghi/copy file `.h264` bằng tay.

```
Quest 3 ──USB──▶ adb exec-out screenrecord (H.264, stdout)
                   │  (pipe, không ghi file)
                   ▼
                 FFmpeg: lấy MẮT TRÁI → cắt khung 16:9 ở giữa → 1280x720 @ 30 fps → H.264
                   ▼
                 HLS: public/hls/quest.m3u8 + quest_*.ts (1 s/segment, giữ 4 segment)
                   ▼
                 server.py  http://<IP_NUC>:8080/hls/quest.m3u8   (CORS, no-cache)
                   ▼
                 web: trang học sinh /tour/*  (hls.js, tự kết nối lại)
```

Một tiến trình `server.py` (Python 3, chỉ dùng thư viện chuẩn) làm hai việc:
giám sát ADB + FFmpeg (tự khởi động lại có back-off) và phục vụ HLS qua HTTP.

| Đường dẫn | Nội dung |
|---|---|
| `server.py` | supervisor ADB → FFmpeg + HTTP server |
| `scripts/check-quest.sh` | kiểm tra adb, ffmpeg, python3, kính, cổng |
| `scripts/start-stream.sh` | chạy nền (hoặc `--foreground` cho systemd) |
| `scripts/stop-stream.sh` | dừng, xoá segment cũ |
| `scripts/measure.sh` | đo độ phân giải, fps, bitrate, CPU, RAM, độ trễ |
| `quest-stream.env.example` | mọi tham số (copy thành `quest-stream.env`) |
| `systemd/quest-stream.service` | tự chạy khi NUC khởi động |
| `tests/` | unit test + `fake_adb.py` (kính giả lập để test không cần Quest) |

---

## Hướng dẫn từng bước

### Bước 1. Chuẩn bị kính Quest 3 (làm một lần)

1. Bật **Developer Mode** cho kính: app Meta Horizon trên điện thoại → Menu →
   Devices → chọn Quest 3 → Headset settings → Developer Mode → bật.
   (Tài khoản Meta cần thuộc một "organization" developer, tạo miễn phí tại
   developers.meta.com nếu app yêu cầu.)
2. Khởi động lại kính.

### Bước 2. Cài phần mềm trên miniPC (Ubuntu, làm một lần)

```bash
sudo apt update
sudo apt install -y adb ffmpeg python3 git curl
```

Lấy code dự án về NUC (đã push branch có thư mục `robot/quest-stream/`):

```bash
cd ~
git clone <URL repo smart-campus-tour>      # hoặc: cd ~/smart-campus-tour && git pull
cd ~/smart-campus-tour/robot/quest-stream
chmod +x scripts/*.sh server.py
```

### Bước 3. Cắm kính vào miniPC và cho phép USB debugging

1. Dùng cáp **USB-C có truyền dữ liệu** (cáp sạc thường nhiều khi chỉ có
   dây nguồn). Cắm trực tiếp vào cổng USB của NUC, tránh hub.
2. Đeo kính lên. Sẽ hiện hộp thoại **"Allow USB debugging?"** → tích
   **Always allow from this computer** → **Allow**.
3. Trên NUC kiểm tra:

```bash
adb devices -l
```

Kết quả đúng (trạng thái phải là `device`):

```
List of devices attached
2G0YC5ZG1234   device usb:1-2 product:eureka model:Quest_3 device:eureka transport_id:1
```

| Thấy gì | Làm gì |
|---|---|
| danh sách trống | kiểm tra cáp, bật kính, Developer Mode; thử cổng USB khác |
| `unauthorized` | đeo kính và bấm Allow ở hộp thoại USB debugging |
| `offline` | rút/cắm lại cáp, hoặc `adb kill-server && adb start-server` |
| `no permissions (user in plugdev group…)` | `sudo usermod -aG plugdev $USER`, đăng xuất/đăng nhập lại; hoặc cài `sudo apt install android-sdk-platform-tools-common` |

Thử quay nhanh 3 giây để chắc kính cho phép `screenrecord`:

```bash
adb exec-out screenrecord --output-format=h264 --time-limit 3 - > /tmp/t.h264
ffprobe -v error -show_entries stream=width,height -of csv=p=0 /tmp/t.h264
```

Phải in ra kích thước (ví dụ `3664,1920`). Nếu file rỗng: kính đang ngủ
(màn hình tắt khi không đeo). Đeo kính lên, hoặc bật `QUEST_KEEP_AWAKE=1`
(bước 4).

### Bước 4. Cấu hình (tuỳ chọn)

```bash
cp quest-stream.env.example quest-stream.env
nano quest-stream.env
```

Mặc định đã đúng yêu cầu: mắt trái, 1280x720, 30 fps, H.264 4 Mbit/s, cổng
8080, nghe trên `0.0.0.0`. Các giá trị hay chỉnh:

- `QUEST_CROP_KEEP=0.80`: giữ 80 % chiều rộng một mắt. Giảm (0.7) nếu còn
  thấy viền đen/méo ống kính; tăng (0.9) nếu muốn góc rộng hơn.
- `QUEST_CROP_OFFSET_X / _Y`: dịch khung nếu tâm ảnh bị lệch.
- `QUEST_KEEP_AWAKE=1`: tắt cảm biến tiệm cận để kính không ngủ khi không ai
  đeo (tự bật lại khi dừng stream). Chưa được kiểm chứng trên mọi firmware.
- `QUEST_ENCODER=h264_vaapi` và/hoặc `QUEST_HWDEC=vaapi`: dùng GPU Intel
  của NUC nếu CPU quá tải (cần `sudo apt install intel-media-va-driver-non-free vainfo`,
  và user thuộc nhóm `render`).
- `QUEST_CAPTURE_SIZE=2560x1344`: bắt kính gửi hình nhỏ hơn để NUC giải mã nhẹ hơn.

### Bước 5. Kiểm tra và chạy stream

```bash
scripts/check-quest.sh       # phải in READY
scripts/start-stream.sh
curl http://localhost:8080/status
```

`/status` trả `"state": "live"` là đang phát. Xem log:

```bash
tail -f logs/quest-stream.log
```

Các dòng log quan trọng: `QUEST_CONNECTED`, `STREAM_STARTING`,
`STREAM_STARTED`, `QUEST_NOT_CONNECTED`, `STREAM_STALLED`, `ADB_ERROR`,
`FFMPEG_ERROR`, `STREAM_STOPPED`.

Mở cổng firewall nếu Ubuntu bật `ufw`:

```bash
sudo ufw allow 8080/tcp
```

Lấy IP của NUC: `hostname -I` (ví dụ `10.80.192.207`). Từ một máy khác cùng
mạng, mở `http://10.80.192.207:8080/status` để chắc là truy cập được.

Dừng stream:

```bash
scripts/stop-stream.sh
```

### Bước 6. Đưa hình lên trang tour học sinh

Trên máy chạy web (máy dev), trong thư mục `web/`:

```bash
cd web
cp .env.example .env.local        # nếu chưa có
```

Thêm vào `web/.env.local` (thay IP bằng IP thật của NUC):

```
VITE_QUEST_STREAM_URL=http://10.80.192.207:8080/hls/quest.m3u8
```

Chạy web (biến `VITE_*` chỉ được đọc khi khởi động, nên sau khi sửa phải chạy lại):

```bash
npm install
npm run dev -- --host
```

Mở trang học sinh: `http://localhost:5173/tour/tour-101` → nhập mã đoàn
`LHP2026`, họ tên `Nguyễn Văn An`, lớp `12A1` (dữ liệu mock, tour đang
chạy) → **Vào buổi tham quan** → khung video lớn ở màn hình live hiện hình từ
kính (mắt trái, 16:9). Từ máy khác trong LAN thì thay `localhost` bằng IP
máy chạy web.
Staff cũng thấy cùng hình ở mục "Preview nguồn hình" của trang kiểm tra trước
khi bắt đầu (`/staff/...`, tài khoản mock `staff/staff`).

Khi không đặt `VITE_QUEST_STREAM_URL`, web giữ nguyên nguồn video cũ.

Trạng thái trên khung video:

| Thấy | Nghĩa |
|---|---|
| "Trực tiếp" + hình chạy | đang phát |
| "Đang kết nối" | đang tải playlist / chờ khung hình đầu |
| "Mất tín hiệu" + "Tạm mất hình ảnh…" | kính rút cáp/ngủ, hoặc NUC không chạy stream. Web tự thử lại (2 s, 4 s, 8 s, rồi 10 s một lần); có nút "Thử lại ngay" |

**Lưu ý HTTPS:** trang web deploy trên Vercel là `https://`, trình duyệt sẽ
chặn tải `http://10.80…` (mixed content). Để demo, chạy web bằng `npm run dev`
trong mạng LAN (http), hoặc đưa stream ra sau HTTPS (Caddy/nginx có chứng chỉ,
Cloudflare Tunnel…).

### Bước 7. Tự chạy khi NUC khởi động (tuỳ chọn)

```bash
sed "s#USER#$USER#g" systemd/quest-stream.service | sudo tee /etc/systemd/system/quest-stream.service
# sửa WorkingDirectory/ExecStart nếu repo không nằm ở ~/smart-campus-tour
sudo systemctl daemon-reload
sudo systemctl enable --now quest-stream
journalctl -u quest-stream -f
```

Khi dùng systemd thì dừng bằng `sudo systemctl stop quest-stream` (không dùng
`stop-stream.sh`). Kính chưa cắm lúc khởi động cũng không sao: dịch vụ chờ và
tự phát khi kính xuất hiện.

---

## Xử lý khi hỏng

Hành vi tự động của `server.py`:

| Sự cố | Hành vi |
|---|---|
| Kính chưa cắm / rút cáp | log `QUEST_NOT_CONNECTED`, xoá HLS, playlist trả **503** kèm lý do; dò lại mỗi 2 → 10 s (không tốn CPU) |
| Cắm lại | tự `QUEST_CONNECTED` → `STREAM_STARTED` (≤ 10 s) |
| `screenrecord` hết 180 s (giới hạn Android) | mở phiên mới ngay, FFmpeg **không** khởi động lại, người xem không bị ngắt |
| Kính ngủ / không có khung hình 10 s | `STREAM_STALLED`, khởi động lại pipeline, chờ tăng dần tới 30 s |
| FFmpeg chết | `FFMPEG_ERROR`, khởi động lại sau 2 s, 4 s … tối đa 60 s |
| `adb` không có / treo | `ADB_ERROR`, thử lại mỗi 15 s |
| `screenrecord` lỗi liên tục | sau 5 lần `ADB_ERROR`, nghỉ 10 s rồi thử lại |
| Segment cũ | mỗi lần chạy có tiền tố riêng (`quest_<runId>_*.ts`), thư mục HLS được xoá khi bắt đầu/dừng |
| Trình duyệt F5 / mất mạng | hls.js tải lại playlist; lỗi thì tự kết nối lại có back-off |

Kiểm tra nhanh:

```bash
curl -s http://localhost:8080/status | python3 -m json.tool
tail -50 logs/quest-stream.log
tail -20 logs/ffmpeg.log          # lệnh FFmpeg đầy đủ + lỗi
tail -20 logs/adb.log
```

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| web "Mất tín hiệu", `/status` = `offline` | xem `reason`: chưa cắm, `unauthorized`, `offline` (xem bảng ở bước 3) |
| `/status` = `connecting`, log `STREAM_STALLED` | kính tắt màn hình vì không ai đeo: đeo kính hoặc `QUEST_KEEP_AWAKE=1` |
| web "Mất tín hiệu" nhưng `/status` = `live` | máy xem không tới được NUC: sai IP, firewall (`ufw`), khác mạng, hoặc trang HTTPS gọi HTTP |
| Hình giật, `speed` < 1.0 trong `measure.sh` | CPU NUC không kịp: `QUEST_X264_PRESET=ultrafast`, `QUEST_CAPTURE_SIZE=2560x1344`, hoặc `QUEST_ENCODER=h264_vaapi` |
| Còn viền đen/méo | giảm `QUEST_CROP_KEEP`, chỉnh `QUEST_CROP_OFFSET_X/Y` |
| Thấy mắt phải / hình lệch | `QUEST_EYE=left`; kiểm tra lại ảnh `adb exec-out screencap -p > q.png` |
| `Address already in use` | stream đang chạy (`scripts/stop-stream.sh` hoặc `systemctl stop`) hoặc đổi `QUEST_STREAM_PORT` |

## Test không cần kính

```bash
python3 -m unittest discover -s tests -v
```

Gồm test bộ lọc (mắt trái, 16:9, 1280x720, 30 fps, pixel vuông), phân tích
`adb devices`, header HTTP (CORS, cache, 503 khi offline) và một test
end-to-end: `tests/fake_adb.py` giả lập Quest 3 phát H.264 stereo (mắt trái là
ảnh test, mắt phải màu đỏ, viền đen quanh mỗi mắt), rồi rút/cắm "cáp" để kiểm
tra phục hồi.

Chạy thử cả hệ thống với kính giả:

```bash
echo device > /tmp/fake-adb-state
QUEST_ADB=$PWD/tests/fake_adb.py python3 server.py
# rút cáp giả:  echo none > /tmp/fake-adb-state
# cắm lại:      echo device > /tmp/fake-adb-state
```

## Hiệu năng

Đo bằng `scripts/measure.sh` khi đang phát. Kết quả đã đo (máy test 2 vCPU x86,
**không phải NUC**, nguồn giả 3664x1920 @ 72 fps):

| Chỉ số | Giá trị |
|---|---|
| Độ phân giải | 1280x720, SAR 1:1 (16:9) |
| FPS | 30/1 (150 khung / 5 s) |
| Bitrate | ~4.2 Mbit/s (mục tiêu 4, trần 6) |
| CPU FFmpeg | ~50 % của 1 core (giải mã 3664x1920 + mã hoá 720p) |
| RAM | FFmpeg ~115 MB, server.py ~25 MB |
| Độ trễ ước tính | segment mới nhất chậm ~1.5–2 s + bộ đệm player ~2 s ⇒ **~3–5 s** từ kính tới web |

NUC7PJYH (Pentium Silver J5005, 4 nhân) yếu hơn nhiều: cần đo lại bằng
`scripts/measure.sh`. Nếu `speed` < 1.0 hoặc CPU > 80 %, làm theo mục "Hình
giật" ở trên. Chưa lên 60 fps trước khi NUC giữ ổn định 30 fps.

## Hướng nâng cấp WebRTC (giai đoạn 2, chưa làm)

HLS dễ kiểm chứng nhưng trễ 3–5 s. WebRTC có thể xuống ~0.3–0.8 s:

```
Quest ─USB─▶ adb screenrecord (H.264) ─▶ FFmpeg (mắt trái, 16:9, 720p30, H.264 baseline/CBR, no B-frames)
          ─▶ RTSP/RTP ─▶ MediaMTX (trên NUC) ─▶ WebRTC (WHEP) ─▶ trình duyệt
```

| Giữ nguyên | Thay |
|---|---|
| bước ADB → stdin FFmpeg, vòng lặp 180 s, phát hiện rút cáp/ngủ, back-off, log sự kiện | đầu ra FFmpeg `-f hls` → `-f rtsp rtsp://127.0.0.1:8554/quest` (thêm `-bf 0 -profile:v baseline`, GOP 1 s) |
| bộ lọc mắt trái / crop 16:9 / 1280x720 / 30 fps | HTTP HLS → **MediaMTX** (một binary, có sẵn WebRTC/WHEP, vẫn xuất được HLS để dự phòng) |
| `/status`, script start/stop/check, systemd | `useHlsStream` → hook WHEP (`RTCPeerConnection`, POST SDP tới `http://<NUC>:8889/quest/whep`) |
| `QuestLiveVideo` / `StudentVideoPlayer` (trạng thái, retry) | biến môi trường mới `VITE_QUEST_WEBRTC_URL`; giữ HLS làm fallback khi WebRTC lỗi |

Cần lưu ý: WebRTC ngoài LAN cần STUN/TURN (MediaMTX có `webrtcICEServers2`)
và HTTPS cho trang web. Chỉ chuyển khi HLS đã chạy ổn trên phần cứng thật.

## Giới hạn hiện tại

- Chưa chạy trên Quest 3 + NUC thật (chỉ test bằng kính giả lập). Cần
  kiểm tra: `screenrecord` của Quest trả đúng khung hình stereo, tỉ lệ cắt
  `QUEST_CROP_KEEP` phù hợp, CPU của NUC.
- `screenrecord` là hình "mirror" của kính: có méo ống kính, không phải camera
  thật; chất lượng phụ thuộc firmware Quest.
- Kính tự ngủ khi không ai đeo; `QUEST_KEEP_AWAKE` dùng broadcast không chính
  thức của Meta.
- Không có âm thanh (`-an`).
- Web HTTPS không đọc được stream HTTP (mixed content).
- Chạy trực tiếp trên host NUC (cần USB/adb), không nằm trong image Docker
  ROS của `robot/`.

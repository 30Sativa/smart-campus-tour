# quest-stream: Meta Quest 3 → miniPC (NUC) → MediaMTX → WebRTC → trang tour

Phát hình trực tiếp từ kính Meta Quest 3 (cắm USB vào miniPC robot) lên web
Smart Campus Tour qua **WebRTC**, độ trễ dưới 1 giây, không cần VLC, không ghi
file.

```
Quest 3 ──USB──▶ adb exec-out screenrecord (H.264 stereo, stdout)
                   │  pipe, không ghi file
                   ▼
                 server.py → FFmpeg: MẮT TRÁI → khung 16:9 ở giữa → 1280x720 @ 30 fps
                            → H.264 constrained baseline, không B-frame, keyframe mỗi 1 s
                   │  RTSP (TCP, chỉ trong máy) rtsp://127.0.0.1:8554/quest
                   ▼
                 MediaMTX  ──WebRTC (WHEP)──▶ trình duyệt  http://<IP_NUC>:8889/quest/whep
                           ──HLS (dự phòng)──▶ http://<IP_NUC>:8888/quest
                   ▼
                 web: /tour/* và preview của staff (RTCPeerConnection, tự kết nối lại)
```

Hai dịch vụ chạy trên NUC:

- **`server.py`** (Python 3, thư viện chuẩn): giám sát ADB + FFmpeg, tự khởi
  động lại có back-off khi rút cáp, kính ngủ, FFmpeg chết hoặc MediaMTX khởi
  động lại; có `/status` và `/health` ở cổng 8080.
- **MediaMTX** (một file chạy, không cần cài thêm gì): nhận luồng RTSP rồi
  phát cho trình duyệt qua WebRTC. Không mã hoá lại, nên gần như không tốn CPU.

| Đường dẫn | Nội dung |
|---|---|
| `server.py` | supervisor ADB → FFmpeg → publish RTSP + HTTP `/status` |
| `scripts/install-mediamtx.sh` | tải và cài MediaMTX (hoặc từ file .tar.gz đã tải sẵn) |
| `scripts/install-services.sh` | cài 2 dịch vụ systemd `mediamtx` + `quest-stream`, mở firewall |
| `scripts/check-quest.sh` | kiểm tra adb, ffmpeg, MediaMTX, cổng WebRTC, kính |
| `scripts/start-stream.sh` / `stop-stream.sh` | chạy/dừng `server.py` bằng tay (không qua systemd) |
| `scripts/measure.sh` | đo độ phân giải, fps, bitrate, số người xem, CPU, RAM |
| `quest-stream.env.example` | tham số của `server.py` (copy thành `quest-stream.env`) |
| `mediamtx.env.example` | tham số MediaMTX (copy thành `mediamtx.env`) |
| `systemd/*.service` | mẫu dịch vụ (được `install-services.sh` điền đường dẫn) |
| `tests/` | unit test + `fake_adb.py` (kính giả lập) + MediaMTX giả |

---

## Hướng dẫn từng bước

Mọi lệnh dưới đây gõ **trên NUC (Ubuntu)**, không phải trên máy Windows.

### Bước 1. Chuẩn bị kính Quest 3 (làm một lần)

1. Bật **Developer Mode**: app Meta Horizon trên điện thoại → Menu → Devices
   → chọn Quest 3 → Headset settings → Developer Mode → bật. (Nếu app yêu cầu,
   tạo "organization" developer miễn phí tại developers.meta.com.)
2. Khởi động lại kính.

### Bước 2. Lấy code và cài phần mềm trên NUC (làm một lần)

```bash
sudo apt update
sudo apt install -y adb ffmpeg python3 git curl

cd ~
git clone <URL repo smart-campus-tour>        # lần sau: cd ~/smart-campus-tour && git pull
cd ~/smart-campus-tour/robot/quest-stream     # MỌI LỆNH scripts/... CHẠY TỪ THƯ MỤC NÀY
chmod +x scripts/*.sh server.py
```

> Lỗi `scripts/check-quest.sh: No such file or directory` nghĩa là bạn chưa
> đứng trong thư mục `robot/quest-stream` (gõ `pwd` để xem), hoặc code trên NUC
> chưa có thư mục này (`git pull`, hoặc copy thư mục từ máy Windows sang).

Cài MediaMTX:

```bash
scripts/install-mediamtx.sh
```

NUC không vào được GitHub? Trên máy khác tải file
`mediamtx_vX.Y.Z_linux_amd64.tar.gz` ở
https://github.com/bluenviron/mediamtx/releases, chép sang NUC (USB/scp) rồi:

```bash
scripts/install-mediamtx.sh ~/Downloads/mediamtx_vX.Y.Z_linux_amd64.tar.gz
```

### Bước 3. Cắm kính và cho phép USB debugging

1. Dùng cáp **USB-C có truyền dữ liệu**, cắm thẳng vào NUC (tránh hub).
2. Đeo kính → hộp thoại **"Allow USB debugging?"** → tích **Always allow from
   this computer** → **Allow**.
3. Kiểm tra:

```bash
adb devices -l
```

Đúng là trạng thái `device`:

```
List of devices attached
2G0YC5ZG1234   device usb:1-2 product:eureka model:Quest_3 device:eureka transport_id:1
```

| Thấy gì | Làm gì |
|---|---|
| danh sách trống | kiểm tra cáp, bật kính, Developer Mode; thử cổng USB khác |
| `unauthorized` | đeo kính và bấm Allow |
| `offline` | rút/cắm lại cáp, hoặc `adb kill-server && adb start-server` |
| `no permissions (user in plugdev group…)` | `sudo usermod -aG plugdev $USER`, đăng xuất/đăng nhập lại; hoặc `sudo apt install android-sdk-platform-tools-common` |

Thử quay 3 giây để chắc kính cho `screenrecord`:

```bash
adb exec-out screenrecord --output-format=h264 --time-limit 3 - > /tmp/t.h264
ffprobe -v error -show_entries stream=width,height -of csv=p=0 /tmp/t.h264
```

Phải in ra kích thước (ví dụ `3664,1920`). File rỗng = kính đang ngủ (màn
hình tắt khi không đeo): đeo kính, hoặc đặt `QUEST_KEEP_AWAKE=1` (bước 5).

### Bước 4. Cài dịch vụ và chạy

```bash
scripts/install-services.sh     # tạo mediamtx.env, quest-stream.env, cài + bật 2 dịch vụ, mở ufw
scripts/check-quest.sh          # phải in READY
curl -s localhost:8080/status   # "state": "live" là đang phát
```

`install-services.sh` in ra địa chỉ WebRTC, ví dụ
`http://10.80.192.207:8889/quest/whep`. Kiểm tra nhanh từ **một máy khác trong
LAN**: mở `http://10.80.192.207:8889/quest` trong Chrome → trang của MediaMTX
hiện hình từ kính. Được bước này thì phía NUC đã xong.

Log:

```bash
journalctl -u quest-stream -u mediamtx -f
tail -f logs/quest-stream.log          # sự kiện: QUEST_CONNECTED, STREAM_STARTED, ...
```

Dừng / chạy lại: `sudo systemctl stop quest-stream mediamtx`,
`sudo systemctl restart mediamtx quest-stream`. Gỡ: `scripts/install-services.sh --remove`.

Chạy tay không qua systemd (để thử): `/usr/local/bin/mediamtx /usr/local/etc/mediamtx.yml`
ở một terminal (nhớ `set -a; . ./mediamtx.env; set +a` trước), rồi
`scripts/start-stream.sh` / `scripts/stop-stream.sh`.

### Bước 5. Cấu hình (tuỳ chọn)

`quest-stream.env` (sau khi sửa: `sudo systemctl restart quest-stream`). Mặc
định đã đúng yêu cầu: mắt trái, 1280x720, 30 fps, H.264 4 Mbit/s.

- `QUEST_CROP_KEEP=0.80`: giữ 80 % chiều rộng một mắt. Giảm (0.7) nếu còn viền
  đen/méo ống kính; tăng (0.9) nếu muốn rộng hơn.
- `QUEST_CROP_OFFSET_X / _Y`: dịch khung nếu tâm ảnh bị lệch.
- `QUEST_KEEP_AWAKE=1`: tắt cảm biến tiệm cận để kính không ngủ khi không ai đeo.
- `QUEST_ENCODER=h264_vaapi` và/hoặc `QUEST_HWDEC=vaapi`: dùng GPU Intel nếu CPU
  quá tải (`sudo apt install intel-media-va-driver-non-free vainfo`, user thuộc nhóm `render`).
- `QUEST_CAPTURE_SIZE=2560x1344`: kính gửi hình nhỏ hơn, NUC giải mã nhẹ hơn.
- `QUEST_KEYFRAME_INTERVAL=1`: người xem mới thấy hình sau tối đa 1 s.

`mediamtx.env` (sau khi sửa: `sudo systemctl restart mediamtx`):

- `MTX_WEBRTCADDITIONALHOSTS=<IP_NUC>` (bỏ dấu `#`): chỉ cần khi trình duyệt không kết nối
  được dù trang `:8889/quest` mở được (NUC có nhiều card mạng / Docker).
- Cổng: 8889/tcp (WHEP), **8189/udp (hình)**, 8888/tcp (HLS), 8554 RTSP chỉ nghe
  trên `127.0.0.1` nên máy khác không đẩy video lạ vào được.

### Bước 6. Đưa hình lên trang tour học sinh

Trên máy chạy web (máy Windows), thư mục `web/`, file `web/.env.local`
(thay IP bằng IP thật của NUC):

```
VITE_QUEST_WHEP_URL=http://10.80.192.207:8889/quest/whep
```

(`VITE_QUEST_STREAM_URL=...m3u8` của bản HLS cũ không còn dùng.) Biến `VITE_*`
chỉ đọc lúc khởi động, sửa xong phải chạy lại:

```bash
npm install
npm run dev -- --host
```

Mở `http://localhost:5173/tour/tour-101` → mã đoàn `LHP2026`, họ tên `Nguyễn Văn An`,
lớp `12A1` → **Vào buổi tham quan** → khung video lớn hiện hình từ kính. Staff
thấy cùng hình ở "Preview nguồn hình" (tài khoản mock `staff/staff`). Không đặt
`VITE_QUEST_WHEP_URL` thì web giữ nguồn video cũ.

| Trên khung video | Nghĩa |
|---|---|
| "Trực tiếp" + hình chạy | đang phát |
| "Đang kết nối" | đang bắt tay WebRTC / chờ khung hình đầu, hoặc hình bị đứng > 6 s và đang nối lại |
| "Mất tín hiệu" | MediaMTX chưa có luồng (kính rút cáp/ngủ, `quest-stream` dừng) hoặc không tới được NUC. Web tự thử lại sau 2 s, 4 s, 8 s rồi 10 s một lần; có nút "Thử lại ngay" |
| "Trình duyệt không phát được hình trực tiếp (WebRTC)" | trình duyệt không có WebRTC/H.264: dùng Chrome, Edge, Firefox, Safari bản mới |

**HTTPS:** trang web deploy trên Vercel là `https://`, trình duyệt chặn gọi
`http://10.80…` (mixed content). Demo bằng `npm run dev` trong LAN, hoặc đưa
MediaMTX ra sau HTTPS (MediaMTX tự bật `webrtcEncryption` với chứng chỉ, hoặc
reverse proxy Caddy/nginx cho cổng 8889; UDP 8189 vẫn đi thẳng).

---

## Xử lý khi hỏng

Hành vi tự động:

| Sự cố | Hành vi |
|---|---|
| Kính chưa cắm / rút cáp | `QUEST_NOT_CONNECTED`, dừng FFmpeg (MediaMTX báo "không có luồng", web hiện "Mất tín hiệu"); dò lại mỗi 2 → 10 s |
| Cắm lại | `QUEST_CONNECTED` → `STREAM_STARTED` (≤ 10 s); web tự nối lại |
| `screenrecord` hết 180 s (giới hạn Android) | mở phiên mới ngay, FFmpeg **không** khởi động lại, người xem không bị ngắt |
| Kính ngủ / không có khung hình 10 s | `STREAM_STALLED`, khởi động lại pipeline, chờ tăng dần tới 30 s |
| MediaMTX chưa chạy / đang khởi động lại | `MEDIAMTX_ERROR`, không mở ADB, thử lại mỗi 3 s; FFmpeg đang chạy mà mất kết nối → `FFMPEG_ERROR`, chạy lại sau 2 → 10 s |
| FFmpeg chết | `FFMPEG_ERROR`, chạy lại sau 2 s, 4 s … tối đa 10 s |
| `adb` không có / treo | `ADB_ERROR`, thử lại mỗi 15 s |
| Mạng chập chờn phía người xem | WebRTC tự phục hồi trong 4 s; quá thì web nối lại. Hình đứng > 6 s cũng nối lại |

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `/status` = `error`, `MEDIAMTX_ERROR` | `sudo systemctl status mediamtx`; `journalctl -u mediamtx -n 50` |
| `/status` = `offline` | xem `reason`: chưa cắm, `unauthorized`, `offline` (bảng ở bước 3) |
| `/status` = `connecting`, log `STREAM_STALLED` | kính tắt màn hình: đeo kính hoặc `QUEST_KEEP_AWAKE=1` |
| `/status` = `live`, nhưng `:8889/quest` không có hình (xoay mãi) | **UDP 8189 bị chặn**: `sudo ufw allow 8189/udp`; NUC nhiều card mạng → đặt `MTX_WEBRTCADDITIONALHOSTS` |
| `:8889/quest` có hình, web vẫn "Mất tín hiệu" | sai `VITE_QUEST_WHEP_URL` (phải có `/quest/whep`), quên chạy lại `npm run dev`, hoặc trang HTTPS gọi HTTP. Xem Console (F12) |
| Hình giật, `speed` < 1.0 trong `measure.sh` | CPU NUC không kịp: `QUEST_X264_PRESET=ultrafast`, `QUEST_CAPTURE_SIZE=2560x1344`, hoặc `QUEST_ENCODER=h264_vaapi` |
| Còn viền đen/méo | giảm `QUEST_CROP_KEEP`, chỉnh `QUEST_CROP_OFFSET_X/Y` |

```bash
curl -s localhost:8080/status | python3 -m json.tool
curl -s localhost:9997/v3/paths/get/quest | python3 -m json.tool   # MediaMTX: ready, readers
tail -20 logs/ffmpeg.log          # lệnh FFmpeg đầy đủ + lỗi
tail -20 logs/adb.log
```

## Test không cần kính

```bash
python3 -m unittest discover -s tests -v
```

20 test: bộ lọc (mắt trái, 16:9, 1280x720, 30 fps, pixel vuông), lệnh FFmpeg
(RTSP/TCP, baseline, không B-frame, GOP), phân tích `adb devices`, HTTP
`/status`, và một test end-to-end: `tests/fake_adb.py` giả lập Quest 3 →
`server.py` → một "MediaMTX giả" (FFmpeg nhận RTSP) → `ffprobe` kiểm tra
H.264 Constrained Baseline 1280x720 30 fps không B-frame; rồi tắt MediaMTX,
bật lại, rút/cắm "cáp" và kiểm tra tự phục hồi.

Phía web, `npm test` chạy test của client WHEP (`whep.test.ts`,
`QuestLiveVideo.test.tsx`).

## Hiệu năng

`scripts/measure.sh` khi đang phát. Đã đo trên máy test 2 vCPU x86 (**không
phải NUC**), nguồn giả 2560x1344 @ 72 fps:

| Chỉ số | Giá trị |
|---|---|
| Đầu ra | H.264 Constrained Baseline, 1280x720, SAR 1:1, 30/1 fps, không B-frame |
| Bitrate | ~4.2 Mbit/s (mục tiêu 4, trần 6) |
| CPU FFmpeg | ~50 % một core (giải mã 2560x1344 + mã hoá 720p) |
| RAM | FFmpeg ~95 MB |
| MediaMTX | chỉ chuyển gói, không mã hoá lại (chưa đo trên NUC) |
| Độ trễ kính → web | **ước tính 0.3–0.8 s** (HLS cũ: 3–5 s). Cần đo trên phần cứng thật |

Đo độ trễ thật: mở đồng hồ bấm giờ (có mili giây) trong kính, đặt màn hình máy
xem cạnh kính, chụp ảnh cả hai; hiệu hai số là độ trễ.

NUC7PJYH (Pentium Silver J5005) yếu hơn và phải giải mã 3664x1920 từ kính: đo lại
bằng `scripts/measure.sh`; nếu `speed` < 1.0 hoặc CPU > 80 % thì làm theo mục
"Hình giật".

## Ngoài LAN

Người xem khác mạng với NUC cần STUN (và thường TURN): đặt
`VITE_QUEST_ICE_SERVERS=stun:stun.l.google.com:19302` cho web, và thêm máy
chủ đó vào `webrtcICEServers2` trong `/usr/local/etc/mediamtx.yml`; trang phải
chạy HTTPS. Demo trong trường nên để máy xem và NUC cùng mạng.

## Giới hạn hiện tại

- Chưa chạy trên Quest 3 + NUC thật (đã test bằng kính giả lập + MediaMTX giả;
  client WebRTC đã chạy thử trong Chromium thật với server WHEP giả). Cần kiểm
  tra: `screenrecord` trả khung stereo, `QUEST_CROP_KEEP`, CPU của NUC, độ trễ.
- `screenrecord` là hình "mirror" của kính (có méo ống kính), không phải camera thật.
- Kính tự ngủ khi không ai đeo; `QUEST_KEEP_AWAKE` dùng broadcast không chính thức.
- Không có âm thanh (`-an`).
- Chạy trực tiếp trên host NUC (cần USB/adb), không nằm trong image Docker ROS của `robot/`.

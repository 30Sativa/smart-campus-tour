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
  động lại; có `/status`, `/device` và `/health` ở cổng 8080.
- **MediaMTX** (một file chạy, không cần cài thêm gì): nhận luồng RTSP rồi
  phát cho trình duyệt qua WebRTC. Không mã hoá lại, nên gần như không tốn CPU.

| Đường dẫn | Nội dung |
|---|---|
| `server.py` | supervisor ADB → FFmpeg → publish RTSP + HTTP `/status`, `/device` |
| `scripts/install-mediamtx.sh` | tải và cài MediaMTX (hoặc từ file .tar.gz đã tải sẵn) |
| `scripts/install-services.sh` | cài 2 dịch vụ systemd `mediamtx` + `quest-stream`, mở firewall |
| `scripts/check-quest.sh` | kiểm tra adb, ffmpeg, MediaMTX, cổng WebRTC, kính |
| `scripts/start-stream.sh` / `stop-stream.sh` | chạy/dừng `server.py` bằng tay (không qua systemd) |
| `scripts/measure.sh` | đo độ phân giải, fps, bitrate, số người xem, CPU, RAM |
| `relay/install-relay.sh` | cài relay MediaMTX công khai trên EC2 (mục "Phát ra Internet") |
| `scripts/install-relay-push.sh`, `scripts/relay-push.sh` | NUC đẩy luồng lên relay (dịch vụ `quest-relay-push`) |
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

(`VITE_QUEST_STREAM_URL=...m3u8` của bản HLS cũ không còn dùng.) **Chỉ dùng khi
chạy dev** (`npm run dev`): bản build production không đọc biến này (ADR-0055), trang
deploy lấy địa chỉ relay kèm token từ API. Biến `VITE_*` chỉ đọc lúc khởi động, sửa
xong phải chạy lại:

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


### `/device`: kính cho Staff Dashboard

`GET http://<IP_NUC>:8080/device` trả về **tình trạng kính** (tách riêng với
luồng hình) để khu "Giám sát thiết bị" trên trang Staff hiển thị. Một luồng
riêng chạy mỗi `QUEST_DEVICE_POLL` giây (mặc định 5): `adb devices -l` rồi, nếu
kính sẵn sàng, `adb shell dumpsys battery`. Chỉ đọc, không đụng tới
screenrecord/FFmpeg/MediaMTX.

```json
{
  "connection": "connected",          // connected | unauthorized | offline | not_found | adb_error | unknown
  "reason": "",
  "serial": "2G0YC5ZG123", "model": "Quest 3",
  "battery": { "level": 54, "charging": true, "plugged": "USB", "status": "charging" },
  "batteryError": null,
  "checkedAt": 1791800000.123,        // lần đọc kính gần nhất (epoch s)
  "stream": "live",                   // live | connecting | lost (từ /status)
  "streamState": "live", "streamReason": "STREAM_STARTED",
  "pollSeconds": 5, "now": 1791800001.456
}
```

Phía web: đặt `VITE_QUEST_STATUS_URL=http://<IP_NUC>:8080/device` trong `web/.env.local`.

## Giảm độ trễ: lấy hình bằng scrcpy

Đo trên NUC7PJYH + Quest 3 thật (2026-11-09): `screenrecord` trễ khoảng **5–6 s**
dù FFmpeg giữ được `speed` 1x. Kính gửi cả hai mắt ở tần số màn hình và tự giữ
đệm; NUC phải giải mã từng khung. `QUEST_CAPTURE=scrcpy` đẩy `scrcpy-server`
lên kính và nhận H.264 thô **chỉ của một mắt**, tối đa `QUEST_FPS` khung/giây,
cạnh dài tối đa 1600 px. Phần sau (FFmpeg, MediaMTX, web) không đổi.
Không cần cài scrcpy hay module `v4l2loopback`.

```bash
bash scripts/install-scrcpy-server.sh                  # tải bin/scrcpy-server (một lần)
sed -i '/^QUEST_CAPTURE=/d' quest-stream.env && echo 'QUEST_CAPTURE=scrcpy' >> quest-stream.env
sudo systemctl restart quest-stream
tail -f logs/adb.log logs/quest-stream.log             # thấy SCRCPY_START rồi STREAM_STARTED
```

| Thấy gì | Làm gì |
|---|---|
| `SCRCPY_ERROR ... is missing` | chạy `install-scrcpy-server.sh` |
| `SCRCPY_ERROR scrcpy-server did not start` | xem dòng ngay trên trong `logs/adb.log`; thử bản khác: `install-scrcpy-server.sh v3.3.1` |
| Hình lệch mắt / còn hai mắt | đặt `QUEST_SCRCPY_CROP=W:H:X:Y` (xem `adb shell wm size`, lấy nửa trái `W/2:H:0:0`) |
| Hình bị nghiêng | `QUEST_SCRCPY_ANGLE=<độ>` (xoay theo chiều kim đồng hồ, số âm là ngược lại; xoay ngay trên kính, không tốn CPU NUC). Thử từng 5° |
| Muốn quay lại cách cũ | `QUEST_CAPTURE=screenrecord`, restart |

**Với scrcpy, để trống `QUEST_HWDEC`.** Đo trên NUC7PJYH (10 s hình từ kính, một
mắt 1496x1600): giải mã bằng CPU 162 fps, giải mã VAAPI chỉ 7.7 fps (chậm hơn
thời gian thực, hình dồn lại, trễ tăng dần tới cả phút). Cả chuỗi CPU (giải mã,
cắt, scale, libx264 ultrafast) đạt 43 fps, đủ cho `QUEST_FPS=30`.

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
| `:8889/quest` có hình, web dev vẫn "Mất tín hiệu" | sai `VITE_QUEST_WHEP_URL` (phải có `/quest/whep`), quên chạy lại `npm run dev`, hoặc trang HTTPS gọi HTTP. Xem Console (F12) |
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

## Chỉ bật camera khi cần (ADR-0052)

Mặc định `quest-stream` phát liên tục khi kính được cắm. Đặt `QUEST_CONTROL_URL=auto` trong
`quest-stream.env` để NUC hỏi backend mỗi 5 giây và **chỉ quay khi có người cần hình**:

| Backend trả lời | Khi nào |
|---|---|
| `TOUR_RUNNING` | Có Tour đang `RUNNING` trên robot này (học sinh và người vận hành đang xem) |
| `STAFF_WATCHING` | Trang "Kiểm tra trước khi bắt đầu" của Staff đang mở cho robot này (gia hạn mỗi 30 s, hết hạn sau 2 phút) |
| `IDLE` | Không ai cần: NUC dừng scrcpy/FFmpeg, kính không quay, MediaMTX báo "không có luồng" |

Khi đang tắt, `/status` có `"state": "paused"`, `"reason": "CAMERA_OFF: IDLE"`; bật lại mất khoảng 20–30 s
(trang Staff mở sớm trước giờ Start là đủ). Backend không trả lời quá `QUEST_CONTROL_GRACE` (60 s):
`QUEST_CONTROL_FAILSAFE=on` (mặc định) giữ camera chạy để Tour không mất hình.

NUC dùng chính danh tính robot của Fleet Sync (`~/.config/campustour/fleet-sync.env` do
`robot/scripts/setup_fleet_sync.py` tạo). Chưa có file đó: chạy script này một lần với credential lấy từ trang
Kỹ thuật, hoặc đặt `QUEST_ROBOT_CODE` + `QUEST_ROBOT_CREDENTIAL_FILE`.

```bash
sed -i '/^QUEST_CONTROL_URL=/d' quest-stream.env && echo 'QUEST_CONTROL_URL=auto' >> quest-stream.env
sudo systemctl restart quest-stream
curl -s localhost:8080/status | python3 -m json.tool | grep -A5 '"camera"'   # enabled, wanted, reason
```

Phía người xem (web): nút tạm dừng trên khung hình, và tự ngắt khi tab bị ẩn; mở lại tab là nối lại.

## Phát ra Internet (trang deploy https://www.fptcampustour.cloud)

Trình duyệt ngoài Internet không tới được NUC trong LAN, và trang HTTPS không gọi
được `http://10.x`. NUC đẩy luồng 720p **một lần** lên MediaMTX trên EC2 (đang
chạy backend), EC2 phát WebRTC cho mọi học sinh:

```
NUC: MediaMTX local ──quest-relay-push (ffmpeg -c copy, SRT có mã hoá)──▶ EC2: mediamtx-relay ──hỏi quyền──▶ API
                                                                          │ WebRTC (WHEP, HTTPS :8889)
LAN vẫn xem trực tiếp từ NUC như cũ                                       ▼
                                          https://stream.fptcampustour.cloud:8889/quest/whep?token=…
```

**Ai được xem (ADR-0055).** Relay hỏi backend mỗi lần có kết nối (`authMethod: http`):
NUC được phát bằng user/mật khẩu của nó; trình duyệt chỉ được xem khi có token do backend
cấp (sống 2 phút, trang tự xin lại): học sinh có phiên còn hiệu lực của Tour đang chạy
hoặc đang ở phòng chờ trên đúng robot này, hoặc Staff đang giữ lease camera. Không có
token thì không xem được, kể cả khi biết URL. Dịch vụ `mediamtx-relay-reaper` hỏi lại
backend mỗi 5 giây cho từng người đang xem và cắt người không còn quyền (End Early, phiên
bị thu hồi, Tour kết thúc, lease Staff hết hạn). Backend không trả lời thì không ai mới vào
xem được, người đang xem vẫn xem tiếp.

Không mã hoá lại ở đâu cả nên NUC và EC2 gần như không tốn CPU. Chi phí là băng
thông ra của EC2: mỗi người xem nhận đúng `QUEST_VIDEO_BITRATE`. Ở 2 Mbit/s,
40 học sinh x 1 giờ khoảng 36 GB; AWS miễn phí 100 GB ra Internet mỗi tháng.

**1. DNS + AWS (một lần)**

- Bản ghi `A`: `stream.fptcampustour.cloud` → Elastic IP của EC2.
- Security Group của EC2, inbound: `8889/tcp`, `8189/udp`, `8189/tcp`, `8890/udp`
  (nguồn `0.0.0.0/0`).
- Chứng chỉ cho `stream.fptcampustour.cloud`, cùng cách đang làm cho `api.`
  (Certbot DNS-01, xem `backend/docs/ec2-deployment.md`), ví dụ
  `sudo certbot certonly --dns-<plugin> -d stream.fptcampustour.cloud`.
  Cách khác nếu mở được cổng 80: `sudo certbot certonly --standalone -d stream.fptcampustour.cloud`.

**2. EC2: cài (hoặc cài lại) relay**

```bash
# trên máy có repo: scp robot/quest-stream/relay/install-relay.sh <user>@<EC2>:~
sudo ROBOT_CODE=<mã robot có kính, ví dụ amr_01> bash install-relay.sh stream.fptcampustour.cloud
```

Script tải MediaMTX, tạo mật khẩu và khoá relay (một lần, `/etc/mediamtx-relay/secrets.env`;
bản cài cũ được thêm `RELAY_KEY`, mật khẩu NUC giữ nguyên), chép chứng chỉ, cài dịch vụ
`mediamtx-relay` và `mediamtx-relay-reaper`, hook gia hạn Certbot, rồi in ra:

- năm dòng `QuestRelay__...` cho API;
- dòng `RELAY_SRT_URL=...` cho NUC (không đổi nếu đã cài trước đây).

API mặc định là `https://api.<phần sau dấu chấm đầu của tên miền>`; khác thì đặt `API_URL=...`.
In lại: `sudo bash install-relay.sh stream.fptcampustour.cloud --show`.
Log: `journalctl -u mediamtx-relay -u mediamtx-relay-reaper -f`.

**2b. EC2: cho API biết relay**

Chép năm dòng `QuestRelay__...` vào `/etc/campustour/api.env` rồi khởi động lại API
(như khi đổi cấu hình khác của API, `backend/docs/ec2-deployment.md`). Thiếu các dòng này
thì API không cấp token và relay từ chối mọi người xem: an toàn, nhưng không ai có hình.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -d '{"action":"read","path":"quest","query":""}' \
  "https://api.fptcampustour.cloud/api/internal/stream-relay/auth?key=$(sudo grep -Po '^RELAY_KEY=\K.*' /etc/mediamtx-relay/secrets.env)"
# 403 = API đã nhận khoá và từ chối người xem không có token (đúng). 401 = API chưa có QuestRelay__*.
```

**3. NUC: đẩy lên relay**

```bash
cd ~/smart-campus-tour/robot/quest-stream
nano relay-push.env                      # dán dòng RELAY_SRT_URL=... từ bước 2
bash scripts/install-relay-push.sh       # cài + chạy dịch vụ quest-relay-push
journalctl -u quest-relay-push -f        # không có lỗi là đang đẩy
```

Giảm băng thông (khuyên dùng khi phát ra Internet), trong `quest-stream.env`:
`QUEST_VIDEO_BITRATE=2M`, `QUEST_VIDEO_MAXRATE=2500k`, rồi `sudo systemctl restart quest-stream`.

Kiểm tra trên EC2: `curl -s localhost:9997/v3/paths/get/quest` phải có `"ready": true`
(NUC phát được nghĩa là API đã nhận mật khẩu của NUC). Mở
`https://stream.fptcampustour.cloud:8889/quest` trong Chrome: **không** được thấy hình
(không có token). Hình chỉ hiện trên trang học sinh hoặc trang "Kiểm tra trước khi bắt đầu".

**4. Vercel**

Project web → Settings → Environment Variables: **xoá** `VITE_QUEST_WHEP_URL` (bản build
production không còn đọc biến này), rồi Redeploy. Trang lấy địa chỉ relay và token từ API.

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `quest-relay-push` log `Input/output error` liên tục | sai `RELAY_SRT_URL`, hoặc `8890/udp` chưa mở trong Security Group |
| log `404 Not Found` | stream trên NUC chưa `live` (`curl localhost:8080/status`) |
| Trang `:8889/quest` mở được nhưng xoay mãi | `8189/udp` và `8189/tcp` chưa mở, hoặc sai IP công khai (chạy lại script với `PUBLIC_IP=<Elastic IP>`) |
| Trình duyệt báo lỗi chứng chỉ | chứng chỉ không đúng tên `stream.fptcampustour.cloud` |
| `quest-relay-push` bị từ chối sau khi cài lại relay | API chưa có `QuestRelay__PublishUser`/`QuestRelay__PublishPasswordSha256`, hoặc API đang không chạy (relay hỏi API cả khi NUC phát) |
| Trang học sinh "Mất tín hiệu", log relay `authentication failed` | API trả 401: thiếu hoặc sai `QuestRelay__Key`; hoặc `QuestRelay__RobotCode` không phải robot của Tour |
| Log reaper `recheck ... answered 401` | `reaper.env` và `api.env` khác khoá: chạy lại install-relay.sh rồi chép lại dòng `QuestRelay__Key` |

Chưa đưa qua relay: đàm thoại staff (`quest-mic`, `staff-mic`) và
`VITE_QUEST_STATUS_URL` (`/device`) vẫn chỉ chạy trong LAN.

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

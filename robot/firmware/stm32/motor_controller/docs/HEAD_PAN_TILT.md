# Đầu quay camera PAN/TILT — firmware

Thêm ngày 23/10/2026 theo PCB `robot-pan-tilt-chan-cho-6-9.epro2` (tài liệu
`THAY-DOI-PCB-SO-VOI-BAN-GOC.md`, 19/10/2026). Trạng thái: **code và test host
xong, chưa chạy trên phần cứng.** Mọi thông số cơ khí dưới đây là mặc định
chưa đo.

## Phần cứng

| Trục | STEP | DIR | nEN | Đầu nối |
|---|---|---|---|---|
| PAN | PA8 | PA15 | PB2 | J_PAN 1/2/3, 4 = GND, 5 = +5V |
| TILT | PA9 | PA7 | PB10 | J_TILT 1/2/3, 4 = GND, 5 = +5V |

- Driver DRV8825. STEP/DIR đi thẳng từ STM32 qua R11–R14 220 Ω (mức 3,3 V,
  không qua 74HCT245). nEN tích cực mức thấp, kéo lên 3V3 qua R9/R10.
- +5V trên J_PAN/J_TILT.5 **không phải** VMOT của DRV8825. VMOT cấp riêng.
- Không có công tắc hành trình, không có encoder. Firmware lấy mốc (`HOME`)
  bằng vật cản cơ khí.
- **PAN: vòng có vật cản chiếm 170°–190°** (0° = phía trước, dương = trái).
  Hai cạnh vật cản ở +170° (trái) và −170° (= 190°, phải). HOME quay sang
  **phải** tới cạnh −170°, rồi đếm +170° về 0°.
- **TILT: hành trình 30° lên / 30° xuống**, vật cản cứng ở +30° và −30°.
  HOME cúi **xuống** tới vật cản −30°, rồi đếm +30° về 0° (đổi
  `HEAD_TILT_HOME_DIR` = 1 nếu muốn tìm mốc theo hướng lên).
- Hộp số hành tinh: PAN 3:1, TILT 2:1.
- PB10 trước đây là CONTACTOR_EN. Contactor chuyển sang PA10, lệnh
  `CONTACTOR` giữ nguyên cú pháp.

## Code

| File | Vai trò |
|---|---|
| `Core/Inc/head/head_core.h`, `Core/Src/head/head_core.c` | Logic thuần: profile hình thang, phát xung, mốc ZERO, giới hạn góc. Test host được |
| `Core/Inc/head/head.h`, `Core/Src/head/head.c` | GPIO 6 chân, TIM6 10 kHz, điểm vào ngắt |
| `Core/Src/stm32g4xx_it.c` (USER CODE) | `TIM6_DAC_IRQHandler` |
| `Core/Src/usb_protocol.c` | Lệnh `HEAD`, 4 trường FB mới, dòng lỗi riêng |
| `tests/test_head_core.c` | Test profile (chạy 2 lần: thông số mặc định và thông số tốc độ cao) |

Phát xung: xung STEP cao 1 tick (100 µs), thấp ít nhất 1 tick, nên trần là
5 kHz; `HEAD_MAX_STEP_HZ` = 4000. Đổi chiều chỉ xảy ra khi vận tốc đi qua 0,
và có thêm 1 tick (≥ 100 µs) giữa lúc đổi DIR và cạnh STEP kế tiếp (DRV8825
cần 650 ns).

## Thông số cần chỉnh trước khi chạy thật (`head_core.h`)

| Macro | Mặc định | Ý nghĩa |
|---|---|---|
| `HEAD_MOTOR_STEPS_PER_REV` | 200 | Motor 1,8°/bước |
| `HEAD_MICROSTEP` | 16 | Phải khớp jumper M0–M2 trên đế DRV8825 |
| `HEAD_PAN_GEAR_RATIO`, `HEAD_TILT_GEAR_RATIO` | 3,0 / 2,0 | Hộp số hành tinh 3:1 và 2:1 |
| `HEAD_PAN_HOME_DIR`, `HEAD_TILT_HOME_DIR` | −1 / +1 | Chiều quay tới vật cản: −1 = chiều âm (PAN phải, TILT xuống), +1 = chiều dương |
| `HEAD_PAN_HOME_OFFSET_CDEG`, `HEAD_TILT_HOME_OFFSET_CDEG` | 17000 / 3000 | Cạnh vật cản phía homing cách 0° bao nhiêu (PAN: cạnh 190° = −170°; TILT: −30°) |
| `HEAD_PAN_HOME_SEEK_CDEG`, `HEAD_TILT_HOME_SEEK_CDEG` | 36000 / 7000 | Quãng quay tìm vật cản, phải lớn hơn khoảng cách xa nhất tới cạnh homing. PAN: 340° + dư 20°. TILT: từ +30° tới −30° là 60° + dư 10° |
| `HEAD_HOME_SPEED_DPS` | 20 °/s | Tốc độ khi tìm vật cản |
| `HEAD_PAN_LIMIT_CDEG`, `HEAD_TILT_LIMIT_CDEG` | 16500 / 2500 | Giới hạn mềm tính từ 0°. PAN ±165°, TILT ±25°: cách vật cản 5° vì sai số mốc có thể tới khoảng 3,6° với TILT. Muốn dùng đủ ±30° thì đặt vật cản TILT ở ±35° và đổi OFFSET 3500, LIMIT 3000, SEEK 8000 |
| `HEAD_JOG_SPEED_DPS` | 30 °/s | Tốc độ khi nhấn/giữ nút |
| `HEAD_JOG_TIMEOUT_MS` | 300 | Deadman của JOG |
| `HEAD_MAX_SPEED_DPS` | 60 °/s | Tốc độ trục ra |
| `HEAD_ACCEL_DPS2` | 120 °/s² | Gia tốc trục ra |
| `HEAD_PAN_DIR_INVERT`, `HEAD_TILT_DIR_INVERT` | 0 | Đảo nếu quay ngược quy ước |

Quy ước: PAN dương = quay trái (nhìn từ trên xuống, ngược chiều kim đồng hồ),
TILT dương = ngóc lên. Với mặc định (1/16 vi bước): PAN 26,67 bước/độ, TILT
17,78 bước/độ; tối đa 1600 / 1067 bước/s ở 60°/s.

## Lấy mốc bằng vật cản (HOME)

1. Bật driver. Mỗi trục quay `HOME_SEEK` ở 20°/s về phía vật cản (PAN: 360°
   sang phải; TILT: 70° xuống).
2. Khi chạm vật cản, motor bước trượt bước tại chỗ cho tới hết quãng seek
   (tiếng rung "tè tè" là bình thường, không hại motor nếu dòng DRV8825 chỉnh
   vừa phải).
3. Firmware đặt vị trí = cạnh vật cản (PAN −170°, TILT −30°) rồi chạy về 0°
   ở tốc độ thường (PAN quay trái 170°, TILT ngóc lên 30°).
4. Xong: `head_state=1`, có mốc. TILT xong sau khoảng 4–5 s, PAN sau khoảng
   21 s; `HOME` kết thúc khi cả hai xong. **Không phụ thuộc vị trí xuất
   phát**, vì không có cảm biến nên firmware luôn quay đủ quãng seek.

Đã kiểm bằng mô phỏng vật cản hai cạnh (mỗi bước đẩy vào vật cản bị mất).
PAN xuất phát từ 0°, +90°, −90°, −169° (sát cạnh homing) và +169° (sát cạnh
trái, xa nhất); TILT từ 0°, −15°, +20°, −29° (sát vật cản dưới) và +29°
(ngóc hết, xa nhất): đều về đúng 0° thật.

**Độ lặp lại phụ thuộc phần cứng.** Khi motor bước ép vào vật cản rồi ngừng,
rotor nằm ở một điểm cân bằng trong khoảng 4 bước đủ cách vật cản. Sai số mốc
có thể tới khoảng 2,4° (PAN) / 3,6° (TILT); bước 5 của bài bench sẽ đo con số
thật. Mô phỏng coi vật cản là hoàn hảo nên không thấy sai số này.

Đánh đổi: thời gian ép vào vật cản tối đa khoảng 18 s nếu xuất phát sát cạnh
homing. Rút ngắn bằng cách tăng `HEAD_HOME_SPEED_DPS` (đập vào vật cản mạnh hơn)
hoặc giảm `HOME_SEEK` nếu biết trục không thể ở xa vật cản quá một góc nhất
định. Độ rơ hộp số hành tinh: luôn tiếp cận 0° từ phía vật cản nên mốc lặp lại
được; khi đổi chiều trong lúc chạy, độ rơ vẫn gây sai lệch nhỏ.

## Nút trên giao diện

| Thao tác | Lệnh host gửi |
|---|---|
| Nhấn ◀ / ▶ một lần | `HEAD,<seq>,STEP,1,0` / `HEAD,<seq>,STEP,-1,0` (PAN 0,6°) |
| Nhấn ▲ / ▼ một lần | `HEAD,<seq>,STEP,0,1` / `HEAD,<seq>,STEP,0,-1` (TILT 0,9°) |
| Giữ nút | `HEAD,<seq>,JOG,±1,0` hoặc `JOG,0,±1`, gửi lại mỗi 100 ms |
| Nhả nút | `HEAD,<seq>,JOG,0,0` (mất lệnh này thì deadman 300 ms tự dừng) |
| Về giữa | `HEAD,<seq>,0,0` |

"Một bước" = một bước đủ của motor (1,8°) = 16 vi bước. Đổi bằng số `n`
trong `STEP` nếu muốn mỗi lần nhấn quay nhiều hơn. Phân biệt nhấn và giữ
(ví dụ giữ > 250 ms) là việc của giao diện / host.

## Giao thức

Đầy đủ ở `robot/docs/PROTOCOL_FB.md`. Tóm tắt:

```text
HEAD,<seq>,HOME                 tìm vật cản rồi về 0°
HEAD,<seq>,STEP,<n_pan>,<n_tilt>    nhấn nút: n bước đủ
HEAD,<seq>,JOG,<d_pan>,<d_tilt>     giữ nút: d = -1/0/1, gửi lại mỗi ≤ 300 ms
HEAD,<seq>,ZERO                 mốc 0/0 tại vị trí hiện tại, bật driver (dự phòng)
HEAD,<seq>,<pan_cdeg>,<tilt_cdeg>   tới góc tuyệt đối (centi-độ)
HEAD,<seq>,OFF                  tắt driver, mất mốc
HEAD,<seq>,STOP                 đầu quay giảm tốc rồi đứng (STOP thường chỉ dừng bánh xe)
FB,...,<head_seq>,<pan_cdeg>,<tilt_cdeg>,<head_state>,<contactor>   (trường 19–23)
```

Khi boot: driver tắt (`head_state=0`), lệnh chuyển động bị từ chối cho tới
khi có mốc. Firmware **không tự HOME lúc cấp nguồn** (motor tự quay khi có
người đứng cạnh là không an toàn): host gửi `HEAD,<seq>,HOME` khi bắt đầu dùng
chức năng.

## Giới hạn đã biết

- Vị trí là vòng hở. `head_state=1` nghĩa là đã phát đủ xung, không phải đã
  xác nhận bằng cảm biến. Trượt bước không phát hiện được.
- `OFF` thả trôi motor. Trục TILT có thể đổ xuống theo trọng lực. Chỉ `OFF`
  khi đầu đã được đỡ hoặc cân bằng.
- `STOP` (bánh xe) và timeout lệnh `CMD` 300 ms **không** ảnh hưởng đầu quay:
  bridge gửi `STOP` 20 lần/giây khi robot đứng yên. Dừng đầu quay bằng
  `HEAD,<seq>,STOP`. Timeout
  `CMD` không ảnh hưởng đầu quay. Hành trình bị chặn bởi giới hạn góc nên đầu
  quay luôn tự dừng.
- Điều khiển từ ROS 2: `stm32_bridge` (action `head/set`, topic `head/jog`,
  `head/step`, `head/state`, service `head/stop`, `head/off`, `contactor/set`),
  xem `robot/ros2_ws/src/stm32_bridge/HEAD_CONTROL.md`.

## Bench lần đầu (người vận hành, chưa chạy)

An toàn: tháo camera hoặc để đầu quay tự do không vướng dây. Một người giữ
nguồn VMOT. Bánh xe nhấc khỏi sàn nếu chạy chung `bench_link.py`. Tắt bridge.

1. Trước khi cấp VMOT: chỉnh dòng giới hạn DRV8825 (Vref) theo motor, đặt
   jumper vi bước khớp `HEAD_MICROSTEP`.
2. Build, nạp (`FLASHING.md`), cold boot. Kiểm tra bằng đồng hồ: PB2 và PB10
   ở mức cao (≈ 3,3 V) ngay sau khi cấp nguồn và trong suốt lúc boot (driver
   tắt, trục quay tự do bằng tay).
3. Mở terminal serial (`/dev/ttyACM0`). Đọc FB: 24 trường, bốn trường cuối
   `0,0,0,0` (head OFF, contactor tắt).
4. `HEAD,1,9000,0` → phải nhận `ERR,head_not_zeroed`.
5. Kiểm chiều trước (an toàn hơn): cân đầu bằng tay về 0°, `HEAD,2,ZERO`,
   `HEAD,3,STEP,5,0` → PAN phải quay trái, `HEAD,4,STEP,0,5` → TILT phải
   ngóc lên. Sai thì đổi `HEAD_*_DIR_INVERT` rồi nạp lại. Sau đó lắp vật cản,
   `HEAD,5,OFF`, gửi `HEAD,6,HOME`: hai trục quay về phía vật cản, rung tại
   vật cản, rồi quay về 0°. FB `head_state` 3 rồi 1, kết thúc `...,2,0,0,1,0`.
   Đánh dấu vị trí 0° thật; lặp HOME 5 lần từ các vị trí khác nhau, 0° phải
   trùng dấu. Sai chiều (quay ra xa vật cản) thì đổi `HEAD_*_HOME_DIR`.
6. `HEAD,3,1000,0` (10°). Nhìn chiều quay: PAN phải quay trái. Sai thì đổi
   `HEAD_PAN_DIR_INVERT`. Lặp với TILT `HEAD,4,0,1000` (phải ngóc lên).
7. `HEAD,5,9000,0` rồi `HEAD,6,0,0`. Đánh dấu vị trí ban đầu, kiểm tra về
   đúng mốc sau 10 lần qua lại. Lệch → trượt bước: giảm `HEAD_ACCEL_DPS2` /
   `HEAD_MAX_SPEED_DPS` hoặc tăng dòng.
8. Đo bằng oscilloscope tại J_PAN.1/J_TILT.1 (đầu driver, dây 20–25 cm):
   mức cao ≥ 2,2 V, cạnh sạch, không ringing vượt ngưỡng. Thử lại khi bánh xe
   đang chạy.
9. Nhấn: `HEAD,9,STEP,1,0` quay 0,6°; giữ: gửi `HEAD,<n>,JOG,1,0` mỗi
   100 ms rồi ngừng gửi → đầu quay tự dừng trong khoảng 0,4 s.
10. Đang chạy, gửi `HEAD,7,STOP` → giảm tốc rồi đứng, FB `head_state=1`. Gửi
   `HEAD,8,OFF` → driver nhả, FB `head_state=0`.
11. Chạy `BENCH_STM32_LINK.md` mục 4 trong lúc gửi luân phiên
    `HEAD,<n>,9000,2000` / `HEAD,<n>,-9000,-2000` mỗi 4 s. Tiêu chí giữ
    nguyên: FB ≥ 35 Hz, 0 `ERR,bad_command`, khoảng hở FB < 0,2 s.

Báo cáo theo mẫu READY FOR HARDWARE TEST trong `AGENTS.md`.

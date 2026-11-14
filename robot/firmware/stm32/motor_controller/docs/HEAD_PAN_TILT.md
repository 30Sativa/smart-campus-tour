# Đầu quay camera PAN/TILT — firmware

Thêm ngày 23/10/2026 theo PCB `robot-pan-tilt-chan-cho-6-9.epro2` (tài liệu
`THAY-DOI-PCB-SO-VOI-BAN-GOC.md`, 19/10/2026). Trạng thái: **code và test host
xong, chưa chạy trên phần cứng.** Thông số cơ khí cập nhật 05/11/2026 theo
phần cứng thật (motor, hộp số, vật cản); `HOME_OFFSET` cần hiệu chỉnh trên
bench.

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
- Motor cả hai trục: 17HD4401S (NEMA17 42×42, 1,8°/bước, 0,42 Nm). DRV8825
  **không cắm jumper vi bước = bước đủ**.
- **PAN**: hộp số hành tinh 3:1 → 1 bước = 0,6°. Khối vật cản ở phía sau
  (chống quay quá một vòng làm hỏng dây), cạnh phải cách 0° là 174° về bên
  phải (giả định cạnh trái đối xứng ở 174° bên trái). HOME quay **phải 190°**
  tới vật cản, rồi quay **trái 174°** về 0°.
- **TILT**: gắn trực tiếp vào đầu giả → 1 bước = 1,8°. Hành trình cúi 18° /
  ngửa 18°. Vật cản ở phía **cúi 20°**. HOME cúi xuống tới vật cản, rồi ngửa
  20° về thẳng.
- PB10 trước đây là CONTACTOR_EN. Contactor chuyển sang PA10, lệnh
  `CONTACTOR` giữ nguyên cú pháp.

## Code

| File | Vai trò |
|---|---|
| `Core/Inc/head/head_core.h`, `Core/Src/head/head_core.c` | Logic thuần: profile hình thang, phát xung, mốc ZERO, giới hạn góc. Test host được |
| `Core/Inc/head/head.h`, `Core/Src/head/head.c` | GPIO 6 chân, TIM6 10 kHz, điểm vào ngắt |
| `Core/Src/stm32g4xx_it.c` (USER CODE) | `TIM6_DAC_IRQHandler` |
| `Core/Src/usb_protocol.c` | Lệnh `HEAD`, 4 trường FB mới, dòng lỗi riêng |
| `tests/test_head_core.c` | Test profile và HOME (chạy 3 lần: thông số mặc định, tốc độ cao, vi bước 1/16) |

Phát xung: xung STEP cao 1 tick (100 µs), thấp ít nhất 1 tick, nên trần là
5 kHz; `HEAD_MAX_STEP_HZ` = 4000. Đổi chiều chỉ xảy ra khi vận tốc đi qua 0,
và có thêm 1 tick (≥ 100 µs) giữa lúc đổi DIR và cạnh STEP kế tiếp (DRV8825
cần 650 ns).

## Thông số (`head_core.h`, 14/11/2026)

| Macro | Giá trị | Ý nghĩa |
|---|---|---|
| `HEAD_MOTOR_STEPS_PER_REV` | 200 | Motor 1,8°/bước |
| `HEAD_MICROSTEP` | 4 | Phải khớp chân M0–M2 của cả hai DRV8825. Hiện tại 1/4: M0 thấp, M1 cao, M2 thấp. Không jumper = 1 (bước đủ); M2 cao = 16 |
| `HEAD_PAN_GEAR_RATIO`, `HEAD_TILT_GEAR_RATIO` | 3,0 / 5,0 | PAN hộp số hành tinh 3:1, TILT hộp số hành tinh 5:1 (đủ lực giữ đầu + Quest 3 ~2 kg ở ±18°) |
| `HEAD_PAN_HOME_DIR`, `HEAD_TILT_HOME_DIR` | −1 / −1 | Chiều tới vật cản: PAN quay phải, TILT cúi xuống |
| `HEAD_PAN_HOME_SEEK_CDEG`, `HEAD_TILT_HOME_SEEK_CDEG` | 19000 / 4400 | Quãng quay tìm vật cản. PAN 190°; TILT 44° (từ ngửa cao nhất ~20° tới vật cản cúi 20° là 40°, dư 4°) |
| `HEAD_PAN_HOME_OFFSET_CDEG`, `HEAD_TILT_HOME_OFFSET_CDEG` | 17400 / 2000 | Từ cạnh vật cản về 0°: PAN quay trái 174°, TILT ngửa 20° (55,6 bước đủ, làm tròn tới vi bước 0,09°). **Núm hiệu chỉnh**: HOME xong mà đầu chưa thẳng thì sửa số này |
| `HEAD_HOME_SPEED_DPS` | 20 °/s | Tốc độ khi tìm vật cản (PAN 133 xung/s, TILT 222 xung/s ở vi bước 1/4) |
| `HEAD_HOME_SETTLE_MS` | 200 | Đứng yên tại vật cản cho rotor hết rung trước khi đặt mốc |
| `HEAD_HOME_PHASE_ALIGN` | 1 | Kết thúc seek ở cùng pha điện của driver để mốc 0 lặp lại (xem dưới) |
| `HEAD_PAN_LIMIT_CDEG`, `HEAD_TILT_LIMIT_CDEG` | 17000 / 1800 | Giới hạn mềm: PAN ±170° (cách vật cản 4°), TILT ±18° (50 bước đủ, cách vật cản cúi 2°). Không mở tới 27°: motor cần ~0,39 N·m, 93% lực |
| `HEAD_JOG_SPEED_DPS` | 30 °/s | Tốc độ khi nhấn/giữ nút |
| `HEAD_JOG_TIMEOUT_MS` | 300 | Deadman của JOG |
| `HEAD_MAX_SPEED_DPS` | 60 °/s | Tốc độ trục ra |
| `HEAD_ACCEL_DPS2` | 120 °/s² | Gia tốc trục ra |
| `HEAD_PAN_DIR_INVERT`, `HEAD_TILT_DIR_INVERT` | 0 | Đảo nếu quay ngược quy ước |

Quy ước: PAN dương = quay trái (nhìn từ trên xuống, ngược chiều kim đồng hồ),
TILT dương = ngửa lên. Bước đủ tại trục ra: PAN 0,6°, TILT 0,36°. Ở vi bước
1/4: PAN 6,67 xung/độ (0,15°/xung), TILT 11,1 xung/độ (0,09°/xung); tối đa
400 / 667 xung/s ở 60°/s. Góc lệnh làm tròn tới vi bước gần nhất.

## Lấy mốc bằng vật cản (HOME)

1. Bật driver. PAN quay **phải** 190°, TILT cúi **xuống** 44°, ở 20°/s. Quãng
   seek được kéo dài thêm 0–3 bước để bước cuối rơi vào cùng một pha điện của
   DRV8825 (`HEAD_HOME_PHASE_ALIGN`).
2. Chạm vật cản thì motor trượt bước tại chỗ tới hết quãng (tiếng "tè tè" là
   bình thường). Xuất phát ở 0° thì PAN chỉ trượt khoảng 16°.
3. Đứng yên 200 ms, rồi firmware đặt vị trí = cạnh vật cản và chạy về 0° ở
   tốc độ thường: PAN quay trái 174°, TILT ngửa lên 20°.
4. Xong: `head_state=1`, có mốc. Toàn bộ khoảng 13 s (PAN), TILT xong sớm hơn.

**Giới hạn của seek 190° (PAN):** chỉ chạm được vật cản khi đầu đang nằm
trong khoảng 174° phải tới 16° trái. Lệch trái hơn 16° thì hết quãng mà chưa
chạm vật cản, và mốc 0 sẽ sai. Vì vậy `stm32_bridge` đưa đầu về 0° trước khi
tắt (`head_park_on_shutdown`). Không được xoay tay PAN sang trái quá 16° khi
robot tắt. Muốn HOME được từ mọi vị trí thì đặt `HEAD_PAN_HOME_SEEK_CDEG` =
36000 (trượt bước lâu hơn).

**Tránh mất góc:**
- Không có cảm biến, nên khi ép vào vật cản rồi dừng, rotor nằm ở điểm cân
  bằng của pha điện cuối, cách vật cản dưới 2 bước đủ. Pha cuối mà ngẫu nhiên
  thì mốc 0 lệch ngẫu nhiên tới ±2 bước đủ (PAN ±1,2°, TILT ±0,72°).
  `HEAD_HOME_PHASE_ALIGN` cố định pha cuối, nên mốc 0 **lặp lại đúng một vị
  trí** mỗi lần HOME. Phần lệch còn lại là hằng số: hiệu chỉnh một lần bằng
  `HOME_OFFSET`.
- Điều kiện để lặp lại: DRV8825 và STM32 được cấp nguồn cùng lúc, vì bộ đếm
  bước của cả hai cùng bắt đầu từ 0. Nếu chỉ reset STM32 (nạp code, rút USB)
  mà VMOT vẫn có, lần HOME sau có thể lệch tới ±2 bước. Khi đó tắt/bật nguồn
  cả robot rồi HOME lại.
- Độ rơ hộp số PAN: HOME luôn tiếp cận vật cản từ cùng một phía nên độ rơ nằm
  trong hằng số được hiệu chỉnh. Khi đổi chiều lúc chạy, độ rơ vẫn gây lệch
  nhỏ.
- Ép nhẹ vào vật cản dưới 2 bước đủ (ví dụ TILT ở −18° khi mốc lệch về phía
  vật cản) không làm mất bước: rotor quay lại đúng chỗ khi rời vật cản.
- Độ rơ hộp số TILT 5:1 cũng nằm trong hằng số HOME. Qua hộp số, lực ép vào
  vật cản lớn gấp ~5 lần (~2 N·m), nên seek TILT chỉ dư 4° và chạy chậm.
- Từ 14/11/2026 cả hai trục chạy vi bước 1/4 (êm hơn bước đủ). Còn ồn thì xem
  mục "Giảm tiếng ồn" bên dưới. Tăng vi bước lên 1/16 thì TILT ở 60°/s cần
  2667 xung/s, gần trần `HEAD_MAX_STEP_HZ` 4000 và xung bị lượng tử theo tick
  100 µs (rung hơn), nên phải tăng `HEAD_TICK_HZ` hoặc giảm tốc độ.

Kiểm bằng hai mô phỏng trong `tests/test_head_core.c`. Mô phỏng 1: vật cản
hai cạnh, mỗi bước đẩy vào vật cản bị mất; xuất phát PAN 0°, +12°, −90°,
−173°, +6° và TILT 0°, −15°, +18°, −19°, +19° đều về đúng 0°. Mô phỏng 2: rotor
chỉ nằm ở điểm cân bằng của pha điện, bị vật cản chặn thì trượt pha. Đầu bị
OFF, xoay tay và HOME lại nhiều lần mà bộ đếm của driver không reset. Mốc
luôn trùng một vị trí, lệch khỏi lý tưởng dưới 2 bước, và chạy giữa hai giới
hạn mềm không mất góc. Tắt `HEAD_HOME_PHASE_ALIGN` thì mốc không còn lặp lại.

## Nút trên giao diện

| Thao tác | Lệnh host gửi |
|---|---|
| Nhấn ◀ / ▶ một lần | `HEAD,<seq>,STEP,1,0` / `HEAD,<seq>,STEP,-1,0` (PAN 0,6°) |
| Nhấn ▲ / ▼ một lần | `HEAD,<seq>,STEP,0,1` / `HEAD,<seq>,STEP,0,-1` (TILT 0,36°) |
| Giữ nút | `HEAD,<seq>,JOG,±1,0` hoặc `JOG,0,±1`, gửi lại mỗi 100 ms |
| Nhả nút | `HEAD,<seq>,JOG,0,0` (mất lệnh này thì deadman 300 ms tự dừng) |
| Về giữa | `HEAD,<seq>,0,0` |

"Một bước" = một bước đủ của motor (1,8° tại motor; PAN 0,6°, TILT 0,36° tại trục ra) = `HEAD_MICROSTEP` xung. Đổi bằng số `n`
trong `STEP` nếu muốn mỗi lần nhấn quay nhiều hơn. Phân biệt nhấn và giữ
(ví dụ giữ > 250 ms) là việc của giao diện / host.

## Giảm tiếng ồn

Theo thứ tự hiệu quả trên mỗi đồng bỏ ra:

1. **Chỉnh dòng (Vref) cho đúng.** DRV8825 (Rsense 0,1 Ω): I = 2 × Vref. Đặt
   khoảng 70% dòng định mức ghi trên nhãn motor. Dòng thừa làm motor rung,
   kêu và nóng. TILT có hộp số 5:1 nên thường không cần dòng tối đa.
2. **Thay DRV8825 bằng TMC2208/TMC2209 (StealthChop).** Cắm được vào cùng đế
   STEP/DIR/EN, nội suy lên 256 vi bước nên gần như im lặng ở tốc độ thấp.
   Chú ý: TMC2208 chỉ có MS1/MS2 (MS1 thấp, MS2 cao = 1/4; cả hai thấp = 1/8;
   TMC2209 dùng bảng khác), Vref tính theo công thức của module, và cắm đúng
   chiều theo nhãn. Đổi xong vẫn giữ `HEAD_MICROSTEP` khớp chế độ đã chọn.
3. **Cách ly rung cơ khí.** Đệm cao su NEMA17 giữa motor và khung, không bắt
   motor thẳng vào tấm nhựa/nhôm mỏng (tấm mỏng thành "loa"). Siết vít hộp số,
   tra mỡ hộp số hành tinh.
4. **Tránh dải tốc độ cộng hưởng.** NEMA17 thường cộng hưởng quanh 100–200 bước
   đủ/s. PAN 30°/s = 150 bước đủ/s nằm trong dải này; nếu nghe kêu to ở một
   tốc độ cụ thể thì đổi `HEAD_JOG_SPEED_DPS` (ví dụ 25 hoặc 40) và
   `HEAD_MAX_SPEED_DPS`.
5. **Gia tốc mềm hơn.** Giảm `HEAD_ACCEL_DPS2` (120 → 80) để bớt tiếng "cụp"
   lúc khởi động và dừng.
6. **Nguồn VMOT 12–24 V ổn định, tụ 100 µF sát chân VMOT** của mỗi driver.
   Thiếu tụ thì dòng chopper dao động và kêu rít.

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
khi có mốc. Firmware **không tự HOME**. `stm32_bridge` gửi `HEAD,<seq>,HOME`
ngay khi thấy STM32 vừa khởi động (`head_auto_home`, mặc định bật), nên đầu
quay tự tìm mốc khi bật chức năng điều khiển. Contactor **bật** ngay khi boot
(`CONTACTOR_ON_AT_BOOT`). Đầu quay không phụ thuộc trạng thái contactor.

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
   `0,0,0,1` (head OFF, contactor bật). Tắt bridge khi bench để nó không tự
   HOME.
4. `HEAD,1,9000,0` → phải nhận `ERR,head_not_zeroed`.
5. Kiểm chiều trước (an toàn hơn): cân đầu bằng tay về 0°, `HEAD,2,ZERO`,
   `HEAD,3,STEP,5,0` → PAN phải quay trái, `HEAD,4,STEP,0,5` → TILT phải
   ngửa lên. Sai thì đổi `HEAD_*_DIR_INVERT` rồi nạp lại. Sau đó lắp vật cản,
   `HEAD,5,OFF`, gửi `HEAD,6,HOME`: hai trục quay về phía vật cản, rung tại
   vật cản, rồi quay về 0°. FB `head_state` 3 rồi 1, kết thúc `...,2,0,0,1,0`.
   Đánh dấu vị trí 0° thật; lặp HOME 5 lần từ các vị trí khác nhau (PAN trong
   khoảng 174° phải – 16° trái), 0° phải trùng dấu. Lệch đều một góc so với
   thẳng thì sửa `HEAD_*_HOME_OFFSET_CDEG` (PAN mỗi 0,6°, TILT mỗi 1,8°) rồi
   nạp lại. Sai chiều (quay ra xa vật cản) thì đổi `HEAD_*_HOME_DIR`.
6. `HEAD,3,1000,0` (10°). Nhìn chiều quay: PAN phải quay trái. Sai thì đổi
   `HEAD_PAN_DIR_INVERT`. Lặp với TILT `HEAD,4,0,1000` (phải ngửa lên).
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
    `HEAD,<n>,9000,1800` / `HEAD,<n>,-9000,-1800` mỗi 4 s. Tiêu chí giữ
    nguyên: FB ≥ 35 Hz, 0 `ERR,bad_command`, khoảng hở FB < 0,2 s.

Báo cáo theo mẫu READY FOR HARDWARE TEST trong `AGENTS.md`.

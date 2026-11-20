# ALM của hai driver HBS57H — chỉ giám sát

Thêm 18/11/2026. **Trạng thái:** đã có trong source, đã kiểm bằng unit test và
build ARM; **chưa chạy trên robot thật, chưa thử một lỗi driver thật.**

Firmware đọc ngõ ALM của hai driver bánh xe, lọc nhiễu, đếm số lần lỗi và báo
lên host qua FB (trường 24–27) và lệnh `ALM,<seq>`. `stm32_bridge` ghi log và
đưa lên `/diagnostics`. **Không có gì tự dừng robot, tắt contactor hay sửa
odometry.** Bật xử lý an toàn chủ động là một thay đổi riêng, chỉ làm sau khi
mục 5 đã chứng minh tín hiệu trên phần cứng.

## 1. Mạch

| Driver | STM32 | Header |
|---|---|---|
| Bánh trái (M1) ALM | PC10 | J_MCU_R pad 16 |
| Bánh phải (M2) ALM | PC11 | J_MCU_R pad 17 |

```text
3V3 STM32 -- 10k -- nút ALM+ -- 1k -- PC10 / PC11
ALM- ------------------------------- GND STM32     (mỗi driver một mạch riêng)
```

Đã đo (18/11/2026): ALM− không thông với DIR−, EGND hay GND nguồn driver khi
tắt nguồn. Driver bình thường, đèn xanh: ALM+ − ALM− ≈ 3,3 V, tức opto ALM
**không dẫn** khi bình thường. Suy ra lúc lỗi opto dẫn và kéo nút xuống LOW —
**đây là giả định, chưa thử**. Nếu thử lỗi cho kết quả ngược, đổi cực tính
(mục 6).

Điện áp tại chân với pull nội ~40 kΩ (giá trị điển hình):

| Tình huống | Pull-up nội | Pull-down nội | Firmware hiểu |
|---|---|---|---|
| Opto không dẫn (bình thường) | 3,3 V → 1 | 3,3·40/51 ≈ 2,6 V → 1 | mức 1 |
| Opto dẫn (lỗi, giả định) | ≈ 0,3 V → 0 | ≈ 0,2 V → 0 | mức 0 |
| Chân thả nổi (chưa hàn, đứt dây 1k) | 1 | 0 | **NO_SIGNAL** |

2,6 V vẫn trên ngưỡng V_IH (0,7·V_DD ≈ 2,3 V) nhưng biên chỉ ~0,3 V. Với pull
nội nhỏ nhất (25 kΩ) chân còn ≈ 2,29 V: vẫn trên V_IH đảm bảo theo thiết kế
của chân FT (0,49·V_DD + 0,26 ≈ 1,88 V), nhưng sát mức 0,7·V_DD. Cách kiểm tra
đúng là `PD=1` trong dòng `ALM` (mục 5 bước 2); nếu ra `PD=0` khi driver bình
thường thì xem mục 6 (`PROBE=0`) hoặc giảm 10k xuống 4,7k.

## 2. Cách firmware đọc

- **Lấy mẫu 1 kHz trong `SysTick_Handler`** (ưu tiên 15, thấp nhất). Không
  bao giờ chen ngang TIM2 (STEP bánh xe), TIM6 (đầu quay), EXTI sonar hay
  USB; vẫn chạy khi vòng lặp chính bị chặn (`DIAG`, chờ USB lúc boot).
  Object code của `motor_core`, `head_core`, `sr04t`, `bno08x` và hai ISR
  TIM2/TIM6 giống hệt bản trước. Phía đọc (vòng lặp chính) dùng bộ đếm thế
  hệ, **không tắt ngắt**. Chi phí ước lượng từ disassembly bản build -O2:
  ~200–250 chu kỳ/ms (~1,5 % CPU ở SYSCLK 16 MHz HSI), chưa đo trên MCU.
- **Phát hiện chân thả nổi:** mỗi tick đọc `GPIOC->IDR` rồi đảo pull-up /
  pull-down nội của PC10/PC11. Mạch ngoài 10k/1k mạnh hơn pull nội nhiều nên
  chân đang được lái cho cùng mức ở cả hai lần; chân thả nổi đi theo pull nên
  hai lần khác nhau. Nhờ vậy **chân chưa hàn 10k/1k không bao giờ bị đọc thành
  OK hay ALARM**. Khi 10k đã hàn thì dây tới driver tuột hoặc driver mất nguồn
  vẫn đọc thành OK (mục 4).
- **Lọc:** trạng thái chỉ đổi khi `MOTOR_ALARM_DEBOUNCE_MS` (20) mẫu liên tiếp
  giống nhau. Lệch rồi quay lại trước khi đủ 20 ms được đếm là `GLITCH`.
- **Trạng thái** (mã trong FB): 0 DISABLED, 1 UNKNOWN (vừa boot, ~20 ms),
  2 OK, 3 ALARM, 4 NO_SIGNAL. `trips` = số lần vào ALARM từ lúc boot, kể cả
  ALARM có sẵn lúc boot, để host không bỏ sót một lần lỗi ngắn giữa hai khung.
  Ghi lại tick lúc đổi trạng thái và lúc vào ALARM (đọc bằng `ALM,<seq>`).

Code: `Core/Src/motor/motor_alarm.c` (GPIO, SysTick),
`Core/Src/motor/motor_alarm_core.c` (lọc, không HAL, test trên host bằng
`tests/test_motor_alarm_core.c`). Giao thức: `robot/docs/PROTOCOL_FB.md`.

## 3. Phía ROS 2

`stm32_bridge/motor_alarm.py`, tham số `enable_motor_alarm` (mặc định `true`):

- Log ERROR khi một bánh vào ALARM (kèm cảnh báo odometry bánh đó sai, vì
  driver bỏ qua STEP nhưng firmware vẫn đếm), WARN khi hết ALARM / mất tín
  hiệu, ERROR khi `trips` tăng mà không thấy khung ALARM nào. Chỉ log khi đổi.
- `/diagnostics` 1 Hz, status `<node>: motor_alarm`: ERROR khi có ALARM, WARN
  khi NO_SIGNAL, OK khi bình thường / tắt / firmware cũ, STALE khi mất FB.
  `fleet_bridge` chỉ đọc status `: imu` nên không gửi trạng thái này lên
  backend.
- Khung 28 trường mà trường ALM không đọc được (không phải số, `trips` âm):
  bỏ qua khung đó, giữ trạng thái ALM trước, WARN một lần. Mã trạng thái lạ
  (firmware mới hơn bridge) ra WARN, không bao giờ thành "drivers OK".
- Firmware cũ (FB < 28 trường) được nhận ra và bỏ qua, log một lần. Bridge cũ
  đọc firmware mới bình thường vì chỉ thêm trường ở cuối.
- Bộ đếm `trips` giảm ⇒ log “MCU restarted?”. Reconnect serial không sinh sự
  kiện giả vì trạng thái lấy lại từ khung FB kế tiếp.

## 4. Giới hạn đã biết

- **OK không chứng minh driver có nguồn.** Driver mất nguồn (contactor tắt,
  E-stop, đứt nguồn) thì opto không dẫn, giống hệt lúc bình thường.
- **Đứt dây ALM− hoặc ALM+ phía driver** cũng cho OK (nút chỉ còn 10k kéo
  lên). Chỉ đứt dây 1k phía STM32 mới ra NO_SIGNAL.
- Chưa biết driver có báo ALM thoáng qua lúc vừa cấp nguồn hay không. Nếu
  có, mỗi lần bật contactor `trips` sẽ tăng — mục 5 bước 4 kiểm tra việc này.
- Chưa có xử lý tự động nào. Encoder chưa làm; nó sẽ thêm module riêng cạnh
  `motor_alarm` và thêm trường ở cuối FB, không phải đổi phần này.

## 5. Kiểm tra sau khi hàn

Tắt bridge ROS trước (chỉ một chương trình giữ được cổng serial). Bánh xe kê
khỏi mặt đất. Hai script dưới đây không gửi `CMD`, nên firmware ở TIMEOUT và
không phát xung STEP.

```bash
python3 robot/firmware/stm32/motor_controller/scripts/alm_watch.py --report 2
```

In một dòng mỗi khi trạng thái đổi, và mỗi 2 s một dòng `ALM,...` chi tiết.
`check_fb.py` cũng giải mã trường 24–27.

1. **Trước khi hàn / chưa nối dây 1k:** cả hai `NO_SIGNAL`, dòng `ALM` cho
   `PU=1,PD=0`. Không bao giờ ra ALARM.
2. **Đã hàn, driver có nguồn, đèn xanh:** cả hai `OK`, `PU=1,PD=1`,
   `GLITCH` không tăng. `PD=1` là bằng chứng chân vẫn ở mức cao khi bật
   pull-down nội. Đồng hồ vạn năng ở PC10/PC11 chỉ thấy **trung bình** của
   chân đang đảo pull 500 Hz (~2,9–3,0 V, không phải 3,3 V như lúc đo trước
   khi nạp firmware); muốn thấy mức thấp nhất (~2,6 V) phải dùng oscilloscope.
   Để chạy vài phút,
   cả lúc bánh quay (`CMD` từ bridge), để xem `GLITCH` có tăng vì nhiễu STEP
   hay không.
3. **Giả lập lỗi phía STM32** (không động vào driver): tháo dây ALM+ khỏi
   driver, nối nút ALM+ (đầu 10k/1k) xuống GND STM32 → bánh đó `ALARM`,
   `trips` +1; bỏ ra → `OK`. Chỉ chứng minh mạch và firmware, **không** chứng
   minh cực tính của driver.
4. **Tắt/bật contactor** (`CONTACTOR,<seq>,OFF` rồi `ON`): ghi lại `trips`
   và `GLITCH` có đổi không, và trạng thái lúc driver không có nguồn (dự kiến
   `OK`, xem mục 4).
5. **Lỗi thật của driver**: chỉ khi có cách an toàn mà manual HBS57H xác nhận
   (bánh kê cao, có người giữ E-stop). Xác nhận đèn đỏ của driver và firmware
   cùng báo `ALARM` ở đúng bánh. Đây là bước duy nhất chứng minh cực tính.

Ghi kết quả (ngày, firmware commit, bước nào đạt) vào `robot/docs/` trước khi
bàn tới việc dùng ALM để dừng robot.

### Kết quả đã ghi

- **20/11/2026, robot, firmware ALM đã nạp sẵn** (`ALM` trả `EN=1,ACT=LOW,PROBE=1,DEB=20`;
  hash chưa đối chiếu vì MiniPC không có SWD), nguồn động lực đã cắt, chưa nối
  mạch 10k/1k vào PC10/PC11. **Bước 1 đạt:** cả hai `NO_SIGNAL`, `PU=1,PD=0`,
  `TRIPS=0` suốt ~70 phút uptime. PC10 có 21945 `GLITCH` từ trước phiên (PC11: 0),
  không tăng trong 12 phút theo dõi, không gây đổi trạng thái (`CHG=22`).
  FB 28 trường, 0 khung hỏng/21819; 37 Hz do IMU câm (bag 14/11 trước ALM cũng
  37,2 Hz khi IMU câm). Bridge mới đọc dữ liệu thật qua tap chỉ đọc và đưa
  `motor_alarm` WARN lên `/diagnostics`. Bước 2–5 chưa làm. Chi tiết:
  `~/amr_logs/runs/20261120_1340_alm_hw/REPORT.md` trên MiniPC.

## 6. Cấu hình và rollback

Tất cả là macro lúc build (thêm `-D...` vào CFLAGS hoặc symbol của CubeIDE);
giá trị mặc định nằm trong `Core/Inc/motor/motor_alarm_core.h`.

| Macro | Mặc định | Ý nghĩa |
|---|---|---|
| `MOTOR_ALARM_ENABLE` | 1 | 0 = không đụng PC10/PC11 (giữ analog sau reset), FB báo DISABLED |
| `MOTOR_ALARM_ACTIVE_LEVEL` | 0 | Mức coi là lỗi. 1 nếu thử thật cho thấy lỗi là HIGH |
| `MOTOR_ALARM_DEBOUNCE_MS` | 20 | Thời gian lọc |
| `MOTOR_ALARM_FLOAT_PROBE` | 1 | 0 = pull-up nội cố định, không đảo pull. Chân chưa đấu thành OK (không báo giả ALARM với cực tính mặc định) nhưng mất khả năng phát hiện đứt dây |

Phía ROS: `enable_motor_alarm:=false` bỏ hẳn phần đọc ALM của bridge.
Rollback hoàn toàn: bỏ `MotorAlarm_Init()` trong `app.c` và `MotorAlarm_Tick()`
trong `stm32g4xx_it.c`, hoặc revert commit. Bridge vẫn đọc firmware cũ.

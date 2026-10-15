# Ngân sách CPU của ngắt STEP (TIM2) và liên kết USB

## Triệu chứng (bag 2026-10-13, START → POI_01 → START)

- Khung `FB` về host: **40 Hz khi đứng yên**, nhưng tụt xuống 11.5 Hz khi
  tổng tốc độ hai bánh < 150 mm/s và **3.5 Hz ở khoảng 250 mm/s**, kể cả trong
  những khoảng không có lỗi nào.
- Khoảng 55 `ERR,bad_command` và 25 lần bridge vào safe stop mỗi lượt. Gần như
  tất cả rơi vào lúc chạy nhanh. Đây là **hệ quả**, không phải nguyên nhân.
- EKF chỉ còn 6–7 Hz (nó chỉ publish khi có đo đạc mới), IMU còn 4–5 Hz (yaw
  đi kèm khung `FB`), TF trễ quá `transform_tolerance` của controller.

## Nguyên nhân đã xác minh

TIM2 ngắt ở `MOTOR_BASE_TIMER_HZ` = 50 kHz, mà lõi chạy **16 MHz** (xem
`IMU_BNO085.md`): mỗi tick chỉ có khoảng 320 chu kỳ cho toàn bộ hệ thống.
Firmware được nạp từ cấu hình **Debug** của CubeIDE (`-O0`): tick đi qua 3
tầng gọi hàm, mỗi biến đều đọc/ghi qua stack.

Chạy chính ngắt đã link trong trình giả lập (`scripts/isr_emulate.py`):

| Trạng thái | Trước: lệnh/tick | Trước: CPU | Sau: lệnh/tick | Sau: CPU |
|---|---|---|---|---|
| Motor dừng | 73 | 49–55 % | 33 | 24–31 % |
| 2 kHz mỗi bánh (≈76 mm/s) | 114 | 70–80 % | 55 | 34–45 % |
| 6.5 / 4.1 kHz (≈250 mm/s) | 122 | 74–84 % | 57 | 36–46 % |
| 12 kHz mỗi bánh (trần) | 138 | 81–93 % | 62 | 38–49 % |

(Chu kỳ ước lượng theo bảng timing Cortex-M4, đã cộng 24 chu kỳ vào/ra ngắt.)

Khi đang chạy, vòng lặp chính (USB RX, `FB`, đọc BNO085 bit-bang) chỉ còn
14–30 % CPU. Nó rút hàng đợi RX chậm hơn host gửi (20 Hz), nên hàng đợi 8 dòng
tràn → `ERR,bad_command`. Thêm vào đó, khi có lỗi đang chờ gửi,
`Protocol_Update` **bỏ luôn việc gửi FB** cho tới khi gửi được `ERR`.

## Đã sửa

1. **`motor_core.c` luôn build `-O2`** (`#pragma GCC optimize`), bất kể cấu
   hình Debug/Release. Tick được inline, chân STEP ghi trực tiếp vào BSRR qua
   macro `MOTOR_HAL_STEP_HIGH/LOW`, `Motor_HandleTimerInterrupt` chỉ còn một
   lệnh nhảy. Ngữ nghĩa không đổi: trạng thái dùng chung đều `volatile` và được
   đổi trong `__disable_irq`. Chuỗi xung STEP được kiểm chứng **giống hệt từng
   lần ghi BSRR** so với bản cũ, ở mọi kịch bản kể cả dừng giữa xung.
2. **Xóa cờ TIM2 bằng cách ghi thẳng** `SR = ~UIF` (thanh ghi rc_w0) thay cho
   đọc-sửa-ghi.
3. **Lỗi đang chờ gửi không chặn FB nữa.** `ERR` chỉ chiếm lượt USB ở vòng nó
   thật sự được gửi.
4. **Watchdog dự phòng trong ngắt** (`MOTOR_ISR_WATCHDOG_MS` = 500 ms, mỗi `CMD`
   hợp lệ nạp lại). Watchdog lệnh 300 ms vẫn nằm ở vòng lặp chính như cũ. Nếu
   vòng lặp chính kẹt, trước đây ngắt cứ phát xung theo lệnh cuối mãi mãi; giờ
   ngắt tự dừng sau 500 ms. Lúc khởi động watchdog ở trạng thái hết hạn: chưa
   có `CMD` thì không phát xung.

Chưa làm (rủi ro hơn): đưa SYSCLK lên PLL (phải sửa trong `.ioc`, kéo theo
độ trễ flash và timing), hạ tần số TIM2 (xung STEP rung pha nhiều hơn).

## Các đường dừng và thời gian dừng mong đợi

Watchdog 300 ms (vòng lặp chính) và 500 ms (ngắt) đo từ **lệnh `CMD` cuối cùng
mà firmware đã xử lý**, không phải từ lúc host ngừng gửi. Bridge gửi 20 Hz,
nên lệnh cuối có thể đã đi trước lúc host chết tới 50 ms. Mỗi vòng lặp chính
(khoảng 25 ms) cũng cộng thêm độ trễ phát hiện. Motor luôn dừng tức thì, không
có dốc giảm tốc (giữ nguyên hành vi cũ).

| Tình huống | Đường dừng | Thời gian dự kiến tính từ sự cố |
|---|---|---|
| Ctrl+C bridge, E-stop, `STOP` | `STOP` được xử lý | ≤ 1 vòng lặp (khoảng 30 ms) |
| `kill -9` bridge, rút cáp USB, host treo | Timeout vòng lặp chính 300 ms | **0.25–0.40 s** |
| Nav2/teleop ngừng gửi `/cmd_vel`, bridge còn sống | Bridge `cmd_timeout` 0.5 s gửi `STOP` | khoảng 0.50–0.55 s |
| Vòng lặp chính firmware kẹt | Watchdog trong ngắt 500 ms | **0.45–0.55 s** |
| Bridge mất FB > 1 s | Safe stop của bridge gửi `STOP` | khoảng 1 s |

Watchdog trong ngắt chỉ là lưới an toàn cuối: khi vòng lặp chính còn chạy, nó
không bao giờ kích hoạt trước timeout 300 ms. Nếu vòng lặp chính chậm hơn
500 ms giữa hai `CMD` (chưa từng thấy sau bản sửa), ngắt sẽ dừng motor và lệnh
`CMD` kế tiếp cho chạy lại: robot giật, nhưng theo hướng an toàn.

## Kiểm chứng lại offline

- `scripts/verify.sh` chạy thêm `test_motor_core` (watchdog: chưa nạp thì không
  phát xung; dừng ở đúng tick 25001 sau khi nạp 500 ms; xung đang cao vẫn được
  hạ; chạy lại sau khi hết hạn; nạp mỗi 20 ms thì không dừng; giới hạn tràn
  32-bit; xóa cờ rc_w0) và `test_usb_protocol` (`CMD` nạp watchdog **trước** khi
  đặt tốc độ; `STOP`/`TARE`/`CONTACTOR` không nạp; timeout ở vòng lặp đầu tiên sau
  300 ms; `ERR` đang chờ không chặn FB). Chạy `test_usb_protocol` với
  `usb_protocol.c` cũ thì fail đúng 2 điểm đã sửa.
- So sánh mã máy của ngắt giữa hai bản build:

  ```bash
  python3 scripts/isr_emulate.py <elf_cu> <elf_moi>
  ```

  Cần `pip install unicorn capstone pyelftools`; script không nằm trong
  `verify.sh`.

## Xác nhận bản build CubeIDE Debug đã có thay đổi

Cấu hình Debug build toàn bộ `Core/` ở `-O0`. Không có file `.c` mới, nên
không phải sửa `.cproject`. Sau Clean + Build, trong thư mục `Debug/`:

```bash
arm-none-eabi-objdump -d motor_controller.elf | grep -A2 "<Motor_HandleTimerInterrupt>:"
arm-none-eabi-nm motor_controller.elf | grep watchdog_ticks_left
```

**Đạt:** `Motor_HandleTimerInterrupt` chỉ có một lệnh `b.w <MotorCore_HandleTimerInterrupt>`,
và symbol `watchdog_ticks_left` tồn tại. Nếu hàm vẫn mở đầu bằng
`push {r7, lr}`, nghĩa là đang build từ source cũ.

## Bench (người làm, bánh nhấc khỏi sàn)

1. CubeIDE: Clean + Build cấu hình **Debug**, chạy phép kiểm ở mục trên, rồi
   nạp qua ST-Link (`FLASHING.md`).
2. Kê robot lên giá cho bánh quay tự do, E-stop trong tầm tay. Chỉ chạy
   `manual_mode.launch.py`, không chạy Nav2. Ghi bag `/robot_01/wheel/odom`,
   `/robot_01/imu/data`, `/robot_01/cmd_vel`, `/rosout`.
3. Cho chạy thẳng lần lượt ở 0, 50, 100, 150, 200, 250 mm/s, mỗi mức khoảng
   20 s, bằng `cmd_vel_manual`. **Đạt:**
   - `wheel/odom` ≥ 35 Hz ở **mọi** mức (trước: 40 → 11.5 → 3.5 Hz).
   - 0 `ERR,bad_command`, 0 `No STM32 feedback`, 0 safe stop.
   - `imu/data` khoảng 20 Hz khi bánh đang quay.
4. Dừng an toàn, mỗi bài 3 lần ở 100 mm/s. Đo từ log `/rosout`/bag (hoặc
   quay video 60 fps) đến lúc bánh đứng yên:
   - Ctrl+C bridge: **≤ 0.1 s**.
   - `kill -9` bridge **hoặc** rút cáp USB STM32: **0.25–0.40 s**; trên 0.45 s
     là không đạt.
   - Ngừng phát `cmd_vel_manual` khi bridge còn chạy: khoảng 0.5 s (theo
     `cmd_timeout`/`nav_timeout`), FB báo `STOP`.

   Watchdog trong ngắt chỉ kích hoạt khi vòng lặp chính kẹt, không ép được từ
   bên ngoài; đã kiểm bằng test host và mô phỏng.
5. Đạt cả các bước trên mới chạy lại bài A → B có người giám sát.

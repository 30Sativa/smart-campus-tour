# Bench test: liên kết USB STM32 sau bản sửa ngắt STEP

Kiểm chứng `MOTOR_ISR_BUDGET.md` trên phần cứng. **Bánh phải nhấc khỏi sàn
suốt bài.** Thời gian dừng ghi trong tài liệu là **giá trị dự kiến** từ thiết kế
và test host/mô phỏng, chưa đo trên MCU thật; kết quả đo ở đây mới là căn cứ.

## 0. An toàn

- Kê khung robot lên giá, hai bánh chủ động quay tự do, không chạm vật gì.
- Một người giữ công tắc nguồn motor / E-stop suốt bài. Không ai đứng cạnh bánh.
- Tắt mọi launch ROS (`stm32_bridge_node` không được giữ cổng). Script
  `scripts/bench_link.py` tự từ chối chạy nếu bridge còn chạy, nếu thiếu cờ
  `--wheels-lifted`, hoặc nếu tốc độ yêu cầu vượt 250 mm/s. Khi thoát, kể cả
  Ctrl+C, script luôn gửi `STOP`.

## 1. Sao lưu firmware đang chạy (để rollback)

Firmware đang nạp hiện tại build từ `main` @ `5630d52` (có GRV). Chọn một
trong hai cách:

- **STM32CubeProgrammer** → Connect ST-LINK → Read, đọc toàn bộ flash từ
  `0x08000000`, độ dài 128 KB → Save as `backup_5630d52.bin`. Cách này lấy
  đúng bản đang chạy.
- Hoặc checkout `5630d52`, Clean + Build Debug, giữ lại
  `Debug/motor_controller.elf` dưới tên `motor_controller_5630d52.elf`.

## 2. Baseline với firmware cũ (cùng giá kê, cùng cáp)

```bash
cd robot/firmware/stm32/motor_controller
python3 scripts/bench_link.py --wheels-lifted | tee ~/bench_before.txt
```

Bản cũ dự kiến sẽ có dòng FAIL: FB tụt khi bánh quay, có thể có `ERR`. Cần
baseline này để so trước/sau trên đúng cùng phần cứng.

## 3. Build bản mới và kiểm tra trước khi nạp

1. Checkout branch `feature/claude/stm32-link`. CubeIDE: **Clean**, rồi Build
   cấu hình **Debug**.
2. Kiểm tra ELF thật sự có thay đổi:

   ```bash
   arm-none-eabi-objdump -d Debug/motor_controller.elf | grep -A2 "<Motor_HandleTimerInterrupt>:"
   arm-none-eabi-nm Debug/motor_controller.elf | grep watchdog_ticks_left
   ```

   **Đạt:** `Motor_HandleTimerInterrupt` chỉ có một lệnh `b.w`, và có symbol
   `watchdog_ticks_left`.
3. Tùy chọn: `python3 scripts/isr_emulate.py motor_controller_5630d52.elf Debug/motor_controller.elf`
   phải in `RESULT PASS`.
4. Nạp qua ST-Link (`FLASHING.md`), rồi **tắt hẳn nguồn và bật lại** (cold boot).

## 4. Bench bản mới

```bash
python3 scripts/bench_link.py --wheels-lifted | tee ~/bench_after.txt
```

Script chạy 0 / 50 / 100 / 150 / 200 / 250 mm/s, mỗi mức 15 s, gửi `CMD` 20 Hz
như bridge. Sau đó đo dừng 3 lần cho mỗi đường: lệnh `STOP` và "host im lặng".

| Chỉ số | Tiêu chí đạt | Bản cũ (bag 2026-10-13) |
|---|---|---|
| Tần số FB, mọi mức tốc độ | ≥ 35 Hz | 40 → 11.5 → 3.5 Hz |
| Khoảng hở FB lớn nhất | < 0.2 s | tới 2.3 s |
| `ERR,bad_command` | 0 | khoảng 55 mỗi lượt |
| Bước thực / bước lệnh | 0.98–1.02 | — |
| `yaw_valid` (GRV) | khoảng 100 % | — |
| Dừng sau `STOP` | ≤ 0.10 s | — |
| Dừng khi host im lặng | ≤ 0.45 s, FB báo `TIMEOUT` (dự kiến khoảng 0.30–0.35 s) | — |

Thời gian dừng được đo **từ lúc ghi `STOP` / `CMD` cuối** tới khung FB đầu tiên
có bộ đếm bước đứng yên. Script in ra *khoảng* thời điểm dừng, vì độ phân giải
chỉ bằng một chu kỳ FB (khoảng 25 ms). Bộ đếm là số xung STEP đã phát ra, nên
đây là thời điểm ngừng phát xung. Driver HBS57H bám xung, nhưng nên nhìn bánh
để xác nhận chúng thật sự dừng.

**`CHECK`/`FAIL`** nghĩa là chưa đạt. Lưu `bench_after.txt` và dừng ở đây:
không chạy tiếp các bước sau.

## 5. Kiểm tra qua ROS (bánh vẫn nhấc)

1. `manual_mode.launch.py`, teleop `cmd_vel_manual` ở 100 và 250 mm/s:
   - `ros2 topic hz /robot_01/wheel/odom` ≥ 35 Hz khi bánh quay.
   - `/rosout` không có `bad_command` / `No STM32 feedback` / safe stop.
2. Dừng an toàn, mỗi bài 3 lần, nhìn bánh hoặc quay video 60 fps:
   - Ctrl+C launch: bánh dừng gần như ngay (bridge gửi `STOP` khi tắt).
   - `kill -9` tiến trình `stm32_bridge_node`: dự kiến 0.25–0.45 s (timeout
     300 ms của firmware cộng tối đa 50 ms nhịp gửi lệnh).
   - Rút cáp USB STM32 khi bánh quay: như `kill -9`.
3. Watchdog 500 ms trong ngắt chỉ kích hoạt khi vòng lặp chính của firmware
   kẹt. Từ bên ngoài không ép được tình huống đó; đã kiểm bằng test host
   (`test_motor_core`) và mô phỏng (`isr_emulate.py`).

## 6. Rollback

Phía host không đổi gì, nên chỉ cần nạp lại firmware cũ:

- STM32CubeProgrammer → Download `backup_5630d52.bin` tại `0x08000000`; hoặc
- CubeIDE nạp `motor_controller_5630d52.elf`; hoặc checkout `5630d52`, Build
  Debug, rồi nạp.

Sau rollback chạy lại `bench_link.py` để xác nhận đã về đúng baseline.

## 7. Sau khi bench đạt

Chạy lại bài START → POI_01 → START trên sàn, có người giám sát, ghi bag như
`robot/docs/logging.md`. So số `ERR`, safe stop, tần số `/odom` (EKF) và độ
lệch ngang với `analysis_AB.md`.

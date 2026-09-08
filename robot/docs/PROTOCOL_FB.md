# Contract USB CDC: STM32 ↔ ROS 2

**Đây là nguồn sự thật duy nhất cho giao thức này.** Firmware
(`firmware/stm32/motor_controller/Core/Src/usb_protocol.c`) và bridge
(`ros2_ws/src/stm32_bridge/stm32_bridge/stm32_bridge_node.py`) đều trỏ về file
này. Sửa giao thức thì sửa ở đây trước, rồi mới sửa hai đầu.

Trước đây mỗi bên tự mô tả khung `FB` trong comment của mình. Hai bản mô tả
trôi khỏi nhau, firmware thêm một trường ở cuối và bridge — vốn khớp **đúng**
số trường — trả `None` cho mọi dòng, làm chết toàn bộ odometry. Đó là lý do
file này tồn tại.

## Quy tắc tiến hoá

1. **Chỉ được thêm trường ở CUỐI.** Không chèn giữa, không đổi thứ tự.
2. **Bên đọc phải khoan dung độ dài**: đọc theo vị trí với số trường *tối
   thiểu*, bỏ qua trường lạ ở cuối. Không bao giờ `if len(parts) == N`.
3. Thêm trường mới thì cập nhật file này + test ở **cả hai** đầu trong cùng
   một lần thay đổi.

## Host → STM32

| Lệnh | Ý nghĩa |
|---|---|
| `CMD,<seq>,<left_mm_s>,<right_mm_s>` | Tốc độ bánh. Phải gửi đều, im quá 300 ms là watchdog cắt động cơ |
| `STOP,<seq>` | Dừng ngay |
| `TARE,<seq>` | Đặt hướng hiện tại = 0° |
| `TARE,<seq>,<deg>` | Đặt hướng hiện tại = `<deg>` |
| `TARE,<seq>,RAW` | Bỏ offset tare |
| `DIAG,<seq>` | Chẩn đoán IMU. **Blocking ~2.5 s và dừng động cơ** — chỉ dùng khi debug |

Kết thúc dòng bằng `\n`. Sai cú pháp → `ERR,bad_command`.

## STM32 → Host: khung `FB`

50 Hz.

```
FB,<seq>,<left_count>,<right_count>,<dt_ms>,<status>,
   <yaw_cdeg>,<yaw_valid>,
   <s1_mm>,<s1_valid>,<s2_mm>,<s2_valid>,<s3_mm>,<s3_valid>,<s4_mm>,<s4_valid>,
   <yaw_acc>
```

| Vị trí | Trường | Ghi chú |
|---|---|---|
| 1 | `seq` | Echo seq của lệnh cuối nhận được |
| 2, 3 | `left_count`, `right_count` | Số bước tích luỹ, int32 có dấu, tự tràn |
| 4 | `dt_ms` | Khoảng cách tới khung trước |
| 5 | `status` | `OK` / `STOP` / `TIMEOUT` / `ERR` |
| 6 | `yaw_cdeg` | Yaw × 100, đơn vị centi-độ. Dương = quay trái (REP-103) |
| 7 | `yaw_valid` | 1 = mẫu IMU còn mới (dưới 200 ms) |
| 8–15 | 4 cặp sonar | `<mm>,<valid>` cho SONAR1–4 |
| 16 | `yaw_acc` | 0–3. **0 = từ kế chưa hiệu chuẩn, heading có thể sai hàng chục độ** |

`yaw_valid` nói *có dữ liệu mới*, `yaw_acc` nói *dữ liệu đáng tin tới đâu*.
Hai thứ khác nhau. Bridge chỉ dùng IMU làm heading khi `yaw_acc >= 2`
(tham số `imu_min_accuracy`), thấp hơn thì rơi về encoder.

### Các độ dài đã từng tồn tại

Bridge vẫn đọc được hết, để firmware cũ không làm chết node:

| Số trường | Nội dung |
|---|---|
| 5 | `FB,left,right,dt,status` — không có seq |
| 6 | thêm `seq` |
| 8 | thêm `yaw_cdeg`, `yaw_valid` |
| 12 | thêm 2 sonar |
| 16 | thêm sonar 3–4 |
| **17** | thêm `yaw_acc` ← hiện tại |
| 18+ | trường lạ ở cuối được bỏ qua |

## Khung `DIAG`

Chỉ để con người đọc khi debug, không phải giao diện máy — đừng parse trong
node. Chi tiết ý nghĩa từng trường:
`firmware/stm32/motor_controller/docs/IMU_BNO085.md`.

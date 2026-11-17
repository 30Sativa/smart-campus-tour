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
| `HEAD,<seq>,HOME` | Đầu quay: bật driver, mỗi trục quay chậm (20°/s) về phía **vật cản cơ khí**, đứng yên 200 ms, coi như đang ở cạnh vật cản, rồi chạy về 0°. PAN: quay **phải** 190° tới cạnh vật cản ở 174° phải, rồi quay trái 174° về 0° (chỉ đúng khi đầu đang trong khoảng 174° phải – 16° trái). TILT: cúi **xuống** 44° tới vật cản ở cúi 20°, rồi ngửa 20° về thẳng. Giới hạn mềm PAN ±170°, TILT ±18°. `stm32_bridge` tự gửi lệnh này khi STM32 vừa khởi động. Mất khoảng 13 s. Bị từ chối khi đang chạy |
| `HEAD,<seq>,STOP` | Đầu quay giảm tốc về 0 rồi đứng, giữ driver bật và giữ mốc. Nếu đang HOME thì hủy HOME và mất mốc (`head_state=4`) |
| `HEAD,<seq>,ZERO` | Lấy vị trí hiện tại làm mốc 0/0 (người vận hành tự cân đầu về FRONT), bật driver. Cách dự phòng khi không HOME được. Bị từ chối khi đang chạy/HOME |
| `HEAD,<seq>,STEP,<n_pan>,<n_tilt>` | **Nhấn nút một lần**: quay tương đối `n` bước đủ của motor (số nguyên có dấu). Tại trục ra: 1 bước PAN = 0,6° (hộp số 3:1), 1 bước TILT = 0,36° (hộp số 5:1). Firmware nhân với `HEAD_MICROSTEP` (hiện 4) nên số bước trên dây không đổi khi đổi vi bước. Cộng dồn vào đích hiện tại, dừng ở giới hạn mềm thay vì báo lỗi |
| `HEAD,<seq>,JOG,<d_pan>,<d_tilt>` | **Giữ nút**: `d` ∈ {-1, 0, 1}. Trục có `d≠0` quay liên tục (30°/s) về phía giới hạn; `d=0` giảm tốc dừng. **Host phải gửi lại ít nhất mỗi 300 ms** (nên 100 ms); im lặng quá hạn thì firmware tự giảm tốc dừng (deadman). Nhả nút: gửi `JOG,0,0` |
| `HEAD,<seq>,<pan_cdeg>,<tilt_cdeg>` | Đầu quay tới góc tuyệt đối tính từ mốc ZERO, số nguyên centi-độ. PAN dương = quay trái, TILT dương = ngửa lên. Góc làm tròn tới vi bước (PAN 0,15°, TILT 0,09° với DRV8825 vi bước 1/4). Firmware tự chạy profile hình thang; gửi lệnh mới giữa chừng thì đổi đích (giảm tốc trước nếu phải đổi chiều) |
| `HEAD,<seq>,OFF` | Tắt hai driver PAN/TILT (nEN cao). Motor thả trôi nên **mất mốc**: phải `ZERO` lại trước lệnh góc tiếp theo |
| `CONTACTOR,<seq>,ON` | Bật MOSFET contactor: PA10 mức cao. Không refresh motor watchdog |
| `CONTACTOR,<seq>,OFF` | Tắt MOSFET contactor: PA10 mức thấp. Khi boot contactor **bật** (PA10 cao, `CONTACTOR_ON_AT_BOOT`, từ 05/11/2026). Không refresh motor watchdog |

Các lệnh `HEAD` không refresh motor watchdog của bánh xe. Kết thúc dòng bằng
`\n`. Sai cú pháp → `ERR,bad_command`. Lệnh `HEAD` đúng cú pháp nhưng bị từ
chối trả một dòng riêng, và `head_seq` trong FB **không** đổi:

| Dòng lỗi | Nguyên nhân |
|---|---|
| `ERR,head_not_zeroed` | Lệnh góc/STEP/JOG khi chưa có mốc (từ lúc boot, sau `OFF`, hoặc HOME bị `HEAD,<seq>,STOP` giữa chừng) |
| `ERR,head_limit` | Góc tuyệt đối vượt giới hạn `HEAD_PAN_LIMIT_CDEG` / `HEAD_TILT_LIMIT_CDEG` |
| `ERR,head_busy` | Lệnh bất kỳ trong lúc HOME, hoặc `ZERO`/`HOME` khi đầu quay đang chạy |

Ba lỗi này **không** đổi trường `status` của FB, vì trường đó mô tả bánh xe.
Riêng `ERR,bad_command` vẫn đặt `status=ERR` như trước.

Contactor chuyển chân ngày 23/10/2026: theo PCB `robot-pan-tilt-chan-cho-6-9`,
PB10 nay là TILT_nEN và MOSFET contactor nối PA10. Cú pháp lệnh `CONTACTOR`
giữ nguyên. Timeout `CMD` 300 ms, watchdog trong ngắt và `STOP` **không** tự
tắt contactor; host phải gửi `CONTACTOR,<seq>,OFF` khi cần. Từ 05/11/2026
firmware bật contactor ngay khi boot. Đầu quay không phụ thuộc contactor.
Bridge gửi lệnh này qua service `contactor/set` (xem
`ros2_ws/src/stm32_bridge/HEAD_CONTROL.md`).

**Seq:** bridge dùng một bộ đếm chung cho mọi lệnh, bắt đầu từ 1 và bỏ qua 0
khi tràn, vì `head_seq=0` trong FB nghĩa là "firmware chưa nhận lệnh HEAD
nào". Lệnh `HEAD` bị từ chối nhận ra được khi trường 1 (`seq`) đã tới seq của
lệnh mà `head_seq` chưa đổi.

## STM32 → Host: khung `FB`

50 Hz.

```
FB,<seq>,<left_count>,<right_count>,<dt_ms>,<status>,
   <yaw_cdeg>,<yaw_valid>,
   <s1_mm>,<s1_valid>,<s2_mm>,<s2_valid>,<s3_mm>,<s3_valid>,<s4_mm>,<s4_valid>,
   <yaw_acc>,<imu_rearm>,<imu_reset_seen>,
   <head_seq>,<pan_cdeg>,<tilt_cdeg>,<head_state>,<contactor>
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
| 17, 18 | `imu_rearm`, `imu_reset_seen` | Bộ đếm IMU tích lũy từ lúc boot |
| 19 | `head_seq` | Seq lệnh HEAD cuối được chấp nhận; 0 khi chưa nhận lệnh |
| 20, 21 | `pan_cdeg`, `tilt_cdeg` | Góc tính từ số xung STEP, đơn vị 0,01°, không phải encoder |
| 22 | `head_state` | 0 OFF, 1 IDLE, 2 MOVING, 3 HOMING, 4 NO_REF |
| 23 | `contactor` | 0 OFF, 1 ON: trạng thái lệnh GPIO PA10, không phải tiếp điểm |

`yaw_valid` nói *có dữ liệu mới*, `yaw_acc` nói *dữ liệu đáng tin tới đâu*.
Hai thứ khác nhau. Bridge publish mọi yaw hợp lệ lên `imu/data` và chuyển
`yaw_acc` thành orientation covariance; `robot_localization` dùng covariance
đó khi fuse yaw với wheel velocity. Bridge không còn dùng yaw để sửa wheel
odometry.

### Các độ dài đã từng tồn tại

Bridge vẫn đọc được hết, để firmware cũ không làm chết node:

| Số trường | Nội dung |
|---|---|
| 5 | `FB,left,right,dt,status` — không có seq |
| 6 | thêm `seq` |
| 8 | thêm `yaw_cdeg`, `yaw_valid` |
| 12 | thêm 2 sonar |
| 16 | thêm sonar 3–4 |
| 17 | thêm `yaw_acc` |
| 19 | thêm bộ đếm IMU |
| 23 | thêm head, chưa có contactor |
| **24** | thêm contactor ← hiện tại |
| 25+ | trường lạ ở cuối được bỏ qua |

## Khung `DIAG`

Chỉ để con người đọc khi debug, không phải giao diện máy — đừng parse trong
node. Chi tiết ý nghĩa từng trường:
`firmware/stm32/motor_controller/docs/IMU_BNO085.md`.

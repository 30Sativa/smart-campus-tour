# Test đầu quay PAN/TILT và contactor trên Linux (miniPC)

Hướng dẫn chạy thử toàn bộ đường ROS 2 → STM32 cho đầu quay và contactor trên
Ubuntu 22.04 + ROS 2 Humble. Giao diện chi tiết: [`HEAD_CONTROL.md`](HEAD_CONTROL.md).
Giao thức serial: `robot/docs/PROTOCOL_FB.md`.

## 0. Đường điều khiển hiện có

```
FE (nút ←→↑↓)  ──X──  BE  ──X──  miniPC (ROS 2)  ──►  stm32_bridge  ──USB──►  STM32  ──►  DRV8825
   chưa có nút      chưa có kênh lệnh       head/jog, head/step,            HEAD,<seq>,…      STEP/DIR
   tay; Staff FE    xuống robot (Fleet      head/set, head/stop|off|zero,   CONTACTOR,<seq>,… PA10
   đang dùng mock   Sync v1 chỉ telemetry,  contactor/set
                    trả commands: [])
```

Phần **miniPC → STM32 đã xong** và test được ngay. Phần FE → BE → miniPC
chưa tồn tại, nên trên Linux ta thay FE bằng `head_teleop` (bàn phím), dùng
đúng các topic/action/service mà backend sẽ gọi sau này.

## 1. Cập nhật code và build

```bash
cd ~/smart-campus-tour
git checkout -b feature/<ten>/robot-head-pan-tilt   # không làm trên main
git apply --check head-contactor-ros2-on-main.patch && git apply head-contactor-ros2-on-main.patch
git apply stm32-bridge-launch-head-args.patch

bash robot/scripts/build-native          # build cả bus_interfaces (msg/action mới) và stm32_bridge
source robot/scripts/source-minipc       # mỗi terminal mới đều phải chạy dòng này
```

Kiểm tra interface mới đã build:

```bash
ros2 interface show bus_interfaces/action/SetHead
ros2 interface show bus_interfaces/msg/HeadJog
```

## 2. Cổng serial

```bash
ls -l /dev/ttyACM*                     # STM32 thường là /dev/ttyACM0
groups | grep dialout || sudo usermod -aG dialout $USER   # rồi đăng xuất/đăng nhập lại
```

ModemManager của Ubuntu hay mở thử các cổng `ttyACM` vài giây sau khi cắm,
làm bridge mất byte hoặc không mở được cổng. Nếu máy không dùng modem:

```bash
sudo systemctl disable --now ModemManager
```

Kiểm tra firmware **khi bridge chưa chạy** (chỉ đọc, không gửi lệnh):

```bash
python3 robot/firmware/stm32/motor_controller/scripts/check_fb.py      # mong đợi: 24 trường, ~50 khung/giây
```

## 3. Chạy bridge

Kê bánh xe lên khỏi mặt đất, để đầu quay quay tự do, tay gần công tắc nguồn.

```bash
ros2 launch stm32_bridge stm32_bridge.launch.py robot_id:=robot_01 port:=/dev/ttyACM0
# hoặc cả cụm: ros2 launch robot_control manual_mode.launch.py robot_id:=robot_01 port:=/dev/ttyACM0
```

Log phải có:

```
Head interface enabled ...
Contactor interface enabled: contactor/set, contactor/state
```

Terminal khác (nhớ `source robot/scripts/source-minipc`):

```bash
ros2 topic list   | grep -E 'head|contactor'   # /robot_01/head/jog, head/step, head/state, contactor/state
ros2 action list  | grep head                  # /robot_01/head/set
ros2 service list | grep -E 'head|contactor'   # head/stop, head/off, head/zero, contactor/set
ros2 topic echo /robot_01/head/state           # state 0 (OFF) sau khi STM32 khởi động
```

## 4. Bàn phím thay cho FE: `head_teleop`

```bash
ros2 run stm32_bridge head_teleop --ros-args -r __ns:=/robot_01
```

| Phím | Tác dụng |
|---|---|
| ← → ↑ ↓ (hoặc A D W S) | **Nhấn** = 1 bước (PAN 0,6°, TILT 0,36°). **Giữ** = quay liên tục. **Nhả** = dừng |
| `h` | HOME: PAN quay phải tới vật cản rồi về 0°, TILT cúi tới vật cản rồi về thẳng (khoảng 13 s). Bridge đã tự HOME một lần khi STM32 khởi động |
| `0` | Về góc 0°/0° (cần đã HOME) |
| Space | Dừng (`head/stop`) |
| `o` | Tắt driver (`head/off`): TILT có thể đổ theo trọng lực |
| `z` | Đặt mốc tay tại vị trí hiện tại (`head/zero`) |
| `c` | Bật/tắt contactor |
| `q` | Thoát (gửi dừng trước khi thoát) |

"Giữ" được nhận ra nhờ tự lặp phím của hệ điều hành: lần lặp đầu đến sau
khoảng 0,25–0,8 s. Hai lần nhấn nhanh trong 0,8 s có thể bị hiểu là giữ ngắn.
FE sau này nên làm theo cùng quy tắc: `pointerdown` gửi `head/step`; còn giữ
sau ~300 ms thì publish `head/jog` 10 Hz; `pointerup` publish `head/jog` 0,0.

## 5. Kịch bản test và tiêu chí đạt

Làm theo thứ tự. Ghi lại kết quả từng bước.

| # | Thao tác | Đạt khi |
|---|---|---|
| 1 | Chưa HOME, nhấn ← | Bị từ chối: log bridge `rejected:head_not_zeroed` hoặc HeadState vẫn OFF; motor không quay |
| 2 | `h` (HOME) | PAN quay **phải** 190° tới vật cản (cạnh 174° phải), TILT cúi tới vật cản (20°), rồi cả hai về 0°. Kết quả `homed`, `state=1`, `referenced=true`, pan≈0, tilt≈0 |
| 3 | Đánh dấu vị trí 0° bằng bút, HOME lại 3 lần | Lệch so với vạch ≤ PAN 2,4° / TILT 3,6° (giới hạn của homing chạm cơ khí) |
| 4 | Nhấn ← 10 lần chậm | PAN tăng đúng 6,0° (10 × 0,6°), chiều quay trái |
| 5 | Nhấn ↑ 5 lần chậm | TILT tăng đúng 9,0°, ngửa lên |
| 6 | Giữ → 2 s rồi nhả | Quay đều, dừng trong ~0,3 s sau khi nhả |
| 7 | Giữ ← tới khi tự dừng | Dừng ở +169,8° (giới hạn mềm ±170°), **không** chạm vật cản |
| 8 | Giữ ↓ tới khi tự dừng | Dừng ở −18° (giới hạn mềm), không trượt ở vật cản cúi 20° |
| 9 | Đang giữ phím, rút cáp mạng/đóng `head_teleop` bằng `kill -9` | Đầu quay tự dừng trong ≤ 0,3 s (deadman firmware) |
| 10 | Đang HOME, nhấn Space | HOME hủy, `state=4` (NO_REF), phải HOME lại |
| 11 | `0` sau khi xoay tay lệch | Về pan 0°, tilt 0°, kết quả `reached` |
| 12 | Cho bánh xe chạy (`/cmd_vel`) và đồng thời giữ phím | Cả bánh và đầu quay đều chạy; dừng xe không làm dừng đầu quay |
| 13 | `c` hai lần | `contactor/set: on` rồi `off`; đo PA10 lên 3,3 V rồi về 0 V; `contactor/state` đổi theo |
| 14 | Rút USB STM32 khi đang chạy goal | Goal kết thúc `aborted:stm32_reset` hoặc `serial_unavailable`; cắm lại thì bridge tự kết nối lại, đầu quay OFF |
| 15 | `o` | `state=0`, driver nhả (nEN cao) |

Thử nhanh bằng lệnh, không cần `head_teleop`:

```bash
ros2 action send_goal /robot_01/head/set bus_interfaces/action/SetHead "{mode: 1}" --feedback
ros2 action send_goal /robot_01/head/set bus_interfaces/action/SetHead "{mode: 0, pan_deg: 45.0, tilt_deg: 10.0}"
ros2 topic pub --once /robot_01/head/step bus_interfaces/msg/HeadStep "{pan_steps: 1, tilt_steps: 0}"
ros2 topic pub -r 10 /robot_01/head/jog bus_interfaces/msg/HeadJog "{pan: -1, tilt: 0}"   # Ctrl+C = nhả
ros2 service call /robot_01/head/stop std_srvs/srv/Trigger
ros2 service call /robot_01/contactor/set std_srvs/srv/SetBool "{data: true}"
```

## 6. Khi có lỗi

| Hiện tượng | Kiểm tra |
|---|---|
| Không có `head/*` trong `ros2 topic list` | Log bridge có `Head interface disabled`? Chưa build lại `bus_interfaces` → chạy lại `build-native`. Quên `source-minipc` |
| `head_teleop` báo "chua nhan head/state" | Sai namespace (`-r __ns:=/robot_01` phải khớp `robot_id`), hoặc discovery server khác terminal |
| `firmware_without_head` | Firmware cũ: FB < 23 trường. Chạy `check_fb.py`, nạp lại |
| Motor rung không quay, hoặc mất bước | Dòng DRV8825 (Vref), nguồn motor, giảm tốc `HEAD_MAX_SPEED_DPS`/`HEAD_ACCEL_DPS2` trong firmware |
| Quay ngược chiều | Đảo dây một cuộn motor, hoặc đổi `HEAD_PAN_DIR_INVERT` / `HEAD_TILT_DIR_INVERT` trong `head_core.h` |
| HOME xong nhưng 0° lệch cố định | Chỉnh `HEAD_PAN_HOME_OFFSET_CDEG` / `HEAD_TILT_HOME_OFFSET_CDEG` (centi-độ) theo đo thực tế |
| Không mở được `/dev/ttyACM0` | Quyền `dialout`, ModemManager, hoặc `check_fb.py`/terminal khác đang giữ cổng |

## 7. Test offline (không cần ROS, không cần robot)

```bash
cd robot/ros2_ws/src/stm32_bridge && python3 -m pytest test/
cd robot/firmware/stm32/motor_controller && bash scripts/verify.sh
```

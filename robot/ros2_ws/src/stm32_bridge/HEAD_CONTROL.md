# Đầu quay PAN/TILT và contactor qua ROS 2

`stm32_bridge` giữ cổng `/dev/ttyACM0`, nên mọi lệnh tới STM32 (bánh xe, đầu
quay, contactor) đều đi qua node này. Hợp đồng serial:
`robot/docs/PROTOCOL_FB.md`. Firmware: `robot/firmware/stm32/motor_controller/docs/HEAD_PAN_TILT.md`.

Trạng thái: **code và test offline xong, chưa chạy với ROS thật và robot.**

## Giao diện (tên tương đối, thành `/robot_01/...` khi có namespace)

| Loại | Tên | Kiểu | Ý nghĩa |
|---|---|---|---|
| action | `head/set` | `bus_interfaces/action/SetHead` | `mode=1` HOME (tìm vật cản rồi về 0°, khoảng 13 s); `mode=0` tới góc `pan_deg`/`tilt_deg`. Thành công chỉ khi FB báo `head_seq` = seq lệnh **và** `head_state=1` |
| topic (sub) | `head/jog` | `bus_interfaces/msg/HeadJog` | Giữ nút: `pan`/`tilt` ∈ {-1,0,1}. Publish đều ≥ 5 Hz (nên 10 Hz) khi giữ; nhả: publish `0,0` |
| topic (sub) | `head/step` | `bus_interfaces/msg/HeadStep` | Nhấn nút: số bước đủ (PAN 0,6°, TILT 0,36° mỗi bước) |
| topic (pub) | `head/state` | `bus_interfaces/msg/HeadState` | Trạng thái, góc, `referenced`, `last_head_seq`. 10 Hz và mỗi khi đổi trạng thái |
| service | `head/stop` | `std_srvs/srv/Trigger` | Giảm tốc dừng; đang HOME thì hủy HOME (mất mốc) |
| service | `head/off` | `std_srvs/srv/Trigger` | Tắt driver, mất mốc (TILT có thể đổ theo trọng lực) |
| service | `head/zero` | `std_srvs/srv/Trigger` | Mốc tay tại vị trí hiện tại (dự phòng khi không HOME được) |
| service | `head/sweep` | `bus_interfaces/srv/HeadSweep` | Xoay tự động: từ vị trí hiện tại PAN sang trái `amplitude_deg` (0 = `head_sweep_deg`, 135°), sang phải gấp đôi, rồi về đúng chỗ cũ, 30°/s. `amplitude_deg` âm hoặc không phải số: `rejected:invalid_amplitude`. Trả `started` sau khi FB đã phản ánh mọi lệnh đầu quay gửi trước đó (≤ 1 s); từ chối `not_ready:<trạng thái>` nếu chưa có mốc hoặc đang quay, `not_ready:command_pending` nếu FB chưa theo kịp, `already_sweeping` nếu đang quét |
| service | `contactor/set` | `std_srvs/srv/SetBool` | Bật/tắt contactor (PA10). Thành công khi một khung FB **sinh sau** lệnh này báo đúng trạng thái. Xem bảng kết quả bên dưới |
| topic (pub) | `contactor/state` | `std_msgs/msg/Bool` | Trạng thái lệnh của PA10, 1 Hz và khi đổi |

Quy ước góc: PAN dương = quay trái, 0° = phía trước, giới hạn ±170° (vật cản
phía sau, cạnh ở 174°). TILT dương = ngửa lên, giới hạn ±18° (vật cản cúi
20°). Góc làm tròn tới vi bước: PAN 0,15°, TILT 0,09° (DRV8825 vi bước 1/4, TILT hộp số 5:1).

## Xoay tự động ở POI (`head/sweep`)

Đầu camera làm gì ở mỗi POI do Staff chọn trong mục **Camera & tư liệu** của POI
(nhìn trước/trái/phải, góc tùy chỉnh, quét với biên độ riêng, hoặc không tự xoay).
Tour ở chế độ **Tự động** (mặc định) thì khi robot tới POI chọn "Quét", backend gửi
`SWEEP` (kèm `sweepDeg` nếu có), `fleet_bridge` gọi `head/sweep` của node này với
`amplitude_deg` tương ứng. Chế độ **Bằng tay** (`PUT .../head-mode`) bỏ qua mọi thiết lập POI.

- Chuỗi lệnh `STEP` ở tốc độ nút bấm của firmware (30°/s, không cần nạp lại):
  `STEP,+trái,0` → `STEP,-(trái+phải),0` → `STEP,+phải,0`, chờ IDLE sau mỗi đoạn.
  Tổng bước bằng 0 nên đầu về **đúng** vị trí bắt đầu; TILT giữ nguyên. Khoảng
  19 s với ±135°.
- Mỗi bên tối đa `head_sweep_deg` (135°), tự thu nhỏ để không chạm giới hạn mềm
  ±170° (đầu đang ở +100° thì chỉ quay trái 69,6°).
- **Tay thắng:** bất kỳ lệnh tay nào (`head/jog` khác 0, `head/step`, `head/set`,
  `head/stop|off|zero`) hủy lượt quét, và lượt quét không gửi thêm lệnh nào sau đó.
  `STEP`/`JOG` chỉ đổi đích của trục được nhấn (firmware cộng `STEP` vào đích
  của đoạn quét đang chạy), nên khi đang quét bridge gửi `HEAD,<seq>,STOP` ngay
  trước chúng: đầu dừng tại chỗ rồi mới làm theo nút, không quay hết đoạn quét.
- Bàn phím: `head_teleop` phím `x` (biên độ mặc định).

| Tham số | Mặc định | |
|---|---|---|
| `head_sweep_deg` | 135 | Biên độ mỗi bên (0 = không quay) |
| `head_sweep_pan_deg_per_step` | 0,6 | **Phải khớp firmware** (bước đủ, hộp số 3:1). Vi bước 1/16 → 0,0375 |
| `head_sweep_pan_limit_deg` | 170 | **Phải khớp** `HEAD_PAN_LIMIT_CDEG` |
| `head_sweep_speed_dps` | 30 | Chỉ để tính timeout; tốc độ thật là `HEAD_JOG_SPEED_DPS` của firmware |

## Tự động khi khởi động

- **HOME tự động** (`head_auto_home`): ngay khi khung FB cho thấy STM32 vừa
  khởi động (`head_state=0` và `head_seq=0`), bridge gửi `HEAD,<seq>,HOME`.
  PAN quay phải 190° tìm vật cản rồi quay trái 174° về 0°. TILT cúi tìm vật
  cản rồi ngửa 20° về thẳng. Bridge chạy lại HOME sau mỗi lần STM32 reset,
  nhưng **không** chạy lại sau `head/off` của người dùng (lúc đó `head_seq≠0`).
  Thất bại (mất serial…) thì thử lại sau 5 s.
- **Về 0 trước khi tắt** (`head_park_on_shutdown`): bridge tắt khi đầu đang có
  mốc thì gửi `HEAD,<seq>,0,0` và **chờ tới khi về xong** (tối đa
  `head_park_timeout`, 4 s; vẫn đọc FB dù executor đã dừng). Lý do: seek PAN chỉ
  190°, nên lần HOME sau phải bắt đầu trong khoảng 174° phải – 16° trái; cắt
  điện ngay sau khi tắt bridge mà đầu còn ở 135° trái thì HOME sai mốc.
- **Nhớ góc PAN qua mất điện** (`head_pan_memory_file`, mặc định
  `~/.ros/stm32_bridge/head_pan.json`): khi có mốc, bridge ghi góc PAN thật ra
  file (đổi ≥ 0,5°, tối đa 5 lần/giây, ghi kiểu tạm-rồi-đổi-tên). `head/off`
  hoặc HOME bị hủy ghi "không có mốc" (đầu có thể bị xoay tay). Khi STM32 vừa
  khởi động lại (`head_seq=0`) file **không** bị ghi đè.
- **HOME an toàn:** nếu file cho thấy đầu đang lệch trái quá
  `head_home_safe_left_deg` (10°) lúc mất điện, HOME tự động làm
  `ZERO` (mốc tạm tại chỗ) → quay phải đúng góc đó về gần 0 → `HOME`. Trong lúc
  đó file vẫn ghi góc thật (cộng phần lệch), nên mất điện lần nữa giữa chừng vẫn
  đúng. `head/set` HOME (bấm tay) khi đầu đang có mốc và lệch trái quá 10° cũng
  quay về 0 trước rồi mới HOME. Phía phải không cần: tìm vật chặn 190° về bên
  phải luôn chạm.
  Giới hạn: nếu ai đó xoay đầu bằng tay khi mất điện, góc trong file sai; khi
  đó tắt `head_auto_home` và HOME bằng tay sau khi đưa đầu về phía trước.
- **Contactor bật khi khởi động**: firmware bật PA10 lúc boot. Bridge
  (`contactor_on_at_startup`) gửi `CONTACTOR,<seq>,ON` một lần nếu khung FB
  đầu tiên báo đang tắt. Sau đó chỉ bật/tắt theo `contactor/set`.
- Đầu quay **không phụ thuộc contactor**: không lệnh `HEAD` nào kiểm tra hay đổi
  trạng thái contactor.

## Kết quả action `head/set`

| `message` | Ý nghĩa |
|---|---|
| `reached` / `homed` | Thành công |
| `rejected:head_limit` | Góc ngoài giới hạn mềm |
| `rejected:head_not_zeroed` | Chưa có mốc: phải HOME trước |
| `rejected:head_busy` | Đang HOME |
| `rejected:invalid_angle` | `pan_deg`/`tilt_deg` là NaN hoặc vô cực: không gửi lệnh |
| `superseded` | Một lệnh HEAD mới hơn (goal khác, JOG, STEP…) đã thay thế |
| `aborted:off` / `aborted:no_reference` | Bị `head/off` hoặc `head/stop` giữa chừng |
| `aborted:stm32_reset` | STM32 khởi động lại giữa chừng (mất nguồn, rút USB): đầu quay OFF, phải HOME lại |
| `canceled` | Client hủy goal; bridge gửi `HEAD,<seq>,STOP` |
| `timeout` | Quá `head_move_timeout` (20 s) / `head_home_timeout` (45 s); bridge gửi `HEAD,<seq>,STOP` |
| `no_feedback` / `serial_unavailable` | Mất FB hoặc mất cổng serial |
| `firmware_without_head` | FB không có trường đầu quay (firmware cũ) |

## Contactor (`contactor_ros.py`)

Tách riêng khỏi đầu quay: chỉ cần `std_msgs`/`std_srvs`, không cần
`bus_interfaces`. Vì vậy `enable_head:=false` hoặc lỗi import đầu quay **không**
làm mất `contactor/set`. Trạng thái là trạng thái **lệnh** của PA10 (FB trường
23), không phải tiếp điểm thật đã đóng.

| `message` của `contactor/set` | Ý nghĩa |
|---|---|
| `on` / `off` | `success=true`, FB sau lệnh xác nhận PA10 |
| `not_confirmed:state_is_on` / `…_off` | Hết `contactor_command_timeout` mà FB vẫn báo trạng thái kia (lệnh mất trên đường truyền, hoặc lệnh khác ghi đè) |
| `serial_unavailable` | Không ghi được cổng serial, lệnh **chưa** gửi |
| `sent_but_firmware_has_no_contactor_feedback` | Đã gửi nhưng FB chưa có trường 23 (firmware cũ): không biết PA10 thật |
| `no_feedback` | Đã gửi nhưng không nhận FB nào |

## Tham số mới

| Tham số | Mặc định | |
|---|---|---|
| `enable_head` | `true` | Tắt nếu chạy với firmware cũ hoặc `bus_interfaces` chưa build lại |
| `head_jog_timeout` | 0,25 s | Nguồn `head/jog` im quá lâu → bridge gửi `JOG,0,0` |
| `head_state_rate_hz` | 10 | Tần số publish `head/state` |
| `head_move_timeout` | 20 s | Timeout goal góc |
| `head_home_timeout` | 45 s | Timeout goal HOME |
| `head_command_timeout` | 1 s | Timeout xác nhận `head/off`, `head/zero` |
| `head_auto_home` | `true` | HOME tự động khi STM32 vừa khởi động |
| `head_park_on_shutdown` | `true` | Đưa đầu về 0/0 khi tắt bridge |
| `head_park_timeout` | 4 s | Chờ tối đa bấy nhiêu cho đầu về 0/0 khi tắt (dưới 5 s của `ros2 launch`) |
| `head_pan_memory_file` | `~/.ros/stm32_bridge/head_pan.json` | Nơi nhớ góc PAN qua mất điện; chuỗi rỗng = tắt |
| `head_home_safe_left_deg` | 10° | Lệch trái quá góc này thì quay về 0 trước khi HOME (firmware chịu được tới 16°) |
| `enable_contactor` | `true` | Bật giao diện contactor (độc lập với `enable_head`) |
| `contactor_on_at_startup` | `true` | Gửi `CONTACTOR,ON` một lần khi bridge khởi động nếu đang tắt |
| `contactor_command_timeout` | 1 s | Timeout xác nhận `contactor/set` |

## Thay đổi khác trong node

- `MultiThreadedExecutor` (8 luồng): action/service chờ xác nhận từ FB trong
  khi timer vẫn gửi `CMD/STOP` và đọc FB. Ghi serial và cấp seq có khóa chung.
- Phần đầu quay **không được làm hỏng bánh xe**: nếu import lỗi (chưa build
  lại `bus_interfaces`) node vẫn chạy, chỉ tắt giao diện đầu quay và log lỗi;
  lỗi trong hook đầu quay (đọc FB, timer) chỉ được log, không chặn
  odometry/`CMD`.
- Lệnh `JOG` keepalive 10 Hz log ở mức debug để không làm đầy log.
- Lệnh bị từ chối: bridge chờ thêm tối đa 0,15 s để lấy lý do từ dòng
  `ERR,head_*` (firmware có thể gửi FB trước ERR).
- Seq bắt đầu từ 1 và bỏ qua 0 khi tràn (FB `head_seq=0` = chưa có lệnh).
- Deadman hai lớp cho giữ nút: bridge 0,25 s (gửi `JOG,0,0`) và firmware 0,3 s.
  Khi đang giữ, bridge tự gửi lại `JOG` 10 Hz để firmware không hết hạn chỉ
  vì nguồn publish chậm.

## Thử nhanh (sau `colcon build`, bánh xe nhấc, đầu quay không vướng)

```bash
ros2 action send_goal /robot_01/head/set bus_interfaces/action/SetHead "{mode: 1}" --feedback
ros2 topic echo /robot_01/head/state
ros2 action send_goal /robot_01/head/set bus_interfaces/action/SetHead "{mode: 0, pan_deg: 45.0, tilt_deg: 10.0}"
ros2 topic pub --once /robot_01/head/step bus_interfaces/msg/HeadStep "{pan_steps: 1, tilt_steps: 0}"
ros2 topic pub -r 10 /robot_01/head/jog bus_interfaces/msg/HeadJog "{pan: -1, tilt: 0}"   # Ctrl+C = nhả
ros2 service call /robot_01/head/stop std_srvs/srv/Trigger
ros2 service call /robot_01/contactor/set std_srvs/srv/SetBool "{data: true}"
```

## Điều khiển bằng bàn phím và test trên Linux

`ros2 run stm32_bridge head_teleop --ros-args -r __ns:=/robot_01`: nhấn phím
mũi tên = 1 bước, giữ = quay liên tục, nhả = dừng. Thay cho FE khi chưa có
kênh lệnh backend → robot. Quy trình test đầy đủ trên miniPC:
[`LINUX_TEST.md`](LINUX_TEST.md).

## Test offline

```bash
cd robot/ros2_ws/src/stm32_bridge
python3 -m pytest test/test_head_link.py test/test_head_ros.py
```

`test_head_ros.py` dùng node giả và "firmware giả" trả khung FB theo giao
thức: HOME, góc, từ chối kèm lý do, hủy, timeout, lệnh mới thay lệnh cũ, mất
serial, firmware cũ, service và deadman JOG.

## Lưu ý an toàn

- `contactor/set` không có phân quyền: node ROS nào trong cùng graph cũng gọi
  được. Contactor không tự tắt khi mất `cmd_vel`/`CMD`, và **bật ngay khi
  STM32 khởi động**.
- Bật bridge là đầu quay tự HOME (motor tự quay). Không để tay hoặc dây vướng
  đầu quay khi khởi động; tắt bằng `head_auto_home:=false` khi bench.
- `head/off` thả trôi motor: TILT có thể đổ theo trọng lực.

## Chưa làm

- Backend → ROS: đã có Fleet Head v1 (ADR-0045, đề xuất 05/11/2026, cờ tắt mặc
  định). `fleet_bridge` (`head_enabled: true`) long-poll backend rồi gửi vào
  `head/step`, `head/jog`, `head/stop`, `head/set` của node này. Chỉ Operator
  của Tour đang RUNNING được bấm; người xem không. Xem
  `docs/contracts/fleet-head/v1/README.md`.
- TF động cho camera theo góc PAN/TILT (nếu camera nằm trên đầu quay).

# rviz_over_ssh: RViz2 trên laptop, không tham gia DDS của robot

Dùng trên **laptop**. Thiết kế và quy trình chuyển đổi nằm ở
[`robot/docs/dds-isolation.md`](../../docs/dds-isolation.md).

```text
robot: foxglove_bridge 127.0.0.1:8765  <== ssh -L (key) ==>  laptop 127.0.0.1:8765
                                                              fox2ros -> DDS cục bộ của laptop -> rviz2
```

## Chạy

Trên robot, sau khi navigation đã chạy:

```bash
ros2 launch robot_navigation debug_bridge.launch.py robot_id:=robot_01
```

Trên laptop, từ checkout này. Source ROS Humble và workspace có
`robot_description` để RViz hiện mesh:

```bash
robot/tools/rviz_over_ssh/rviz-over-ssh sativa@<ip-robot>
```

- SSH phải đăng nhập được bằng key không hỏi mật khẩu (`BatchMode=yes`).
  Kiểm tra trước bằng `ssh -o BatchMode=yes sativa@<ip-robot> true`.
- Laptop chạy graph riêng: `ROS_LOCALHOST_ONLY=1`, domain
  `LAPTOP_ROS_DOMAIN_ID` (mặc định 42). Script tự bỏ `ROS_DISCOVERY_SERVER`.
- Cần global costmap thì thêm `-e global_costmap/costmap`: nhận một snapshot
  mỗi 10 s (khoảng 2.8 MB mỗi lần).
- Muốn tự mở `rviz2` thì dùng `--no-rviz`.

## Những gì thấy và làm được

- **Hiển thị:** map, scan, TF, RobotModel, local costmap, footprint, plan,
  particle cloud, sonar. Tên topic và namespace giống hệt trên robot, nên
  `navigation.rviz` dùng được nguyên.
- **2D Pose Estimate:** chuyển tới `initialpose_guard` trên robot. Kết quả
  (`FORWARDED`/`ACCEPTED`/`REJECTED`…) hiện trong terminal với tiền tố
  `[robot]`. Guard từ chối khi robot đang chạy, khi Fixed Frame không phải
  `map`, hoặc khi bấm hai lần trong vòng 1 s.
- **Không chuyển:** Nav2 Goal, panel Nav2 (action/service), param, `cmd_vel`.

## Khi mạng chập chờn

| Sự kiện | Hành vi |
|---|---|
| Wi-Fi/SSH rớt | RViz giữ dữ liệu cuối. Tunnel tự nối lại sau 3 s, `fox2ros` sau 1–5 s. Map được latch sẵn trên laptop |
| Bridge trên robot restart | `fox2ros` nối lại và subscribe theo channel id mới |
| Link sống nhưng không có dữ liệu | Sau 6 s `fox2ros` coi là chết và nối lại |
| Bấm Initial Pose lúc link đứt | **Không gửi và không xếp hàng** (để không có pose cũ tới muộn); terminal báo `NOT sent` |
| Đồng hồ laptop lệch robot > 1 s | Có cảnh báo; nên đồng bộ NTP (guard trên robot đã đóng dấu lại thời gian cho Initial Pose) |

## File

| File | Vai trò |
|---|---|
| `rviz-over-ssh` | Mở tunnel, chạy `fox2ros` và `rviz2`; dọn sạch khi thoát |
| `fox2ros.py` | Adapter WebSocket (`foxglove.sdk.v1`) → DDS cục bộ của laptop; tự nối lại |
| `fox2ros_topics.yaml` | Danh sách topic, QoS phía laptop, uplink |
| `test_fox2ros.py` | Test framing, cấu hình, session, reconnect với bridge giả (không cần ROS) |

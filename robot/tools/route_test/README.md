# route_test — chạy thử tuyến POI qua Nav2 (có người đi theo)

Script test thủ công trên MiniPC, **chưa nối backend**. Script không ghi PASS,
không đổi trạng thái Tour trên BE, không set initial pose và không publish
`/cmd_vel`. Mục đích là kiểm chứng robot đi được tuyến trước khi viết phần BE.

```
2D Pose Estimate (RViz, thủ công)
route.yaml + robot_maps/poi_*.yaml ──► route_test.py ──► /robot_01/navigate_to_pose
                                            │              (mỗi lúc MỘT goal)
                                            └── ~/amr_logs/runs/<session>/
```

Luồng chạy:

1. Validate file tuyến và in kế hoạch. Sai là thoát ngay, không gửi goal nào.
2. Chờ Action server, đọc TF `map -> base_footprint`, in khoảng cách robot tới
   START và cảnh báo nếu lớn hơn 1 m (chỉ cảnh báo). Bấm Enter để bắt đầu.
3. Gửi một goal. `SUCCEEDED` thì dừng đúng `dwell_s` rồi gửi POI tiếp theo.
4. `ABORTED`, `REJECTED`, timeout hoặc Ctrl+C thì dừng chuỗi, **không gửi điểm
   tiếp theo** và ghi log.
5. `end_mode: return_to_start` thì chạy thêm chặng về START.

## Dừng script là dừng robot

| Tình huống | Script làm gì |
|---|---|
| Ctrl+C lúc đang chạy, timeout chặng, exception | Hủy goal, đợi Nav2 trả result, ghi `cancel_confirmed` |
| Ctrl+C lúc đang dừng ở POI | Dừng chuỗi, robot đang đứng yên |
| Không xác nhận được việc hủy | In cảnh báo to `DÙNG E-STOP` |
| Nav2 chưa accept sau 10 s | Đợi thêm 10 s; goal được accept muộn thì hủy ngay; vẫn im lặng thì in `DÙNG E-STOP` |
| Ctrl+C lần 2 | Thoát ngay, goal **có thể vẫn chạy**: quan sát robot, dùng E-stop nếu còn đi |
| SIGTERM, SIGHUP (rớt SSH) | Xử lý như Ctrl+C lần 1 |

`SIGKILL`, mất điện MiniPC hoặc script treo thì không hủy được goal. Người đi theo
phải luôn giữ E-stop.

## Chuẩn bị

- Navigation stack đã chạy, map đang load phải đúng là `map_yaml` trong file tuyến.
- Đặt 2D Pose Estimate trên RViz, robot đứng ở START.
- Fleet Bridge có thể chạy song song vì chỉ gửi telemetry. **Không gửi Nav2 Goal
  từ RViz** trong lúc script đang chạy.
- Muốn bag, ghi trước khi chạy theo `robot/docs/logging.md`.

## File tuyến

Copy `route.example.yaml`. File tuyến chỉ chứa `route_id`, `map_yaml`, `frame_id`,
`start`, `pois`, `default_dwell_s` (tùy chọn, mặc định 0), `end_mode`
(`return_to_start` hoặc `none`), `end_timeout_s` (tùy chọn, timeout chặng về START).
Mỗi POI có `poi_file`, `dwell_s` và `timeout_s` tùy chọn. **File tuyến không chứa
tọa độ**, tọa độ chỉ lấy từ file POI: `robot/robot_maps/poi_start.yaml`, `poi_01.yaml`
và `robot/robot_maps/poi_records/poi_02.yaml`, `poi_03.yaml`.

`poi_records/` là bản ghi khôi phục từ MiniPC, xem `robot/robot_maps/poi_records/README.md`
trước khi chạy: `poi_03.yaml` vẫn `verified: false`. Script không đọc trường `verified`.

Với Nav2 V2 (0,20 m/s), chặng POI_03 -> START dài ít nhất 48 m nên cần hơn 240 s; file
mẫu đặt `end_timeout_s: 600` để không bị hủy giữa đường khi robot vẫn đang chạy tốt.

Script từ chối file tuyến khi: file POI thiếu, `map_yaml`/`frame_id` khác tuyến,
`yaw` lệch `quaternion` quá 0,02 rad, quaternion không phải pose 2D chuẩn hóa, id
trùng (kể cả với START), số không hợp lệ, hoặc có khóa lạ (gõ nhầm `dwell: 30`).

## Chạy (tăng dần)

```bash
source robot/scripts/source-minipc     # như terminal robot thường dùng
cd robot/tools/route_test
```

```bash
python3 route_test.py route.example.yaml --dry-run                  # chỉ in kế hoạch, không cần ROS
```

```bash
python3 route_test.py route.example.yaml --max-points 1             # 1 POI -> single_point
```

```bash
python3 route_test.py route.example.yaml --max-points 1 --with-end  # 1 POI + về START
```

```bash
python3 route_test.py route.example.yaml                            # cả tuyến -> full_route
```

| Tuỳ chọn | Mặc định | Ý nghĩa |
|---|---|---|
| `--action` | `/robot_01/navigate_to_pose` | kiểm tra bằng `ros2 action list` |
| `--leg-timeout` | 300 s | timeout mỗi chặng; POI có thể ghi đè bằng `timeout_s` |
| `--max-points N` | tất cả | chỉ chạy N POI đầu, mặc định bỏ chặng kết thúc |
| `--with-end` | tắt | vẫn chạy chặng kết thúc khi dùng `--max-points` |
| `--dry-run` | tắt | chỉ validate và in kế hoạch, không cần ROS, không ghi log |
| `--no-confirm` | tắt | bỏ bước bấm Enter |
| `--log-dir` | `$AMR_RUN_DIR` hoặc `~/amr_logs/runs` | nơi tạo thư mục log của lần chạy |

## Log

Mỗi lần chạy tạo **một thư mục mới** `<giờ VN>_route_<route_id>_<ngẫu nhiên>` bên
trong thư mục ở trên, nên không ghi đè lần chạy trước, kể cả khi cùng `$AMR_RUN_DIR`.

- `route_snapshot.yaml`: bản sao file tuyến đã dùng.
- `events.jsonl`: `run_start`, `leg_start`, `leg_end`, `dwell_end`, `run_end`.
  `run_start` có tọa độ thật từng chặng, host, git revision và biến môi trường ROS.
  Mỗi `leg_end` có `outcome`, `nav_status`, `nav_s`, `number_of_recoveries`,
  `final_pose` (TF, `null` nếu không đọc được), `error_xy_m`, `error_yaw_deg` và
  `cancel_confirmed` (`null` nếu không cần hủy).
- `summary.json`: `completed`, `stop_reason`, `scope`, `planned_scope`,
  `total_wall_s` (gồm cả thời gian dừng), `total_nav_s`, `total_dwell_s`,
  `goal_may_still_run` và chi tiết từng chặng.

`scope` là phạm vi **đã thực sự chạy xong**: `full_route` chỉ khi chạy đủ mọi POI
và cả chặng kết thúc. Kế hoạch cả tuyến bị dừng giữa chừng được ghi `partial`.

Exit code: `0` xong phạm vi đã chọn, `1` chặng lỗi hoặc không có Nav2, `2` file
tuyến hoặc tham số sai, `130` người dùng dừng.

## Tái sử dụng cho BE

`Nav2GoalRunner` chỉ thực thi **một** goal `NavigateToPose`: gửi, đợi, timeout,
hủy, đo sai số. Lớp này không biết gì về tuyến; `run_legs` mới là vòng lặp chọn
chặng. Chương trình nhận lệnh từ BE sau này dùng lại `Nav2GoalRunner`, còn BE
quyết định chặng tiếp theo.

Test không cần ROS, Nav2 được giả lập ở mức action client:

```bash
python3 -m pytest robot/tools/route_test
```

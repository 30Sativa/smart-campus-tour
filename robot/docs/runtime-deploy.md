# Từ source đã kiểm chứng sang runtime MiniPC, và rollback

Áp dụng cho MiniPC thật. Mọi lệnh ở đây chỉ chạy khi robot **đứng yên**, stack **đã dừng**, và
có người được phép thay đổi runtime. Một lệnh viết trong tài liệu không phải sự cho phép
(`robot/AGENTS.md`).

## 1. Vì sao cần quy trình này

`scripts/build-native` build bằng `--symlink-install` ngay trong checkout. File trong install
vì thế là symlink về source: chỉ cần `git checkout`, `git pull` hay sửa một file trong checkout
đó là **runtime đổi ngay**, không qua build, không để lại dấu vết.

Trạng thái 11/11/2026 (đo bằng `scripts/runtime_provenance.py`):

| Package | Nguồn đang dùng |
|---|---|
| robot_control, robot_navigation, robot_description, robot_nav_plugins | overlay `~/.cache/armtc/smoothws`, symlink vào worktree `~/sct-nav-smooth` (73b86307, branch remote đã xoá). `navigation.launch.py` và `manual_mode.launch.py` **khác** tag `robot-baseline-20261102`; vẫn còn `nav2_params_smooth.yaml` (V1) |
| bus_interfaces, fleet_bridge, orbbec_bringup, robot_perception, simulation | `~/smart-campus-tour/robot/ros2_ws/install`, symlink vào checkout `main@c3aca0fd`, **có thay đổi chưa commit** |
| stm32_bridge, bus_manager | cùng install đó nhưng là bản copy, build ngày 24/10 |
| astra_camera, astra_camera_msgs | cùng install đó, build từ `third_party/` (source không còn trong checkout) |
| `nav2_params_v2.yaml` | baseline đọc theo **đường dẫn file** trong checkout `~/smart-campus-tour`, không đọc từ install |

Hệ quả: **không sửa và không checkout** `~/sct-nav-smooth` hay `~/smart-campus-tour` khi chưa
có overlay thay thế, vì làm vậy là đổi runtime.

## 2. Công cụ

| Lệnh | Việc làm | Có ghi gì không |
|---|---|---|
| `python3 robot/scripts/runtime_provenance.py --ref <ref> [--strict]` | Với môi trường shell hiện tại, mỗi package lấy từ prefix nào, symlink theo checkout nào (HEAD, có dirty không), và file `launch/`, `config/` nào khác `<ref>` | Không |
| `robot/scripts/stage-runtime <ref> [--dest DIR]` | Lấy source của **một commit** bằng `git archive`, build **không** symlink vào thư mục mới (mặc định `~/.cache/sct-runtime/<sha>`), ghi `PROVENANCE`, đặt `src/` và `install/` chỉ đọc. Từ chối nếu thư mục đã có | Chỉ thư mục mới |
| `robot/tools/nav2_bench/verify_params.sh V2 <lidar_yaw>` | Tham số Nav2 và TF mà stack **đang chạy** thực sự nạp | Không |
| `robot/tools/preflight/preflight.py <workflow> --lidar-yaw <rad>` | Kiểm tra trước khi chạy (xem `test-readiness-2026-11-10.md`) | Không |

## 3. Quy trình triển khai một commit đã kiểm chứng

**Điều kiện:**
- commit đã được review;
- `robot/scripts/verify` không có lỗi **mới** so với `origin/main`;
- commit có tag hoặc có ghi trong tài liệu.

1. **Build (stack vẫn chạy được, không ảnh hưởng):**
   ```bash
   robot/scripts/stage-runtime <tag-hoặc-sha>
   ```
   Kết quả: `~/.cache/sct-runtime/<sha>/{src,install,PROVENANCE,build.log}`.
2. **Dừng stack đang chạy** (SIGINT, theo thứ tự trong runbook của workflow).
3. **Mở terminal mới**, source giống hệt hiện tại nhưng thay `smoothws` bằng overlay mới:
   ```bash
   export ROBOT_RUNTIME_ROOT="$HOME/smart-campus-tour/robot"; source "$HOME/sct-r3-deploy/robot/scripts/source-minipc"
   source "$HOME/.cache/sct-runtime/<sha>/install/setup.bash"; unset ROS_SUPER_CLIENT
   ```
   Overlay mới che các package cùng tên trong install gốc. Các package không có trong overlay
   (`astra_camera`) vẫn lấy từ install gốc.
4. **Kiểm nguồn:**
   ```bash
   python3 robot/scripts/runtime_provenance.py --ref <sha> --strict
   ```
   Phải thoát 0 với mọi package của repo. Nếu một package vẫn lấy từ install gốc, overlay
   chưa được source đúng.
5. **Tham số Nav2 lấy từ overlay**, không lấy từ checkout:
   `nav2_params_file:=$HOME/.cache/sct-runtime/<sha>/install/robot_control/share/robot_control/config/nav2_params_v2.yaml`.
6. Chạy workflow ở chế độ **tĩnh** trước: launch, `preflight.py ... --static`, `verify_params.sh`.
7. Ghi lại vào phiên trong `~/amr_logs/runs/`: `PROVENANCE`, kết quả provenance và kết quả preflight.

## 4. Rollback

**Rollback = dừng stack, mở terminal mới, source overlay cũ.** Không phải build lại, không
phải xoá gì, vì overlay cũ không bị động tới.

| Quay về | Source |
|---|---|
| Runtime trước 11/11 (baseline 02/11 đang chạy) | `source ~/.cache/armtc/smoothws/install/setup.bash` (như `robot-baseline-2026-11-02.md` §2) |
| Một overlay đã stage trước đó | `source ~/.cache/sct-runtime/<sha-cũ>/install/setup.bash` |

Xoá một overlay đã stage (chỉ khi chắc chắn không dùng nữa):
```bash
chmod -R u+w ~/.cache/sct-runtime/<sha> && rm -rf ~/.cache/sct-runtime/<sha>
```
Không xoá `smoothws`, `~/sct-nav-smooth` hay install gốc khi chưa có ít nhất một phiên chạy
thật PASS trên overlay mới.

## 5. Kiểm chứng của chính quy trình

| Lần | Kết quả |
|---|---|
| 11/11 | `stage-runtime HEAD` build 12 package trong 55 s. Overlay chỉ đọc. Gọi lại vào cùng thư mục bị từ chối. `runtime_provenance --strict` trên overlay đó thoát 0 |

**Chưa làm:** chạy stack thật trên overlay staged. Đó là bước hardware, cần anh cho phép.

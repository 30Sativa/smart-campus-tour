# Fleet service: `fleet_bridge` chạy từ lúc bật MiniPC

Trạng thái: code và test offline xong; **chưa cài lên MiniPC**. Cần một lần `sudo loginctl enable-linger`
(mục 5).

## 1. Đã có gì, thiếu gì

`fleet_bridge` (`robot/ros2_ws/src/fleet_bridge/`, `robot/docs/fleet-bridge.md`) đã tự lo phần lớn:

- **Mất mạng / backend tạm sập:** worker HTTPS giữ đúng một báo cáo, thử lại với backoff có
  jitter, rồi nối lại trên cùng stream. Không cần khởi động lại.
- **Không cần Nav2:** Fleet Sync và chẩn đoán MiniPC chạy khi chưa có gì khác. Pose để trống,
  `motionReady` là null. Độ sẵn sàng (Nav2, AMCL, bản đồ, cổng an toàn) được kiểm định kỳ, nên
  khi Nav2 lên sau thì tự thấy.
- **Đồng hồ sai lúc boot:** tạm dừng khi đồng hồ chạy lùi một chút. Lệch lớn thì dừng hẳn và
  thoát (`CLOCK_STEP_BACKWARD`), vì vậy tài liệu yêu cầu không khởi động bridge trước khi NTP
  đồng bộ (`robot/scripts/check_fleet_time_sync.py`).
- **Lỗi không tự sửa được** (credential sai, xung đột stream, map context): thoát với mã 1. Lỗi cấu
  hình thoát với mã 2.

Còn thiếu: ai chạy nó lúc boot, ai chạy lại khi nó thoát, ai đợi NTP, và ai quyết định lúc nào nó
được nhận lệnh. Trước đây việc đó là `robot fleet [--commands]` gõ tay trong SSH.

## 2. Thiết kế

```
systemd --user (linger)          sct-fleet.service  ->  robot fleet --service   (launcher, 1 tiến trình giám sát)
                                                          │  giữ khóa "fleet" suốt đời: robot fleet tay bị từ chối
                                                          │  trước mỗi lần chạy bridge: check_fleet_time_sync.py (NTP)
                                                          │  chạy thẳng file thực thi fleet_bridge (đánh dấu SCT_FLEET_SERVICE=1)
                                                          ├─ telemetry  : lúc bình thường (online, chẩn đoán)
                                                          └─ commands   : chỉ khi "robot nav --fleet" đang giữ khóa workflow
```

- **Tận dụng launcher.** Môi trường ROS, profile, `fleet-sync.env`, gói bản đồ, credential, khóa
  chống chạy trùng và quét tiến trình đều dùng lại; không có cách cấu hình thứ hai.
- **Online ≠ nhận lệnh.** Chế độ commands bật **đúng lúc cổng an toàn ADR-0049 có mặt**
  (`robot nav --fleet`) và tắt khi phiên đó kết thúc. `robot nav` thường, `robot manual`,
  `robot map`, `run_route.sh` thì bridge chỉ gửi telemetry, nên không có hai bên cùng gửi goal.
  Kể cả ở chế độ commands, web vẫn cần robot đã định vị, sẵn sàng di chuyển và được "Cho phép
  điều phối" mới bắt đầu Tour được.
- **Đổi chế độ = chạy lại bridge** (khoảng 3 s, stream mới). Việc này chỉ xảy ra lúc nav bắt đầu
  hoặc kết thúc, khi chưa có chặng nào đang chạy.
- **Khởi động lại.** Bridge thoát thì backoff 5 s, nhân đôi tới 300 s; chạy được >60 s thì về
  lại 5 s. Mã 2 (cấu hình) chờ thẳng 300 s. Bộ giám sát chết thì systemd chạy lại
  (`Restart=always`); `KillMode=mixed` dọn luôn bridge con. Bridge mang dấu dịch vụ mà sống sót
  (bộ giám sát bị kill ngoài systemd) thì bộ giám sát kế tiếp dừng nó. Bridge chạy tay (không dấu)
  thì chỉ được **đợi**, không bị dừng.
- **User unit, không phải system unit.** Bật/tắt/xem log không cần sudo. Bù lại cần linger để
  chạy từ lúc boot mà không cần đăng nhập.

Không làm: không sửa `fleet_bridge`, không đổi giao thức, không thêm cơ chế thử lại thứ hai
(bridge đã tự thử lại backend).

## 3. Lệnh

| Lệnh | Việc |
|---|---|
| `robot fleet status` | Trạng thái unit, linger, bộ giám sát, chế độ hiện tại và lý do, kết nối backend gần nhất, số lần chạy lại, thư mục log |
| `robot fleet start` / `stop` / `restart` | `systemctl --user ... sct-fleet.service` |
| `robot fleet logs [-f]` | `journalctl --user -u sct-fleet.service` |
| `robot fleet [--commands]` | Như trước (chạy tay ở terminal), chỉ khi dịch vụ không chạy. Đang chạy thì bị từ chối kèm hướng dẫn |
| `robot status` | Thêm dòng `fleet` |

Khóa profile `FLEET_SERVICE_COMMANDS`: `auto` (mặc định, như trên) hoặc `off` (chỉ telemetry).

Log của bridge: `~/amr_logs/runs/<giờ>_fleet_service/ros_log` (mỗi lần dịch vụ khởi động một thư mục)
và journal của unit. Trạng thái máy đọc được: `~/.local/state/sct-robot/fleet-service.json`.

## 4. Kiểm thử

**Unit** (`robot/scripts/tests/test_robot_launcher.py`, bridge giả): chạy telemetry, chặn bridge
thứ hai và `robot fleet` tay, commands chỉ khi `nav --fleet` (không khi `nav` thường), chính
sách `off`, chạy lại khi bridge thoát, đợi NTP, đợi bridge lạ, dừng bridge sót của chính dịch
vụ, lệnh `start/stop/logs`, đọc `commands_enabled` từ `-p`, nội dung unit file.

**Đầu-cuối offline** (`robot/tools/fleet_service/offline_e2e.py`): bộ giám sát thật +
`fleet_bridge` thật của runtime + backend giả trên loopback; domain 89, discovery server giả,
profile/state tạm, mã robot `amr_e2e`. Kết quả 13/11/2026 trên MiniPC, runtime `1d15f555ad`,
chạy lúc robot thật đang chạy `nav --fleet` mà không ảnh hưởng nó:

| Kịch bản | Kết quả |
|---|---|
| Online khi không có Nav2 (Fleet Sync ACK, telemetry) | PASS |
| Chẩn đoán MiniPC tới backend | PASS |
| Telemetry không hỏi lệnh | PASS |
| `robot fleet` tay bị từ chối khi dịch vụ chạy | PASS |
| Backend sập → bridge thử lại, **không** chạy lại | PASS |
| Backend sống lại → nối lại trên cùng bridge | PASS |
| `robot nav --fleet` → chế độ commands, bắt đầu hỏi lệnh | PASS |
| Hết nav → về telemetry; luôn đúng một bridge | PASS |
| Bridge bị SIGKILL → chạy lại | PASS |
| SIGTERM → dừng sạch, không sót bridge | PASS |
| `--systemd`: unit tạm, SIGKILL bộ giám sát → systemd chạy lại, vẫn một bridge | PASS |

Lần chạy đầu bắt được hai lỗi đã sửa: chạy qua `ros2 run` làm bridge mồ côi khi tiến trình trung
gian bị kill; và bridge thật của robot (domain 30) làm bộ giám sát trong phép thử đứng đợi. Đợi
là đúng; phép thử giờ dùng thư mục proc rỗng cho phần đó.

**Chưa kiểm được offline:** khởi động lại thật MiniPC (thứ tự boot, linger, mạng lên muộn) và
backend thật.

## 5. Cài lên MiniPC (cần đồng ý; chưa làm)

1. Cài launcher có tính năng này (`robot/scripts/stage-runtime <commit> --tools-only`, đổi link
   `~/.local/bin/robot`; `robot/docs/runtime-deploy.md`).
2. Tắt `robot fleet` đang chạy tay (nếu có).
3. `robot/scripts/install-fleet-service` (thêm `--dry-run` để xem trước). Script copy unit,
   `daemon-reload`, `enable --now`, rồi in lệnh linger nếu chưa bật.
4. Một lần: `sudo loginctl enable-linger sativa`.
5. Kiểm: `robot fleet status` cho thấy `connected`; web hiện robot online khi Nav2 chưa chạy.
6. Kiểm boot: `sudo reboot`, **không SSH**, mở web: robot online trong khoảng 1–2 phút. Sau đó SSH
   vào chạy `robot fleet status`.
7. Kiểm mạng: tắt Wi-Fi 1 phút rồi bật lại: `robot fleet status` từ `retrying` về `connected`,
   số lần chạy lại không tăng.
8. Kiểm luồng web: `robot nav --fleet` → `robot fleet status` cho thấy `commands`; Tour chạy;
   Ctrl+C nav → `telemetry`.

Gỡ: `robot/scripts/install-fleet-service --uninstall`; linger để nguyên cũng không sao.
`~/amr_logs/routes/run_route.sh` (script cục bộ) đang từ chối khi thấy **bất kỳ** fleet_bridge
nào. Khi cài dịch vụ, cần sửa nó để chỉ từ chối bridge đang nhận lệnh.

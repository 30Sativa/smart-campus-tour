# R3: sẵn sàng chuyển DDS S1–S3, kiểm tra ngày 17/10/2026

**Kết luận: có thể triển khai S1–S3 khi robot đứng yên trong phòng; không cần
định vị đúng trên map2 trước.** Cần một phiên bảo trì để dừng/khởi động lại
stack và quyền sudo đổi service. Lượt này chỉ review, kiểm tra chỉ đọc và sửa
script trên branch R3; chưa triển khai cô lập DDS lên runtime.

Source `c4abcf3` used for the reviewed stage scripts was present in the local
MiniPC checkout at the time, but was not on GitHub `main` or a published
branch. A future operator must verify that exact commit is available before
using these commands; the dirty runtime checkout at `1cc5b33` is not a
substitute.

Kết luận này thay thế đề xuất trước đó yêu cầu AMCL chấp nhận Initial Pose
trước S1–S3. Initial Pose hợp lệ là bài nghiệm thu localization sau này,
không phải điều kiện của transport DDS. Báo cáo này không kết luận rằng
navigation đã được nghiệm thu.

## Trạng thái MiniPC thực tế

Ảnh chụp kiểm tra khoảng 16:10 +07 trên MiniPC:

| Thành phần | Thực tế và hệ quả |
|---|---|
| Checkout runtime `$HOME/smart-campus-tour` | Branch `main`, HEAD `1cc5b33`, 2283 dòng status, trong đó đã có rất nhiều build output được stage từ trước. Không reset, merge, build lại toàn bộ hoặc commit checkout này để triển khai R3. |
| Checkout R3 `$HOME/sct-dds-r3` | Sạch ở `483fcb8` khi bắt đầu review. Chỉ đồng bộ bản sửa R3 vào worktree này; script chạy trực tiếp từ đây. |
| Overlay Nav2 V1 | `$HOME/.cache/armtc/smoothws/install`, symlink tới `$HOME/sct-nav-smooth`, HEAD `73b8630`. Commit sau `dfcf889` chỉ sửa tài liệu; các package/file V1 được kiểm vẫn không đổi. |
| Overlay debug thực sự đang dùng | `$HOME/.cache/armtc/r3_runtime_review_20261017/install`; portable bridge 3.6.0; guard protocol v2. Không dùng lại overlay S0a cũ chỉ vì thư mục còn tồn tại. |
| Helper runtime | `robot/scripts/source-minipc` trong checkout runtime còn là bản cũ, thiếu các chặn S1/S2/S3. Helper trong R3 không tự tìm `.env` runtime: cần chọn runtime root rõ ràng như bên dưới. |
| DDS | Domain 30, Fast DDS, discovery `127.0.0.1:11811`, `ROS_LOCALHOST_ONLY=0`; service gốc không có drop-in. Server và node còn socket trên LAN/Tailscale. Checker: **NOT ISOLATED, 22 FAIL, 1 WARN**, đúng trạng thái trước S1. |
| CLI daemon | PID 158550, domain 30, `LOCALHOST_ONLY=0`, `ROS_SUPER_CLIENT=TRUE`. Phải dừng trước chuyển bậc; không để daemon này sống qua S2. |
| Điều khiển | Nav2 launch PID 163567, AMCL 163595, controller 163603. Launch map2, camera=false, rviz=false, params smooth V1. Không có explorer hoặc stop_navigator trong snapshot. |
| Quyền vận hành | SSH key hoạt động. `sudo -n true` không được cấp: cần người vận hành có sudo trong phiên triển khai. Không đổi sudoers, SSH hay mạng để vượt qua điều này. |
| Phần việc khác | `quest-stream.service`, `mediamtx.service`, Tailscale và mạng vẫn chạy. Không dừng chúng; không dùng apt khi còn vấn đề DKMS đã ghi trong runbook. |

Probe chỉ subscribe topic và gọi lifecycle `GetState` (chỉ đọc), trong 12 s:

- Scan 133 mẫu, odom 221 mẫu, wheel odom 440 mẫu; map, URDF và static TF nhận
  được. Hash map/URDF trùng lượt review trước.
- `odom -> base_footprint` và các TF của model có dữ liệu. Không có
  `map -> odom`; `amcl_pose` chưa có mẫu. Không phát pose/TF giả để làm xanh UI.
- map_server, AMCL, controller và local_costmap **active**; bt_navigator
  **inactive**. Planner chưa trả lời GetState trong cửa sổ đo. Đây là mốc
  trước chuyển đổi, không được dùng tiêu chí “mọi Nav2 node active” lúc chưa
  có localization.
- cmd_vel quan sát được đều 0; wheel odom có twist 0. Mode là `explore`,
  emergency_stop_state=false: robot đang đứng yên không đồng nghĩa đã có
  inhibit điều khiển. Không phát hiện action status mẫu trong cửa sổ này;
  điều đó riêng lẻ không chứng minh không có goal đang chờ.
- Scan gap lớn nhất của probe khoảng 0.313 s; đây là thời gian callback trên
  máy đang chạy nhiều phần mềm, không phải phép đo publish latency hoặc
  benchmark bảo đảm navigation. Không yêu cầu threshold navigation B2 trước
  khi có localization.

## Điều kiện thực sự phải có trước khi chuyển

1. **Phiên bảo trì được thông báo**, robot đứng yên, không có goal/teleop/
   nguồn tự gửi lệnh hoặc thành viên khác dùng DDS trực tiếp. Dừng viewer và
   công cụ đo, bag nếu có, launch debug rồi Nav2 bằng SIGINT đúng tiến trình
   sở hữu. Không dùng `pkill python`, không khởi động lại cả máy. Giữ SSH
   phục hồi riêng và khả năng dừng tại chỗ. Script chuyển bậc chỉ xác nhận
   tiến trình đã dừng, không chứng minh an toàn cơ khí hay sở hữu goal.
2. **Ghim đúng code và runtime**: dùng script R3 đã review, cùng native
   install + overlay V1 hiện tại. Chỉ terminal debug source thêm overlay R3
   và bridge portable. Không cần merge R3 vào checkout `main` bẩn, rebuild
   V1 hoặc cài dependency mới để đổi DDS.
3. **Có quyền sudo và bản sao cấu hình trước đổi**: `.env`, unit/drop-in
   hiện hành, revision, hash params và lệnh launch thực sự. Lưu ngoài Git
   trong session mới dưới `$HOME/amr_logs/runs/`, quyền hạn chế vì `.env` có
   thể có thông tin máy. Không ghi đè session Nav2/Quest đang dùng.
4. **Dừng cả CLI daemon** bằng `ros2 daemon stop` trong môi trường domain 30
   hiện tại. Chốt chặn mới từ chối nếu còn ROS process, kể cả daemon hay
   middleware khác. Mở terminal mới, source lại `.env` sau từng lần đổi;
   sửa file không thay môi trường tiến trình đã chạy.
5. **Thứ tự và rollback đã chuẩn bị**: original → S1 → S2 → S3; sau mỗi bước
   kiểm dữ liệu thật và socket, lỗi thì dừng ở đó. S1 tương thích cả hai giá
   trị localhost-only, nên là điểm trung gian cho cả triển khai và rollback.

S0b hiển thị, read-only bridge, SSH/reconnect/cleanup và sự tương ứng map/model
đã có bằng chứng robot thật ở lượt trước. Không cần lặp toàn bộ S0b, mở goal
để thử guard, làm bag dài, giả lập mất Wi-Fi hoặc làm Initial Pose để cho phép
bắt đầu S1. Sau restart vẫn phải kiểm ngắn các dữ liệu này vì môi trường mới
có thể bị source sai.

## Dùng helper R3 với install V1 hiện tại

Mỗi terminal **Nav2/inspection trên MiniPC** trong phiên chuyển đổi:

```bash
export ROBOT_RUNTIME_ROOT="$HOME/smart-campus-tour/robot"
source "$HOME/sct-dds-r3/robot/scripts/source-minipc"
source "$HOME/.cache/armtc/smoothws/install/setup.bash"
unset ROS_SUPER_CLIENT
```

Helper đọc đúng `.env` và install ở runtime root được chọn, không đụng file
trong checkout cũ. Kiểm trên MiniPC ở shell inspection riêng đã xác nhận
robot_navigation và robot_control vẫn resolve vào smoothws. Không source
install R3 vào terminal Nav2.

Chỉ trong **terminal debug**, sau đoạn trên:

```bash
source "$HOME/.cache/armtc/r3_runtime_review_20261017/install/setup.bash"
source "$HOME/.local/opt/foxglove-bridge-3.6.0/env.sh"
ros2 launch robot_navigation debug_bridge.launch.py robot_id:=robot_01
```

Lệnh Nav2 giữ đúng như runtime đã chụp, chỉ chạy lại trong phiên bảo trì:

```bash
ros2 launch robot_navigation navigation.launch.py \
  robot_id:=robot_01 map:="$ROBOT_MAP_DIR/map2.yaml" \
  enable_camera:=false rviz:=false \
  nav2_params_file:="$HOME/.cache/armtc/smoothws/install/robot_control/share/robot_control/config/nav2_params_smooth.yaml"
```

Các lệnh này là hướng dẫn chuyển đổi; lượt review này không chạy chúng.
Lệnh laptop vẫn là `amr-rviz --r3 -f odom`; map chưa định vị có thể được nhận
nhưng không có overlay map/scan đúng trong cùng Fixed Frame. Không đổi
`amr-rviz` mặc định trong lượt này. Từ S2, lệnh legacy sẽ không kết nối được
đến robot cho đến khi rollback DDS hoàn toàn; cần báo rõ cho người vận hành.

## Trình tự chuyển và tiêu chí đứng yên

Lệnh dưới chạy trên MiniPC. Trước **mỗi hàng**: dừng các ROS process và daemon;
sau đổi: dùng terminal mới với helper ở trên, khởi động đúng V1 và debug,
kiểm dữ liệu, rồi mới sang hàng kế. S2 cũng cần stop/restart, dù không đổi
service. Không restart network/SSH/Quest và không gửi goal/velocity/pose.

| Bước | Thay đổi được phép trong phiên triển khai | Điều kiện để đi tiếp |
|---|---|---|
| S1 | `sudo "$HOME/sct-dds-r3/robot/scripts/discovery-server-stage" s1` | Command line server thực sự có `-l 127.0.0.1 -p 11811`; `.env` vẫn 0. Dữ liệu cục bộ/R3 trở lại như mốc trước. Server vẫn bind LAN: **chưa cô lập**. |
| S2 | Chỉ đổi `ROS_LOCALHOST_ONLY=1` trong `$HOME/smart-campus-tour/robot/.env`; giữ domain, RMW và discovery như cũ | Mọi ROS process được khởi động mới có localhost-only=1; checker không còn FAIL cho node, còn FAIL server do S1. Topic thật/TF cục bộ vẫn nhận được. Không giữ daemon/node cũ rồi chỉ export biến trong shell. |
| S3 | `sudo "$HOME/sct-dds-r3/robot/scripts/discovery-server-stage" s3 --env "$HOME/smart-campus-tour/robot/.env"` | Checker trả **ISOLATED, exit 0** khi stack đang chạy; server và data sockets chỉ loopback theo kiểm tra. Map/static/model replay và scan/odom/TF qua R3 vẫn được, robot domain 30 và laptop domain 42. |

Sau mỗi bước so số mẫu/freshness và trạng thái với mốc **chưa định vị**;
không chờ amcl_pose, map→odom, global costmap/plan hoặc bt_navigator active
để kết luận transport có hoạt động. Một graph list rỗng hoặc còn node cũ
không đủ kết luận: kiểm dữ liệu của topic đã biết, QoS và socket thực tế.
Ngược lại, chỉ thấy socket loopback hoặc ảnh cũ trong RViz cũng không đủ:
phải có scan/odom/TF mới và lịch sử map/model từ kết nối mới.

Sau S3 làm thêm một probe **subscriber chỉ đọc** trên laptop, dùng domain 30
và Discovery Server IP LAN robot trong process riêng, timeout hữu hạn: không
được nhận dữ liệu DDS trực tiếp trong khi topic tương ứng vẫn chạy trên
robot. Không dùng publisher/cmd_vel để thử đóng cổng. Kết hợp phép thử âm này
với checker và phép thử dương R3; “không nhận gì” riêng lẻ không chứng minh
cô lập. Có thể làm bag ngắn trên robot để xác nhận công cụ ghi local sau S3;
bag không phải điều kiện bắt buộc trước S1.

## Rollback và giới hạn của tự phục hồi

Vẫn dừng toàn bộ ROS process/daemon trước khi lùi cấu hình:

1. S3 → S1:
   `sudo "$HOME/sct-dds-r3/robot/scripts/discovery-server-stage" s1 --env "$HOME/smart-campus-tour/robot/.env"`.
   Giữ `.env=1` để kiểm lại nếu cần; S1 chạy được với cả 0 và 1.
2. Ở S1, đưa **chỉ** localhost-only về giá trị trước phiên (hiện là 0).
3. S1 → original:
   `sudo "$HOME/sct-dds-r3/robot/scripts/discovery-server-stage" original --env "$HOME/smart-campus-tour/robot/.env"`.
4. Terminal mới, source đúng V1, chạy lại cùng launch; kiểm scan/odom/TF,
   map/model và command legacy. Không cần Initial Pose hợp lệ để kiểm đã
   khôi phục transport. Không ghi đè `.env` bằng bản sao cũ nếu người khác đã
   sửa khóa khác trong phiên; đối chiếu trước khi phục hồi.

Nếu đang S2 thì bắt đầu từ bước 2; nếu chỉ S1 thì lùi original với `.env=0`.
Không đưa `.env` về 0 khi server vẫn S3 rồi khởi động node; không đưa server
về original khi `.env` còn 1.

Script tự lùi **service** khi restart/verify thất bại hoặc nhận INT/TERM/HUP
trong lúc thay đổi. Nó không sửa `.env`, không tự chạy Nav2 và không xác nhận
topic/AMCL end-to-end. Nếu check dữ liệu sau restart thất bại thì người vận
hành dùng thang rollback này. SIGKILL/mất điện không thể được trap: SSH lại,
đọc status, unit và `.env`. Nếu drop-in bị ghi dở/unknown, phục hồi bản sao
đã chụp trước; chỉ tiếp tục từ bậc đã xác định, qua S1. Không reboot như một
cách sửa discovery. Rollback có thể thất bại nếu systemd/host hỏng; script báo rõ,
không được tiếp tục khởi động stack mù.

## Sửa phần mềm và kiểm thử trong lượt review này

- `source-minipc`: runtime root tùy chọn, mặc định giữ hành vi cũ; chặn cả
  E1b thực tế (localhost-only=1 + server gốc), ngoài chặn LAN discovery và
  S3 + localhost-only=0 đã có.
- `discovery-server-stage`: từ chối CLI daemon cũ và ROS middleware khác;
  chỉ nhận drop-in nguyên dạng do nó sinh, tránh ghi đè cấu hình tùy biến;
  kiểm command line server đang chạy vì S1/gốc có socket tương tự nhau;
  phục hồi service khi bị ngắt, ngoài lỗi restart/verify đã được xử lý.
- Test regression tái hiện các lỗi bằng proc/systemctl/ss giả. Không gọi
  systemctl restart thật để “kiểm thử rollback” trong lượt chỉ review.
- Suite R3 tools/scripts/robot_navigation: **162 passed** (trước: 148).
  `bash scripts/verify robot`: **exit 1**; build chạy, native summary
  280 tests, 0 errors, 7 failure records, 1 skipped. Các lỗi vẫn như review
  trước: test robot_control truy cập khóa cũ `/**/scan_filter_chain` và
  copyright thiếu ở 5 file robot_description (CTest ghi thêm suite failure).
  Ruff và standalone xacro bị skip, không tính là PASS. Không sửa V1 hay
  bỏ test để làm xanh gate. Đây không phải gate đã xanh để merge/release
  toàn repo, cũng không phải lỗi transport mới buộc phải đưa robot tới map
  trước khi đổi DDS.

Bằng chứng trên laptop, ngoài Git:
`$HOME/amr_logs/runs/20261017_160842_r3_dds_readiness_wb4ipby4/`.
`inventory-before.json`/`inventory-after.json` ghi cấu hình/PID/hash;
`stationary.json` và stderr là probe chỉ đọc;
`source-reviewed-real.log` là kiểm helper trên MiniPC trong shell riêng;
`r3-tests.log`, `verify-robot.log` là kiểm phần mềm. Không lưu bí mật `.env`
trong báo cáo; chỉ chụp khóa DDS và hash file.

## Các bài nghiệm thu được để sau

| Khi nào | Cần kiểm | Có chặn S1–S3 không? |
|---|---|---|
| Ngay trong/sau chuyển đổi, vẫn đứng yên ở phòng | Stop/restart systemd thật, rollback nếu lỗi; sockets/env, topic mới, R3 reconnect/latched history, local recorder và probe DDS âm | Là tiêu chí nghiệm thu từng bước; không thể bắt buộc có bằng chứng trước khi bước đó được thực hiện. |
| Tới vị trí biết trên đúng map, vẫn có thể đứng yên | Initial Pose → FORWARDED → ACCEPTED, map→odom, alignment scan/map, global costmap và Nav2 sẵn sàng | **Không**; bắt buộc trước nghiệm thu localization hoặc navigation. |
| Phiên chuyển động được cấp phép riêng | A→B→A/roam, FollowPath, latency khi robot vận hành, guard với goal thật | **Không**; chưa yêu cầu ở lượt này. |
| Phiên gián đoạn mạng được phối hợp riêng | Wi-Fi robot mất rồi hồi, ảnh hưởng Quest/SSH và dữ liệu nội bộ | **Không**; không tắt mạng trong phiên này. |

Trạng thái cuối của review: **READY FOR HARDWARE TEST — S1–S3 đứng yên**.
Giữ Baseline V1, runtime đang chạy và mặc định legacy nguyên trạng. Việc
cô lập được chấp nhận chỉ sau khi đo trên service và robot thật ở phiên
triển khai; review không phải bằng chứng S1–S3 đã thành công.

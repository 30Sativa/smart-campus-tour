# T0: kiểm tra 4 sonar SR04T thật (chỉ đo, không thay đổi gì trên robot)

Trạng thái 23/11/2026: **hướng dẫn, chưa chạy**. Không có kết quả nào trong file này là số đo;
mọi ô "kết quả" để trống cho tới khi đo.

T0 không cần nạp firmware, không cần deploy runtime, không chạy Nav2, không bật sonar guard. Nó
thay thế và chi tiết hoá H1–H4 của `sonar-perception.md` mục 8, và là bước 1 của đề xuất
`robot/docs/sonar-fb-status-proposal.md` (nhánh `feature/claude/sonar-fb-status`).

## 0. T0 trả lời câu hỏi nào

Mỗi câu hỏi dưới đây đang được thiết kế dựa trên **giả định**. T0 thay giả định bằng số đo.

| # | Câu hỏi | Đang giả định | Quyết định phụ thuộc |
|---|---|---|---|
| Q1 | SONAR1–4 gắn ở góc nào, trục hướng đâu? | 1=trước-trái +45°, 2=trước-phải −45°, 3=sau-trái +135°, 4=sau-phải −135° (`sensors.xacro`, "tạm") | TF; mọi phản ứng của guard |
| Q2 | Mỗi sonar được đo lại bao lâu một lần, có đều không? | 0.29–0.42 s (đọc từ `sr04t.c`) | `repeat_confirm`, heartbeat, có cần bộ đếm phép đo không |
| Q3 | Vật **gần hơn 0.20 m** làm module xuất gì? | thành "không echo" (`valid=0`) | toàn bộ cơ chế giữ vùng chết, mã `SHORT` trong FB |
| Q4 | Vật ở 0.05–0.10 m, tường phía sau 1–2 m: sonar báo tường hay "không echo"? | báo "không echo" | `blind_clear_range` (thả bộ nhớ) đúng hay sai |
| Q5 | Chùm thật rộng bao nhiêu? | ±15° (`sonar_field_of_view` 0.52) | độ rộng cung trong guard và memory |
| Q6 | Sàn có tạo echo giả không? Bao nhiêu? | không | số lần xác nhận, có dùng sonar được trên loại sàn đó không |
| Q7 | Sonar lành trong khoảng trống trông thế nào; sonar rút dây trông thế nào? | phân biệt được ở mức xung, không ở FB | mã `NO_PULSE`/`STUCK_HIGH`, chẩn đoán sonar chết |
| Q8 | Khung FB thật dài bao nhiêu byte? | ≤ 226 B (test host) | kích thước `PROTOCOL_TX_BUFFER_SIZE` nếu thêm trường |
| Q9 | 4 module có giống nhau không? Có nhiễu chéo không? | giống; đo tuần tự nên không chéo | một bộ tham số chung hay riêng |

## 1. An toàn và điều kiện

**Đã biết trước:** phiên 20/11 13:40 (`~/amr_logs/runs/20261120_1340_alm_hw/REPORT.md`) thấy **cả 4
sonar invalid** cùng lúc IMU câm, nghi rail cảm biến mất nguồn cùng nguồn động lực (chưa xác minh).
Nếu T0.0 lại cho 0 % hợp lệ ở **cả 4** sonar trong phòng có tường trong 1–2 m: dừng T0, đó là vấn đề
nguồn / dây, việc của người phụ trách phần cứng, không phải dữ liệu về module.

- Robot **đứng yên trên sàn**, không chạy `robot nav`, `robot manual`, teleop, gamepad. Người đi kèm
  cầm E-stop như mọi phiên (quy tắc từ 10/11).
- Công cụ chính (`sonar_watch.py`) đọc cổng serial **trực tiếp** và **không gửi byte nào**: firmware ở
  `TIMEOUT`, động cơ không nhận xung STEP, contactor giữ nguyên trạng thái. Nó tự từ chối chạy khi
  `stm32_bridge_node` đang chạy (chỉ một chương trình được đọc cổng).
- `sct-fleet.service` (fleet_bridge) không dùng cổng serial, để nguyên.
- Chạy công cụ thẳng từ worktree, **không cài, không đổi runtime**:
  `python3 ~/sct-sonar-perception/robot/tools/sonar/sonar_watch.py ...`
- Các bước có dấu ⚡ cần **tắt nguồn** trước khi chạm dây (rút connector, kẹp đầu dò). Ai làm, khi
  nào, do người phụ trách phần cứng quyết định; agent không làm.
- Lưu mọi thứ ở `~/amr_logs/runs/<YYYYMMDD_HHMM>_sonar_t0/` (CSV, raw, ảnh bố trí, ghi chú).

## 2. Thiết bị

| Loại | Cụ thể | Dùng cho |
|---|---|---|
| Có sẵn trên robot | MiniPC, STM32, 4 SR04T; `sonar_watch.py` (mới, chỉ đọc FB); `check_fb.py` (firmware/scripts, chỉ đọc) | mọi bước FB |
| Có sẵn, cần stack ROS | `robot manual` (runtime hiện tại) + `sonar_check.py` | chỉ T0.10: so TF với số đo |
| Dụng cụ thường | thước dây, tấm bìa phẳng ~20×20 cm, hộp thấp (≤ 0.3 m cao), vật trụ 3–5 cm (chân ghế), băng dính đánh dấu sàn, êke / thước đo góc (hoặc vạch góc vẽ trên giấy) | T0.1–T0.8 |
| **Thiết bị ngoài** (chưa chắc có) | bộ phân tích logic ≥ 1 MHz (loại 24 MHz rẻ là đủ) hoặc oscilloscope 2 kênh, đầu dò chịu 5 V | T0.9: phân biệt O1/O4, chữ ký sonar lành / hỏng ở mức xung |

Không có thiết bị ngoài thì **bỏ T0.9 và ghi "chưa đo"**. Khi đó Q3 chỉ trả lời được một nửa
(xem mục 5), Q7 không trả lời được.

## 3. Các bước

Quy ước chung:
- Khoảng cách đo **từ mặt đầu dò**, dọc trục danh nghĩa của sonar đang thử (đánh dấu trục bằng băng
  dính trên sàn từ T0.6 trở đi).
- Trong chùm không có gì khác trong 1.5 m, trừ bước có tường.
- Mỗi vị trí giữ yên ≥ 10 s: `--seconds 12` (≈ 30 phép đo của mỗi sonar).
- Mỗi lệnh ghi một dòng/sonar vào cùng file CSV với `--label` mô tả vị trí:

```bash
cd ~/amr_logs/runs/<phiên>_sonar_t0
W=~/sct-sonar-perception/robot/tools/sonar/sonar_watch.py
python3 $W --seconds 12 --csv t0.csv --raw raw.log --label "T0.2 s1 board 0.15"
```

| Bước | Làm gì | Ghi / nhìn gì | Trả lời |
|---|---|---|---|
| **T0.0** | Khởi đầu: `python3 robot/firmware/stm32/motor_controller/scripts/check_fb.py /dev/ttyACM0 5` (nó chờ 33 trường; 28 trường cũng bình thường nếu firmware ALM chưa có encoder), rồi `sonar_watch.py --seconds 30 --label "T0.0 empty"` với mọi phía trống ≥ 1.5 m | số trường FB thật (28 hay 33), khung/s, `line bytes max`; mỗi sonar: `chg/s`, `valid`, `same max s` | Q2, Q8, nền cho Q7 |
| **T0.1** | Ánh xạ kênh: bìa ở 0.50 m trước **từng góc** lần lượt (trước-trái, trước-phải, sau-trái, sau-phải), các góc khác trống | sonar nào đổi sang ≈ 500 mm; **không** giả định SONAR1 là trước-trái | Q1 (kênh) |
| **T0.2** | Dải gần, một sonar đầy đủ (bắt đầu trước-trái): bìa vuông góc trục ở 0.50, 0.40, 0.30, 0.25, 0.22, 0.20, 0.18, 0.15, 0.12, 0.10, 0.08, 0.05 m và sát (~0.02 m) | `valid`, `median`, `top values` mỗi vị trí | Q3 (mức FB) |
| **T0.3** | Như T0.2 với hộp thấp và vật trụ ở 0.40, 0.25, 0.15, 0.10, 0.05 m | như trên | Q3 với vật thật |
| **T0.4** | Bìa ở 0.10 rồi 0.05 m, **tường hoặc tấm lớn phía sau** ở 1.0 m rồi 2.0 m (4 tổ hợp) | sonar báo ≈ tường (≥ 600 mm) hay `INVALID` | Q4 |
| **T0.5** | `--events --seconds 40`: kéo bìa thật chậm từ 0.40 m vào sát rồi ra lại 0.40 m | thứ tự giá trị khi vào và khi ra; có trễ (hysteresis) không; giá trị cuối cùng trước `INVALID` | Q3 động, `hold_trigger` |
| **T0.6** | Góc chùm và trục: vật trụ ở 0.50 m trên trục danh nghĩa, rồi dịch **ngang** mỗi 5 cm sang hai bên (giữ khoảng cách tới đầu dò ≈ 0.50 m) tới khi mất phát hiện; lặp ở 1.0 m | biên trái / phải mà sonar còn báo ≈ khoảng cách; nửa góc = atan(biên/khoảng cách); trục thật = giữa hai biên, so với hướng danh nghĩa | Q5, Q1 (hướng) |
| **T0.7** | Sàn: robot giữa khoảng trống, `--seconds 30`, trên **từng loại sàn của tuyến**; thêm một lần trong hành lang (tường bên 0.5–0.8 m) | echo hợp lệ < 1 m khi không có vật = echo giả; tỉ lệ | Q6 |
| **T0.8** | Nhiễu chéo và độ đồng đều: bìa trước một sonar ở 0.25 m, xem 3 sonar kia; lặp T0.2 rút gọn (0.25, 0.15, 0.10 m, trống) cho 3 sonar còn lại | sonar khác có đổi giá trị không; 4 module có cùng hành vi gần không | Q9 |
| **T0.9** ⚡ | *(Thiết bị ngoài)* Kẹp TRIG/ECHO của **một** sonar (khi tắt nguồn, đo mức điện áp ECHO trước), ghi trong T0.0, T0.2, T0.4; tuỳ chọn rút connector sonar đó khi tắt nguồn rồi bật lại | độ trễ TRIG→sườn lên, độ rộng xung, có xung hay không, xung dài hơn 45 ms không; phân loại O1–O5 (mục 5) | Q3 đầy đủ, Q7 |
| **T0.10** | *(Tuỳ chọn, cần stack ROS hiện có)* `robot manual`, bìa ở 0.50 m trên trục mỗi góc, `python3 ~/sct-sonar-perception/robot/tools/sonar/sonar_check.py --seconds 10 --expect sonarN=0.50` | đúng topic phản ứng; TF yaw in ra khớp hướng đo ở T0.6 | Q1 trên đường ROS |

Lưu ý T0.10: runtime hiện tại publish `NaN` cho echo > 2.0 m (`sonar_max_range` mặc định); dùng
`sonar_watch.py` cho mọi phép đo xa. Tắt `robot manual` trước khi quay lại `sonar_watch.py`.

## 4. Biểu mẫu

`t0.csv` do công cụ ghi (một dòng mỗi sonar mỗi lần chạy): `label, sonar, seconds, frames,
changes_per_s, valid_share, min_mm, median_mm, max_mm, longest_same_s, top_values, fb_fields,
fb_line_max_bytes`. Ghi tay thêm vào `notes.md`:

| label | sàn / bố trí | vật | khoảng cách thước (m) | tường phía sau (m) | ảnh | T0.9 (nếu có): trễ µs, rộng µs, có xung % |
|---|---|---|---|---|---|---|
| | | | | | | |

## 5. Không được kết luận quá số đo

- Chỉ có FB (không có T0.9): `INVALID` dưới 0.20 m **không** cho biết module không thấy vật (O4) hay
  thấy mà xung quá ngắn (O1): firmware gộp cả hai. Ghi "O1 hoặc O4".
- Một giá trị lặp lại đúng y hệt quanh 200–250 mm bất kể vật gần cỡ nào là dấu hiệu O2 (kẹp ở tầm
  tối thiểu); giá trị xa hơn thật (≈ 2d, 3d) là O3. Hai cái này thấy được ngay ở FB.
- `chg/s` là **cận dưới** của tần số đo: hai phép đo bằng nhau liên tiếp không hiện thành thay đổi.
  Chỉ T0.0 (khoảng trống thường cho cùng giá trị) và T0.5 (giá trị đổi liên tục) mới cho tần số gần
  đúng.
- Một lần thử của một module không nói gì về 3 module kia (T0.8).
- Kết quả trên một loại sàn không áp cho loại khác (T0.7).

## 6. Quyết định theo kết quả

Kết quả T0 đi vào đâu. Mỗi dòng ghi **khuyến nghị hiện tại khi chưa có số đo** để so; quyết định thật
viết lại sau khi có số, vào `sonar-perception.md` mục 7–8 và đề xuất FB.

### 6.1 Cơ chế bộ nhớ vùng chết (`sonar_memory`)

| Kết quả | Hành động |
|---|---|
| T0.4: có bìa ở 0.05–0.10 m mà sonar vẫn báo tường ≥ 600 mm | `blind_clear_range: 0` (không bao giờ thả nhờ echo dài của chính nó; chỉ sonar khác nhìn xuyên hoặc robot đi xa mới thả). Ghi rõ: vật được dọn khi robot đang dừng sát sẽ dẫn tới ABORTED → Retry. |
| T0.4: luôn `INVALID` khi có bìa gần | giữ 0.60 m; nếu T0.5 cho thấy echo dài chỉ xuất hiện khi bìa đã ra xa > X, đặt `blind_clear_range` ≥ X + 0.1 |
| T0.5: giá trị cuối trước `INVALID` thường lớn hơn 0.30 m (mất sớm) | tăng `hold_trigger` lên giá trị đó + 0.1 m, kiểm lại mô phỏng `low_turn*` |
| T0.2/T0.3: O2 (kẹp ở ~0.21–0.25 m) | coi echo hợp lệ dưới ngưỡng kẹp + 0.02 m là "rất gần": bridge (hoặc memory) giữ ngay, không cần đợi `INVALID` |
| T0.7: echo giả trên sàn ≥ vài % phép đo | `confirm` 2 → 3 phép đo; nếu một loại sàn cho echo giả liên tục ở < 0.5 m thì **không** dùng sonar trên tuyến đó (ghi vào giới hạn) |
| T0.6: nửa góc chùm thật khác 15° quá 5° | đặt `sonar_field_of_view` của bridge = 2 × nửa góc đo được (một tham số chung nếu T0.8 cho 4 module giống nhau); chạy lại mô phỏng `clean` (khung cửa) để chắc không dừng oan |
| T0.1/T0.6: kênh hoặc hướng khác URDF | sửa `sensors.xacro` (một thay đổi riêng, có review) **trước** mọi bước shadow/enforce |
| Q2: tần số đo < 2 lần/s hoặc khoảng hở > 0.6 s | tăng `repeat_confirm` và `confirm_window` theo số đo |

Khuyến nghị hiện tại: giữ cơ chế suy luận như trên nhánh (`hold_trigger` 0.40, xác nhận 2 phép
đo, `blind_clear_range` 0.60, FOV 0.52) cho tới khi có T0.

### 6.2 Trạng thái FB (đề xuất `sonar-fb-status`, chưa làm)

| Kết quả | Hành động |
|---|---|
| T0.9 cho O4 (vật gần không tạo xung khác "không có vật") | mã `SHORT` vô ích cho phần "quá gần": **không** làm phần (b). Vẫn cân nhắc phần (c) và bộ đếm |
| T0.9 cho O1 | `SHORT` có giá trị thật: host giữ ngay khi `SHORT` (bỏ được giới hạn 2 "vật lọt vùng chết từ bên hông") |
| T0.9: sonar lành trong khoảng trống có xung dài, sonar rút dây không có xung | `NO_PULSE` phân biệt được "hỏng" với "không có vật": làm phần (c) |
| T0.9: sonar lành cũng không có xung | (c) chỉ còn `STUCK_HIGH`; chẩn đoán sonar chết vẫn chỉ bằng kiểm trước phiên (T0.1 rút gọn) |
| Không có thiết bị cho T0.9 | **chưa quyết** phần (b)/(c). Bộ đếm phép đo vẫn có thể quyết riêng (dòng dưới) |
| T0.0/T0.5: `same max s` hay tần số cho thấy heartbeat 0.2 s làm lẫn phép đo mới với gửi lại (vd. mô phỏng đã cần sửa `repeat_confirm`) | bộ đếm phép đo đáng làm: stamp đúng lúc đo, xác nhận đếm đúng số phép đo |

Khuyến nghị hiện tại: chưa đổi firmware. Nếu sau T0 chỉ còn lý do "bộ đếm", làm riêng bộ đếm
(4 trường) trước, mã kết quả sau, mỗi lần một thay đổi.

### 6.3 Kích thước bộ đệm TX

| Kết quả | Hành động |
|---|---|
| Không thêm trường FB | **không đổi** `PROTOCOL_TX_BUFFER_SIZE` (256 B). T0.0 chỉ để xác nhận khung thật (`line bytes max`) nằm dưới mức xấu nhất 226 B của test host |
| Thêm 8 trường (mã + bộ đếm) | khung xấu nhất 240–250 B, còn 5 B: **tăng lên 320 B** cùng lúc (+128 B RAM trên 32 KB), sửa test host giữ giới hạn mới |
| Chỉ thêm bộ đếm (4 trường, ≤ +16 B) | vẫn vừa 256 B (còn ~13 B) nhưng lần thêm sau sẽ chạm trần: vẫn khuyến nghị 320 B khi đã phải sửa firmware |
| T0.0: `line bytes max` > 226 B hoặc thấy dòng bị dán / thiếu `\r\n` (dòng FB có số trường lạ trong `fields`) | lỗi hiện có, **báo ngay**, sửa trước mọi trường mới |

### 6.4 Tương thích firmware cũ

Quy tắc đã có (`PROTOCOL_FB.md`): chỉ thêm ở cuối, bridge đọc theo số trường tối thiểu. Hệ quả:
- Bridge mới + firmware cũ (không có mã/bộ đếm): không có mã/bộ đếm → dùng đúng đường hiện nay (suy luận
  theo giá trị, stamp lúc nhận). `sonar_memory` phải tự nhận biết nguồn nào có mã (đề xuất mục 7.1).
- Bridge cũ + firmware mới (thêm 8 trường): bridge cũ bỏ qua trường lạ ở cuối (`stm32_bridge_node.py`
  đọc vị trí, không khớp độ dài). Phải kiểm bằng test với khung 41 trường **trước** khi nạp.
- Firmware đang nạp trên robot: 20/11 ghi nhận bản có ALM (28 trường); bản encoder (33 trường) đã merge
  sau đó nhưng **chưa xác nhận đã nạp**. T0.0 in ra số trường thật. Nhánh `sonar-perception` chỉ đọc
  4 cặp sonar ở trường 8–15, nên chạy được với cả hai, không cần nạp.
- Khuyến nghị: không nạp firmware sonar mới cho tới khi (1) T0 cho lý do cụ thể, (2) có test cả hai
  chiều tương thích, (3) có lịch nạp bằng ST-Link do người làm (ADR-0002).

### 6.5 Cổng sang shadow / enforce

T0 xong và Q1 đúng (kênh, hướng) là điều kiện **cần** để chạy `--sonar shadow` (cần stage runtime
mới: chưa làm, cần cho phép). `enforce` cần thêm H5 shadow trên tuyến và cho phép riêng.

## 7. Sau khi đo

1. Chép `t0.csv`, `notes.md`, ảnh vào thư mục phiên; không commit dữ liệu đo vào repo.
2. Điền bảng kết quả rút gọn (mỗi Q một dòng: số đo, kết luận, quyết định ở mục 6) vào
   `sonar-perception.md` mục 8 và vào đề xuất FB.
3. Nếu có thay đổi tham số: một commit mỗi thay đổi, chạy lại mô phỏng sonar
   (`robot/tools/nav2_bench/sim/sonar/`) với số đo mới (beam, vùng gần) trước khi lên robot.

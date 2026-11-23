# Đề xuất: trạng thái và số thứ tự phép đo sonar trong khung FB

Trạng thái 23/11/2026, nhánh `feature/claude/sonar-fb-status` (tách từ
`feature/claude/sonar-perception` @ `ab6a2a0d`):
- **Chỉ là đề xuất.** Không có thay đổi code, firmware, cấu hình, service. Chưa nạp gì.
- Đọc trước: `sonar-perception.md` (RCA, guard, mục 8 H3/H4), `PROTOCOL_FB.md` (hợp đồng),
  `robot/AGENTS.md` mục 5 (firmware).
- Nạp firmware là việc **người làm bằng tay**, qua ST-Link (ADR-0002). Không có bước nào ở
  đây được tự chạy trên robot.

Quy ước đường dẫn (cho gọn): `Core/…`, `tests/…`, `scripts/…`, `docs/PIN_MAP.md`,
`motor_controller.ioc` nằm dưới `robot/firmware/stm32/motor_controller/`; `stm32_bridge/…` và
`test/test_sonar_status.py` dưới `robot/ros2_ws/src/stm32_bridge/`; `sonar_memory*.py` và
`config/sonar_collision_monitor.yaml` dưới `robot/ros2_ws/src/robot_navigation/`
(`robot_navigation/`); `sonar_check.py`, `sonar_shadow_report.py` dưới `robot/tools/sonar/`;
`range.cpp`, `polygon.cpp`, `range_sensor_layer.cpp` là mã nguồn Nav2 Humble 1.1.20 (bản cài
trên MiniPC). Số dòng theo commit `ab6a2a0d`.

## 0. Tóm tắt

| Câu hỏi | Trả lời ngắn |
|---|---|
| Vấn đề? | Firmware gộp ba thứ vào `valid=0, mm=0`: không có echo, echo ngắn hơn 200 mm, cảm biến hỏng (`sr04t.c:142`, `:228`). Mỗi giá trị cũ còn được gửi lại trong **mọi** khung FB (~40 Hz), không có số thứ tự. `sonar_memory` phải **đoán** "quá gần" và **đoán** đâu là phép đo mới. |
| Đề xuất firmware | Thêm **8 trường ở cuối** khung FB (vị trí 33–40): mỗi sonar một **mã kết quả** (7 giá trị, theo hình dạng xung ECHO) và một **bộ đếm phép đo** uint8. Trường 8–15 giữ **nguyên từng byte**. Thêm lệnh `SONAR,<seq>,<1-4>` (một dòng cho người đọc: độ rộng xung thô, độ trễ sườn lên, đếm từng loại kết quả). Chỉ sửa file người viết (`sonar/sr04t.c/.h`, `usb_protocol.c`, test); **không** file nào do CubeMX sinh, `.ioc` không đổi. |
| Bridge | FB < 41 trường: hành vi **y hệt hôm nay**. FB ≥ 41: stamp = lúc phép đo **mới** tới (sai ≤ ±½ chu kỳ FB, ~±12 ms), `range` theo REP-117: số đo / `-Inf` quá gần / `+Inf` không có echo / `NaN` lỗi; `/diagnostics` phát hiện sonar chết hoặc đứng. Bảng ánh xạ là **tham số**, chỉnh được không cần nạp lại. |
| `sonar_memory` | Giữ cung **ngay khi** sonar báo `-Inf` (không cần đoán), cả khi vật lọt vào từ bên hông; xác nhận "hai phép đo khớp" bằng phép đo thật thay vì heuristic 0.45 s; tra pose đúng thời điểm đo. `collision_monitor` không đổi gì về logic: ±Inf và NaN đều không sinh điểm. |
| Điều kiện trước tiên | **Đo xem JSN-SR04T thật xuất ra gì** cho vật ở 0.05–0.25 m (mục 3, bước T0, không cần nạp firmware). Theo nguyên lý một đầu dò vừa phát vừa thu, xung ngắn hơn thời gian chặn có thể **không bao giờ** xuất hiện: nếu vậy firmware **không thể** báo "quá gần" và phần (b) không làm được; phần (a)/(c) và bộ đếm vẫn có ích. |

## 1. Hiện trạng (đọc từ code, không phải đo)

### 1.1 Firmware `Core/Src/sonar/sr04t.c`

Mỗi chu kỳ: trigger một sonar (`:148–163`), chờ sườn lên rồi sườn xuống của ECHO qua EXTI
(`:204–230`, chân PULLDOWN, ngắt cả hai sườn), tính `d = w·343/2000` mm. Kết thúc bằng một
trong ba lệnh:

| Đường | Điều kiện | Ghi vào `readings[i]` |
|---|---|---|
| `:223` | có sườn lên và sườn xuống, 200 ≤ d ≤ 6000 mm (xung 1 166 µs – 35.0 ms) | `valid=1, mm=d` |
| `:228` | có sườn lên và sườn xuống, d < 200 **hoặc** d > 6000 | `valid=0, mm=0` |
| `:142` | hết 45 ms (~7.7 m) mà chưa kết thúc: **không có sườn lên** (không xung), **hoặc** có sườn lên mà chưa có sườn xuống | `valid=0, mm=0` |

Sau đó nghỉ 60 ms rồi sang sonar kế (`:8`, `:100`). Mỗi sonar được đo lại sau 0.29–0.42 s.
Khung FB (`usb_protocol.c:735–738`) đọc `readings[]` ở **mọi** khung, nên một phép đo xuất hiện
lại 10–16 lần.

Thông tin bị mất trên dây, dù firmware đã biết:
- xung ngắn (< 200 mm) khác xung dài (> 6000 mm) khác hết giờ;
- có sườn lên hay không (chân PULLDOWN: sonar rút dây / chết / mất nguồn thì **không bao giờ**
  có sườn lên, `PIN_MAP.md` mục 6);
- phép đo nào là mới.

### 1.2 Phía host

- `stm32_bridge_node.py:1035–1039` đọc 4 cặp `<mm>,<valid>`; `:1174–1197` publish mỗi khung
  một `Range`/sonar, stamp = lúc nhận khung, `NaN` nếu `valid=0` **hoặc** ngoài
  [`sonar_min_range`, `sonar_max_range`].
- `sonar_memory_core.py`: "phép đo mới" = giá trị đổi (`needs_pose`, `:94`); "đo hai lần" =
  giá trị đứng yên ≥ `repeat_confirm` 0.45 s (`:108`); "quá gần" = suy ra từ "echo gần đã xác
  nhận rồi chuyển thành NaN mà chỗ đó vẫn trước sonar" (`:114–127`). Vật lọt vùng chết từ bên
  hông (không có echo gần trước đó) **không** được giữ (`sonar-perception.md` giới hạn 2).
- `collision_monitor` Humble 1.1.20, nguồn Range (`range.cpp:81`): loại `range < min_range ||
  range > max_range`, tức loại `-Inf` và `+Inf`. **`NaN` không bị loại ở đây** (mọi so sánh với
  NaN đều sai), nhưng điểm NaN không bao giờ nằm trong polygon (`polygon.cpp:404–411`: phép thử
  tia cho NaN không bao giờ đảo kết quả), nên kết quả cuối cùng giống bỏ qua. Câu
  "NaN … bỏ qua (`range.cpp:81`)" ở `sonar-perception.md` mục 4.4 đúng về hệ quả, sai về chỗ.

### 1.3 Ngân sách khung FB

`PROTOCOL_TX_BUFFER_SIZE` = 256 B (`usb_protocol.c:24`); `vsnprintf` cắt ở 255 ký tự và cắt
mất `\r\n` (`:880`), host sẽ dán hai khung. Test hiện tại (`tests/test_usb_protocol.c:365–398`,
chạy lại 23/11 trên host): 168 B đo được + 48 B phần không lái được = **216 B**. Test giữ
`enc_*_terr` ở 5 chữ số; nếu tính cả trường này ở độ rộng tối đa (10 chữ số) thì **226 B**.
Còn 29 B.

## 2. Mục tiêu và ràng buộc

Mục tiêu: host phân biệt được
- (a) không có echo trong 0.2–6 m;
- (b) echo ngắn hơn `SR04T_MIN_DISTANCE_MM` (200 mm);
- (c) cảm biến hỏng (không phát xung, chân ECHO kẹt);
- và phép đo mới với giá trị gửi lại.

Ràng buộc (`robot/AGENTS.md`, `PROTOCOL_FB.md`):
1. Chỉ **thêm ở cuối** khung FB; không đổi nghĩa trường cũ. Bridge đọc theo số trường tối
   thiểu, mọi độ dài cũ (5 … 33) vẫn phải đọc được.
2. Sửa hợp đồng: `PROTOCOL_FB.md` trước, rồi test ở **cả hai** đầu trong cùng thay đổi.
3. `Core/` do CubeIDE quản lý: không sửa file CubeMX sinh, không sửa ngoài khối `USER CODE`.
   Mục 4.5 liệt kê chính xác file nào đổi.
4. Không đổi động cơ, watchdog, thời gian đo của sonar (khoảng nghỉ 60 ms, hết giờ 45 ms).
5. ADR-0001: sonar là cảm biến phụ; sonar hỏng **không** được chặn điều hướng. Phát hiện lỗi
   chỉ để giám sát và kiểm trước phiên.

## 3. Bước 0: đo xem JSN-SR04T thật xuất ra gì (T0, KHÔNG cần nạp firmware)

Thiết kế ở mục 4–7 có hay không có phần (b) là do kết quả này. Đây là phiên bản chi tiết của
H3/H4 trong `sonar-perception.md` mục 8, thêm một kênh "sự thật" đo thẳng trên chân ECHO.

### 3.1 Vì sao phải đo trước

JSN-SR04T dùng **một** đầu dò chống nước cho cả phát và thu. Sau khi phát, màng còn rung một
thời gian; module bỏ qua mọi thứ nhận được trong khoảng đó, nên mới có tầm tối thiểu ~20 cm.
Với vật gần hơn, các khả năng (chưa biết module của robot rơi vào cái nào):

| Mã | Module có thể xuất | Firmware hôm nay thấy | Firmware mới phân biệt được? |
|---|---|---|---|
| O1 | xung ngắn tỉ lệ với khoảng cách (< 1 166 µs) | `:228` → `valid=0` | **Có**: `SHORT` → `-Inf` |
| O2 | xung cố định ở tầm tối thiểu (ví dụ ~0.21–0.25 m), bất kể vật gần cỡ nào | `valid=1`, mm ≈ 210–250 | Không qua mã; host coi echo < ngưỡng kẹp là "≤ ngưỡng" (tham số bridge, mục 6.3) |
| O3 | echo phản xạ nhiều lần (≈ 2d, 3d) lọt sau thời gian chặn | `valid=1`, mm sai (xa hơn thật) | Không; chỉ biết để đặt ngưỡng thận trọng |
| O4 | không bắt được echo: xung dài kiểu "không có vật", hoặc hết giờ | `valid=0` | Không: giống hệt "không có vật". Phần (b) **không làm được** bằng firmware |
| O5 | lẫn lộn theo khoảng cách / loại vật | | lấy trường hợp xấu nhất mỗi dải |

Cũng chưa biết sonar **lành** trong khoảng trống xuất gì: xung dài (~35–40 ms), xung dài hơn
45 ms (firmware hết giờ khi chân còn cao), hay **không có xung**. Nếu là "không có xung" thì
"không có vật" và "rút dây" trông giống nhau và phần (c) chỉ còn bắt được chân kẹt cao.

### 3.2 Chuẩn bị

- Robot đứng yên, không chạy `nav`, không teleop; người đi kèm cầm E-stop như mọi phiên
  (quy tắc 10/11). Bridge chạy như H0 (`robot manual`, không ai gửi `cmd_vel`).
- Một bộ phân tích logic (24 MHz loại rẻ là đủ; lấy mẫu ≥ 1 MHz = 0.17 mm/mẫu) hoặc
  oscilloscope 2 kênh: kênh 0 = TRIG, kênh 1 = ECHO của **một** sonar, GND chung với mạch
  STM32. **Đo mức điện áp ECHO trước** (module cấp 5 V có thể ra 5 V); dùng đầu dò chịu được
  mức đó. Kẹp đầu dò khi robot **tắt nguồn**. Nếu không có thiết bị: vẫn làm được phần FB,
  nhưng chỉ phân biệt được O2/O3 với "O1 hoặc O4".
- Thước dây, tấm bìa phẳng ~20×20 cm, một hộp thấp (≤ 0.3 m cao), một vật trụ nhỏ (chân ghế
  3–5 cm). Đo khoảng cách **từ mặt đầu dò dọc theo trục danh nghĩa** của sonar đó.
- Trong chùm không có gì khác trong 1.5 m (trừ bước có tường).

### 3.3 Trình tự

Mỗi vị trí giữ ≥ 10 s (≥ 25 phép đo của sonar đó), chạy song song:
`python3 robot/tools/sonar/sonar_check.py --seconds 10` (công cụ có sẵn trên nhánh
`feature/claude/sonar-perception`, chỉ đọc) và ghi bộ phân tích logic.

| Bước | Nội dung | Ghi lại |
|---|---|---|
| T0.1 | Khoảng trống, không vật | xung lành "không có vật": có sườn lên không, độ trễ TRIG→sườn lên, độ rộng (hay > 45 ms) |
| T0.2 | Tấm bìa vuông góc trục ở 0.30, 0.25, 0.22, 0.20, 0.18, 0.15, 0.12, 0.10, 0.08, 0.05 m, và sát (~0.02 m) | FB: tỉ lệ hợp lệ, min/median/max; xung: độ trễ, độ rộng min/median/max, tỉ lệ không xung / hết giờ |
| T0.3 | Lặp T0.2 với hộp thấp và vật trụ ở 0.25, 0.15, 0.10, 0.05 m | như trên |
| T0.4 | (H4) Bìa ở 0.10 và 0.05 m, **tường phía sau** ở 1.0 m rồi 2.0 m | sonar báo tường (≥ 0.6 m) hay không: giả định `blind_clear_range` đúng/sai |
| T0.5 | Kéo bìa chậm từ 0.40 m vào sát rồi ra lại trong ~20 s | chuyển trạng thái, có trễ (hysteresis) không |
| T0.6 | Ba sonar còn lại: bìa ở 0.25 và 0.10 m, và khoảng trống | các module có giống nhau không |
| T0.7 | (Tuỳ chọn, **tắt nguồn trước**, chỉ khi connector tháo được) rút một sonar, bật lại | chữ ký "hỏng": dự kiến không có sườn lên (PULLDOWN) |
| T0.8 | (H2) giữa sảnh trống, trên từng loại sàn của tuyến, 30 s | tỉ lệ xung ngắn / echo < 1 m giả (để chọn số lần xác nhận ở mục 7.2) |

Bảng ghi (một dòng mỗi vị trí): `sonar | vật | d (m) | FB hợp lệ % | FB median mm | xung có/không % | trễ sườn lên µs | rộng µs min/med/max | hết giờ %`.
Lưu ở `~/amr_logs/runs/<phiên>_sonar_t0/` cùng file của bộ phân tích.

### 3.4 Quyết định theo kết quả

| Kết quả T0 | Hệ quả cho thiết kế |
|---|---|
| O1 ở mọi loại vật cho d < 0.2 m | bridge `sonar_short_is_too_close:=true` (→ `-Inf`); `sonar_memory` giữ trực tiếp khi có `-Inf` (mục 7.2) |
| O2 | bridge `sonar_too_close_below:=<ngưỡng kẹp + lề>`: echo hợp lệ ngắn hơn ngưỡng đó cũng là `-Inf` |
| O3 | không có cách đáng tin để biết "quá gần" từ một phép đo; tăng `hold_trigger` để giữ sớm hơn; ghi giới hạn |
| O4 | phần (b) không làm được; `sonar_memory` giữ cách suy luận hiện tại; firmware vẫn có ích cho (a)/(c) và bộ đếm |
| T0.1 có xung (dài, hoặc cao quá 45 ms) và T0.7 không xung | (c) làm được: chuỗi `NO_PULSE` = hỏng (mục 6.4) |
| T0.1 không có xung | (c) chỉ còn `STUCK_HIGH`; bridge `sonar_no_pulse_is_no_echo:=true`; kiểm H1 trước mỗi phiên vẫn là cách duy nhất bắt sonar chết |
| T0.4 sonar báo tường khi có bìa ở 0.10 m | `blind_clear_range:=0` (như H4 đã ghi) |
| Ngưỡng thời gian khác 1 166 µs / 35 ms tách rõ các trường hợp | đặt macro `SR04T_*` ở mục 4.2 theo số đo, không đoán |

## 4. Thiết kế firmware

### 4.1 Mã kết quả mỗi phép đo

Một phép đo kết thúc bằng **đúng một** mã (mã trên dây, uint8):

| Mã | Tên | Điều kiện trong firmware | Tương ứng hôm nay | `valid`, `mm` |
|---|---|---|---|---|
| 0 | `NONE` | chưa có phép đo nào từ lúc boot | (giá trị khởi tạo) | 0, 0 |
| 1 | `OK` | có sườn lên và xuống, 200 ≤ d ≤ 6000 | `:223` | 1, d |
| 2 | `SHORT` | có sườn lên và xuống, d < 200 (xung < 1 166 µs) | `:228` | 0, 0 |
| 3 | `LONG` | có sườn lên và xuống, d > 6000 (xung > 35.0 ms) | `:228` | 0, 0 |
| 4 | `HIGH_TIMEOUT` | có sườn lên, chưa có sườn xuống khi hết 45 ms | `:142` | 0, 0 |
| 5 | `NO_PULSE` | không có sườn lên trong 45 ms, chân ECHO thấp lúc trigger | `:142` | 0, 0 |
| 6 | `STUCK_HIGH` | chân ECHO **đã cao** ngay trước trigger và phép đo không thành `OK`/`SHORT`/`LONG` | `:142` | 0, 0 |

Bất biến (test bắt buộc): `valid=1 ⇔ mã = OK`; `mm ≠ 0 ⇒ mã = OK`; với **mọi** chuỗi sự kiện
ECHO, `valid`/`mm` giống hệt firmware hiện tại. Firmware chỉ mô tả **hình dạng xung**, không
nói "quá gần" hay "không có vật": ý nghĩa do host gán (mục 6.3) theo kết quả T0, đổi được mà
không nạp lại.

`STUCK_HIGH`: đọc mức chân ECHO trong `SR04T_Update` ngay trước khi kéo TRIG lên (một
`HAL_GPIO_ReadPin`, không đổi thời gian trigger). Vẫn trigger như cũ; cờ này chỉ đổi mã
`HIGH_TIMEOUT`/`NO_PULSE` thành `STUCK_HIGH`. Nó bắt cả chân chập lên nguồn lẫn module mà
xung "không có vật" dài hơn ~3 khe đo (nếu T0.1 thấy vậy thì `STUCK_HIGH` là "bận", không
phải "hỏng": bridge đọc bảng ở mục 6.3).

### 4.2 Bộ đếm phép đo

`sN_n`: uint8, cộng 1 (mod 256) **mỗi lần** `SR04T_FinishMeasurement` chạy cho sonar N, bất kể
mã, trong cùng đoạn ghi với `mm/valid/mã`. Boot: `n=0`, mã `NONE`; phép đo đầu tiên `n=1`.
Ở 2.4–3.8 phép đo/s mỗi sonar, vòng 256 dài ≥ 67 s, lâu hơn nhiều mọi khoảng hở FB mà bridge
còn coi là link sống (`feedback_timeout` 0.4 s).

Ngưỡng mới là macro (mặc định = giá trị hiện tại, nên build mặc định không đổi hành vi):
`SR04T_MIN_DISTANCE_MM` 200 và `SR04T_MAX_DISTANCE_MM` 6000 giữ nguyên; không thêm ngưỡng
"glitch" cho tới khi T0 cho số.

### 4.3 Trường FB mới (vị trí 33–40)

```
..., <enc_left_terr>,<enc_right_terr>,
     <s1_res>,<s1_n>,<s2_res>,<s2_n>,<s3_res>,<s3_n>,<s4_res>,<s4_n>
```

| Vị trí | Trường | Ghi chú |
|---|---|---|
| 33, 35, 37, 39 | `sN_res` | mã ở mục 4.1, 0–6 |
| 34, 36, 38, 40 | `sN_n` | bộ đếm ở mục 4.2, 0–255, tự tràn |

`mm/valid` (8–15) và `res/n` (33–40) của cùng một sonar phải lấy từ **một** lần đọc có khoá ngắt
(`SR04T_GetStatus`, mục 4.5), nếu không một phép đo kết thúc giữa hai lần đọc sẽ cho cặp lệch.

Độ dài: mỗi sonar thêm tối đa `,6,255` = 6 B → +24 B → khung xấu nhất **240 B** (cách tính của
test hiện tại) hoặc **250 B** (tính cả `enc_*_terr` 10 chữ số), dưới giới hạn 255. Còn 5 B: lần
thêm trường sau bắt buộc phải tăng bộ đệm. Đề xuất tăng luôn `PROTOCOL_TX_BUFFER_SIZE` lên 320
(2 bộ đệm × 64 B = +128 B RAM trên 32 KB; khung 216 B hiện đã đi qua 4 gói USB FS 64 B nên
dài hơn không đổi cơ chế) — câu hỏi mở 4.

### 4.4 Lệnh `SONAR,<seq>,<1-4>` (cho người đọc, bridge không gửi)

Theo mẫu `ALM`/`ENC`: không blocking, không dừng động cơ, không refresh watchdog. Trả một dòng:

```
SONAR,<seq>,S=<1-4>,NOW=<ms>,RES=<res>,N=<n>,W=<us>,RISE=<us>,AT=<ms>,
      OK=<k>,SHORT=<k>,LONG=<k>,HTO=<k>,NOP=<k>,STUCK=<k>
```

`W` = độ rộng xung của phép đo hoàn chỉnh gần nhất (µs, kể cả khi ngoài 200–6000 mm), `RISE` =
µs từ TRIG tới sườn lên, `AT` = HAL tick lúc phép đo gần nhất kết thúc, các bộ đếm uint32 từ lúc
boot. Xấu nhất ~165 B. Một sonar mỗi dòng để vừa bộ đệm hiện tại. Sai cú pháp →
`ERR,bad_command`. Firmware cũ trả `ERR,bad_command`. Đây là công cụ của T1 (mục 8): thay cho
bộ phân tích logic khi kiểm firmware mới.

### 4.5 File thay đổi (chính xác)

Không có file nào do CubeMX sinh phải sửa, không có khối `USER CODE` nào phải đổi:
- `Core/Src/main.c`: `/* USER CODE BEGIN 2 */` đã gọi `SR04T_Init()`; `App_Loop()` đã gọi
  `SR04T_Update()`. Giữ nguyên.
- `Core/Src/stm32g4xx_it.c`: `EXTI1/9_5/15_10_IRQHandler` gọi `HAL_GPIO_EXTI_IRQHandler`, rồi HAL
  gọi `HAL_GPIO_EXTI_Callback` (định nghĩa trong `sr04t.c`). Giữ nguyên.
- `motor_controller.ioc`: chân, EXTI hai sườn, PULLDOWN, ưu tiên ngắt giữ nguyên. Không cần
  generate lại. Không dùng ngoại vi mới (DWT đã dùng sẵn).

File người viết sẽ đổi (CubeMX không sinh và không ghi đè; cùng cách PR ALM #376 và encoder
`e77dcd08` đã làm với `usb_protocol.c`):

| File | Thay đổi |
|---|---|
| `Core/Inc/sonar/sr04t.h` | thêm enum mã (mục 4.1), `Sr04tStatus {mm, valid, res, n}`, `SR04T_GetStatus(i, *status)`, `SR04T_GetDetail(i, *detail)` cho lệnh `SONAR`. Giữ `SR04T_GetReading` (API cũ) |
| `Core/Src/sonar/sr04t.c` | `readings[]` thêm `res`, `n`, độ rộng thô, độ trễ sườn lên, tick kết thúc, 6 bộ đếm; `FinishMeasurement(i, res, mm)`; ba chỗ `:142`, `:223`, `:228` truyền mã; ghi mức ECHO trước trigger và cờ "đã có sườn lên". Tính `valid/mm` **không đổi** |
| `Core/Inc/sonar/sr04t_core.h`, `Core/Src/sonar/sr04t_core.c` (mới) | phần thuần: phân loại (có sườn lên?, có sườn xuống?, độ rộng, cao lúc trigger) → mã; để test bằng gcc trên host như `motor_alarm_core.c`. `Makefile` tự `find` mọi `.c` dưới `Core/`; CubeIDE build mọi file trong source folder |
| `Core/Src/usb_protocol.c` | `Protocol_TrySendFeedback` (`:685–787`): 4 lần `SR04T_GetStatus` thay 4 lần `SR04T_GetReading`, thêm 8 `%u` ở cuối chuỗi định dạng và comment hợp đồng; `Protocol_ProcessLine`: lệnh `SONAR`; `Protocol_TrySendSonarReport` + cờ chờ (như ALM/ENC); có thể `PROTOCOL_TX_BUFFER_SIZE` |
| `tests/test_usb_protocol.c` | stub `SR04T_GetStatus`; trường 33–40; trường 8–15 không đổi; lệnh `SONAR` và lỗi cú pháp; khung xấu nhất (thêm `enc_*_terr` vào `FB_UNDRIVEN_EXTRA`) |
| `tests/test_sr04t_core.c` (mới), `scripts/verify.sh` | bảng phân loại, biên 1 166 µs / 35 ms / 45 ms, bộ đếm tràn 255 → 0, bất biến `valid ⇔ OK` |
| `scripts/check_fb.py` | `EXPECTED` 33 → 41, tên trường 33–40 (với 41 trường bản hiện tại in "firmware mới hơn, vẫn đọc được" thay vì "DAT") |
| `scripts/sonar_watch.py` (mới, tuỳ chọn) | như `alm_watch.py`: chỉ đọc, in mỗi phép đo mới (theo `sN_n`) và hỏi `SONAR` định kỳ; cho T1 |
| `robot/docs/PROTOCOL_FB.md` | bảng trường 33–40, bảng độ dài (**41** ← hiện tại), lệnh và khung `SONAR`, ghi chú bộ đệm |

Chi phí: EXTI ISR thêm vài lệnh ghi (đã có đọc `DWT->CYCCNT`); `SR04T_Update` thêm một lần đọc
GPIO mỗi trigger. Không đụng TIM2/TIM6 (`MOTOR_ISR_BUDGET.md`). RAM ~160 B (+128 B nếu tăng bộ
đệm).

Cần owner xác nhận cách hiểu quy tắc "không sửa `Core/` bằng tay" ở trên (câu hỏi mở 3).

## 5. Các phương án đã cân nhắc

| Phương án | Kết luận |
|---|---|
| **A. Mã + bộ đếm uint8 mỗi sonar, nối cuối FB** | **chọn**: vừa bộ đệm hiện tại, không nhập nhằng khi mất khung, theo đúng mẫu ALM/ENC |
| B. A + tuổi phép đo (ms, giới hạn 999) mỗi sonar | stamp chính xác ~1–2 ms thay vì ±12 ms; +16 B → 266 B, bắt buộc tăng bộ đệm. ±12 ms ở 0.2 m/s là ±2.4 mm, ở 0.45 rad/s là ±0.3°: không đáng. Giữ làm phương án nếu owner muốn (câu hỏi mở 5) |
| C. Chỉ tuổi, không bộ đếm | giảm tuổi = phép đo mới, nhưng nhập nhằng khi mất khung dài hơn một chu kỳ đo |
| D. Ghi mã vào trường `mm` cũ khi `valid=0` (ví dụ `mm=1` = ngắn) | bridge cũ bỏ qua `mm` khi `valid=0` nên chạy được, nhưng **đổi nghĩa** trường cũ: trái quy tắc 1 |
| E. Dòng riêng `SR,<i>,<res>,<mm>,<n>` gửi ngay khi đo xong (~12 dòng/s) | thời điểm chính xác, không tốn ngân sách FB; bridge cũ bỏ qua dòng lạ. Nhưng tranh bộ đệm TX đôi với FB (`CDC_Transmit_FS` bận → mất dòng hoặc trễ FB), thêm một loại dòng vào hợp đồng. Không chọn |
| F. Firmware tự kết luận "quá gần / hỏng" | sai chỗ: ngưỡng phụ thuộc số đo T0 và có thể đổi; host chỉnh được không cần nạp |

## 6. `stm32_bridge`

### 6.1 Đọc khung và tương thích

Module thuần mới `stm32_bridge/sonar_status.py` (mẫu `motor_encoder.py`):
`FB_SONAR_MIN_FIELDS = 41`, `parse_fb_sonar(line)` trả `None` nếu ít hơn 41 trường hoặc giá trị
lạ (mã > 6 → coi như firmware lạ, về hành vi cũ và log một lần).

| Firmware \ Bridge | Bridge hiện tại | Bridge mới |
|---|---|---|
| FB 33 (hiện tại) hoặc cũ hơn | như hôm nay | **như hôm nay, từng bit**: NaN cho mọi `valid=0`, stamp = lúc nhận |
| FB 34–40 (khung hỏng / bản trung gian) | như hôm nay | như hôm nay |
| FB ≥ 41 | như hôm nay (bỏ qua 33–40; mọi parser hiện có đều dùng `len(parts) <`, đã kiểm `head_link`, `imu_health`, `motor_alarm`, `motor_encoder`, `alm_watch`, `enc_watch`, `bench_link`) | mục 6.2–6.4 |

Tham số `sonar_status_mode: auto|off` (mặc định `auto`): `off` ép hành vi cũ dù firmware mới,
để rollback phía host không cần nạp lại firmware.

### 6.2 Stamp = thời điểm đo

- Mỗi sonar nhớ `n` cuối. Khung có `n` khác → phép đo mới; stamp
  `t_đo = t_nhận − dt_ms/2` (`dt_ms` là trường 4 của chính khung đó: phép đo kết thúc đâu đó
  trong khoảng giữa khung trước và khung này). Sai số ±½ chu kỳ FB (~±12 ms) + trễ USB/đọc.
- Khung không đổi `n` → **cùng** giá trị, **cùng** stamp `t_đo` (không làm mới stamp).
- `n` nhảy > 1: vẫn dùng giá trị mới nhất, cộng `missed` (chẩn đoán).
- MCU reset (mã `NONE`, hoặc `n` lùi cùng lúc bộ đếm IMU/ALM về 0): lấy mốc lại, không tính là mất.

Hệ quả với `collision_monitor`: stamp nay là **tuổi thật** của dữ liệu. Bình thường ≤ 0.42 s
(4 sonar đều hết giờ: 4 × 105 ms) + 1 khung; cộng một lần hở FB còn được chịu (0.4 s) là
~0.85 s, vẫn dưới `source_timeout` 1.0 s. Sonar mà phép đo **dừng lại** (bộ đếm đứng) sẽ bị bỏ
sau 1 s; hôm nay chuyện đó không ai thấy vì stamp luôn mới.

Với chế độ `sonar_publish_mode: on_change` + heartbeat 0.2 s đang được làm trên nhánh
`feature/claude/sonar-perception`: khi có bộ đếm, khoá của `SonarPublishGate` thành
`(mm, valid, res, n)` thì `on_change` trở thành **đúng một lần mỗi phép đo** (hai phép đo bằng
nhau liền nhau không còn bị nuốt). Heartbeat mang **stamp của phép đo** (không làm mới), nên chỉ
có ích cho công cụ xem; nguồn của `collision_monitor` vẫn tươi vì mỗi sonar có phép đo mới
≤ 0.45 s. Firmware cũ: `on_change` giữ nguyên như nhánh đó viết.

### 6.3 Giá trị `range` (REP-117)

REP-117 (Status: Final; áp dụng cho `sensor_msgs/Range`): `-Inf` = "detection too close to
determine true distance", `+Inf` = "no information within the useful range of the sensor but
likely no object within range", `NaN` = "an erroneous measurement that has no useful physical
quantification"; số hữu hạn ngoài [min, max] thì bị bỏ.

| Mã firmware | `range` | Tham số quyết định | Mặc định trước T0 |
|---|---|---|---|
| `OK`, min ≤ d ≤ max | d | | |
| `OK`, d < `sonar_too_close_below` (O2) | `-Inf` | `sonar_too_close_below` (m, 0 = tắt) | 0 |
| `OK`, d > `sonar_max_range` | `+Inf` | | |
| `SHORT` | `-Inf` nếu `sonar_short_is_too_close`, ngược lại `NaN` | `sonar_short_is_too_close` | `false` (O1 chưa được chứng minh) |
| `LONG`, `HIGH_TIMEOUT` | `+Inf` | | — |
| `NO_PULSE` | `NaN`, hoặc `+Inf` nếu `sonar_no_pulse_is_no_echo` | `sonar_no_pulse_is_no_echo` | `false` |
| `STUCK_HIGH` | `NaN` | | |
| `NONE` | không publish | | |

Lưu ý quan trọng: `+Inf` ở đây chỉ nói "không có echo **trong 0.2–6 m**". Nếu T0 cho O4, một vật
nằm trong vùng chết cũng ra `+Inf`. Người dùng không được coi `+Inf` là "vùng chết trống"
(mục 7.2).

Ảnh hưởng tới người dùng khác của topic:
- `collision_monitor`: `-Inf`, `+Inf` bị loại ở `range.cpp:81`; `NaN` cho điểm không bao giờ
  nằm trong polygon. Logic dừng/giảm tốc của guard **không đổi**; mọi hành vi mới nằm trong
  `sonar_memory`.
- `RangeSensorLayer` (không còn nạp ở V2/V3): ở chế độ tầm biến thiên, `+Inf > max_range` bị bỏ
  **trước** bước xoá (`range_sensor_layer.cpp:268–279`), nên `+Inf` không xoá vết. Ai định bật lại
  layer này cần biết.
- RViz/Foxglove (`fox2ros_topics.yaml`), `sonar_check.py`, `sonar_shadow_report.py`: phải chịu
  được ±Inf (mục 8 liệt kê sửa công cụ).

### 6.4 Chẩn đoán

`/diagnostics` status `<node>: sonar` (mẫu `motor_alarm`), mỗi sonar: mã cuối, `n`, phép đo/s,
`missed`, chuỗi lỗi liên tiếp.

| Mức | Điều kiện (mặc định, chỉnh được) |
|---|---|
| OK | phép đo đều, mã nằm trong tập "lành" của T0 |
| WARN | `missed` > 0 trong 10 s; phép đo/s < 2.0 |
| ERROR | ≥ `sonar_fault_count` (8, ~3.4 s) phép đo liên tiếp `NO_PULSE` (khi `sonar_no_pulse_is_no_echo=false`) hoặc `STUCK_HIGH`; hoặc `n` đứng ≥ 1.5 s trong khi FB vẫn tới |
| STALE | firmware < 41 trường: "sonar status unavailable" |

Chỉ giám sát (ADR-0001): không dừng xe, không đổi `stm32_link_ok`, `mode_manager`/`fleet_bridge`
không đọc. `sonar_check.py` coi ERROR là FAIL trước khi chạy `enforce` (câu hỏi mở 7).

### 6.5 Test bridge (cùng thay đổi với firmware, quy tắc 3 của hợp đồng)

`test/test_sonar_status.py`: khung 5/17/33/40/41/42 trường; hành vi cũ giữ từng bit với
< 41 trường và với `sonar_status_mode:=off`; bảng 6.3 với mọi tổ hợp tham số; stamp mới/lặp/
nhảy/MCU reset; chẩn đoán; `test_odometry.py` thêm khung 41 trường (odometry không đổi).

## 7. `robot_navigation`: `sonar_memory` và `collision_monitor`

### 7.1 Nhận dạng nguồn

`sonar_memory` tự biết bridge đang ở chế độ nào: cùng một `header.stamp` xuất hiện lại trên một
topic ⇒ chế độ **phép đo** (bridge mới + firmware mới, hoặc heartbeat ở 6.2); stamp không bao
giờ lặp ⇒ chế độ **cũ** (giữ nguyên logic hiện tại). Tham số `input: auto|legacy|measurement`
(mặc định `auto`) để ép khi cần. Ở chế độ phép đo, tin trùng stamp bị bỏ ngay đầu callback
(rẻ hơn hôm nay).

### 7.2 Quy tắc ở chế độ phép đo

| Đầu vào | Hôm nay (cũ) | Đề xuất |
|---|---|---|
| Phép đo mới | giá trị đổi | stamp mới |
| "Đo hai lần" | giá trị đứng yên ≥ 0.45 s (`repeat_confirm`) | hai phép đo **liên tiếp** khớp trong `confirm_range` |
| Pose của phép đo | pose lúc nhận khung **đầu tiên** mang giá trị đổi (phép đo thứ hai cùng giá trị không bao giờ có pose riêng) | `pose_at(odom, stamp)` cho **mọi** phép đo |
| `-Inf` (quá gần) | không có | **giữ ngay**: cung ở `too_close_range` (tham số, đặt theo T0; gợi ý 0.10 m) trong chùm **hiện tại**, khung odom; cộng cung echo gần cuối nếu còn mới. Cần 1 `-Inf` nếu ngay trước đó (≤ `confirm_window`) có echo < `hold_trigger`, ngược lại 2 `-Inf` liên tiếp (`too_close_confirm`), chọn theo tỉ lệ xung ngắn giả của T0.8 |
| `+Inf` (không echo) | giữ nếu echo gần đã xác nhận mà chỗ đó vẫn trước sonar (suy luận) | **giữ nguyên suy luận** (`infer_on_no_echo: true`), vì O4 có thể xảy ra với một loại vật nào đó. Chỉ tắt khi T0 cho thấy **mọi** vật gần đều ra `-Inf` |
| `NaN` (lỗi) | như "không echo" | không giữ mới, không thả; log WARN một lần cho chuỗi lỗi |
| Thả | echo của chính sonar ≥ `blind_clear_range` khi đang nhìn cung giữ; sonar khác nhìn xuyên; đi xa; điểm trong footprint | **không đổi**. `-Inf`, `+Inf`, `NaN` không bao giờ thả. Tuỳ chọn `release_on_no_echo` (mặc định `false`): chỉ bật khi T0 cho O1 ở mọi vật **và** T0.4 cho thấy vật gần không bao giờ ra "không echo" |

Lợi ích cụ thể (so với `sonar-perception.md` mục 7):
- **Giới hạn 2** (vật lọt vùng chết từ bên hông không được giữ): được che nếu T0 cho O1 hoặc O2.
- **Giới hạn 5** (stamp là lúc nhận, lệch tới 8 cm ở 0.2 m/s): còn ±2.4 mm.
- **Giới hạn 9** (CPU): bỏ tin trùng ngay đầu callback; cùng `on_change` của nhánh kia thì còn
  ~20–30 Range/s (mỗi phép đo một lần + heartbeat 0.2 s) thay vì ~160, và chỉ ~10–15/s cần
  xử lý thật.
- `release_on_no_echo` (nếu được bật) gỡ một điểm nghẽn: trong sảnh rộng không có tường trong
  6 m, sonar không bao giờ thấy echo ≥ 0.6 m nên hôm nay cung giữ chỉ thả được nhờ sonar khác
  hoặc khi robot bị dời đi.
- Không cải thiện: dải mù thẳng trước mũi, hai hông, sau lưng (giới hạn 1, phần cứng).

### 7.3 `collision_monitor` (`config/sonar_collision_monitor.yaml`)

- `base_shift_correction: false` → `true` khi stamp là thời điểm đo: monitor dịch điểm theo
  chuyển động của robot kể từ lúc đo (TF odom, đã có). Phải đo CPU trong mô phỏng trước.
- `source_timeout: 1.0` giữ nguyên (mục 6.2).
- Không đổi polygon, `time_before_collision`, nguồn.

### 7.4 Mô phỏng (`robot/tools/nav2_bench/sim/sonar/`)

- `sonarsim.py`: phát stamp theo phép đo, ±Inf theo bảng 6.3, và **mô hình vùng gần lấy từ T0**
  (`NAVSIM_SONAR_NEAR=short|clamp|double|none` ứng với O1–O4).
- Kịch bản mới: `low_side_entry` (vật vào vùng chết từ bên hông khi cua), `dead_sensor`
  (`NO_PULSE` → NaN), `frozen_sensor` (bộ đếm đứng → stamp già → nguồn bị bỏ).
- Đạt: ma trận 23/11 (`sonar-perception.md` mục 6.2) ở `enforce` không xấu hơn; `low_side_entry`
  không chạm vật với mô hình `short`/`clamp`; `dead_sensor`/`frozen_sensor` chạy như LiDAR-only
  và có ERROR trong `/diagnostics`.

## 8. Triển khai và nghiệm thu

Mỗi bước một thay đổi, có rollback. Mọi bước trên robot: người đi kèm cầm E-stop, ghi bag.

| Bước | Việc | Ai | Đạt khi | Rollback |
|---|---|---|---|---|
| 1 | T0 (mục 3) | người | bảng 3.3 đủ; quyết định 3.4 được ghi vào doc này | — |
| 2 | PR firmware + `PROTOCOL_FB.md` + test host; build ARM (CI `stm32-build.yml`), ghi kích thước | AI viết, người review | `scripts/verify.sh` exit 0; khung xấu nhất ≤ 255 B có CRLF; trường 8–15 giống hệt | không merge |
| 3 | **Lưu ảnh firmware đang chạy** vào `~/amr_logs/firmware/<tên>/`, rồi nạp firmware mới | người (ST-Link trên laptop; MiniPC không có ST-Link) | `check_fb.py`: 41 trường, ~40–50 khung/s | nạp lại ảnh vừa lưu |
| 4 | Với **bridge đang triển khai (cũ)**: H0 + odometry/IMU/ALM/encoder như trước | người | `sonar_check.py` giống T0 (tỉ lệ hợp lệ, median); không WARN mới | bước 3 |
| 5 | T1: lặp T0.1, T0.2 (0.25/0.15/0.10/0.05), T0.7 với `sonar_watch.py`/`SONAR` cạnh bộ phân tích logic | người | mã firmware khớp bộ phân tích ≥ 95 % phép đo mỗi vị trí; `n` tăng đúng 1 mỗi phép đo | bước 3 |
| 6 | PR bridge (6.1–6.5) + công cụ (`sonar_check.py` đếm phép đo theo stamp và tỉ lệ ±Inf/NaN, ERROR = FAIL; `sonar_shadow_report.py` chịu ±Inf) | AI | test pass; với firmware cũ hành vi bit-for-bit | `sonar_status_mode:=off` hoặc runtime cũ |
| 7 | PR `sonar_memory` + `collision_monitor` + mô phỏng (mục 7) | AI | mục 7.4 | `input:=legacy`; hoặc nhánh trước |
| 8 | Stage runtime mới, rồi H0–H6 của `sonar-perception.md` mục 8 (shadow trước, enforce sau), thêm: vật vào từ bên hông ở góc trước khi robot đứng yên (log giữ ngay khi `-Inf`) | người | như mục 8 đó | `SONAR_MODE=off` |

Bridge mới chạy được với firmware cũ và ngược lại (bảng 6.1), nên bước 3 và bước 6 tách được;
không bao giờ phải đổi hai đầu cùng lúc.

## 9. Rủi ro và giới hạn còn lại

1. Nếu T0 cho O4 (hoặc O3) ở vật thường gặp, phần (b) không làm được bằng firmware nào với
   module này; chỉ đổi phần cứng (sonar có tầm tối thiểu ngắn hơn, ToF/IR ở góc) mới giải quyết.
   Đề xuất vẫn có ích cho (a), (c) và stamp.
2. Một xung ngắn giả (nhiễu điện, phản xạ sàn) với `-Inf` "giữ ngay" có thể làm robot dừng oan
   sát tường. Giảm bằng `too_close_confirm: 2` và số liệu T0.8/H2.
3. Cung `-Inf` đặt ở `too_close_range` cố định: vật thật có thể gần hơn hoặc xa hơn trong vùng
   chết. Đặt nhỏ (trong footprint +5 cm) thì robot đứng hẳn cho tới khi có bằng chứng thả (như
   `low_turn` mô phỏng: chờ rồi ABORTED → Retry).
4. "Hỏng" chỉ bắt được kiểu không xung / kẹt cao. Sonar còn phát xung nhưng lệch hướng, bẩn, hay
   đầu dò nứt vẫn cần H1 trước phiên.
5. Bộ đệm TX còn 5 B nếu không tăng: trường tiếp theo bắt buộc tăng bộ đệm.
6. Stamp có sai số ±½ chu kỳ FB cộng trễ đọc của bridge (chưa đo trên robot; CPU bận thì trễ
   lớn hơn).

## 10. Câu hỏi mở cho owner

1. **Module chính xác**: JSN-SR04T bản nào (2.0 / 3.0), hay AJ-SR04M? Đang ở chế độ TRIG/ECHO
   nào (điện trở chọn chế độ R27 nếu là 3.0)? Cấp 5 V hay 3.3 V, ECHO ra mức nào, có chuyển mức
   không?
2. Có **bộ phân tích logic / oscilloscope** cho T0 không? Connector sonar có tháo được (lúc tắt
   nguồn) để đo chữ ký "hỏng" (T0.7) không?
3. Xác nhận cách hiểu quy tắc `Core/`: `Core/Src/sonar/*`, `Core/Src/usb_protocol.c` là file
   người viết, được sửa trực tiếp như PR ALM/encoder; file CubeMX sinh và `.ioc` không đổi.
4. Tăng `PROTOCOL_TX_BUFFER_SIZE` 256 → 320 ngay trong lần này, hay giữ 256 (còn 5 B)?
5. Bộ đếm uint8 (stamp ±12 ms) là đủ, hay muốn thêm tuổi phép đo (phương án B, bắt buộc tăng
   bộ đệm)?
6. Đổi giao thức FB lần này có cần ADR riêng, hay ghi bổ sung vào ADR-0066 (Proposed)?
7. Sonar báo ERROR (không xung / kẹt cao): chỉ cảnh báo (đề xuất), hay `sonar_check.py`/launcher
   **từ chối** `--sonar enforce` khi có ERROR?
8. Có chấp nhận "giữ ngay khi `-Inf`" dù không có echo gần trước đó (che vật vào từ bên hông),
   biết rằng có thể dừng oan nếu sàn/tường cho xung ngắn giả?
9. STM32 trên robot đang chạy firmware nào (ALM `4f664b40`? encoder `e77dcd08`?), ảnh rollback
   lưu ở đâu? `~/amr_logs/firmware/` hiện chỉ có `main_4f664b40_alm`, `main_6750633d_pre_alm_rollback`,
   `main_e3c1545`.
10. Ai nạp, khi nào; ST-Link cắm vào laptop nào?
11. Có thành viên nào khác đọc khung FB hoặc topic sonar (web "Bên trong robot", Quest, công cụ
    riêng) mà so **đúng** số trường, hoặc không chịu được ±Inf?
12. Thứ tự với việc `sonar_publish_mode: on_change` đang làm trên `feature/claude/sonar-perception`:
    merge nhánh đó trước, rồi đề xuất này dựa lên?

## 11. Tham chiếu

- `robot/docs/sonar-perception.md` (RCA, guard, giới hạn mục 7, nghiệm thu mục 8);
  `docs/decisions/0066-sonar-near-field-speed-guard.md`.
- `robot/docs/PROTOCOL_FB.md`; `firmware/stm32/motor_controller/docs/PIN_MAP.md` mục 6 (PULLDOWN).
- Firmware: `Core/Src/sonar/sr04t.c`, `Core/Src/usb_protocol.c`, `tests/test_usb_protocol.c`.
- Bridge: `stm32_bridge/stm32_bridge_node.py`, mẫu module thuần `motor_encoder.py`, `motor_alarm.py`.
- Nav2 Humble 1.1.20: `nav2_collision_monitor/src/range.cpp:81`, `polygon.cpp:387–416`,
  `nav2_costmap_2d/plugins/range_sensor_layer.cpp:234–280`.
- REP-117 "Informational Distance Measurements" (Final),
  `github.com/ros-infrastructure/rep/blob/master/rep-0117.rst`.

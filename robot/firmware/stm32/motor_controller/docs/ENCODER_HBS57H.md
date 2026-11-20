# Encoder thật của hai motor HBS57H — chỉ giám sát

Thêm 20/11/2026. **Trạng thái:** đã thử trên robot thật cùng ngày, bánh kê,
xem `robot/docs/encoder-bench-2026-11-20.md`. Encoder hai bánh đếm đúng ở
20 và 100 mm/s, cả hai chiều: **trái 2,5 count/STEP, dấu −1; phải 2,5
count/STEP, dấu +1**; TERR 0, ALM không báo lỗi. **Không đạt:** nhấn NRST lúc
kênh B phải (PB8) đang mức cao thì chip vào DFU (mục 3). Chưa đo common-mode,
chưa thử ALM khi driver lỗi thật, chưa chạy trên sàn.

STM32 đọc song song encoder của hai motor (HBS57H vẫn dùng encoder cho vòng
kín của nó) qua AM26LV32E, đếm bằng timer phần cứng và gửi count lên host
cùng khung với số xung STEP. `stm32_bridge` so hai số đó và báo lên
`/diagnostics`. **Odometry vẫn tính từ số xung STEP. Không có gì tự dừng
robot hay tắt contactor.**

## 1. Mạch (theo sơ đồ đã đấu, chưa đo)

| AM26LV32E | Nối với | STM32 | Timer |
|---|---|---|---|
| 1 / 2 (1A− / 1A+) | EA− / EA+ motor trái | 3 (1Y) → 470 Ω → **PB4** | TIM3_CH1, AF2 |
| 7 / 6 (2A− / 2A+) | EB− / EB+ motor trái | 5 (2Y) → 470 Ω → **PB5** | TIM3_CH2, AF2 |
| 9 / 10 (3A− / 3A+) | EA− / EA+ motor phải | 11 (3Y) → 470 Ω → **PC6** | TIM8_CH1, AF4 |
| 15 / 14 (4A− / 4A+) | EB− / EB+ motor phải | 13 (4Y) → 470 Ω → **PB8-BOOT0** | TIM8_CH2, AF10 |
| 4 (G) | **PB9**, 10 kΩ kéo xuống GND | GPIO OUT | — |
| 12 (/G) | 3V3 (không tích cực) | — | — |
| 16 / 8 | 3V3 / GND STM32 | — | — |

Số AF đối chiếu với dữ liệu pin chính thức của ST (`STM32_open_pin_data`,
`GPIO-STM32G43x_gpio_v1_0_Modes.xml`, 20/11/2026).

AM26LV32E bật ngõ ra khi G = H **hoặc** /G = L. /G nối 3V3, nên **chỉ PB9
quyết định**: PB9 thấp (hoặc thả nổi, nhờ 10 kΩ) thì 4 ngõ ra Hi-Z.

## 2. Cách firmware đọc

- **TIM3 (trái) và TIM8 (phải) ở encoder mode x4** (SMS = 0011): phần cứng
  đếm mọi cạnh của A và B. **Không có ngắt nào theo xung encoder.** Bộ lọc
  ngõ vào `MOTOR_ENCODER_INPUT_FILTER = 0x9` (f_DTS/8, N = 8, bỏ gai < ~4 µs ở
  16 MHz). Cạnh A/B ở tốc độ trần (12 kHz STEP, giả định 2,5 count/STEP) cách
  nhau ~33 µs, nên vẫn còn biên.
- **SysTick 1 kHz** (ưu tiên thấp nhất, cùng chỗ với ALM) đọc `CNT` 16-bit và
  cộng hiệu có dấu vào bộ đếm 32-bit (`motor_encoder_core.c`). 16-bit chỉ nhập
  nhằng khi lệch quá 32 768 count giữa hai lần đọc (1 ms), tức trên 3·10⁷
  count/s. SysTick cũng tính tốc độ count/s qua cửa sổ 100 ms và đếm cờ
  **TERRF** (RM0440: A và B đổi cùng lúc, tức mất cạnh hoặc nhiễu). Chi phí
  ước lượng ~150 lệnh/ms (~1–2 % CPU ở 16 MHz), chưa đo trên MCU.
- **Không đụng tới đường STEP.** `TIM2_IRQHandler`, `TIM6_DAC_IRQHandler`,
  `motor_core.o`, `motor.o`, `motor_hal.o`, `head*.o` và `motor_alarm*.o`
  giống hệt bản trước từng byte (so `objdump` của bản build `Makefile`).
- Chiều đếm **theo dây nối**, firmware không đảo. Hai motor lắp đối xứng nên
  dự kiến một bên đếm ngược chiều STEP. Host đổi dấu bằng tham số, không cần
  nạp lại.
- Timer và chân chỉ được cấu hình ở `motor_encoder.c` (không có trong `.ioc`),
  giống TIM6 trong `head.c` và ALM. Nếu sau này bật TIM3/TIM8 hoặc
  PB4/PB5/PC6/PB8/PB9 trong CubeMX thì sẽ có hai chỗ cấu hình cùng một thứ.

Trình tự trong `MotorEncoder_Init()` (gọi trong `App_Init`, **trước**
`MotorAlarm_Init` vì PC6 cùng GPIOC mà SysTick của ALM đọc-sửa-ghi
`GPIOC->PUPDR`):

1. PB9 = 0, rồi cấu hình output: receiver vẫn tắt.
2. Cấu hình TIM3/TIM8 ở chế độ input **trước**, rồi mới giao PB4/PB5/PC6/PB8
   cho AF, kèm pull-down nội. Receiver tắt thì chân ở mức 0 ổn định, không đếm
   nhiễu.
3. PB9 = 1 (`MOTOR_ENCODER_RX_ON_AT_BOOT`), chờ 2 ms, rồi xóa `CNT` và cờ, để
   các cạnh sinh ra lúc bật không bị tính.
4. Mẫu SysTick đầu tiên chỉ lấy mốc. Count bắt đầu từ 0 sau mỗi lần MCU boot.

## 3. PB8 = BOOT0: phân tích và việc cần làm

**Vì sao có rủi ro.** Với option byte mặc định của nhà máy (`nSWBOOT0 = 1`),
STM32G431 đọc mức chân PB8-BOOT0 ngay khi thoát reset. Nếu mức đó là **cao**,
chip chạy bootloader hệ thống thay cho firmware (robot "chết", USB hiện
`STM32 BOOTLOADER`). Ngõ 4Y là kênh B của encoder phải, nên mức cao hay thấp
tùy vị trí trục motor lúc reset.

**Vì sao mạch hiện tại xử lý được, với một điều kiện.** Khi reset (NRST,
bật nguồn, ST-LINK reset sau khi nạp), mọi GPIO về analog/Hi-Z ngay, nên
PB9 thả nổi. Điện trở 10 kΩ kéo G xuống, AM26LV32E tắt ngõ ra, và **4Y không
còn lái PB8**. Firmware chỉ bật receiver sau khi đã chạy (bước 3 ở trên),
tức là lâu sau lúc chip đọc BOOT0. Firmware không gọi `NVIC_SystemReset` ở đâu
cả. Lúc đó PB8 chỉ còn mạch BOOT0 của module quyết định.
**Điều kiện:** module phải có điện trở kéo xuống trên BOOT0. Board có nút
BOOT0 (xem `FLASHING.md`), loại này thường kéo xuống 10 kΩ. **Chưa đo, phải
kiểm (mục 6, bước 1–2).** Nếu PB8 không có gì kéo xuống thì điện dung của
đường dây có thể giữ mức cao vừa có trước reset.

Vài trường hợp đi kèm:

- **Có kéo xuống 10 kΩ:** khi chạy, 4Y lái mức cao qua 470 Ω được
  ~3,3·10/10,47 ≈ 3,15 V, đủ cao. Bấm nút BOOT0 lúc 4Y đang thấp thì dòng
  ~7 mA chạy qua 470 Ω, vô hại.
- **BOOT0 bị nối cứng xuống GND** (jumper): kênh B phải không bao giờ lên cao.
  Mục 6 bước 3–5 sẽ thấy ngay (`B=0` mãi, TERR tăng, count chỉ lắc ±1).
- **STM32 reset trong khi HBS57H vẫn có nguồn:** STEP/DIR thả nổi như trước
  (không đổi), receiver tắt, còn tap encoder vẫn thụ động. Driver giữ vị trí
  bằng vòng kín của nó. Count encoder về 0 sau boot, và host nhận ra lần reset
  (mục 4).

**Kết quả trên robot 20/11/2026: KHÔNG ĐẠT.** Nhấn NRST lúc `B=1` ở bánh phải
thì chip vào DFU (`0483:df11`). Nguyên nhân khả dĩ nhất: chân G không được kéo
xuống khi firmware không chạy (điện trở 10 kΩ của PB9 thiếu hoặc không có tác
dụng), hoặc module thiếu R2. Chưa đo PB8–GND và PB9–GND. Thoát DFU: tắt hẳn
nguồn STM32 (**cả** nguồn pin hạ áp lẫn USB) rồi bật, hoặc rút dây vào PB8,
nhấn NRST, rồi cắm lại. PCB V2 dời encoder phải sang TIM1 PA8/PA9 và để PB8
chỉ làm BOOT0 (`robot/docs/encoder-bench-2026-11-20.md`).

**Option byte: không bắt buộc nếu đo thấy BOOT0 có kéo xuống.** Firmware
**không** ghi option byte. Nếu muốn khóa hẳn rủi ro này, **anh tự làm bằng
tay** trong STM32CubeProgrammer qua ST-LINK: `nSWBOOT0 = 0` (bỏ qua chân
PB8) và `nBOOT0 = 1` (luôn khởi động từ flash). Cái giá phải trả là đường cứu
hộ DFU trong `FLASHING.md` (giữ BOOT0 rồi reset) sẽ không dùng được nữa. SWD
vẫn nạp bình thường, và đổi lại option byte cũng qua SWD. Chỉ làm nếu bước 2
của mục 6 thất bại, hoặc anh muốn chắc chắn tuyệt đối.

## 4. Giao thức và phía ROS 2

FB thêm 5 trường ở cuối (28–32, tổng 33): `enc_state` (0 DISABLED, 1 RX_OFF,
2 RX_ON), `enc_left`, `enc_right` (count x4, int32, tự tràn),
`enc_left_terr`, `enc_right_terr`. Lệnh `ENC,<seq>` trả về một dòng chi tiết
(mức chân A/B, count/s, STEP). `ENC,<seq>,ON|OFF` bật hoặc tắt receiver, dùng
khi thử mạch. Hợp đồng đầy đủ nằm ở `robot/docs/PROTOCOL_FB.md`. Bridge cũ
vẫn đọc được firmware mới vì chỉ có trường thêm vào cuối.

`stm32_bridge/motor_encoder.py`, bật bằng `enable_motor_encoder` (mặc định
`true`):

- So STEP với encoder trên từng **cửa sổ 800 xung STEP cùng chiều** (≈ 1/20
  vòng bánh), hoặc khi đã qua 2 s và có ít nhất 200 xung. Kết quả của cửa sổ:
  - `NO_MOTION` (ERROR): có xung STEP nhưng encoder gần như không quay (dưới
    10 % mức kỳ vọng; chưa hiệu chuẩn thì kỳ vọng tính là 1 count/STEP).
  - `WRONG_DIRECTION` (ERROR): encoder quay ngược chiều STEP. Chỉ kiểm khi đã
    đặt `encoder_sign_*`.
  - `RATIO_MISMATCH` (WARN): count/STEP lệch quá ±20 % so với
    `encoder_counts_per_step_*`. Chỉ kiểm khi đã đặt tham số này.
- Ngoài ra: TERR tăng thì WARN (giữ 10 s), receiver tắt thì WARN, encoder
  quay khi không có STEP thì chỉ đếm vào `counts_without_step`. Bộ đếm nhảy
  hoặc TERR giảm được coi là MCU reset, và việc so sánh bắt đầu lại từ khung đó.
- `/diagnostics` 1 Hz, status `<node>: motor_encoder`, có các giá trị count,
  `last_window_*`, `measured_counts_per_step` (có dấu, tích lũy qua các cửa sổ
  đang chạy) và tham số đang dùng.
- Topic **`wheel/encoder_raw`** (`std_msgs/Int32MultiArray`, 50 Hz) gồm
  `[state, left_step, right_step, left_encoder, right_encoder, left_terr,
  right_terr]` lấy nguyên từ FB, để ghi bag và so sánh offline.
- Tham số hiệu chuẩn (launch arg cùng tên): `encoder_counts_per_step_left/right`
  (0 = chưa hiệu chuẩn), `encoder_sign_left/right` (+1/−1, 0 = chưa biết). Dấu
  được tính so với **số STEP của firmware**, không phải chiều ROS.

## 5. Giới hạn đã biết

- **Count/STEP đã đo: 2,5 cho cả hai bánh** (20/11/2026). Khớp encoder 1000
  xung/vòng × 4 cạnh = 4000 count/vòng motor, tức 40 000 count/vòng bánh với
  hộp số 10:1, và 1600 STEP/vòng motor.
- **TERRF** hoạt động theo mô tả RM0440, chưa thấy trên phần cứng. Khi tín hiệu
  sạch, nó phải đứng yên ở 0. Một ms có nhiều lỗi chỉ được đếm là 1.
- Encoder có thể chỉ được cấp nguồn khi driver có nguồn. Khi đó tắt contactor
  thì receiver thấy đầu vào hở, và **nếu** AM26LV32E fail-safe như datasheet
  thì A = B = 1 cố định.
- `NO_MOTION` chỉ dựa trên tỉ lệ, nên **không** bắt được trượt bánh trên sàn:
  encoder đo trục motor, không đo mặt đất.
- Chỉ giám sát. Dùng encoder để dừng robot, sửa odometry hay thay odometry là
  các thay đổi riêng, và chỉ làm sau khi đã có bằng chứng (mục 7).

## 6. Quy trình thử trên robot

Làm theo thứ tự, và ghi lại kết quả từng bước. **Kê hai bánh khỏi mặt đất,
có người giữ E-stop.** Tắt `stm32_bridge` trước các bước dùng script (chỉ một
chương trình được giữ cổng serial). Nạp firmware là việc người làm qua ST-LINK
(`FLASHING.md`). Lệnh tính từ gốc repo, `S=robot/firmware/stm32/motor_controller/scripts`.

**Bước 1 — Đo tĩnh, tắt hết nguồn.** Đo điện trở PB8–GND: phải ra vài kΩ tới
~10 kΩ (kéo xuống của module). Nếu hở mạch (> 1 MΩ), **dừng lại**: phải thêm
kéo xuống 10 kΩ hoặc đặt option byte (mục 3) trước khi bật receiver. Đo PB9–GND
≈ 10 kΩ. Nếu PB8–GND gần 0 Ω thì BOOT0 bị nối cứng, kênh B phải sẽ chết.

**Bước 2 — Khởi động và reset.** Nạp firmware. Chạy
`python3 $S/check_fb.py`: phải thấy **33 trường** và `enc_state = RX_ON`.
Nhấn rồi nhả NRST khoảng 10 lần (driver có nguồn, motor đứng yên), mỗi lần
board phải lên lại cổng CDC chứ không hiện `STM32 BOOTLOADER`. Trong lúc giữ
NRST, đo PB9 ≈ 0 V và PB8 ≈ 0 V. Phần khó nhất của bước này làm sau bước 4:
xoay bánh phải tới vị trí có `B=1` ở bánh phải rồi mới nhấn NRST. Lúc đó PB8
đang cao ngay trước reset, nên đây là phép thử thật của rủi ro BOOT0.

**Bước 3 — Receiver.**
`python3 $S/enc_watch.py --rx off` → dòng `ENC` báo `RX=OFF`, cả 4 chân
`A=0,B=0`, PB9 ≈ 0 V, count đứng yên.
`python3 $S/enc_watch.py --rx on` → `RX=ON`, PB9 ≈ 3,3 V. Khi driver có nguồn,
A/B mang một tổ hợp nào đó (tùy vị trí trục), và không đổi khi motor đứng yên.
Tắt contactor (`CONTACTOR,<seq>,OFF` qua terminal, hoặc service khi bridge
chạy) để xem encoder có còn nguồn hay không: A/B đứng yên ở 1/1 nghĩa là
encoder mất nguồn và receiver đang ở fail-safe.

**Bước 4 — Quay bánh bằng tay (chỉ khi driver KHÔNG giữ trục).** Driver có
nguồn thì vòng kín giữ trục: **đừng cố vặn**, driver sẽ chống lại và có thể
báo ALM. Chỉ làm bước này nếu bước 3 cho thấy encoder vẫn có nguồn khi motor
không được giữ (contactor tắt). Nếu không có trạng thái như vậy thì bỏ qua, vì
bước 5 đo count/STEP chính xác hơn. Cách làm: đánh dấu bánh, rồi chạy
`python3 $S/enc_watch.py --revs 5`, quay **thật chậm** đúng 5 vòng theo chiều
tới, Ctrl+C. Kỳ vọng: count tăng hoặc giảm đều, `TERR+0`, rồi lặp với bánh còn
lại. Quay ngược 5 vòng thì count về gần 0. Tổng kết in ra count/vòng bánh và
count/vòng motor (giả định hộp số 10:1).

**Bước 5 — Chạy motor chậm, từng bánh (công cụ chính để hiệu chuẩn).**
```bash
python3 $S/enc_watch.py --wheels-lifted --drive=20,0 --seconds 10 --csv /tmp/enc_L+.csv
python3 $S/enc_watch.py --wheels-lifted --drive=-20,0 --seconds 10
python3 $S/enc_watch.py --wheels-lifted --drive=0,20 --seconds 10
python3 $S/enc_watch.py --wheels-lifted --drive=0,-20 --seconds 10
```
Viết `--drive=L,R` có dấu `=`: không có dấu `=` thì giá trị âm như `-20,0` bị
hiểu là một tùy chọn. Tốc độ tính theo firmware (mm/s, tối đa 100 trong
script), **không** theo ROS:
bridge đảo cả hai bánh cho chiều tới. Chỉ bánh được lệnh mới quay. Kỳ vọng:
`count/STEP` không đổi giữa lần chạy tới và lần chạy lùi (dấu đảo theo), TERR
vẫn ở 0, ALM vẫn OK, và bánh còn lại có count ≈ 0. Tổng kết in sẵn hai tham số
`encoder_counts_per_step_*` và `encoder_sign_*`. Lặp lại ở 50 rồi 100 mm/s, rồi
cả hai bánh `--drive 50,50`. Tỉ số phải giữ nguyên ở mọi tốc độ (sai khác dưới
1 %). Nếu tỉ số tụt ở tốc độ cao, tức là bị mất count: xem lại bộ lọc hoặc
chất lượng xung. Đối chiếu thêm với vạch đánh dấu: 16 000 STEP phải đúng 1
vòng bánh, và đó cũng là phép kiểm hộp số 10:1.

**Bước 6 — Qua ROS, tốc độ vận hành.** Chạy bridge với tham số vừa đo:
```bash
ros2 launch stm32_bridge stm32_bridge.launch.py \
  encoder_counts_per_step_left:=<L> encoder_sign_left:=<±1> \
  encoder_counts_per_step_right:=<R> encoder_sign_right:=<±1>
ros2 topic echo /wheel/encoder_raw
ros2 topic echo /diagnostics | grep -A 60 'motor_encoder'
```
Teleop (bánh vẫn kê) tới 250 mm/s, tới/lùi/xoay. Kỳ vọng: status
`encoders agree with STEP`, `last_window_counts_per_step` ổn định. Ghi bag
`/wheel/encoder_raw /wheel/odom /diagnostics` theo `robot/docs/logging.md`.

**Bước 7 — Bộ phát hiện bất thường.** Bánh vẫn kê, bridge đang chạy, teleop
chậm:
- Tắt contactor trong lúc đang gửi lệnh. Driver mất nguồn nên STEP vẫn đi mà
  encoder đứng yên → `NO_MOTION` (ERROR) ở cả hai bánh sau 800 STEP (≈ 0,6 s
  ở 50 mm/s), ALM vẫn OK. Bật contactor lại, chạy tiếp → `agrees with STEP
  again`.
- Đặt cố ý `encoder_sign_left` sai dấu → `WRONG_DIRECTION` khi bánh trái quay.
  Sau đó trả về đúng dấu.

**Bước 8 — Reset khi driver đang có nguồn.** Bánh kê, bridge tắt, motor đứng
yên. Nhấn NRST: motor không giật, driver không báo ALM, board lên lại bình
thường, count encoder về 0 và bridge (nếu chạy) log "MCU restarted?".

Ghi kết quả (ngày, commit firmware, các tham số đo được, bước nào đạt) vào
`robot/docs/`. Sau đó mới đặt các giá trị hiệu chuẩn thành mặc định trong
`stm32_bridge.launch.py`. Kết quả 20/11/2026 nằm ở
`robot/docs/encoder-bench-2026-11-20.md`, và đã được đặt làm mặc định (trái
2,5 / −1, phải 2,5 / +1).

## 7. Lộ trình odometry (chưa làm)

1. **Bây giờ:** dữ liệu thô cùng thời điểm (FB, `wheel/encoder_raw`) và bộ so
   sánh chỉ giám sát.
2. Hiệu chuẩn theo mục 6, ghi lại bằng chứng.
3. So sánh offline từ bag: odometry encoder tính lại từ `wheel/encoder_raw`,
   so với `/wheel/odom` (STEP) và mốc thật (thước, AMCL), bằng công cụ trong
   `robot/tools/odom_calibration/`.
4. Thêm `wheel/encoder_odom` ở chế độ shadow (không vào EKF), rồi tham số
   `odom_source: step|encoder` với mặc định `step`. Rollback là đổi lại tham số.
5. Dùng `NO_MOTION` để dừng robot là một quyết định an toàn riêng (xem
   ADR-0049). Không làm ngầm trong module này.

## 8. Cấu hình và rollback

Macro lúc build (thêm `-D...` vào CFLAGS hoặc symbol của CubeIDE); giá trị mặc
định nằm ở `Core/Inc/motor/motor_encoder_core.h`:

| Macro | Mặc định | Ý nghĩa |
|---|---|---|
| `MOTOR_ENCODER_ENABLE` | 1 | 0 = không động vào TIM3/TIM8 và các chân (receiver tắt nhờ 10 kΩ), FB báo DISABLED |
| `MOTOR_ENCODER_RX_ON_AT_BOOT` | 1 | 0 = receiver tắt sau boot, bật bằng `ENC,<seq>,ON` |
| `MOTOR_ENCODER_INPUT_FILTER` | 0x9 | ICxF của timer (≈ 4 µs). Tăng (0xC ≈ 8 µs) nếu TERR tăng vì nhiễu |
| `MOTOR_ENCODER_SPEED_WINDOW_MS` | 100 | Cửa sổ tính count/s trong dòng `ENC` |

Phía ROS: `enable_motor_encoder:=false` bỏ hẳn phần encoder của bridge (không
còn topic, không còn status). Rollback hoàn toàn: bỏ `MotorEncoder_Init()`
trong `app.c` và `MotorEncoder_Tick()` trong `stm32g4xx_it.c` (FB khi đó báo
DISABLED), hoặc revert commit. Bridge vẫn đọc firmware cũ.

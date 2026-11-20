# Encoder HBS57H trên bàn thử, 2026-11-20, và yêu cầu cho PCB V2

Tài liệu bằng chứng có ngày: đúng cho ngày và bản firmware ghi dưới đây. Thiết
kế và cách dùng nằm ở
`robot/firmware/stm32/motor_controller/docs/ENCODER_HBS57H.md`.

## 1. Điều kiện

| Mục | Giá trị |
|---|---|
| Firmware trên MCU | Thay đổi encoder lúc đó chưa commit; nay là commit đầu tiên trên nhánh `feature/claude/fw-encoder` (encoder TIM3/TIM8, FB 33 trường). Chủ robot nạp lúc 15:21 bằng ST-LINK. Bản nạp được nhận ra qua FB 33 trường và lệnh `ENC`, không đối chiếu checksum |
| Phần cứng | STM32G431 trên module WeAct V1.0; AM26LV32E đấu như `PIN_MAP.md` (PB4/PB5 trái, PC6/PB8 phải, PB9 → G, 470 Ω nối tiếp); hai driver HBS57H, bộ vi bước 1600 xung/vòng |
| Công cụ | `scripts/enc_watch.py`, `check_fb.py` chạy trên MiniPC, không chạy ROS. Bánh kê khỏi mặt đất, có người giữ E-stop |
| Log | MiniPC: `~/amr_logs/runs/20261120_152357_encoder_bench_oUPTNF/` (`raw/`, `notes.md`) |

## 2. Kết quả

### Khi motor đứng yên

| Phép thử | Kết quả |
|---|---|
| FB 33 trường, 50 Hz, USB không rớt | Đạt |
| `ENC,<seq>,OFF/ON` × 5: cả 4 chân về 0 khi tắt; count lệch đúng 1 cạnh rồi trở lại, tổng lệch 0; TERR 0 | Đạt |
| Đứng yên 60 s và tiếp khoảng 11 phút, driver đang giữ trục: count không trôi, TERR 0 | Đạt |
| ALM hai bánh: OK, `PU=1 PD=1` (chân được lái) | Đạt (chỉ trạng thái bình thường) |
| Cầu hàn WeAct SB5 (PA10↔PB4): hở, vì PB4 về 0 khi tắt receiver trong lúc PA10 đang mức cao | Đạt |
| Cầu hàn WeAct SB3 (PA9↔PB6): hở, vì `DIAG` đọc `SCL=1` trong lúc PA9 đang mức thấp | Đạt |

### Khi motor chạy (chạy từng bánh, firmware phát STEP, `enc_watch.py --drive`)

| Lần chạy | Tốc độ | STEP | Count encoder | Count/STEP | TERR |
|---|---|---|---|---|---|
| M1 trái tới | 20 mm/s | +2600 | −6491 | −2,4965 | +0 |
| M2 trái lùi | 20 mm/s | −2592 | +6459 | −2,4919 | +0 |
| M3 phải tới | 20 mm/s | +2596 | +6474 | +2,4938 | +0 |
| M4 phải lùi | 20 mm/s | −2598 | −6476 | +2,4927 | +0 |
| M5 trái tới | 100 mm/s | +7844 | −19606 | −2,4995 | +0 |
| M6 phải tới | 100 mm/s | +7837 | +19606 | +2,5017 | +0 |

- **Hiệu chuẩn: trái 2,5 count/STEP, dấu −1; phải 2,5 count/STEP, dấu +1.**
  Khớp lý thuyết: encoder 1000 xung/vòng × 4 cạnh ÷ 1600 STEP mỗi vòng motor
  = 2,5. Tỉ số thấp hơn một chút ở 1/3 đầu mỗi lần chạy (2,47–2,48) là do vòng
  kín của driver trễ lúc tăng tốc.
- **Chạy tới rồi lùi về:** STEP trở về 0 thì encoder lệch 2 count trên khoảng
  6500 count. Đây là vùng giữ vị trí của vòng kín, không phải mất xung.
- Chỉ bánh được lệnh mới quay; bánh còn lại dao động ±1–2 count khi giữ vị trí.
  Cả 4 kênh A/B đều lên/xuống được. Không có khung nào encoder đếm ngược chiều.
- STEP khoảng 520/s ở 20 mm/s và khoảng 2610/s ở 100 mm/s, đúng như lệnh: đường
  STEP/DIR không bị ảnh hưởng.
- ALM: không lần nào báo lỗi (trip 0); `GLITCH` không tăng trong lần chạy M2.

### Reset và BOOT0

| Phép thử | Kết quả |
|---|---|
| Nhấn NRST trong lúc bánh phải có `B=1` (PB8 mức cao) | **Không đạt: chip vào DFU (`0483:df11`)**, firmware không chạy |
| Rút/cắm USB 8 lần | **Không tính.** STM32 còn nguồn từ pin hạ áp nên không khởi động lại; bootloader cứ chạy tiếp |
| Tắt hẳn nguồn rồi bật | Chưa test (chủ robot quyết định bỏ qua) |

Nguyên nhân khả dĩ nhất: khi firmware không chạy, chân G (PB9) không được kéo
xuống. Receiver vẫn bật và lái PB8 lên cao, hoặc module thiếu R2 kéo PB8 xuống.
Hai điện trở PB9–GND và PB8–GND chưa được đo. Cách thoát DFU trên mạch hiện
tại: tắt hẳn nguồn STM32 rồi bật lại, hoặc rút dây vào PB8, nhấn NRST, rồi cắm
lại dây.

### Chưa giải thích được (không chặn việc vẽ PCB)

- Ngoài các lần chạy, TERR trái tăng 0 → 7 và GLITCH của ALM tăng lên 7/8,
  trong khoảng thời gian chủ robot thao tác trên robot (kê robot, tắt/bật
  nguồn). Trong tất cả các lần chạy, TERR không tăng.
- `DIAG` báo `EXTPU=11` (có pull-up ngoài trên PB6/PB7) dù IMU được báo là
  chưa cắm.

### Chưa test

- Common-mode (VIC) đo bằng oscilloscope, sơ đồ GND giữa EGND và GND STM32.
- ALM khi driver lỗi thật (cách thử: rút đầu nối encoder lúc driver tắt nguồn,
  rồi cấp nguồn).
- Chạy nhanh hơn 100 mm/s, chạy trên sàn có tải.

## 3. Yêu cầu cho PCB V2

### Pin map (đã chốt)

| Chân | Chức năng | Kiểu | So với PCB hiện tại |
|---|---|---|---|
| PA0 / PA1 | M1 STEP / DIR | GPIO, ngắt TIM2 | Giữ |
| PA2 / PA3 | M2 STEP / DIR | GPIO, ngắt TIM2 | Giữ |
| PA4 / PA5 | BNO085 RST / INT (dự phòng) | GPIO | Giữ |
| PA6 | Sonar 4 ECHO | EXTI | Giữ |
| PA7 | TILT DIR | GPIO | Giữ |
| **PA8** | **Encoder phải A** | **TIM1_CH1, AF6** | **Đổi** (cũ: PAN STEP) |
| **PA9** | **Encoder phải B** | **TIM1_CH2, AF6** | **Đổi** (cũ: TILT STEP) |
| PA10 | Contactor | GPIO | Giữ chân và hành vi khởi động |
| PA11 / PA12 | USB | AF | Giữ |
| PA13 / PA14 | SWD | AF | Giữ |
| PA15 | PAN DIR | GPIO | Giữ |
| PB0–PB1, PB11–PB15 | Sonar 1–4 | GPIO / EXTI | Giữ |
| PB2 / PB10 | PAN / TILT nEN | GPIO | Giữ |
| PB3 | Dự trữ, có test pad | — | Không dùng làm ngõ ra (là JTDO/SWO) |
| PB4 / PB5 | Encoder trái A / B | TIM3_CH1 / CH2, AF2 | Giữ |
| PB6 / PB7 | IMU SCL / SDA | I2C bit-bang | Giữ |
| **PB8** | **Chỉ làm BOOT0** | — | **Đổi**: không còn là encoder |
| PB9 | G của receiver | GPIO | Giữ |
| **PC4** | **PAN STEP** | GPIO, ngắt TIM6 | **Đổi** (cũ: trống) |
| **PC6** | **TILT STEP** | GPIO, ngắt TIM6 | **Đổi** (cũ: encoder phải A). LED xanh trên WeAct sẽ chớp theo xung, tải khoảng 0,1 mA |
| PC10 / PC11 | ALM trái / phải | GPIO | Giữ |
| PC13, PC14/PC15, PF0/PF1 | Nút bấm, thạch anh trên module WeAct | — | Không dùng |

Các số AF lấy từ dữ liệu pin chính thức của ST (`STM32_open_pin_data`) cho gói
48 chân. TIM1 có cùng encoder mode x4 và cùng cờ TERRF như TIM8 (RM0440 mục 29).

### Mạch

1. **AM26LV32E:** VCC 3V3 có tụ 100 nF đặt sát chip; pin 8 nối GND STM32;
   **Ḡ (pin 12) nối 3V3**; **G (pin 4) nối PB9 và có 10 kΩ xuống GND ngay trên
   PCB.** Điện trở này bắt buộc: receiver phải tắt mỗi khi firmware không chạy.
   1Y/2Y → 470 Ω → PB4/PB5; 3Y/4Y → 470 Ω → PA8/PA9.
2. **PB8: 10 kΩ xuống GND ngay trên PCB**, không nối net nào khác. Không phụ
   thuộc R2 trên module.
3. **Đầu vào encoder:** đấu song song cặp EA±/EB± của mỗi driver như hiện tại,
   không thêm điện trở đầu cuối (bàn thử chạy tốt khi không có). Đưa EGND của
   mỗi driver ra một chân header, kèm jumper hoặc điện trở 0 Ω tới GND, để chọn
   có nối GND hay không sau khi đo (sơ đồ GND chưa đo).
4. **Test point:** A/B của từng bánh phía MCU (sau 470 Ω), G/PB9, GND receiver,
   EGND.
5. **PAN/TILT STEP:** đi tới PC4/PC6, giữ điện trở 220 Ω nối tiếp như hiện tại.
6. **ALM:** giữ mạch 3V3 – 10 kΩ – nút ALM+ – 1 kΩ – PC10/PC11, ALM− nối GND.
   Mới chứng minh ở trạng thái bình thường; cực tính lỗi chỉnh bằng macro
   firmware, không cần đổi PCB.
7. **Contactor (quyết định riêng):** điện trở kéo xuống tại cổng MOSFET làm
   contactor tắt chắc chắn trong lúc reset/nạp, và làm E-stop ngắt được kể cả
   khi nó cắt đường tín hiệu cổng. Hệ quả: mỗi lần MCU reset thì driver mất
   nguồn rồi có lại. Firmware vẫn bật contactor khi boot như cũ. Đo E-stop
   (A10, `test-readiness-2026-11-10.md`) trước khi quyết định.
8. **Tùy chọn:** điện trở kéo xuống 10–100 kΩ trên đầu vào STEP/DIR của
   74HCT245, để không có xung giả trong lúc MCU reset.

### Firmware cần đổi khi chuyển sang V2

1. `motor_encoder.c`: encoder phải đổi TIM8 → TIM1, chân GPIOA PA8/PA9
   `GPIO_AF6_TIM1`, mức chân đọc từ `GPIOA->IDR`, bỏ cấu hình PB8.
2. `.ioc` → generate lại: PC4 `PAN_STEP`, PC6 `TILT_STEP` làm output, mức đầu
   thấp; bỏ PA8/PA9 khỏi danh sách GPIO.
3. `head.c`: struct chân dùng PC4/PC6; `Head_ConfigPins` tách STEP (GPIOC) khỏi
   DIR (vẫn GPIOA).
4. `app.c`: gọi `Head_Init()` **trước** `MotorAlarm_Init()`. Sau
   `MotorAlarm_Init`, SysTick đọc-sửa-ghi `GPIOC->PUPDR`, nên khởi tạo GPIOC từ
   vòng lặp chính sau thời điểm đó sẽ tranh chấp với nó.
5. Tài liệu: `PIN_MAP.md`, `ENCODER_HBS57H.md`, `HEAD_PAN_TILT.md`. Giao thức FB
   và `stm32_bridge` không đổi.
6. Test lại trên V2: M1–M6 như mục 2, HOME/JOG của đầu quay, và reset/tắt-bật
   nguồn với kênh B phải ở mức cao.

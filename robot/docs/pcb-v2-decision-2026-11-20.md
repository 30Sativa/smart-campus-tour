# PCB V2: quyết định kiến trúc encoder, ALM và BOOT0 (2026-11-20)

Dựa trên bench test thật (`encoder-bench-2026-11-20.md`), RM0440 Rev 9, dữ
liệu pin chính thức của ST (`STM32_open_pin_data`), sơ đồ WeAct STM32G431
V1.0, datasheet AM26LV32E và firmware hiện tại. Chưa vẽ schematic/PCB.

## 1. Vấn đề cần giải quyết

Bench test 20/11 chứng minh lỗi có thật: **nhấn NRST lúc kênh B encoder phải
(PB8) đang mức cao thì STM32 vào bootloader (DFU), robot không chạy.**

Nguyên nhân gốc là **thiết kế**, không phải firmware:

- PB8 cũng là chân BOOT0. Theo RM0440, chip xuất xưởng (`nSWBOOT0 = 1`) đọc
  BOOT0 từ PB8 ngay sau khi nhả reset. Trong suốt pha reset, PB8 là input
  không có pull.
- Ngõ 4Y của AM26LV32E lái thẳng PB8. Muốn boot đúng thì cùng lúc phải có:
  receiver tắt (G kéo xuống), có điện trở kéo PB8 xuống, và receiver không lái
  ngõ ra trong lúc nguồn đang lên. Datasheet không quy định ngõ ra khi VCC < 3 V.
- Trên mạch hiện tại có ít nhất một điều kiện trong số đó không đúng. Nghi
  nhiều nhất là chân G không được kéo xuống khi firmware không chạy.

## 2. Quyết định

**Chuyển encoder phải từ TIM8 (PC6/PB8) sang TIM1 (PA8/PA9). PAN STEP chuyển
sang PC4, TILT STEP sang PC6. PB8 chỉ còn làm BOOT0, có 10 kΩ xuống GND. Thêm
10 kΩ kéo chân G (PB9) xuống GND. Mọi thứ khác giữ nguyên PCB gốc.**

Lý do, theo thứ tự ưu tiên:

1. **An toàn khởi động: loại bỏ hẳn nguyên nhân thay vì vá.** Encoder không còn
   chạm BOOT0, nên đúng hay sai không còn phụ thuộc điện trở trên module, giá
   trị pull-down, trạng thái receiver khi nguồn lên, hay option byte.
2. **Độ tin cậy khi chạy không đổi:** cùng receiver, cùng mạch 470 Ω. TIM1 cùng
   loại advanced timer với TIM8, cùng encoder mode x4 và cùng cờ TERRF
   (RM0440 mục 29). Bench test đã chứng minh chuỗi receiver → timer → firmware.
3. **Thay đổi ít:** chỉ đổi 4 net (2 encoder, 2 STEP). Firmware đổi khoảng 4
   file và không đụng ngắt STEP bánh xe, IMU, contactor hay giao thức FB.
4. **PA8/PA9 an toàn:** không có chức năng boot hay debug; trên module WeAct chỉ
   ra header. Cầu hàn SB3 (PA9 ↔ PB6) đã xác nhận hở bằng lệnh `DIAG`. PC4 chỉ
   ra header. PC6 có LED xanh 5,1 kΩ trên module: làm ngõ ra STEP thì vô hại,
   tải khoảng 0,1 mA, LED chớp theo xung.

## 3. Các phương án đã cân nhắc và lý do không chọn

| Phương án | Ưu | Lý do không chọn |
|---|---|---|
| **A. Giữ TIM8 PC6/PB8, chỉ thêm 10 kΩ ở G và ở PB8** | Không đổi firmware, sửa PCB ít nhất | Vẫn phụ thuộc hai điện trở và hành vi receiver lúc nguồn lên (datasheet không quy định). Lỗi xảy ra im lặng (robot không boot), khó chứng minh bằng test. **Dùng được để sửa tạm board hiện tại**, không nên làm kiến trúc V2 |
| A2. Option byte `nSWBOOT0 = 0` | Chắc chắn, không thêm linh kiện | Cấu hình ẩn, mất khi thay chip hoặc module, người sau dễ quên. Chỉ nên dùng tạm cho board hiện tại |
| A3. Thêm cổng logic hoặc diode chặn receiver theo NRST | Giữ được PB8 | Thêm linh kiện; BOOT0 được đọc *sau* khi nhả reset nên vẫn cần pull-down. Phức tạp hơn việc đổi chân |
| C. TIM4 trên PB6/PB7, dời IMU | Hai encoder trên hai timer cùng loại | Phải sửa driver IMU bit-bang đang chạy ổn. PB6 không có I2C phần cứng trên G431, nên dời cũng không mở ra lựa chọn I2C phần cứng |
| D. Dùng TIM2 cho encoder, dời ngắt STEP sang timer khác | TIM2 32-bit | Đụng ngắt STEP bánh xe, phần nhạy nhất và đã đo kỹ |
| E. Bỏ điều khiển receiver, cho G luôn bật | Bớt 1 GPIO, 1 điện trở | Khi không còn dính PB8 thì làm được, nhưng PB9 đã test và tiện cho chẩn đoán. Giữ |

## 4. Pin map V2

| Chân | Chức năng | Ghi chú |
|---|---|---|
| PB4 / PB5 | Encoder trái A/B, TIM3 AF2 | Giữ |
| **PA8 / PA9** | **Encoder phải A/B, TIM1 AF6** | Đổi (cũ: PAN/TILT STEP) |
| **PC4 / PC6** | **PAN / TILT STEP** | Đổi (cũ: trống / encoder phải A) |
| PB9 | G của AM26LV32E | Giữ, **thêm 10 kΩ xuống GND** |
| **PB8** | **Chỉ BOOT0** | **10 kΩ xuống GND trên PCB, không nối gì khác** |
| PC10 / PC11 | ALM trái / phải | Giữ |
| PA0–PA3, PA7, PA15, PB2, PB10 | STEP/DIR bánh, DIR và nEN đầu quay | Giữ |
| PA10 | Contactor | Giữ chân và hành vi |
| PB6 / PB7, PA4 / PA5 | IMU bit-bang, dự phòng RST/INT | Giữ |
| PA6, PB0–PB1, PB11–PB15 | Sonar | Giữ |
| PA11–PA14 | USB, SWD | Giữ |

## 5. Thay đổi điện thật sự cần

1. 3Y/4Y của receiver → 470 Ω → **PA8/PA9** (thay cho PC6/PB8).
2. STEP của PAN/TILT → **PC4/PC6**, giữ 220 Ω nối tiếp.
3. **10 kΩ từ G (pin 4 AM26LV32E) xuống GND**: bắt buộc.
4. **10 kΩ từ PB8 xuống GND** đặt trên PCB.
5. AM26LV32E: tụ 100 nF sát VCC; Ḡ (pin 12) nối 3V3; pin 8 nối GND STM32.
6. EGND của mỗi driver ra header, kèm jumper hoặc 0 Ω tới GND (chọn sau khi đo).
7. Test point: A/B mỗi bánh (phía MCU), PB9/G, GND receiver.

Linh kiện thêm so với PCB gốc (cho khối encoder + ALM + BOOT0): 1 AM26LV32E
(SOIC-16), 1 tụ 100 nF, 4 điện trở 470 Ω, 2 × 10 kΩ (G, PB8), mạch ALM 2 × 10 kΩ
+ 2 × 1 kΩ (giữ như bản đã test), 2 connector tap encoder, 2 jumper/0 Ω cho
EGND, các test point.

**Giữ nguyên từ PCB gốc:** nguồn, 74HCT245 và STEP/DIR bánh xe, sonar, header
IMU, contactor, đầu quay (ngoài 2 chân STEP), USB/SWD, kích thước và connector
hiện có.

**Quyết định riêng, không bắt buộc cho encoder:**
- 100 kΩ kéo cổng MOSFET contactor xuống: contactor tắt chắc chắn khi MCU reset
  và giúp E-stop ngắt đúng. Hệ quả là driver mất nguồn mỗi lần reset. Xem mạch
  hiện tại và kết quả đo A10 rồi quyết định.
- Điện trở kéo xuống trên đầu vào STEP/DIR của 74HCT245, để tránh xung giả lúc
  reset.

## 6. Cần đo trước khi đặt sản xuất (vài phút với đồng hồ)

| Đo trên board hiện tại | Mục đích |
|---|---|
| PB9–GND, PB8–GND (tắt nguồn) | Xác nhận nguyên nhân DFU, khẳng định cần mục 5.3–5.4 |
| Thông mạch cầu hàn WeAct SB6 (PB6 ↔ CC1), SB7 (PB4 ↔ CC2), SB4 (VBUS → PB2) | Phải hở. Nếu đóng thì PB4/PB6/PB2 có tải lạ |
| EGND với GND STM32 (thông mạch khi tắt nguồn; điện áp khi chạy) | Chọn mặc định cho jumper EGND |
| Mạch cổng MOSFET contactor và E-stop | Quyết định điện trở kéo xuống ở cổng |

Chưa test nhưng **không ảnh hưởng PCB:** ALM khi driver lỗi thật (cực tính
chỉnh bằng macro firmware), common-mode đo bằng oscilloscope, chạy trên sàn.

## 7. Hướng triển khai

1. Trong EasyEDA: từ dự án gốc `robot-2drive-logic`, tạo bản sao V2 (không dùng
   RevB). Chỉ sửa khối encoder/ALM/BOOT0 và 4 net ở mục 5.
2. Layout 2 lớp: AM26LV32E đặt gần header MCU; mỗi cặp EA±/EB± đi song song
   từ connector tap tới receiver; 470 Ω đặt sát ngõ Y; đổ GND hai mặt, khâu via.
3. Firmware V2 (khi có board): dùng cờ build `BOARD_PCB_V2` để robot hiện tại
   vẫn chạy bản cũ. Các thay đổi: `motor_encoder.c` đổi TIM8 → TIM1 trên
   PA8/PA9; `head.c` dùng STEP PC4/PC6; `app.c` gọi `Head_Init` trước
   `MotorAlarm_Init` (GPIOC dùng chung với SysTick của ALM).
4. Test board V2: chạy lại M1–M6 như bench, HOME/JOG đầu quay, và **10 lần
   reset + tắt/bật nguồn hẳn** với kênh B phải ở mức cao. Chỉ cần lên đúng
   firmware cả 10 lần là bài này đạt.

**Board hiện tại trong lúc chờ V2:** hàn thêm 10 kΩ từ G xuống GND (và từ PB8
xuống GND nếu đo thấy thiếu), hoặc tạm đặt `nSWBOOT0 = 0`. Nếu robot vào DFU:
tắt hẳn nguồn STM32 (cả pin hạ áp lẫn USB) rồi bật lại.

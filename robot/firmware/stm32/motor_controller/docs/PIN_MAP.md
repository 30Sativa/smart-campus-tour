# STM32G431C6U6 (UFQFPN48) — pin map hiện tại

Cập nhật 18/11/2026, đối chiếu trực tiếp với:

- `robot/firmware/stm32/motor_controller/motor_controller.ioc`
- `Core/Src/main.c` (`MX_GPIO_Init`, `MX_TIM2_Init`), `Core/Inc/main.h`
- Driver: `motor/motor_hal.c`, `motor/motor.c`, `head/head.c`, `sonar/sr04t.c`,
  `imu/bno08x.c`, `contactor/contactor.c`, `stm32g4xx_hal_msp.c`
- Danh sách alternate function lấy từ dữ liệu pin chính thức của ST
  (`STM32_open_pin_data`, file `STM32G431C(6-8-B)Ux.xml`).

Mọi thay đổi pin phải cập nhật **cùng lúc** ở CubeMX (`.ioc`), code driver,
tài liệu này và sơ đồ dây thực tế.

Tổng quan: 42 chân I/O → **32 đang dùng**, **1 là NRST**, **9 còn trống**
(đếm lại 20/11/2026 sau khi thêm 5 chân encoder, xem `docs/ENCODER_HBS57H.md`).
Clock hệ thống lấy từ **HSI** (không dùng thạch anh), nên PF0/PF1 và
PC14/PC15 đều trống.

Chú thích cột "Chế độ hiện tại":

| Ký hiệu | Nghĩa |
|---|---|
| GPIO OUT PP | GPIO output push-pull, firmware tự ghi mức |
| GPIO OUT OD | GPIO output open-drain (dùng cho I2C bit-bang) |
| GPIO EXTI | GPIO input có ngắt ngoài (EXTI), cả sườn lên và xuống |
| AF | Chân giao cho một peripheral phần cứng (USB, SWD…) |
| SYS | Chân hệ thống (reset, boot, nguồn) |

---

## 1. Các chân đang dùng

| # | Chân | Tên trong code | Chức năng | Chế độ hiện tại | Cấu hình ở | Chức năng thay thế đáng chú ý (chưa dùng) |
|---|---|---|---|---|---|---|
| 8 | PA0 | `PA0___M1_STEP` | Bánh 1 STEP | GPIO OUT PP. Xung tạo bằng phần mềm trong ISR **TIM2**, không phải ngõ ra PWM của timer | `.ioc`, `main.c`, `motor_hal.c` | TIM2_CH1, TIM8_BKIN, ADC1/2_IN1 |
| 9 | PA1 | `PA1___M1_DIR` | Bánh 1 DIR | GPIO OUT PP | `.ioc`, `main.c` | TIM2_CH2, TIM15_CH1N, ADC1/2_IN2 |
| 10 | PA2 | `PA2___M2_STEP` | Bánh 2 STEP | GPIO OUT PP. Xung tạo bằng phần mềm trong ISR **TIM2** | `.ioc`, `main.c`, `motor_hal.c` | TIM2_CH3, TIM15_CH1, USART2_TX, LPUART1_TX |
| 11 | PA3 | `PA3___M2_DIR` | Bánh 2 DIR | GPIO OUT PP | `.ioc`, `main.c` | TIM2_CH4, TIM15_CH2, USART2_RX, LPUART1_RX |
| 14 | PA6 | `PA6_SONAR4_ECHO` | SR04T sonar 4 ECHO | GPIO EXTI, **PULLDOWN**, EXTI line 6 → `EXTI9_5_IRQHandler` | `.ioc`, `main.c` | TIM3_CH1, TIM16_CH1, TIM1_BKIN, ADC2_IN3, SPI1_MISO |
| 15 | PA7 | `PA7_TILT_DIR` | Tilt DIR (DRV8825) | GPIO OUT PP | `.ioc`, `main.c`, `head.c` | TIM3_CH2, TIM17_CH1, TIM1_CH1N, TIM8_CH1N, SPI1_MOSI |
| 30 | PA8 | `PA8_PAN_STEP` | Pan STEP (DRV8825) | GPIO OUT PP. Xung tạo bằng phần mềm trong ISR **TIM6** | `.ioc`, `main.c`, `head.c` | TIM1_CH1, TIM4_ETR, I2C2_SDA, MCO |
| 31 | PA9 | `PA9_TILT_STEP` | Tilt STEP (DRV8825) | GPIO OUT PP. Xung tạo bằng phần mềm trong ISR **TIM6** | `.ioc`, `main.c`, `head.c` | TIM1_CH2, TIM2_CH3, TIM15_BKIN, USART1_TX, I2C2_SCL |
| 32 | PA10 | `CONTACTOR_EN` | Cổng MOSFET contactor (mức cao = đóng) | GPIO OUT PP | `.ioc`, `main.c`, `contactor.c` | TIM1_CH3, TIM2_CH4, TIM17_BKIN, USART1_RX |
| 33 | PA11 | — | USB_DM (USB CDC) | AF: USB FS | `.ioc`, USB_DEVICE | (dành riêng cho USB) |
| 34 | PA12 | — | USB_DP (USB CDC) | AF: USB FS | `.ioc`, USB_DEVICE | (dành riêng cho USB) |
| 36 | PA13 | — | SWDIO (nạp/debug) | AF: SYS Serial Wire | `.ioc` | Không dùng cho việc khác |
| 37 | PA14 | — | SWCLK (nạp/debug) | AF: SYS Serial Wire | `.ioc` | Không dùng cho việc khác |
| 38 | PA15 | `PA15_PAN_DIR` | Pan DIR (DRV8825) | GPIO OUT PP | `.ioc`, `main.c`, `head.c` | TIM2_CH1/ETR, TIM8_CH1, SPI1/3_NSS, USART2_RX (JTDI, không dùng vì chỉ chạy SWD) |
| 17 | PB0 | `PB0_SONAR1_TRIG` | SR04T sonar 1 TRIG | GPIO OUT PP | `.ioc`, `main.c` | TIM3_CH3, TIM1_CH2N, TIM8_CH2N, ADC1_IN15 |
| 18 | PB1 | `PB1_SONAR1_ECHO` | SR04T sonar 1 ECHO | GPIO EXTI, **PULLDOWN**, EXTI line 1 → `EXTI1_IRQHandler` | `.ioc`, `main.c` | TIM3_CH4, TIM1_CH3N, TIM8_CH3N, ADC1_IN12 |
| 19 | PB2 | `PAN_nEN` | Pan nEN (tích cực mức thấp) | GPIO OUT PP, mức khởi động **CAO** (driver tắt) | `.ioc`, `main.c`, `head.c` | LPTIM1_OUT, ADC2_IN12 |
| 22 | PB10 | `TILT_nEN` | Tilt nEN (tích cực mức thấp) | GPIO OUT PP, mức khởi động **CAO** (driver tắt) | `.ioc`, `main.c`, `head.c` | TIM2_CH3, TIM1_BKIN, USART3_TX, LPUART1_RX |
| 24 | PB11 | `PB11_SONAR2_TRIG` | SR04T sonar 2 TRIG | GPIO OUT PP | `.ioc`, `main.c` | TIM2_CH4, USART3_RX, LPUART1_TX, ADC1/2_IN14 |
| 25 | PB12 | `PB12_SONAR2_ECHO` | SR04T sonar 2 ECHO | GPIO EXTI, **PULLDOWN**, EXTI line 12 → `EXTI15_10_IRQHandler` | `.ioc`, `main.c` | TIM1_BKIN, SPI2_NSS, USART3_CK, ADC1_IN11 |
| 26 | PB13 | `PB13_SONAR3_TRIG` | SR04T sonar 3 TRIG | GPIO OUT PP | `.ioc`, `main.c` | TIM1_CH1N, SPI2_SCK, USART3_CTS |
| 27 | PB14 | `PB14_SONAR3_ECHO` | SR04T sonar 3 ECHO | GPIO EXTI, **PULLDOWN**, EXTI line 14 → `EXTI15_10_IRQHandler` | `.ioc`, `main.c` | TIM15_CH1, TIM1_CH2N, SPI2_MISO, ADC1_IN5 |
| 28 | PB15 | `PB15_SONAR4_TRIG` | SR04T sonar 4 TRIG | GPIO OUT PP | `.ioc`, `main.c` | TIM15_CH2, TIM1_CH3N, SPI2_MOSI, ADC2_IN15 |
| 39 | PC10 | — (`motor_alarm.c`) | ALM driver HBS57H bánh trái (M1) | GPIO IN, firmware đảo **pull-up/pull-down nội mỗi 1 ms** trong SysTick để nhận ra chân thả nổi. Chỉ giám sát | **Chỉ `motor_alarm.c`**, không có trong `.ioc` | TIM8_CH1N, USART3_TX, UART4_TX, SPI3_SCK |
| 40 | PC11 | — (`motor_alarm.c`) | ALM driver HBS57H bánh phải (M2) | GPIO IN, như PC10 | **Chỉ `motor_alarm.c`**, không có trong `.ioc` | TIM8_CH2N, USART3_RX, UART4_RX, SPI3_MISO, I2C3_SDA |
| 29 | PC6 | — (`motor_encoder.c`) | Encoder motor phải EA (AM26LV32E 3Y qua 470 Ω) | **AF4 TIM8_CH1**, pull-down nội. Encoder mode x4, không ngắt | **Chỉ `motor_encoder.c`**, không có trong `.ioc` | TIM3_CH1 (AF2), I2S2_MCK. Không dùng được EXTI (line 6 của PA6) |
| 42 | PB4 | — (`motor_encoder.c`) | Encoder motor trái EA (1Y qua 470 Ω) | **AF2 TIM3_CH1**, pull-down nội | **Chỉ `motor_encoder.c`** | TIM16_CH1, TIM8_CH2N, SPI1/3_MISO, USART2_RX. Dead-battery UCPD1_CC2 đã tắt trong `stm32g4xx_hal_msp.c` |
| 43 | PB5 | — (`motor_encoder.c`) | Encoder motor trái EB (2Y qua 470 Ω) | **AF2 TIM3_CH2**, pull-down nội | **Chỉ `motor_encoder.c`** | TIM17_CH1, TIM8_CH3N, LPTIM1_IN1, SPI1/3_MOSI, I2C3_SDA |
| 46 | PB8-BOOT0 | — (`motor_encoder.c`) | Encoder motor phải EB (4Y qua 470 Ω). **Cũng là BOOT0** | **AF10 TIM8_CH2**, pull-down nội (chỉ có hiệu lực sau khi firmware chạy) | **Chỉ `motor_encoder.c`** | Xem mục 7: receiver phải tắt lúc reset |
| 47 | PB9 | — (`motor_encoder.c`) | G (enable) AM26LV32E, cao = bật. 10 kΩ ngoài kéo xuống | GPIO OUT PP, ghi bằng BSRR. Mức thấp cho tới khi timer sẵn sàng | **Chỉ `motor_encoder.c`** | TIM8_CH3, FDCAN1_TX, I2C1_SDA |
| 44 | PB6 | `PB6___IMU_SCL_BITBANG` | BNO08x SCL | `.ioc` khai báo GPIO OUT, còn `bno08x.c` cấu hình lại thành **GPIO OUT OD** để chạy I2C bit-bang | `.ioc`, `main.c`, `bno08x.c` | TIM4_CH1, TIM8_CH1, TIM16_CH1N, USART1_TX, UCPD1_CC1 |
| 45 | PB7 | `PB7___IMU_SDA_BITBANG` | BNO08x SDA | `.ioc` khai báo GPIO OUT, còn `bno08x.c` cấu hình lại thành **GPIO OUT OD**, đọc mức qua `GPIOB->IDR` | `.ioc`, `main.c`, `bno08x.c` | TIM4_CH2, TIM3_CH4, TIM17_CH1N, I2C1_SDA, USART1_RX |

### Chân hệ thống

| # | Chân | Chức năng | Ghi chú |
|---|---|---|---|
| 7 | PG10-NRST | **SYS: NRST (reset)** | Firmware giữ nguyên chức năng reset, không cấu hình làm GPIO. Xem mục 5. |
| 46 | PB8-BOOT0 | SYS: BOOT0 | Nay là encoder phải EB. Nếu chân này ở mức cao lúc reset, chip sẽ vào bootloader. Xem mục 7. |
| 1 | VBAT | Nguồn | |
| 20 | VREF+ | Điện áp tham chiếu ADC | |
| 21 | VDDA | Nguồn analog | |
| 23, 35, 48 | VDD | Nguồn 3V3 | VSS là pad lộ ở mặt dưới chip. |

---

## 2. Các chân còn trống

Các chân dưới đây **không có trong `.ioc` và không được driver nào khởi tạo**.
Khi chưa cấu hình, chúng ở chế độ analog sau reset. Trước khi dùng phải bật
trong CubeMX và kiểm tra xung đột ở mục 3.

| # | Chân | Loại | Chức năng thay thế đáng chú ý | Ghi chú |
|---|---|---|---|---|
| 12 | PA4 | GPIO | **TIM3_CH2**, ADC2_IN17, DAC1_OUT1, SPI1/3_NSS, USART2_CK | **Dành cho BNO08x RST**, chỉ dùng khi bật `BNO08X_USE_HW_RST=1` trong `bno08x.c` (hiện đang `0`). Muốn dùng chân này cho việc khác thì giữ macro ở `0`. |
| 13 | PA5 | GPIO | **TIM2_CH1/ETR**, ADC2_IN13, DAC1_OUT2, SPI1_SCK | **Dành cho BNO08x INT**, chỉ dùng khi bật `BNO08X_USE_INT_PIN=1` (hiện đang `0`, driver đang polling). |
| 16 | PC4 | GPIO | TIM1_ETR, ADC2_IN5, I2C2_SCL, USART1_TX | |
| 41 | PB3 | GPIO | **TIM2_CH2**, TIM3_ETR, TIM4_ETR, TIM8_CH1N, SPI1/3_SCK, USART2_TX | Chức năng JTDO/SWO chưa được dùng, vì debug chỉ chạy SWD. |
| 2 | PC13 | GPIO (yếu) | TIM1_CH1N, TIM1_BKIN, TIM8_CH4N, RTC_TAMP1, WKUP2 | Chân thuộc miền backup, dòng ra rất yếu (khoảng 3 mA, tối đa 2 MHz). Chỉ nên dùng cho input, nút nhấn hoặc LED nhỏ. |
| 3 | PC14-OSC32_IN | GPIO (yếu) | OSC32_IN (LSE) | Giới hạn giống PC13. **Không dùng được EXTI** vì EXTI line 14 đã thuộc về PB14 (sonar 3). |
| 4 | PC15-OSC32_OUT | GPIO (yếu) | OSC32_OUT (LSE) | Giới hạn giống PC13. |
| 5 | PF0-OSC_IN | GPIO | OSC_IN (HSE), TIM1_CH3N, ADC1_IN10, I2C2_SDA, SPI2_NSS | Trống vì đang chạy HSI. Nếu sau này gắn thạch anh HSE thì mất chân này. |
| 6 | PF1-OSC_OUT | GPIO | OSC_OUT (HSE), ADC2_IN10, SPI2_SCK | Giống PF0. |

---

## 3. Tài nguyên đã chiếm (kiểm tra trước khi dùng chân mới)

### Timer

| Timer | Dùng cho | Ưu tiên ngắt | Cấu hình ở | Ghi chú |
|---|---|---|---|---|
| TIM2 | Tick 50 kHz (`MOTOR_BASE_TIMER_HZ`) phát xung STEP bánh xe | 1 | `.ioc` + `main.c` + `motor_hal.c` / `motor.c` | Chỉ dùng ngắt update, không có ngõ ra kênh. **Không dùng được TIM2_CHx (PA5, PB3…) làm PWM**, vì ARR/PSC đã bị khóa cho tick 50 kHz. |
| TIM6 | Tick 10 kHz phát xung Pan/Tilt | 2 | **Chỉ có trong `head.c`** (ghi thanh ghi trực tiếp), không có trong `.ioc` | Nếu bật TIM6 hoặc DAC trong CubeMX, code sinh ra sẽ có `TIM6_DAC_IRQHandler` trùng với bản đang có trong `stm32g4xx_it.c`. |
| SysTick | HAL tick 1 kHz, lấy mẫu ALM PC10/PC11 (`MotorAlarm_Tick`), nối CNT encoder 16 → 32 bit (`MotorEncoder_Tick`) | 15 (thấp nhất) | `stm32g4xx_it.c` (USER CODE), `motor_alarm.c`, `motor_encoder.c` | Ưu tiên thấp nhất nên không chen ngang TIM2/TIM6/EXTI/USB. |
| TIM3 | Encoder motor trái, encoder mode x4 (PB4/PB5) | không ngắt | **Chỉ `motor_encoder.c`** (ghi thanh ghi), không có trong `.ioc` | Không dùng được cho PWM/capture khác. |
| TIM8 | Encoder motor phải, encoder mode x4 (PC6/PB8) | không ngắt | **Chỉ `motor_encoder.c`**, không có trong `.ioc` | Timer nâng cao, MOE = 0: không có ngõ ra nào. |
| TIM1, TIM4, TIM15, TIM16, TIM17, LPTIM1 | **Còn trống** | — | — | TIM4 là lựa chọn gọn nhất nếu cần thêm PWM/capture (PA4 có TIM3_CH2 nhưng TIM3 đã dùng). |

Bộ đếm chu kỳ DWT->CYCCNT được `bno08x.c` và `sr04t.c` dùng để đo thời gian.
Nó không chiếm chân nào.

### EXTI

| EXTI line | Chân đang giữ | Vector ngắt |
|---|---|---|
| 1 | PB1 (sonar 1 ECHO) | `EXTI1_IRQHandler` |
| 6 | PA6 (sonar 4 ECHO) | `EXTI9_5_IRQHandler` |
| 12 | PB12 (sonar 2 ECHO) | `EXTI15_10_IRQHandler` |
| 14 | PB14 (sonar 3 ECHO) | `EXTI15_10_IRQHandler` |

Mỗi line EXTI chỉ gắn được với một port. Trong các chân còn trống, **PC6 và
PC14 không dùng được ngắt ngoài**. Các line còn lại (0, 2–5, 7–11, 13, 15)
vẫn trống. Ưu tiên ngắt của EXTI là 2.

### Peripheral giao tiếp

| Peripheral | Trạng thái |
|---|---|
| USB FS (CDC) | Đang dùng: PA11/PA12 |
| I2C1/I2C2/I2C3 (phần cứng) | **Không chạy.** Một số giá trị clock I2C còn sót trong `.ioc` không có nghĩa là I2C đang bật. IMU dùng I2C bit-bang trên PB6/PB7. |
| FDCAN1 | Chưa cấu hình. PB8/PB9 nay là encoder/receiver: không còn cặp chân FDCAN1 trống trên gói 48 chân. |
| USART1/2/3, UART4, LPUART1 | Chưa cấu hình. PB4 nay là encoder, PC10/PC11 là ALM HBS57H. |
| SPI1/SPI2/SPI3 | Chưa cấu hình. SPI3 trên PC10/PC11 không còn dùng được (ALM HBS57H). |
| ADC, DAC | Chưa cấu hình. |

---

## 4. Sơ đồ dây theo module

Tài liệu này lấy **code làm chuẩn**. Mã connector, điện trở và các chi tiết
PCB không có trong code nên không ghi ở đây. Muốn xem phần đó thì đọc tài liệu
PCB riêng.

### Bánh xe

| Tín hiệu | Chân | Code |
|---|---|---|
| M1_STEP / M1_DIR | PA0 / PA1 | `motor.c`, `motor_hal.c` |
| M2_STEP / M2_DIR | PA2 / PA3 | `motor.c`, `motor_hal.c` |

ALM của driver (chỉ giám sát, xem `docs/ALM_HBS57H.md`):

```text
3V3 STM32 -- 10k -- ALM+ (driver) -- 1k -- PC10 (trái) / PC11 (phải)
ALM- (driver) -- GND STM32            # mỗi driver một mạch riêng
```

| Tín hiệu | Chân | Code |
|---|---|---|
| ALM trái / ALM phải | PC10 / PC11 | `motor_alarm.c` (GPIO, SysTick), `motor_alarm_core.c` (lọc) |

GPIOC chỉ được `motor_encoder.c` (PC6) và `motor_alarm.c` (PC10/PC11) cấu hình,
và chỉ SysTick ghi `GPIOC->PUPDR` sau đó. `MotorEncoder_Init()` chạy trước
`MotorAlarm_Init()`; chân PC mới nào cũng phải khởi tạo trước `MotorAlarm_Init()`.

Encoder của driver (chỉ giám sát, xem `docs/ENCODER_HBS57H.md`), qua AM26LV32E,
mỗi ngõ Y nối 470 Ω tới STM32:

| Tín hiệu | Chân | Timer |
|---|---|---|
| EA / EB motor trái | PB4 / PB5 | TIM3_CH1 / CH2 (AF2) |
| EA / EB motor phải | PC6 / PB8-BOOT0 | TIM8_CH1 (AF4) / TIM8_CH2 (AF10) |
| G (enable receiver) | PB9 (10 kΩ kéo xuống) | — |

### Đầu quay PAN/TILT

| Tín hiệu | Chân | Code |
|---|---|---|
| PAN STEP / DIR / nEN | PA8 / PA15 / PB2 | `head.c` |
| TILT STEP / DIR / nEN | PA9 / PA7 / PB10 | `head.c` |

nEN tích cực mức thấp. Firmware chốt nEN ở mức cao (driver tắt) trước khi bật
output: `.ioc` đặt `PinState=GPIO_PIN_SET`, và `main.c` cùng `head.c` đều ghi
mức SET trước khi gọi `HAL_GPIO_Init`. Chi tiết điều khiển xem
`docs/HEAD_PAN_TILT.md`.

### Sonar SR04T

| Sonar | TRIG | ECHO | Vector ngắt |
|---|---|---|---|
| 1 | PB0 | PB1 (EXTI line 1) | `EXTI1_IRQHandler` |
| 2 | PB11 | PB12 (EXTI line 12) | `EXTI15_10_IRQHandler` |
| 3 | PB13 | PB14 (EXTI line 14) | `EXTI15_10_IRQHandler` |
| 4 | PB15 | **PA6** (EXTI line 6) | `EXTI9_5_IRQHandler` |

Sonar 4 có ECHO nằm ở port A, còn các chân khác ở port B. Vì vậy
`SR04T_EchoPort()` trong `sr04t.c` trả về `GPIOA` khi `sensor_index == 3`.

### IMU BNO08x (I2C bit-bang, địa chỉ 0x4A)

```text
BNO08x SCL  -> PB6
BNO08x SDA  -> PB7
BNO08x ADD  -> GND        # địa chỉ 7-bit 0x4A
BNO08x CS   -> 3V3        # bắt buộc mức cao để chọn chế độ I2C
BNO08x PS0/PS1 -> GND
BNO08x RST  -> 3V3        # PA4 để dành, BNO08X_USE_HW_RST=0
BNO08x INT  -> bỏ trống   # PA5 để dành, BNO08X_USE_INT_PIN=0, driver polling
BNO08x BOOT -> VCC (kéo cao, qua 10k nếu có)
```

Phần nối dây ở trên lấy từ comment đầu file `Core/Inc/imu/bno08x.h`. Driver
không dùng `HAL_I2C`/`MX_I2C1_Init`. Nó tự tạo START/STOP/ACK bằng GPIO
open-drain (`GPIO_MODE_OUTPUT_OD`) và đọc mức chân qua `GPIOB->IDR`.

### Contactor (PA10)

PA10 là GPIO OUT PP, mức cao là bật contactor. Trước khi `MX_GPIO_Init` chạy
(lúc vừa cấp nguồn, đang reset hoặc đang nạp code), PA10 chưa được cấu hình
nên code không kiểm soát được mức của chân.

Firmware bật contactor ngay khi boot (`CONTACTOR_ON_AT_BOOT = 1` trong
`contactor.c`): `MX_GPIO_Init` đặt mức thấp, rồi `App_Init` kéo lên cao. Nghĩa
là contactor đóng vài ms sau khi STM32 chạy, kể cả sau mỗi lần reset hoặc nạp
code. Điều khiển lúc chạy bằng lệnh `CONTACTOR,<seq>,ON|OFF`.

---

## 5. SWD / NRST

| Tín hiệu | Chân | Căn cứ |
|---|---|---|
| SWDIO | PA13 | `.ioc`: `SYS_JTMS-SWDIO` |
| SWCLK | PA14 | `.ioc`: `SYS_JTCK-SWCLK` |
| NRST | PG10-NRST | Chân reset mặc định, firmware không cấu hình lại |

Chỉ bật Serial Wire, không bật JTAG, nên PB3 (JTDO/SWO), PB4 (NJTRST) và
JTDI trên PA15 đều được giải phóng. Cách nối ST-LINK và xử lý lỗi khi nạp
xem `docs/FLASHING.md`.

---

## 6. Chân ECHO của sonar phải là PULLDOWN

Bốn chân ECHO (PB1, PB12, PB14, PA6) dùng ngắt trên cả hai sườn. Nếu để
`GPIO_NOPULL` (thả nổi), chân sẽ bắt nhiễu và sinh sườn ngẫu nhiên. Khi đó
driver tính ra khoảng cách nằm trong dải hợp lệ 200–6000 mm và gắn cờ
`valid=1`, dù **không cắm cảm biến nào**. Vật cản ma này đi thẳng vào local costmap của
Nav2 mà không có dấu hiệu lỗi nào.

Với `GPIO_PULLDOWN`: không có cảm biến thì không có sườn, driver timeout và
báo `valid=0`. Cảm biến thật có ngõ ra push-pull nên thắng điện trở nội
khoảng 40 kΩ một cách dễ dàng.

Cấu hình này đã có ở **cả** `.ioc` lẫn `main.c`. Sau mỗi lần generate lại từ
CubeMX, kiểm tra lại bốn chân này vẫn là PULLDOWN.

---

## 7. PB8 = BOOT0 và receiver encoder

PB8 nay mang kênh B encoder phải (ngõ 4Y của AM26LV32E qua 470 Ω). Với option
byte mặc định, chip đọc PB8 lúc thoát reset; mức cao thì chạy bootloader thay
cho firmware. Lúc reset mọi GPIO về Hi-Z, PB9 được 10 kΩ kéo xuống nên
receiver tắt và 4Y không lái PB8. Firmware chỉ bật receiver khi đã chạy.
Khi đó PB8 chỉ còn phụ thuộc mạch BOOT0 của module (nút BOOT0 + kéo xuống),
**chưa đo**. Cách kiểm, và lựa chọn option byte `nSWBOOT0` (làm bằng tay,
firmware không ghi): `docs/ENCODER_HBS57H.md` mục 3 và 6.

**Thử ngày 20/11/2026: không đạt.** Nhấn NRST lúc PB8 đang mức cao thì chip vào
DFU. PCB V2 dời encoder phải sang TIM1 PA8/PA9 và để PB8 chỉ làm BOOT0, xem
`robot/docs/encoder-bench-2026-11-20.md`.

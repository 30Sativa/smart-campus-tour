# STM32G431CBU (UFQFPN48) — pin map hiện tại

Tài liệu này mô tả **đúng theo source firmware và `motor_controller.ioc` hiện
tại**. Mọi thay đổi pin phải được cập nhật đồng thời trong CubeMX, code driver
và sơ đồ dây thực tế.

## Các chân đang được firmware sử dụng

| Chân | Chức năng | Căn cứ |
|---|---|---|
| PA0 | M1_STEP | GPIO output trong `main.c` |
| PA1 | M1_DIR | GPIO output trong `main.c` |
| PA2 | M2_STEP | GPIO output trong `main.c` |
| PA3 | M2_DIR | GPIO output trong `main.c` |
| PA4 | IMU RST tùy chọn | Chỉ dùng khi bật `BNO08X_USE_HW_RST=1` |
| PA5 | IMU INT tùy chọn | Chỉ dùng khi bật `BNO08X_USE_INT_PIN=1` |
| PA11 | USB_DM | USB CDC |
| PA12 | USB_DP | USB CDC |
| PA13 | SWDIO | Debug, không dùng cho thiết bị khác |
| PA14 | SWCLK | Debug, không dùng cho thiết bị khác |
| PB6 | IMU SCL | I2C bit-bang trong `bno08x.c` |
| PB7 | IMU SDA | I2C bit-bang trong `bno08x.c` |
| PB0 | SR04T SONAR1 TRIG | J_SONAR1 pin 2, GPIO output |
| PB1 | SR04T SONAR1 ECHO | J_SONAR1 pin 3, EXTI1 input |
| PB11 | SR04T SONAR2 TRIG | J_SONAR2 pin 2, GPIO output |
| PB12 | SR04T SONAR2 ECHO | J_SONAR2 pin 3, EXTI15_10 input |
| PB13 | SR04T SONAR3 TRIG | J_SONAR3 pin 2, GPIO output |
| PB14 | SR04T SONAR3 ECHO | J_SONAR3 pin 3, EXTI15_10 input |
| PB15 | SR04T SONAR4 TRIG | J_SONAR4 pin 1, GPIO output |
| PA6 | SR04T SONAR4 ECHO | J_SONAR4 pin 3, EXTI9_5 input |
| PA8 | PAN STEP | J_MCU_R.10 → R11 220 Ω → J_PAN.1, GPIO output (`head.c`) |
| PA15 | PAN DIR | J_MCU_R.15 → R12 220 Ω → J_PAN.2, GPIO output |
| PB2 | PAN nEN | J_MCU_L.7 → J_PAN.3, kéo lên 3V3 qua R9/R10, GPIO output, khởi động mức CAO |
| PA9 | TILT STEP | J_MCU_R.11 → R13 220 Ω → J_TILT.1, GPIO output |
| PA7 | TILT DIR | J_MCU_L.11 → R14 220 Ω → J_TILT.2, GPIO output |
| PB10 | TILT nEN | J_MCU_L.5 → J_TILT.3, kéo lên 3V3 qua R9/R10, GPIO output, khởi động mức CAO. **Trước 23/10/2026 là CONTACTOR_EN** |
| PA10 | CONTACTOR_EN | Cổng MOSFET contactor, GPIO output push-pull, khởi động mức THẤP (tắt). Lệnh `CONTACTOR,<seq>,ON/OFF`. **Từ 23/10/2026** |

## Timer đang dùng

| Timer | Dùng cho | Cấu hình ở |
|---|---|---|
| TIM2 | Tick 50 kHz phát xung STEP bánh xe, ưu tiên ngắt 1 | `.ioc` + `motor_hal.c` |
| TIM6 | Tick 10 kHz phát xung PAN/TILT, ưu tiên ngắt 2 | **chỉ `head.c`**, không có trong `.ioc` |

TIM6 không khai báo trong `.ioc`. Bật TIM6 hoặc DAC trong CubeMX sau này sẽ
sinh `TIM6_DAC_IRQHandler` trùng với bản trong `stm32g4xx_it.c` (USER CODE).

## Đầu quay PAN/TILT (DRV8825)

Theo PCB `robot-pan-tilt-chan-cho-6-9` (19/10/2026): STEP/DIR đi **thẳng** từ
STM32 qua điện trở nối tiếp 220 Ω, không qua 74HCT245, nên driver nhận mức
logic 3,3 V. DRV8825 nhận mức cao từ 2,2 V nên đủ, nhưng cần đo dạng xung tại
đầu driver với dây 20–25 cm. nEN tích cực mức thấp và có điện trở kéo lên
3V3: khi MCU reset hay chưa chạy tới `MX_GPIO_Init`, driver tắt. Firmware
chốt nEN mức cao trước khi bật output (`.ioc` `PinState=GPIO_PIN_SET`,
`main.c`, `head.c`). Chi tiết điều khiển: `docs/HEAD_PAN_TILT.md`.

**74HCT245 chân 6–9 (A5–A8) đang để hở** trên PCB mới. Firmware không điều
khiển được các chân này. Trước khi cấp nguồn chạy IC đệm của bánh xe, phải
đưa chúng về mức xác định ở phần cứng (nối GND hoặc điện trở kéo), xem tài
liệu PCB mục 3 và datasheet TI SN74HCT245 mục 11.1.

## Contactor (PA10)

PA10 lái cổng MOSFET của contactor: mức cao = đóng. Từ lúc cấp nguồn tới khi
`MX_GPIO_Init` chạy (và suốt lúc MCU reset hoặc đang nạp ST-Link), PA10 ở
trạng thái input thả nổi. **Cổng MOSFET phải có điện trở kéo xuống GND trên
mạch** (thường 10–100 kΩ), nếu không contactor có thể tự đóng lúc khởi động.
Firmware không thay thế được điện trở này. Cần kiểm tra trên PCB.

## ST-LINK / SWD

```text
ST-LINK SWDIO  -> STM32 PA13 (SWDIO)
ST-LINK SWCLK  -> STM32 PA14 (SWCLK)
ST-LINK GND    -> STM32 GND
ST-LINK VTref  -> STM32 3V3 (mức tham chiếu, không phải nguồn 5V)
ST-LINK NRST   -> STM32 NRST (BẮT BUỘC, xem docs/FLASHING.md)
```

**Cả 5 dây đều bắt buộc.** Thiếu NRST thì lúc firmware chạy nặng (USB CDC +
4 sonar EXTI + I2C bit-bang) ST-LINK không giành được quyền halt, báo
`init mode failed (unable to connect to the target)`. Chi tiết sự cố và cách
xử lý: `docs/FLASHING.md`.

Không cấp nguồn cho board từ chân 3V3 của mạch nạp DAPLink — ngõ ra đó quá yếu,
board sụt áp và SWD báo `cannot read IDR`.

USB nối vào cổng USB CDC của board chỉ dùng cho giao tiếp firmware/ROS, không
thay thế được dây SWD. ST-LINK phải được USB attach vào đúng hệ điều hành đang
chạy CubeIDE; nếu CubeIDE chạy trên Windows thì không để VMware giữ ST-LINK cho
Ubuntu guest. Kiểm tra bằng `STM32_Programmer_CLI -l` trước khi bấm Run/Debug.

## IMU BNO08x

```text
BNO08x SCL -> PB6
BNO08x SDA -> PB7
BNO08x ADD -> GND       # địa chỉ 7-bit 0x4A
BNO08x CS  -> 3V3       # chọn chế độ I2C
BNO08x RST -> 3V3       # hiện không dùng reset GPIO
BNO08x INT -> bỏ trống  # hiện driver đang polling
```

Driver không dùng `HAL_I2C`, `I2C_HandleTypeDef` hay `MX_I2C1_Init`. Nó tự tạo
START/STOP/ACK bằng GPIO open-drain và đọc `GPIOB->IDR`. Vì vậy đây là I2C
bit-bang, có hỗ trợ chờ clock stretching của BNO08x (timeout 25 ms).

## Các chân chưa được cấu hình trong firmware hiện tại

| Nhóm | Trạng thái |
|---|---|
| PB8/PB9 | Chưa dùng. Không được ghi là I2C1 trong tài liệu hiện tại. Có thể dành cho CAN sau khi cấu hình CubeMX và driver CAN. |
| I2C1/I2C2/I2C3 | Chưa có peripheral nào được khởi tạo trong `main.c`; các giá trị clock I2C còn lại trong `.ioc` không có nghĩa là I2C đang chạy. |
| CAN/FDCAN | Chưa có cấu hình và driver trong firmware hiện tại. |
| PB3–PB5, PB8/PB9, PC4, PC6, PC10–PC15, PF0–PF1 | Đang để dành; phải kiểm tra alternate function trong CubeMX trước khi dùng. |

## Lưu ý phần cứng

- BNO08x dùng bus I2C open-drain; cần pull-up phù hợp lên 3.3V.
- Không nối PB6/PB7 đồng thời vào một peripheral I2C khác nếu chưa kiểm tra địa
  chỉ và tải bus.
- Echo của SR04T có thể là 5V. Sơ đồ hiện tại nối trực tiếp vào PB1/PB12/PB14/PA6, nên phải xác nhận module đang chạy mức echo 3.3V hoặc thêm chia áp/level shifter trước khi cấp nguồn và flash firmware.
- SONAR3 (PB13/PB14) và SONAR2 (PB11/PB12) dùng chung `EXTI15_10_IRQHandler` (khác EXTI line thật: line 12 và line 14, chỉ chung vector ngắt theo nhóm). SONAR4 ECHO (PA6) dùng `EXTI9_5_IRQHandler` riêng (EXTI line 6). Không có xung đột line vì PB1(1), PB12(12), PB14(14), PA6(6) là 4 line EXTI khác nhau.
- SONAR4 TRIG dùng PB15 nhưng ECHO dùng PA6 (khác port A/B) — do đó `SR04T_EchoPort()` trong `sr04t.c` phải trả về đúng `GPIOA` cho sensor_index 3, các sensor còn lại vẫn `GPIOB`.
- 74HCT245 phải cấp 5V nếu dùng để nâng mức tín hiệu STEP/DIR; `OE#` phải được
  kéo đúng mức để output hoạt động.
- PB8/PB9 không được tự nhận là CAN chỉ vì tài liệu cũ từng đề xuất như vậy.

## Chân ECHO của sonar phải là PULLDOWN

Bốn chân ECHO (PB1, PB12, PB14, PA6) dùng ngắt trên cả hai sườn. Ban đầu chúng
được cấu hình `GPIO_NOPULL` — thả nổi.

Chân input thả nổi bắt nhiễu, sinh sườn lên/xuống ngẫu nhiên, và driver tính ra
khoảng cách nằm gọn trong dải hợp lệ 200–6000 mm rồi gắn cờ `valid=1`. Quan sát
thực tế: khi **chưa cắm cảm biến nào**, khung `FB` vẫn báo `642mm valid` và
`1364mm valid`.

Chế độ hỏng này im lặng và nguy hiểm — vật cản ma đi thẳng vào local costmap của
Nav2, và dây đứt hay cảm biến chết cũng cho ra đúng triệu chứng đó thay vì báo
`valid=0`.

`GPIO_PULLDOWN` là trạng thái nghỉ đúng: ECHO của SR04T nghỉ ở mức thấp và phát
xung lên cao. Không cắm cảm biến → không có sườn → timeout → `valid=0`. Cảm biến
thật có ngõ ra push-pull nên thắng điện trở nội ~40 kΩ dễ dàng, phép đo không
bị ảnh hưởng.

Sửa ở **cả** `motor_controller.ioc` (để CubeMX nhớ) và `Core/Src/main.c` (để
chạy được ngay). Nếu generate lại từ CubeMX, kiểm tra bốn chân này vẫn là
PULLDOWN.

**Đây là lỗi cấu hình phần mềm, không phải lỗi PCB.** Điện trở pull-down nằm
bên trong STM32, bật bằng một bit thanh ghi.

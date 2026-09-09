# IMU BNO085 — driver, tare và cách test

## File liên quan

| File | Vai trò |
|---|---|
| `Core/Inc/imu/bno08x.h` | API công khai |
| `Core/Inc/imu/bno08x_parse.h` | Logic thuần (parse SHTP, quaternion→Euler, wrap góc). Không phụ thuộc HAL → test được trên host |
| `Core/Src/imu/bno08x.c` | I2C bit-bang PB6/PB7, SHTP, self-test |
| `tests/test_bno08x_parse.c` | Test host cho `bno08x_parse.h` |
| `scripts/verify.sh` | Build + chạy test host, exit 0 = pass |

## Parse report — vì sao đổi

Bản cũ tìm rotation vector bằng cách **quét byte 0x05** trong payload. Một byte
dữ liệu (ví dụ delta trong base-timestamp 0xFB) tình cờ bằng 0x05 sẽ bị nhận nhầm
là report ID → quaternion rác, yaw nhảy lung tung mà không có lỗi nào báo ra.

Bản mới duyệt **tuần tự theo độ dài từng report** (`bno08x_find_report`). Gặp
report ID lạ hoặc report bị cắt cụt thì bỏ cả gói thay vì đoán bừa.

## Gói advertisement chắn hàng đợi

Ngay sau khi cấp nguồn hoặc reset, BNO085 đẩy ra một gói SHTP *advertisement*
dài khoảng 276 byte. Bản `shtp_read` cũ có buffer 256 byte và khi gặp gói lớn
hơn buffer thì `return -1` mà **không đọc bỏ nó đi**. Trên I2C, gói chưa đọc hết
vẫn nằm nguyên ở đầu hàng đợi, nên mọi lần đọc sau đó lại đụng đúng gói đó —
product-ID response và rotation vector vĩnh viễn không tới nơi. Triệu chứng:
`ACK` (chip có trên bus) nhưng `SELFTEST_FAIL` và `RV_NONE`.

Bản mới đọc bỏ gói quá cỡ theo từng chunk rồi trả `0`, và chặn header rác bằng
`SHTP_MAX_PACKET = 512`.

## Set Feature thiếu byte channel

`shtp_set_feature` bản cũ gán `pkt[0]`, `pkt[1]` rồi nhảy thẳng sang `pkt[3]` —
**`pkt[2]` không bao giờ được gán**, mà đó là byte channel của SHTP (phải = 2).
Nó mang rác trên stack nên lệnh bật rotation vector bay tới channel ngẫu nhiên
và chip lặng lẽ bỏ qua.

Triệu chứng rất dễ dẫn sai hướng: `SELFTEST_OK` (product-ID request có gán
channel đúng nên chạy tốt) nhưng `RV_NONE` mãi mãi.

Phần dựng gói giờ nằm ở `bno08x_build_set_feature()` trong `bno08x_parse.h`,
memset sạch trước khi gán, và `tests/test_bno08x_parse.c` đổ 0xAA vào buffer
trước khi gọi để bắt đúng lỗi sót byte kiểu này.

## Bus bit-bang chạy ở 2 kHz

`bb_delay()` bản cũ là `for (volatile int i = 0; i < 150; i++)` — số vòng chọn
đại, thời gian thực tế phụ thuộc cả tần số CPU lẫn mức optimize. Đo ra
**2 kHz**, chậm hơn chuẩn I2C 50 lần. Hậu quả dây chuyền: đọc chậm → chip dồn
nhiều mẫu vào một gói → gói to hơn → đọc càng chậm, cân bằng ở 5 mẫu/gói và
14 mẫu/giây thay vì 50.

Bản mới đếm chu kỳ CPU qua DWT (`BNO08X_BB_HALF_PERIOD_US = 5`), độc lập với
cả hai thứ đó. Kết quả đo: `CLK` 2 000 → 23 500, `PKT` 79 → 23, `RATE` 14 → 51.

Ghi chú: `CLK` chưa đạt 90 kHz như tính toán vì ở SYSCLK 16 MHz thì
`HAL_GPIO_WritePin` và vòng đọc DWT chiếm phần lớn thời gian mỗi bit. Bus dùng
~52% băng thông, đủ chạy 50 Hz.

## Ngân sách thời gian của main loop

`App_Loop()` là vòng lặp co-operative duy nhất: `Motor_Update()`,
`Protocol_Update()` (feedback + watchdog lệnh 300 ms) và
`BNO08x_ReadRotationVector()` dùng chung nó.

Bản cũ xả **tối đa 8 gói SHTP mỗi lần gọi** `ReadRotationVector()`. Trên bus
22.5 kHz, một vòng `App_Loop()` tốn ~220 ms, nên feedback tụt xuống **4.5 Hz**
dù `FEEDBACK_PERIOD_MS = 20`, và `ros2 topic hz /odom` chỉ còn ~4.5 Hz.

Đo trên phần cứng, 30 s gửi `STOP` ở 20 Hz:

| | trước |
|---|---|
| command gửi | 594 |
| feedback nhận | 136 |
| `ERR` | 0 |
| `dt_ms` min/max | 210 / 231 |
| `dt_ms` trung bình | 220.6 |

Hai hằng số chặn việc này, cả hai ở `bno08x.h`:

| Hằng số | Giá trị | Chặn cái gì |
|---|---|---|
| `BNO08X_MAX_PACKETS_PER_UPDATE` | 1 | Độ trễ của main loop |
| `BNO08X_RV_INTERVAL_MS` | 50 (20 Hz) | Backlog trong FIFO của BNO08x |

Cần **cả hai**, và mỗi cái giải quyết một việc khác nhau:

- Băng thông bus mới là thứ chặn trên tốc độ tiêu thụ, **không phải** số gói
  mỗi vòng. Đọc N gói tốn ~N lần thời gian, nên số gói/giây gần như không đổi
  dù N là 1 hay 8. Vì vậy giảm N **một mình** làm feedback nhanh lên nhưng
  **không** chống được backlog — đúng cái bẫy "đổi 8 → 1 là xong".
- Chống backlog phải làm ở phía **phát**: `BNO08X_RV_INTERVAL_MS` đặt tốc độ
  phát ≤ tốc độ tiêu thụ. 20 Hz khớp đúng nhịp `FEEDBACK_PERIOD_MS = 20 ms` —
  khung `FB` chỉ mang được mẫu yaw **mới nhất**, nên phát nhanh hơn chỉ đốt
  băng thông bus chứ không làm `/odom` chính xác hơn.
- Chọn N = 1 chứ không phải 2: throughput y hệt (bus chặn), nhưng độ trễ
  worst-case của main loop chỉ bằng một nửa.

Cách kiểm tra sau khi flash — chạy `DIAG` và đọc hai trường:

- `RATE` ≈ `1000 / BNO08X_RV_INTERVAL_MS` (= ~20). Thấp hơn nhiều = đọc không
  kịp → **nới rộng** `BNO08X_RV_INTERVAL_MS`, đừng tăng số gói mỗi vòng.
- `PKT` giữ ~23 (một report/gói). `PKT` lớn dần = chip đang dồn mẫu vì đọc
  chậm — dấu hiệu sớm của death spiral mô tả ở mục bus 2 kHz phía trên.

Nếu sau này SYSCLK lên PLL (mục dưới) thì bus nhanh hơn nhiều và có thể hạ
`BNO08X_RV_INTERVAL_MS` về 20 (50 Hz), kiểm lại bằng `RATE`/`PKT`.

## SYSCLK đang là 16 MHz, không phải 96 MHz

`SystemClock_Config` bật PLL (16 MHz × 12 / 2 = 96 MHz) nhưng lại đặt
`SYSCLKSource = RCC_SYSCLKSOURCE_HSI`, nên MCU chạy thẳng HSI 16 MHz.

**Chưa sửa** vì đổi SYSCLK làm prescaler timer động cơ sai đi 6 lần và cần tăng
flash latency. Nếu sửa thì làm trong CubeMX (Clock Configuration → System Clock
Mux = PLLCLK) rồi hiệu chỉnh lại tốc độ động cơ. USB không ảnh hưởng vì lấy
48 MHz từ HSI48 riêng.

## Quy ước dấu yaw

Đo trên bàn, tare về 0 rồi xoay một phần tư vòng:

| Chiều xoay | yaw |
|---|---|
| Sang phải (thuận chiều kim đồng hồ) | −90.97 |
| Sang trái (ngược chiều kim đồng hồ) | +89.52 |

Khớp REP-103 của ROS (trục Z hướng lên, yaw dương = quay trái). **Không đảo dấu
trong driver.** Sai số dưới 1.5° mỗi phần tư vòng.

## Độ bền của tầng I/O

Ba lỗi có thể làm robot chết giữa đường, đã sửa:

**`i2c_read` vứt dữ liệu đã đọc.** Bản cũ `return bb_stop() ? n : 0U;` — mà
`bb_stop()` trả về mức SDA sau STOP. Slave giữ SDA thấp hoặc sườn lên chậm là
cả gói bị coi như lỗi, dù dữ liệu đã nằm đủ trong buffer và gói đó đã bị tiêu
thụ khỏi thiết bị. Đường mất mẫu âm thầm. Giờ đọc đủ byte là thành công; bất
thường ở STOP đếm vào `WARN` trong `DIAG`.

**`bb_delay()` treo vĩnh viễn.** `while ((DWT->CYCCNT - start) < ticks) {}`
không có lối thoát. `CYCCNT` không chạy là treo cứng firmware. Giờ `Init` kiểm
tra `CYCCNT` có thật sự tăng (`DWT=1/0` trong `DIAG`), có đường dự phòng bằng
vòng NOP, và có trần vòng lặp trong mọi trường hợp. Cùng lỗi ở
`sr04t.c: SR04T_DelayUs()` cũng đã sửa.

**Bus kẹt không tự hồi.** MCU reset giữa lúc slave đang đẩy bit ra thì slave
giữ SDA thấp chờ clock, `bb_start()` trả 0 mãi mãi cho tới khi cắt nguồn. Giờ
`bb_start()` gặp SDA thấp sẽ gọi `bus_recover()` (9 xung clock + STOP, kỹ thuật
chuẩn) rồi thử lại một lần. Đếm vào `REC`.

`WARN` và `REC` phải đứng yên ở 0 khi bus khoẻ. Tăng dần trong lúc chạy là dấu
hiệu phần cứng có vấn đề.

## Accuracy

Report rotation vector mang mức tin cậy 0–3 ở byte status. Khi từ kế chưa hiệu
chuẩn, BNO085 vẫn trả heading nhưng báo accuracy 0 — số nhìn hợp lý mà sai hàng
chục độ. Giá trị này giờ nằm ở **cuối** khung `FB` (thêm ở cuối nên parser cũ
không vỡ) và trong `DIAG` dưới tên `ACC`.

`yaw_valid` nói "có dữ liệu mới", `ACC` nói "dữ liệu đáng tin tới đâu". Bên Nav2
nên dùng `ACC` để hạ trọng số IMU thay vì tin tuyệt đối.

Hiệu chuẩn từ kế: cầm xe vẽ hình số 8 trong không khí khoảng 10 lần, `ACC` sẽ
leo lên 3.

## Tare (đặt góc)

Tare ở đây là **offset phần mềm**, chỉ tác động lên yaw, không ghi flash của
BNO085 (không dùng lệnh Tare/Persist của SH-2). Đơn giản, không mòn flash,
và reset lại khi cấp nguồn lại.

```
reported_yaw = wrap180(raw_yaw - offset)
```

API:

```c
void  BNO08x_SetYawDeg(float yaw_deg);  // hướng đang quay mặt vào = yaw_deg
void  BNO08x_ClearYawOffset(void);      // bỏ offset, về yaw thô
float BNO08x_GetYawOffset(void);
```

Lệnh USB CDC (CSV, kết thúc bằng `\n`):

```
TARE,<seq>          -> đặt hướng hiện tại = 0 độ
TARE,<seq>,<deg>    -> đặt hướng hiện tại = <deg> độ
TARE,<seq>,RAW      -> bỏ offset, về yaw thô
```

### Chẩn đoán tại chỗ

```
DIAG,<seq>
```

Dừng motor, ping I2C, chạy self-test, bật lại rotation vector rồi chờ tối đa
500 ms xem có report về không. Blocking ~1.1 s. Trả về một dòng:

```
DIAG,<seq>,<ACK|NOACK>,<SELFTEST_OK|SELFTEST_FAIL>,<sw>,<RV_OK|RV_NONE>,SDA=<0|1>,SCL=<0|1>,EXTPU=<sda><scl>,SCAN=<addr...>,PKT=<len>/ch<n>,RATE=<hz>,CLK=<hz>,
SYS=<MHz>,ACC=<0..3>,WARN=<n>,REC=<n>,DWT=<0|1>
```

Dùng cái này thay vì phải canh cửa sổ 5 giây in diag lúc boot.

Đọc kết quả:

| Triệu chứng | Nghĩa là |
|---|---|
| `SDA=0` hoặc `SCL=0` | Đường bus chập GND. Sửa cái này trước, mọi thứ khác vô nghĩa |
| `EXTPU=00` | **Không có pull-up ngoài.** Dây đứt/chưa cắm, module mất nguồn, hoặc chưa gắn điện trở 4.7k. `SDA=1,SCL=1` mà `EXTPU=00` chỉ là pull-up nội của STM32, không chứng minh gì về module |
| `EXTPU=11` + `SCAN=none` | Dây và nguồn ổn, chip không chịu nói chuyện → sai chân chọn chế độ (CS, PS0, PS1, BOOTN, RST) |
| `SDA=1,SCL=1,SCAN=none` | Bus điện tốt nhưng không có thiết bị nào trả lời. Nghi CS chưa kéo 3V3 (chip vào SPI mode), BOOTN thấp, RST thấp, hoặc chưa cấp nguồn |
| `SCAN=4B` | Chip sống nhưng ở địa chỉ khác. Kéo chân ADD/ADR xuống GND, hoặc đổi `BNO_ADDR` trong `bno08x.c` |
| `SCAN=4A` + `NOACK` | Bus chập chờn, nghi pull-up quá yếu hoặc dây quá dài |
| `ACK` + `SELFTEST_FAIL` | Tầng SHTP hỏng, không phải wiring. Xem `PKT` |
| `PKT` > 256 | Gói advertisement đang nằm chắn ở đầu hàng đợi — xem mục dưới |
| `PKT=65535` | Không đọc nổi header, bus có ACK nhưng không trả dữ liệu |

`TARE` **không** làm mới watchdog motor (300 ms) — nó không phải lệnh chuyển động.
Không có ACK riêng: xác nhận bằng cách nhìn `yaw_cdeg` trong frame `FB` kế tiếp.

## Test

### 1. Test logic trên máy (không cần board)

```bash
cd stm32/motor_controller
./scripts/verify.sh        # exit 0 = pass
```

Bao gồm: bảng độ dài report, không nhầm byte dữ liệu thành report ID, không nhầm
game-rotation-vector thành rotation-vector, report lạ/cắt cụt, quaternion→Euler,
wrap180, và toán tare (kể cả các trường hợp vắt qua ±180).

### 2. Test trên board

1. Nạp firmware, mở cổng USB CDC (Tera Term / `screen` / `pyserial`).
2. Lúc boot có `[diag k] BNO08x PB6/PB7=ACK-OK` và `BNO08x self-test: OK (SW x.y)`.
   - `NOACK` → sai dây SCL/SDA, thiếu pull-up, hoặc CS chưa kéo lên 3V3.
3. Đọc yaw: mỗi 20 ms có frame
   `FB,<seq>,<left>,<right>,<dt_ms>,<status>,<yaw_cdeg>,<yaw_valid>,<sonar...>`
   → `yaw_deg = yaw_cdeg / 100`.
4. Kiểm tra dấu và độ chính xác: đặt robot yên, xoay đúng 90° theo chiều kim đồng
   hồ, yaw phải đổi khoảng 90° (kiểm tra luôn chiều dấu để khớp quy ước của bên
   navigation).
5. Kiểm tra tare:
   - gửi `TARE,1` → frame kế tiếp `yaw_cdeg` ≈ 0
   - xoay 30° → `yaw_cdeg` ≈ 3000
   - gửi `TARE,2,90` → `yaw_cdeg` ≈ 9000
   - gửi `TARE,3,RAW` → quay lại giá trị thô
6. Kiểm tra vắt biên: tare sao cho yaw ở gần 180, xoay qua lại — giá trị phải
   nhảy giữa +180 và −180, không được ra 190 hay −190.
7. Muốn in trực tiếp yaw/pitch/roll ra CDC: đặt `BNO08X_DEBUG_PRINT_EULER 1`
   trong `Core/Src/app/app.c` (in 10 Hz).

## Còn thiếu

- Chỉ bật Rotation Vector. Chưa có accel/gyro raw, linear accel, game rotation vector.
- Chưa lưu/nạp calibration (DCD) của BNO085 → mỗi lần cấp nguồn phải để nó tự ổn định.
- Chân RST/INT đang tắt bằng macro (`BNO08X_USE_HW_RST` / `BNO08X_USE_INT_PIN` = 0),
  chạy thuần polling.
- `bb_delay()` là vòng lặp NOP → tốc độ bus phụ thuộc mức optimize khi compile.

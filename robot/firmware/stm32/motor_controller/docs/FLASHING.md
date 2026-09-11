# Nạp firmware — quy trình và sự cố đã gặp

## Cách nạp (dùng hằng ngày)

Double-click **`scripts/nap.bat`**. Nó build rồi nạp trong một lần chạy, không
cần mở STM32CubeIDE.

```
scripts/nap.bat
  ├─ [1/2] make -C Debug all       (toolchain lấy từ CubeIDE)
  └─ [2/2] openocd -f scripts/stlink.cfg → program + verify + reset
```

Trước khi chạy: **đóng STM32CubeIDE và STM32CubeProgrammer**, nếu không chúng
giữ mất ST-LINK và OpenOCD báo `open failed`.

Debug từng bước (breakpoint, xem biến) thì vẫn dùng CubeIDE như bình thường.

## Đấu dây ST-LINK — đủ 5 sợi

```text
ST-LINK 3.3V   -> board 3V3     (VTref, ST-LINK cần để biết mức logic)
ST-LINK GND    -> board GND
ST-LINK SWCLK  -> board CLK     (PA13)
ST-LINK SWDIO  -> board DIO     (PA14)
ST-LINK RST    -> board NRST    (header trên, hàng trong: VB, C14, NRST)
```

Khi gỡ lỗi nạp, **tháo hết tải khỏi board**: motor driver, contactor, sonar, IMU.

## Sự cố 2026-09-11 — `init mode failed (unable to connect to the target)`

**Triệu chứng.** Hôm trước nạp bình thường, hôm sau CubeIDE báo:

```
Error: init mode failed (unable to connect to the target)
```

kèm popup GDB `could not connect (error 138)`. Popup đó chỉ là hệ quả: OpenOCD
chết ở bước `init` nên cổng 3333 không mở, GDB connect trượt. **Luôn đọc console
OpenOCD, đừng đọc popup GDB.**

**Nguyên nhân gốc.**

1. Thiếu dây NRST. Launch config sinh ra `reset_config none` +
   `CONNECT_UNDER_RESET 0`, tức OpenOCD phải bắt con MCU đang chạy. Firmware
   hiện tại khởi động USB CDC, 4 sonar dùng EXTI và I2C bit-bang polling —
   cửa sổ để SWD chen vào gần như không còn.
2. Nguồn cấp không ổn định (có lúc thử cấp từ chân 3V3 của DAPLink, quá yếu).

**Không phải** do ST-LINK hỏng. Đã thử thay bằng DAPLink (CMSIS-DAP) và nó fail
đúng ở cùng một chỗ — đó là bằng chứng loại trừ, không phải công cốc.

**Cách khắc phục.** Nối đủ 5 dây, tháo tải, nạp bằng `scripts/nap.bat`.

## Giải mã thông báo lỗi

| Log | Nghĩa | Xử lý |
|---|---|---|
| `Target voltage: 0 V` + `Firmware version` trống | Phần mềm chưa mở được ST-LINK | Tắt CubeIDE, kill `openocd.exe` / `ST-LINK_gdbserver.exe`, rút cắm lại |
| `cannot read IDR` | Đầu nạp OK, MCU không trả lời trên SWD | Kiểm tra DIO/CLK có đảo không, GND, nguồn board |
| `init mode failed` | SWD không bắt tay được | Nối NRST, hạ `CLOCK_FREQ` xuống 100 |
| `timed out while waiting for target halted` | `connect_assert_srst` đang ghim NRST ở mức thấp | Dùng `reset_config none separate` + `cortex_m reset_config sysresetreq` |
| `RDP level 0 (0xAA)` | Chip không bị khoá | Bình thường, không cần làm gì |

## Đường cứu hộ khi SWD chết hẳn

Board có USB-C nối thẳng PA11/PA12 nên dùng được USB DFU bootloader, không cần
mạch nạp:

1. Giữ **BOOT0**, nhấn–nhả **NRST**, nhả **BOOT0**
2. Cắm USB-C của **board** (không phải của mạch nạp) vào PC
3. Device Manager hiện `STM32 BOOTLOADER`
4. CubeProgrammer → đổi dropdown `ST-LINK` thành `USB` → Connect → nạp

Hiện `STM32 BOOTLOADER` nghĩa là MCU còn sống, lỗi chỉ nằm ở đường SWD.

## Còn tồn đọng

Linker script đang là `STM32G431C6UX_FLASH.ld` (32 KB flash) trong khi chip thật
là **STM32G431CBU6 — 128 KB** (OpenOCD đọc `flash size = 128 KiB`). Đang tự giới
hạn còn 1/4 dung lượng, sẽ gặp `region FLASH overflowed` khi firmware lớn thêm.

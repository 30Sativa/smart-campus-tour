#!/usr/bin/env bash
# Verify nhanh phan logic thuan cua firmware (khong can toolchain ARM).
# Exit 0 = pass.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

echo "== build test host =="
for t in test_bno08x_parse test_usb_rx_queue; do
    gcc -std=c11 -Wall -Wextra -Werror -O1 \
        -I "$root/Core/Inc" \
        "$root/tests/$t.c" \
        -lm -o "$out/$t"
done

<<<<<<< Updated upstream
echo "== run =="
for t in test_bno08x_parse test_usb_rx_queue; do
=======
# motor_core.c chay voi main.h gia (tests/stubs) va -O0 nhu build Debug cua
# CubeIDE; #pragma optimize trong file van ap dung nhu tren MCU.
gcc -std=c11 -Wall -Wextra -Werror -O1 \
    -I "$root/Core/Inc" \
    "$root/tests/test_bno08x_rearm.c" "$root/Core/Src/imu/bno08x_rearm.c" \
    -o "$out/test_bno08x_rearm"

gcc -std=gnu11 -Wall -Wextra -Werror -O0 \
    -I "$root/tests/stubs" -I "$root/Core/Inc" \
    "$root/tests/test_motor_core.c" "$root/Core/Src/motor/motor_core.c" \
    -lm -o "$out/test_motor_core"

gcc -std=gnu11 -Wall -Wextra -Werror -O0 \
    -I "$root/tests/stubs" -I "$root/Core/Inc" \
    "$root/tests/test_usb_protocol.c" "$root/Core/Src/usb_protocol.c" \
    "$root/Core/Src/head/head_core.c" \
    -lm -o "$out/test_usb_protocol"

# Dau quay PAN/TILT: thong so mac dinh, va mot ban toc do cao de cham tran
# HEAD_MAX_STEP_HZ (kiem tra do rong xung va khong mat xung o tran).
gcc -std=gnu11 -Wall -Wextra -Werror -O0 \
    -I "$root/tests/stubs" -I "$root/Core/Inc" \
    "$root/tests/test_head_core.c" "$root/Core/Src/head/head_core.c" \
    -lm -o "$out/test_head_core"
gcc -std=gnu11 -Wall -Wextra -Werror -O0 \
    -DHEAD_MAX_SPEED_DPS=3000.0f -DHEAD_ACCEL_DPS2=30000.0f \
    -I "$root/tests/stubs" -I "$root/Core/Inc" \
    "$root/tests/test_head_core.c" "$root/Core/Src/head/head_core.c" \
    -lm -o "$out/test_head_core_fast"
# Ban vi buoc 1/16 (khi cam jumper M2 tren DRV8825).
gcc -std=gnu11 -Wall -Wextra -Werror -O0 \
    -DHEAD_MICROSTEP=16.0f \
    -I "$root/tests/stubs" -I "$root/Core/Inc" \
    "$root/tests/test_head_core.c" "$root/Core/Src/head/head_core.c" \
    -lm -o "$out/test_head_core_micro16"

echo "== run =="
for t in test_bno08x_parse test_bno08x_rearm test_usb_rx_queue test_motor_core test_usb_protocol test_head_core test_head_core_fast test_head_core_micro16; do
>>>>>>> Stashed changes
    echo "-- $t"
    "$out/$t"
done

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

# motor_core.c chay voi main.h gia (tests/stubs) va -O0 nhu build Debug cua
# CubeIDE; #pragma optimize trong file van ap dung nhu tren MCU.
gcc -std=gnu11 -Wall -Wextra -Werror -O0 \
    -I "$root/tests/stubs" -I "$root/Core/Inc" \
    "$root/tests/test_motor_core.c" "$root/Core/Src/motor/motor_core.c" \
    -lm -o "$out/test_motor_core"

gcc -std=gnu11 -Wall -Wextra -Werror -O0 \
    -I "$root/tests/stubs" -I "$root/Core/Inc" \
    "$root/tests/test_usb_protocol.c" "$root/Core/Src/usb_protocol.c" \
    -lm -o "$out/test_usb_protocol"

echo "== run =="
for t in test_bno08x_parse test_usb_rx_queue test_motor_core test_usb_protocol; do
    echo "-- $t"
    "$out/$t"
done

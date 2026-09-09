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

echo "== run =="
for t in test_bno08x_parse test_usb_rx_queue; do
    echo "-- $t"
    "$out/$t"
done

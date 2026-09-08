#!/usr/bin/env bash
# Verify nhanh phan logic thuan cua firmware (khong can toolchain ARM).
# Exit 0 = pass.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

echo "== build test host =="
gcc -std=c11 -Wall -Wextra -Werror -O1 \
    -I "$root/Core/Inc" \
    "$root/tests/test_bno08x_parse.c" \
    -lm -o "$out/test_bno08x_parse"

echo "== run =="
"$out/test_bno08x_parse"

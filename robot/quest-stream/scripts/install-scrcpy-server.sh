#!/usr/bin/env bash
# Download scrcpy-server (the small Android-side part of scrcpy, ~90 KB) for QUEST_CAPTURE=scrcpy.
# Nothing is installed system-wide and no kernel module (v4l2loopback) is needed.
#   bash scripts/install-scrcpy-server.sh           # latest release
#   bash scripts/install-scrcpy-server.sh v3.3.1    # a given release
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p bin
TAG="${1:-}"
if [ -z "$TAG" ]; then
  TAG=$(curl -fsSL https://api.github.com/repos/Genymobile/scrcpy/releases/latest \
    | python3 -c 'import json, sys; print(json.load(sys.stdin)["tag_name"])')
fi
case "$TAG" in v*) ;; *) TAG="v$TAG" ;; esac
curl -fL --retry 3 -o bin/scrcpy-server.tmp \
  "https://github.com/Genymobile/scrcpy/releases/download/$TAG/scrcpy-server-$TAG"
mv bin/scrcpy-server.tmp bin/scrcpy-server
echo "${TAG#v}" > bin/scrcpy-server.version
echo "Installed scrcpy-server ${TAG#v} -> bin/scrcpy-server"
echo "Enable it: QUEST_CAPTURE=scrcpy in quest-stream.env, then: sudo systemctl restart quest-stream"

#!/usr/bin/env bash
# Environment check for the Quest 3 -> NUC -> HLS stream.
# Exit 0 = ready to stream, 1 = something is missing (the message says what).
set -u
cd "$(dirname "$0")/.."
[ -f quest-stream.env ] && set -a && . ./quest-stream.env && set +a
ADB="${QUEST_ADB:-adb}"
FFMPEG="${QUEST_FFMPEG:-ffmpeg}"
PORT="${QUEST_STREAM_PORT:-8080}"
ok=1

step() { printf '%-10s ' "$1"; }

step adb
if command -v "$ADB" >/dev/null 2>&1; then "$ADB" version | head -1; else echo "MISSING -> sudo apt install adb"; ok=0; fi
step ffmpeg
if command -v "$FFMPEG" >/dev/null 2>&1; then "$FFMPEG" -hide_banner -version | head -1; else echo "MISSING -> sudo apt install ffmpeg"; ok=0; fi
step python3
if command -v python3 >/dev/null 2>&1; then python3 --version; else echo "MISSING -> sudo apt install python3"; ok=0; fi
if command -v "$FFMPEG" >/dev/null 2>&1; then
  step libx264
  if "$FFMPEG" -hide_banner -encoders 2>/dev/null | grep -q libx264; then echo ok; else echo "MISSING (install the Ubuntu ffmpeg package)"; ok=0; fi
fi

step quest
if command -v "$ADB" >/dev/null 2>&1; then
  devices=$("$ADB" devices -l 2>&1 | sed '1d;/^$/d;/^\*/d')
  if [ -z "$devices" ]; then
    echo "QUEST_NOT_CONNECTED: no device. Check USB cable, headset on, Developer Mode enabled."; ok=0
  else
    echo "$devices" | while read -r line; do echo "           $line"; done
    if [ -n "${QUEST_SERIAL:-}" ]; then
      echo "$devices" | grep -q "^${QUEST_SERIAL}[[:space:]]\+device" || { echo "           QUEST_NOT_CONNECTED: ${QUEST_SERIAL} not in 'device' state"; ok=0; }
    elif ! echo "$devices" | grep -q "[[:space:]]device\([[:space:]]\|$\)"; then
      echo "           QUEST_NOT_CONNECTED: device not authorised/online. Put the headset on and accept 'Allow USB debugging'."; ok=0
    fi
  fi
fi

step port
if command -v ss >/dev/null 2>&1 && ss -ltn "( sport = :$PORT )" | grep -q ":$PORT"; then
  echo "$PORT in use (stream already running? scripts/stop-stream.sh)"
else
  echo "$PORT free"
fi
step ip
hostname -I 2>/dev/null | awk -v p="$PORT" '{for(i=1;i<=NF;i++) if ($i !~ /:/) print "http://" $i ":" p "/hls/quest.m3u8"}' | head -3

[ "$ok" = 1 ] && { echo "READY"; exit 0; } || { echo "NOT READY"; exit 1; }

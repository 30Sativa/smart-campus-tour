#!/usr/bin/env bash
# Environment check for Quest 3 -> NUC -> MediaMTX -> WebRTC.
# Exit 0 = ready to stream, 1 = something is missing (the message says what).
set -u
cd "$(dirname "$0")/.."
[ -f quest-stream.env ] && set -a && . ./quest-stream.env && set +a
ADB="${QUEST_ADB:-adb}"
FFMPEG="${QUEST_FFMPEG:-ffmpeg}"
PORT="${QUEST_STREAM_PORT:-8080}"
PUBLISH="${QUEST_PUBLISH_URL:-rtsp://127.0.0.1:8554/quest}"
ok=1

step() { printf '%-10s ' "$1"; }
listening() { # proto port
  command -v ss >/dev/null 2>&1 || return 2
  ss -ln"$([ "$1" = udp ] && echo u || echo t)" "( sport = :$2 )" | grep -q ":$2"
}

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

step mediamtx
if [ -x /usr/local/bin/mediamtx ] || command -v mediamtx >/dev/null 2>&1; then
  printf 'installed'
  if systemctl is-active --quiet mediamtx 2>/dev/null; then echo ", service running"; else echo ", service NOT running -> scripts/install-services.sh (or: sudo systemctl start mediamtx)"; fi
else
  echo "MISSING -> scripts/install-mediamtx.sh"; ok=0
fi
step rtsp
host_port=$(echo "$PUBLISH" | sed -E 's#^rtsps?://([^@/]*@)?([^/]+)/.*#\2#')
host=${host_port%:*}; rport=${host_port##*:}; [ "$rport" = "$host_port" ] && rport=554
if (exec 3<>"/dev/tcp/$host/$rport") 2>/dev/null; then echo "$host:$rport reachable ($PUBLISH)"; else echo "$host:$rport NOT reachable -> MediaMTX not running?"; ok=0; fi
step webrtc
if ! command -v ss >/dev/null 2>&1; then echo "skipped (no 'ss' command)"
else
  if listening tcp 8889; then printf '8889/tcp listening'; else printf '8889/tcp NOT listening'; ok=0; fi
  if listening udp 8189; then echo ", 8189/udp listening"; else echo ", 8189/udp NOT listening"; ok=0; fi
fi
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw status 2>/dev/null | grep -q "8189/udp" || echo "           WARN firewall active without 8189/udp: sudo ufw allow 8189/udp && sudo ufw allow 8889/tcp"
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
else
  echo "skipped (no adb)"
fi

step status
if listening tcp "$PORT"; then echo "$PORT in use (quest-stream already running? curl localhost:$PORT/status)"; else echo "$PORT free"; fi
step whep
hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' | head -3 | sed 's#.*#http://&:8889/quest/whep#' | sed '2,$s/^/           /'

[ "$ok" = 1 ] && { echo "READY"; exit 0; } || { echo "NOT READY"; exit 1; }

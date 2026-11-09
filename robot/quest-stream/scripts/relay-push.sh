#!/usr/bin/env bash
# Forward the local Quest stream (MediaMTX on this NUC) to the public relay on EC2.
# No re-encoding (-c copy): almost no CPU. Run by the quest-relay-push service,
# which restarts it a few seconds after it stops (no local stream yet, network down).
#   RELAY_SRT_URL   srt://... printed by relay/install-relay.sh on EC2 (relay-push.env)
#   RELAY_SOURCE    default rtsp://127.0.0.1:8554/quest
set -eu
cd "$(dirname "$0")/.."
# Read the value literally: the URL contains '&' and '?', so the file is not sourced.
if [ -z "${RELAY_SRT_URL:-}" ] && [ -f relay-push.env ]; then
  RELAY_SRT_URL=$(sed -n 's/^RELAY_SRT_URL=//p' relay-push.env | tail -n 1 | tr -d "\"'\r")
fi
: "${RELAY_SRT_URL:?set RELAY_SRT_URL in relay-push.env (printed by relay/install-relay.sh on EC2)}"
SOURCE=${RELAY_SOURCE:-rtsp://127.0.0.1:8554/quest}
echo "RELAY_PUSH ${SOURCE} -> ${RELAY_SRT_URL%%\?*}"
exec ffmpeg -hide_banner -loglevel warning -nostats \
  -fflags nobuffer -flags low_delay -rtsp_transport tcp -i "$SOURCE" \
  -map 0:v:0 -c copy -f mpegts "$RELAY_SRT_URL"

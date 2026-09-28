#!/usr/bin/env bash
# Snapshot of stream performance: resolution, fps, bitrate, viewers, CPU,
# memory. Glass-to-screen latency: see README "Đo độ trễ".
set -u
cd "$(dirname "$0")/.."
[ -f quest-stream.env ] && set -a && . ./quest-stream.env && set +a
PORT="${QUEST_STREAM_PORT:-8080}"
URL="http://127.0.0.1:$PORT"
API="${MEDIAMTX_API:-http://127.0.0.1:9997}"
PUBLISH="${QUEST_PUBLISH_URL:-rtsp://127.0.0.1:8554/quest}"
MPATH=$(echo "$PUBLISH" | sed -E 's#^rtsps?://[^/]+/##')

echo "== quest-stream /status"
curl -s "$URL/status" | python3 -c '
import json, sys
d = json.load(sys.stdin)
o = d["output"]
print("  state={} reason={}".format(d["state"], d["reason"]))
print("  output={}x{} target_fps={} actual_fps={} encoder_bitrate={} speed={} drop={} dup={}".format(
    o["width"], o["height"], o["targetFps"], o["fps"], o["bitrate"], o["speed"], o["dropFrames"], o["dupFrames"]))
' 2>/dev/null || echo "  quest-stream not reachable on $URL"

echo "== MediaMTX path '$MPATH' (bitrate over 5 s, viewers)"
python3 - "$API" "$MPATH" <<'PY'
import json, sys, time, urllib.request
api, path = sys.argv[1], sys.argv[2]
def get():
    with urllib.request.urlopen(f"{api}/v3/paths/get/{path}", timeout=3) as r:
        return json.load(r)
try:
    a = get(); time.sleep(5); b = get()
except Exception as e:
    print(f"  n/a ({e}); is MediaMTX running with MTX_API=yes?")
    sys.exit(0)
rate = (b.get("bytesReceived", 0) - a.get("bytesReceived", 0)) * 8 / 5 / 1e6
readers = b.get("readers") or []
kinds = {}
for r in readers:
    kinds[r.get("type", "?")] = kinds.get(r.get("type", "?"), 0) + 1
print(f"  ready={b.get('ready')} tracks={b.get('tracks')} bitrate_in={rate:.2f} Mbit/s")
print(f"  viewers={len(readers)} {kinds if kinds else ''}")
PY

echo "== ffprobe of what MediaMTX serves"
command -v ffprobe >/dev/null && timeout 15 ffprobe -v error -rtsp_transport tcp -select_streams v:0 \
  -show_entries stream=codec_name,profile,width,height,sample_aspect_ratio,r_frame_rate,has_b_frames \
  -of default=nw=1 "$PUBLISH" 2>&1 | awk '!seen[$0]++' | sed 's/^/  /'

echo "== CPU / memory"
SV=$(pgrep -f "server.py" | tr '\n' ' ')
FF=$(pgrep -f "rtsp_transport tcp" | tr '\n' ' ')
AD=$(pgrep -f "screenrecord" | tr '\n' ' ')
MX=$(pgrep -x mediamtx | tr '\n' ' ')
[ -n "$SV$FF$AD$MX" ] && ps -o pid,pcpu,rss,etime,comm -p $SV $FF $AD $MX
echo "  (pcpu = % of one core averaged over the process lifetime; live: top -p $(echo $FF $MX | tr ' ' ','))"
nproc | sed 's/^/  cores: /'

#!/usr/bin/env bash
# Snapshot of stream performance: resolution, fps, bitrate, CPU, memory,
# and how far the newest segment is behind real time.
set -u
cd "$(dirname "$0")/.."
[ -f quest-stream.env ] && set -a && . ./quest-stream.env && set +a
PORT="${QUEST_STREAM_PORT:-8080}"
URL="http://127.0.0.1:$PORT"

echo "== /status"
curl -s "$URL/status" | python3 -c '
import json, sys
d = json.load(sys.stdin)
o = d["output"]
print("state={} reason={}".format(d["state"], d["reason"]))
print("output={}x{} target_fps={} actual_fps={} speed={} drop={} dup={}".format(
    o["width"], o["height"], o["targetFps"], o["fps"], o["speed"], o["dropFrames"], o["dupFrames"]))
' 2>/dev/null || echo "stream server not reachable on $URL"

echo "== ffprobe of the live playlist"
command -v ffprobe >/dev/null && ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,profile,width,height,sample_aspect_ratio,r_frame_rate \
  -of default=nw=1 "$URL/hls/quest.m3u8" 2>&1 | awk '!seen[$0]++' | sed 's/^/  /'

echo "== bitrate (average over the segments on disk)"
python3 - <<'PY'
import glob, os, re
segs = sorted(glob.glob("public/hls/*.ts"), key=os.path.getmtime)
try:
    pl = open("public/hls/quest.m3u8").read()
    durs = [float(x) for x in re.findall(r"#EXTINF:([\d.]+)", pl)]
    names = re.findall(r"^(quest.*\.ts)$", pl, re.M)
    size = sum(os.path.getsize("public/hls/" + n) for n in names if os.path.exists("public/hls/" + n))
    print(f"  {size * 8 / sum(durs) / 1e6:.2f} Mbit/s over {len(names)} segments")
except Exception as e:
    print("  n/a:", e)
PY

echo "== CPU / memory"
PIDS=$(pgrep -f "server.py" | tr '\n' ' ')
FF=$(pgrep -f "hls_segment_filename" | tr '\n' ' ')
AD=$(pgrep -f "screenrecord" | tr '\n' ' ')
[ -n "$PIDS$FF$AD" ] && ps -o pid,pcpu,rss,etime,comm -p $PIDS $FF $AD
echo "  (pcpu is % of one core averaged over the process lifetime; for live values: top -p ${FF// /,})"
nproc | sed 's/^/  cores: /'

echo "== segment age (how far the newest segment is behind now)"
python3 - <<'PY'
import datetime, re
try:
    pl = open("public/hls/quest.m3u8").read()
    last = re.findall(r"#EXT-X-PROGRAM-DATE-TIME:(\S+)", pl)[-1]
    t = datetime.datetime.strptime(last.replace("+0000", "+00:00"), "%Y-%m-%dT%H:%M:%S.%f%z")
    age = (datetime.datetime.now(datetime.timezone.utc) - t).total_seconds()
    print(f"  newest segment started {age:.1f}s ago; add ~2-3 s player buffer for glass-to-screen latency")
except Exception as e:
    print("  n/a:", e)
PY

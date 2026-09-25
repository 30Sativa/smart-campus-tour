#!/usr/bin/env bash
# Start the Quest stream in the background (or --foreground for systemd).
# Settings come from quest-stream.env next to server.py, if present.
set -eu
cd "$(dirname "$0")/.."
[ -f quest-stream.env ] && set -a && . ./quest-stream.env && set +a
mkdir -p logs public/hls
PIDFILE=logs/quest-stream.pid

if [ "${1:-}" = "--foreground" ]; then
  exec python3 -u server.py
fi

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Already running (pid $(cat "$PIDFILE")). Stop it with scripts/stop-stream.sh"
  exit 0
fi

# Not fatal: the server itself waits for the Quest and recovers when it appears.
scripts/check-quest.sh || echo "WARN: continuing; the stream starts as soon as the Quest is ready."

nohup python3 -u server.py >> logs/console.log 2>&1 &
echo $! > "$PIDFILE"
sleep 1
if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Failed to start, see logs/console.log:"; tail -5 logs/console.log; rm -f "$PIDFILE"; exit 1
fi
PORT="${QUEST_STREAM_PORT:-8080}"
echo "Started (pid $(cat "$PIDFILE"))."
echo "  status:   curl http://localhost:$PORT/status"
echo "  playlist: http://<NUC_IP>:$PORT/hls/quest.m3u8"
echo "  logs:     tail -f logs/quest-stream.log"

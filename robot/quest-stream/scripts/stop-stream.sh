#!/usr/bin/env bash
# Stop the background stream started by start-stream.sh (not the systemd one:
# use `sudo systemctl stop quest-stream` for that).
set -u
cd "$(dirname "$0")/.."
PIDFILE=logs/quest-stream.pid
if [ ! -f "$PIDFILE" ]; then echo "Not running (no pid file)."; exit 0; fi
PID=$(cat "$PIDFILE")
if kill -0 "$PID" 2>/dev/null; then
  kill -TERM "$PID"
  for _ in $(seq 1 20); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
  kill -0 "$PID" 2>/dev/null && { echo "Did not stop in 10 s, killing."; kill -KILL "$PID"; }
fi
rm -f "$PIDFILE" public/hls/*.ts public/hls/*.m3u8 public/hls/*.tmp 2>/dev/null
echo "STREAM_STOPPED"

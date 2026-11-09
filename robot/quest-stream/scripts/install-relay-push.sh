#!/usr/bin/env bash
# Forward the Quest stream from this NUC to the public relay on EC2 (systemd service).
#   scripts/install-relay-push.sh             # install + start (needs relay-push.env)
#   scripts/install-relay-push.sh --remove
set -eu
cd "$(dirname "$0")/.."
DIR=$(pwd)
RUN_USER=${SUDO_USER:-$(id -un)}
if [ "${1:-}" = "--remove" ]; then
  sudo systemctl disable --now quest-relay-push 2>/dev/null || true
  sudo rm -f /etc/systemd/system/quest-relay-push.service
  sudo systemctl daemon-reload
  echo "quest-relay-push removed."
  exit 0
fi
grep -q '^RELAY_SRT_URL=srt://' relay-push.env 2>/dev/null || {
  echo "relay-push.env missing: on EC2 run 'sudo bash install-relay.sh <domain> --show',"
  echo "then put its RELAY_SRT_URL=... line in $DIR/relay-push.env"
  exit 1
}
chmod 600 relay-push.env
ffmpeg -hide_banner -protocols 2>/dev/null | grep -qw srt \
  || { echo "This ffmpeg has no SRT support (sudo apt install ffmpeg on Ubuntu has it)"; exit 1; }
chmod +x scripts/relay-push.sh
sed -e "s#__DIR__#$DIR#g" -e "s#__USER__#$RUN_USER#g" systemd/quest-relay-push.service \
  | sudo tee /etc/systemd/system/quest-relay-push.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable quest-relay-push >/dev/null
sudo systemctl restart quest-relay-push
sleep 3
systemctl --no-pager --lines=5 status quest-relay-push || true
echo "Logs: journalctl -u quest-relay-push -f"

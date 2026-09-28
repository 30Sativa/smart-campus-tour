#!/usr/bin/env bash
# Run MediaMTX and quest-stream as systemd services (start at boot, restart on
# crash) for the current user and this checkout. Safe to run again.
#   scripts/install-services.sh            # install + start
#   scripts/install-services.sh --remove   # stop + uninstall
set -eu
cd "$(dirname "$0")/.."
DIR=$(pwd)
RUN_USER=${SUDO_USER:-$(id -un)}

if [ "${1:-}" = "--remove" ]; then
  sudo systemctl disable --now quest-stream mediamtx 2>/dev/null || true
  sudo rm -f /etc/systemd/system/quest-stream.service /etc/systemd/system/mediamtx.service
  sudo systemctl daemon-reload
  echo "Services removed."
  exit 0
fi

[ -x /usr/local/bin/mediamtx ] || { echo "MediaMTX not installed: run scripts/install-mediamtx.sh first"; exit 1; }
[ -f mediamtx.env ] || { cp mediamtx.env.example mediamtx.env; echo "Created mediamtx.env"; }
[ -f quest-stream.env ] || { cp quest-stream.env.example quest-stream.env; echo "Created quest-stream.env"; }
chmod +x scripts/*.sh

# adb needs USB access without root: the plugdev group + Android udev rules.
if ! id -nG "$RUN_USER" | tr ' ' '\n' | grep -qx plugdev; then
  sudo usermod -aG plugdev "$RUN_USER" && echo "Added $RUN_USER to plugdev (log out/in for your own shell)"
fi

for unit in mediamtx quest-stream; do
  sed -e "s#__DIR__#$DIR#g" -e "s#__USER__#$RUN_USER#g" "systemd/$unit.service" \
    | sudo tee "/etc/systemd/system/$unit.service" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable mediamtx quest-stream
sudo systemctl restart mediamtx
sleep 1
sudo systemctl restart quest-stream

if command -v ufw >/dev/null && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 8889/tcp comment "MediaMTX WebRTC (WHEP)"
  sudo ufw allow 8189/udp comment "MediaMTX WebRTC media"
  sudo ufw allow 8888/tcp comment "MediaMTX HLS (debug)"
  sudo ufw allow 8080/tcp comment "quest-stream status"
fi

systemctl --no-pager --lines=0 status mediamtx quest-stream || true
echo
echo "WebRTC (WHEP) for the web app (VITE_QUEST_WHEP_URL):"
hostname -I | tr ' ' '\n' | grep -E '^[0-9]+\.' | sed 's#.*#  http://&:8889/quest/whep#'
echo "Watch in a browser: http://<NUC_IP>:8889/quest    Logs: journalctl -u mediamtx -u quest-stream -f"

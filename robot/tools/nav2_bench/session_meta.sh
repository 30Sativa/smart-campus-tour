#!/bin/bash
# session_meta.sh CFG DIR : record what this A/B round runs with (read-only), BEFORE rec_start.sh.
# DIR must end with _CFG (e.g. ~/amr_logs/runs/20261023_AB1_V1).
cfg=$1; D=$2; mkdir -p "$D"
{
  echo "date: $(date '+%F %T')"; echo "cfg: $cfg"
  echo "nav2 launch cmdline: $(pgrep -af 'ros2 launch robot_navigation navigation.launch.py' | head -1 | cut -c1-600)"
  pf=$(pgrep -af 'ros2 launch robot_navigation navigation.launch.py' | grep -oE 'nav2_params_file:=[^ ]+' | head -1 | cut -d= -f2-)
  echo "nav2_params_file: ${pf:-<default nav2_params.yaml>}"; [ -n "$pf" ] && sha256sum "$pf"
  echo "external load (must be empty): $(pgrep -xl 'ffmpeg|scrcpy' | tr '\n' ' ')"
  echo "verify_params:"; bash "$(dirname "$0")/verify_params.sh" "$cfg" 2>&1
} > "$D/session_meta.txt"
grep -q "ALL PASS" "$D/session_meta.txt" && echo "meta saved: $D/session_meta.txt (params OK)" || { echo "WARNING: params check did not pass - see $D/session_meta.txt"; exit 1; }
case "$(basename "$D")" in *_"$cfg") ;; *) echo "WARNING: directory name must end with _$cfg"; exit 1;; esac

#!/usr/bin/env bash
# Install (or update) the MediaMTX binary and its stock config on the NUC.
#
#   scripts/install-mediamtx.sh                 # latest release from GitHub
#   MEDIAMTX_VERSION=v1.15.0 scripts/install-mediamtx.sh
#   scripts/install-mediamtx.sh ~/Downloads/mediamtx_v1.15.0_linux_amd64.tar.gz
#                                               # offline: a tarball you copied over
#
# Installs /usr/local/bin/mediamtx and, only if missing, /usr/local/etc/mediamtx.yml.
# Our settings are not in that file: they live in mediamtx.env (see
# scripts/install-services.sh), so updating MediaMTX never loses them.
set -eu

case "$(uname -m)" in
  x86_64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  armv7l) ARCH=armv7 ;;
  *) echo "Unsupported CPU: $(uname -m)"; exit 1 ;;
esac

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if [ $# -ge 1 ]; then
  TARBALL=$1
  [ -f "$TARBALL" ] || { echo "Not found: $TARBALL"; exit 1; }
else
  command -v curl >/dev/null || { echo "curl missing -> sudo apt install curl"; exit 1; }
  VERSION=${MEDIAMTX_VERSION:-}
  if [ -z "$VERSION" ]; then
    # The /releases/latest page redirects to /releases/tag/vX.Y.Z.
    VERSION=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/bluenviron/mediamtx/releases/latest | sed 's#.*/tag/##')
  fi
  case "$VERSION" in v*) ;; *) echo "Could not find the latest MediaMTX version (no internet?). Set MEDIAMTX_VERSION=v1.x.y or pass a tarball."; exit 1 ;; esac
  URL="https://github.com/bluenviron/mediamtx/releases/download/${VERSION}/mediamtx_${VERSION}_linux_${ARCH}.tar.gz"
  echo "Downloading $URL"
  TARBALL="$TMP/mediamtx.tar.gz"
  curl -fL --retry 3 -o "$TARBALL" "$URL"
fi

tar -xzf "$TARBALL" -C "$TMP"
[ -x "$TMP/mediamtx" ] || { echo "No mediamtx binary in $TARBALL"; exit 1; }

sudo install -m 0755 "$TMP/mediamtx" /usr/local/bin/mediamtx
sudo mkdir -p /usr/local/etc
if [ -f /usr/local/etc/mediamtx.yml ]; then
  echo "Keeping existing /usr/local/etc/mediamtx.yml (new stock config saved as mediamtx.yml.new)"
  sudo install -m 0644 "$TMP/mediamtx.yml" /usr/local/etc/mediamtx.yml.new
else
  sudo install -m 0644 "$TMP/mediamtx.yml" /usr/local/etc/mediamtx.yml
fi

echo "Installed: $(/usr/local/bin/mediamtx --version 2>/dev/null || echo mediamtx)"
if systemctl is-active --quiet mediamtx 2>/dev/null; then
  sudo systemctl restart mediamtx && echo "mediamtx service restarted"
else
  echo "Next: scripts/install-services.sh"
fi

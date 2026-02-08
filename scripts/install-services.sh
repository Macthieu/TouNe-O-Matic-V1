#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/install-services.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -m 0644 "${SCRIPT_DIR}/toune-api.service" /etc/systemd/system/toune-api.service
install -m 0644 "${SCRIPT_DIR}/toune-daemon.service" /etc/systemd/system/toune-daemon.service
install -m 0644 "${SCRIPT_DIR}/toune-library-sync.service" /etc/systemd/system/toune-library-sync.service
install -m 0644 "${SCRIPT_DIR}/toune-library-sync.timer" /etc/systemd/system/toune-library-sync.timer

systemctl daemon-reload
systemctl enable --now toune-api.service toune-daemon.service toune-library-sync.timer

echo "Services installed and started:"
systemctl --no-pager --full status toune-api.service toune-daemon.service toune-library-sync.timer | sed -n '1,120p'
echo
echo "Optional touchscreen kiosk:"
echo "  sudo ./scripts/install-kiosk.sh"

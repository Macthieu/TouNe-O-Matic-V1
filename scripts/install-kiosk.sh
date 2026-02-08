#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/install-kiosk.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -m 0755 "${SCRIPT_DIR}/toune-kiosk-session.sh" /usr/local/bin/toune-kiosk-session.sh
install -m 0644 "${SCRIPT_DIR}/toune-kiosk.service" /etc/systemd/system/toune-kiosk.service

if [[ ! -f /etc/default/toune-kiosk ]]; then
  cat >/etc/default/toune-kiosk <<'EOF'
# TouNe-o-matic touchscreen kiosk settings
# TOUNE_KIOSK_URL=http://127.0.0.1:11000
# TOUNE_KIOSK_OUTPUT=HDMI-1
# TOUNE_KIOSK_MODE=1024x600
# TOUNE_KIOSK_ROTATE=normal
# TOUNE_TOUCH_DEVICE_HINT=HID 27c0:0818
EOF
fi

systemctl daemon-reload
systemctl enable --now toune-kiosk.service

echo "Kiosk service installed and started:"
systemctl --no-pager --full status toune-kiosk.service | sed -n '1,120p'

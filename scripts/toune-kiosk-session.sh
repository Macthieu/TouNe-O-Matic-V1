#!/usr/bin/env bash
set -euo pipefail

URL="${TOUNE_KIOSK_URL:-http://127.0.0.1:11000}"
BROWSER_BIN="${TOUNE_KIOSK_BROWSER:-}"
TOUCH_DEVICE_HINT="${TOUNE_TOUCH_DEVICE_HINT:-HID 27c0:0818}"
OUTPUT_HINT="${TOUNE_KIOSK_OUTPUT:-}"
ROTATE_MODE="${TOUNE_KIOSK_ROTATE:-normal}"
MODE_HINT="${TOUNE_KIOSK_MODE:-1024x600}"

if [[ -z "${BROWSER_BIN}" ]]; then
  if command -v chromium >/dev/null 2>&1; then
    BROWSER_BIN="$(command -v chromium)"
  elif command -v chromium-browser >/dev/null 2>&1; then
    BROWSER_BIN="$(command -v chromium-browser)"
  else
    echo "Chromium not found." >&2
    exit 1
  fi
fi

if [[ "${URL}" == *"?"* ]]; then
  URL="${URL}&boot=$(date +%s)"
else
  URL="${URL}?boot=$(date +%s)"
fi

xset -dpms || true
xset s off || true
xset s noblank || true

if command -v xrandr >/dev/null 2>&1; then
  if [[ -z "${OUTPUT_HINT}" ]]; then
    for _ in $(seq 1 6); do
      OUTPUT_HINT="$(xrandr --query | awk '/ connected/{print $1; exit}')"
      [[ -n "${OUTPUT_HINT}" ]] && break
      sleep 0.5
    done
  fi
  if [[ -n "${OUTPUT_HINT}" ]]; then
    xrandr --output "${OUTPUT_HINT}" --auto >/dev/null 2>&1 || true
    if xrandr --query | awk '/ connected/{cur=$1} cur==o && /^[[:space:]]+[0-9]+x[0-9]+/ {print $1}' o="${OUTPUT_HINT}" | grep -qx "${MODE_HINT}"; then
      xrandr --output "${OUTPUT_HINT}" --mode "${MODE_HINT}" >/dev/null 2>&1 || true
    fi
    xrandr --output "${OUTPUT_HINT}" --rotate "${ROTATE_MODE}" >/dev/null 2>&1 || true
  fi
fi

if command -v xinput >/dev/null 2>&1 && [[ -n "${OUTPUT_HINT}" ]]; then
  TOUCH_ID="$(xinput --list --id-only "${TOUCH_DEVICE_HINT}" 2>/dev/null || true)"
  if [[ -z "${TOUCH_ID}" ]]; then
    TOUCH_ID="$(xinput --list --id-only "HID 27c0:0818" 2>/dev/null || true)"
  fi
  if [[ -n "${TOUCH_ID}" ]]; then
    xinput map-to-output "${TOUCH_ID}" "${OUTPUT_HINT}" >/dev/null 2>&1 || true
  fi
fi

if command -v unclutter >/dev/null 2>&1; then
  unclutter --timeout 1 --hide-on-touch >/dev/null 2>&1 &
fi

if command -v openbox-session >/dev/null 2>&1; then
  openbox-session >/dev/null 2>&1 &
fi

exec "${BROWSER_BIN}" \
  --kiosk \
  --incognito \
  --no-first-run \
  --disable-background-networking \
  --disable-component-update \
  --disable-default-apps \
  --disable-sync \
  --metrics-recording-only \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate,AutofillServerCommunication \
  --overscroll-history-navigation=0 \
  --touch-events=enabled \
  --check-for-update-interval=31536000 \
  --user-data-dir=/home/pi/.config/chromium-toune-kiosk \
  "${URL}"

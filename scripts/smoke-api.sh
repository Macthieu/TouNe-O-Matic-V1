#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:11000/api}"

echo "[1/5] health"
curl -fsS "${BASE_URL}/health" >/dev/null

echo "[2/5] analog state"
curl -fsS "${BASE_URL}/analog/state" >/dev/null

echo "[3/5] analog mode cast"
curl -fsS -X POST "${BASE_URL}/analog/mode" \
  -H "Content-Type: application/json" \
  -d '{"mode":"cast"}' >/dev/null

echo "[4/5] analog route on"
curl -fsS -X POST "${BASE_URL}/analog/route" \
  -H "Content-Type: application/json" \
  -d '{"input_id":"line-in","output_id":"dac","enabled":true}' >/dev/null

echo "[5/5] queue command write"
curl -fsS -X POST "${BASE_URL}/cmd" \
  -H "Content-Type: application/json" \
  -d '{"cmd":"pause"}' >/dev/null

echo "Smoke API OK"

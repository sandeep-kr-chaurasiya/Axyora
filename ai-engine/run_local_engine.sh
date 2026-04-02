#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/Users/sandeepkumar/Desktop/Axyora"
ENGINE_DIR="$ROOT_DIR/ai-engine"
if [[ -f "$ROOT_DIR/.venv/bin/activate" ]]; then
  VENV="$ROOT_DIR/.venv/bin/activate"
elif [[ -f "$ENGINE_DIR/venv/bin/activate" ]]; then
  VENV="$ENGINE_DIR/venv/bin/activate"
else
  echo "No Python virtual environment found. Expected one of:"
  echo "  $ROOT_DIR/.venv/bin/activate"
  echo "  $ENGINE_DIR/venv/bin/activate"
  exit 1
fi
LOG_DIR="$ENGINE_DIR/logs"
PID_FILE="$ENGINE_DIR/engine.pid"
LOG_FILE="$LOG_DIR/engine.log"

mkdir -p "$LOG_DIR"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "AI engine already running (pid=$OLD_PID)"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

nohup bash -lc '
  source "'$VENV'"
  cd "'$ENGINE_DIR'"
  while true; do
    if lsof -ti :8000 >/dev/null 2>&1; then
      echo "[$(date "+%Y-%m-%d %H:%M:%S")] port 8000 already in use, waiting..." >> "'$LOG_FILE'"
      sleep 3
      continue
    fi
    echo "[$(date "+%Y-%m-%d %H:%M:%S")] starting uvicorn" >> "'$LOG_FILE'"
    python -m uvicorn main:app --host 0.0.0.0 --port 8000 >> "'$LOG_FILE'" 2>&1 || true
    echo "[$(date "+%Y-%m-%d %H:%M:%S")] uvicorn exited, restarting in 2s" >> "'$LOG_FILE'"
    sleep 2
  done
' >/dev/null 2>&1 &

echo $! > "$PID_FILE"
echo "AI engine started in background (pid=$(cat "$PID_FILE"))"
echo "Logs: $LOG_FILE"
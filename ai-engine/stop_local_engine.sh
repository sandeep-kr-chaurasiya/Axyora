#!/usr/bin/env bash
set -euo pipefail

ENGINE_DIR="/Users/sandeepkumar/Desktop/Axyora/ai-engine"
PID_FILE="$ENGINE_DIR/engine.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No PID file found. AI engine may already be stopped."
  exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"
if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
  kill "$PID" || true
  sleep 1
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" || true
  fi
  echo "Stopped AI engine (pid=$PID)"
else
  echo "Process not running; cleaning stale PID file."
fi

# Also kill any orphan uvicorn/python process still holding port 8000.
PORT_PIDS="$(lsof -ti :8000 2>/dev/null || true)"
if [[ -n "$PORT_PIDS" ]]; then
  echo "$PORT_PIDS" | xargs kill 2>/dev/null || true
  sleep 1
  PORT_PIDS="$(lsof -ti :8000 2>/dev/null || true)"
  if [[ -n "$PORT_PIDS" ]]; then
    echo "$PORT_PIDS" | xargs kill -9 2>/dev/null || true
  fi
fi

rm -f "$PID_FILE"

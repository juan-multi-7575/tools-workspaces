#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================================="
echo "  Universal Multi-Tool Platform & DAG Pipeline Shell"
echo "=========================================================="

# Check for Python venv
if [ -d "$DIR/.venv" ]; then
    PYTHON="$DIR/.venv/bin/python"
    UVICORN="$DIR/.venv/bin/uvicorn"
else
    PYTHON="python3"
    UVICORN="uvicorn"
fi

# Cleanup on exit
cleanup() {
    echo ""
    echo "[shutdown] Stopping backend and frontend servers..."
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    wait 2>/dev/null || true
    echo "[shutdown] All servers stopped cleanly."
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 1. Start Backend FastAPI Server
echo "[backend] Starting FastAPI server on http://0.0.0.0:8000 ..."
export PYTHONPATH="$DIR/backend:$PYTHONPATH"
"$UVICORN" app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Wait for backend to be available
sleep 1.5

# 2. Start Frontend Vite Server
echo "[frontend] Starting Vite frontend server on http://localhost:5173 ..."
npm --prefix "$DIR/frontend" run dev -- --host &
FRONTEND_PID=$!

echo ""
echo "=========================================================="
echo "  🚀 Platform Ready!"
echo "  • Web UI:        http://localhost:5173"
echo "  • API Backend:   http://localhost:8000"
echo "  • API Docs:      http://localhost:8000/docs"
echo "  • Press Ctrl+C to terminate both servers"
echo "=========================================================="
echo ""

# Keep running and wait for signals
wait

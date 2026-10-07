#!/usr/bin/env bash
# ==============================================================================
# MusicTalk — Bash Microservices Launcher (Linux / macOS)
# ==============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=============================================================================="
echo "                      Starting MusicTalk Microservices                        "
echo "=============================================================================="

# Trap SIGINT to clean up background processes on exit
trap 'kill $(jobs -p) 2>/dev/null || true; exit' SIGINT SIGTERM EXIT

echo "[1/5] Starting Recognition Service (:8000)..."
(cd "$ROOT_DIR/recognition-service" && uvicorn main:app --host 0.0.0.0 --port 8000 --reload) &

echo "[2/5] Starting Catalog Service (:8001)..."
(cd "$ROOT_DIR/catalog-service" && uvicorn main:app --host 0.0.0.0 --port 8001 --reload) &

echo "[3/5] Starting Recommendation Service (:8002)..."
(cd "$ROOT_DIR/recommendation-service" && uvicorn main:app --host 0.0.0.0 --port 8002 --reload) &

echo "[4/5] Starting API Gateway (:3000)..."
(cd "$ROOT_DIR/gateway" && uvicorn main:app --host 0.0.0.0 --port 3000 --reload) &

echo "[5/5] Starting Frontend (:5173)..."
(cd "$ROOT_DIR/frontend" && npm run dev) &

echo "=============================================================================="
echo " All services running! Open http://localhost:5173 in your browser."
echo " Press Ctrl+C to terminate all services."
echo "=============================================================================="

wait

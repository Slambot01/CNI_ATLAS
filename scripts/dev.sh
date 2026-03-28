#!/bin/bash
# Start CNI in development mode (frontend + backend)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_ROOT/cni/server/frontend"

echo "==> Starting Next.js dev server..."
cd "$FRONTEND_DIR" && npm run dev &

sleep 2

echo "==> Starting CNI API server..."
cni serve . --no-browser

echo "CNI running at http://localhost:3000"

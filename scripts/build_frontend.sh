#!/bin/bash
# Build the CNI frontend for production
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_ROOT/cni/server/frontend"

echo "==> Installing frontend dependencies..."
cd "$FRONTEND_DIR"
npm install

echo "==> Building frontend..."
npm run build

echo ""
echo "✓ Frontend built successfully."
echo "  Run 'cni serve .' to start the web UI."

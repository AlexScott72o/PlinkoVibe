#!/usr/bin/env bash
# Load dev environment and start PlinkoVibe (backend + frontend).
# Usage: ./scripts/dev.sh   or   bash scripts/dev.sh

set -e
cd "$(dirname "$0")/.."

echo "Installing dependencies..."
npm install

echo "Starting backend and frontend..."
npm run dev

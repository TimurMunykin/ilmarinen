#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "Stopping Docker dev stack..."
docker compose -f docker-compose.yml -f docker-compose.dev.yml down

echo "Docker dev stack stopped."

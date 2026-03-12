#!/bin/sh
set -e

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

echo "Starting services..."
$COMPOSE up -d --force-recreate

echo "Done. Running containers:"
$COMPOSE ps

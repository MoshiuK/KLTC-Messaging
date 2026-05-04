#!/bin/bash
set -e

echo "==> Pulling latest code..."
git pull origin main

echo "==> Building and restarting container..."
docker compose down
docker compose build --no-cache
docker compose up -d

echo "==> Waiting for health check..."
sleep 5
docker compose ps

echo "==> Done. Logs:"
docker compose logs --tail=30

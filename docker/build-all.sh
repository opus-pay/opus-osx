#!/bin/bash
# Builds the three images on this machine, without pushing: opus-keeper, opus-relayer, opus-indexer (tag "local").
# Use it to check a change before packages/<name>/docker-build.sh publishes anything.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for service in keeper relayer indexer; do
    docker build --target "$service" -t "opus-$service:local" -f "$ROOT/Dockerfile" "$ROOT"
done
docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' | grep -E "REPOSITORY|opus-(keeper|relayer|indexer)"

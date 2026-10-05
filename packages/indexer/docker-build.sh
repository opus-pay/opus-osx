#!/bin/bash
set -euo pipefail

TAG_NAME="$(git rev-parse --short=12 HEAD)"
echo "TAG_NAME=$TAG_NAME"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
docker build --target indexer \
    -t mukeunkim/opus-indexer:"$TAG_NAME" \
    -t mukeunkim/opus-indexer:latest \
    -f "$ROOT/Dockerfile" --push "$ROOT"

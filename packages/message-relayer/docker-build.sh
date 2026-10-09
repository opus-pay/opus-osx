#!/bin/bash
set -euo pipefail

TAG_NAME="$(git rev-parse --short=12 HEAD)"
echo "TAG_NAME=$TAG_NAME"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
docker build --target message-relayer \
    -t mukeunkim/opus-message-relayer:"$TAG_NAME" \
    -t mukeunkim/opus-message-relayer:latest \
    -f "$ROOT/Dockerfile" --push "$ROOT"

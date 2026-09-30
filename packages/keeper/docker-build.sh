#!/bin/bash
set -euo pipefail

TAG_NAME="$(git rev-parse --short=12 HEAD)"
echo "TAG_NAME=$TAG_NAME"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
docker build --build-arg PACKAGE=keeper \
    -t mukeunkim/opus-keeper:"$TAG_NAME" \
    -t mukeunkim/opus-keeper:latest \
    -f "$ROOT/Dockerfile" --push "$ROOT"

#!/bin/bash
set -euo pipefail

TAG_NAME="$(git rev-parse --short=12 HEAD)"
echo "TAG_NAME=$TAG_NAME"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
docker buildx build --platform=linux/amd64,linux/arm64 --build-arg PACKAGE=keeper -t mukeunkim/opus-keeper:"$TAG_NAME" -f "$ROOT/Dockerfile" --push "$ROOT"
docker buildx build --platform=linux/amd64,linux/arm64 --build-arg PACKAGE=keeper -t mukeunkim/opus-keeper:latest -f "$ROOT/Dockerfile" --push "$ROOT"

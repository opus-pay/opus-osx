#!/bin/sh
set -e
cd "/app/packages/${OPUS_PACKAGE}"
exec /app/node_modules/.bin/ts-node src/cli.ts

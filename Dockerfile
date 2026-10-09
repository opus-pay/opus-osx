# One image per service: build with --target keeper, relayer, indexer or message-relayer.
#   docker build --target relayer -t opus-relayer .
# Each image holds only that service, the SDK it needs and production dependencies, and runs compiled
# JavaScript (no ts-node). Keys and addresses are not copied in; they come from the environment and mounts.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.19 --activate

# ---- build: compile the SDK and the four services. The payment app and the contract toolchain stay out so the
# install does not fetch Next or Hardhat.
FROM base AS build
COPY package.json yarn.lock ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/keeper/package.json packages/keeper/
COPY packages/relayer/package.json packages/relayer/
COPY packages/indexer/package.json packages/indexer/
COPY packages/message-relayer/package.json packages/message-relayer/
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.workspaces={packages:['packages/sdk','packages/keeper','packages/relayer','packages/indexer','packages/message-relayer']}; fs.writeFileSync('package.json', JSON.stringify(p,null,4)+'\n');" \
    && yarn install --frozen-lockfile --network-timeout 600000
COPY packages/sdk packages/sdk
COPY packages/keeper packages/keeper
COPY packages/relayer packages/relayer
COPY packages/indexer packages/indexer
COPY packages/message-relayer packages/message-relayer
RUN yarn workspace @opus/sdk build \
    && yarn workspace @opus/keeper build \
    && yarn workspace @opus/relayer build \
    && yarn workspace @opus/indexer build \
    && yarn workspace @opus/message-relayer build

# ---- production dependencies, one install per service so each image carries only what it needs.
FROM base AS deps-keeper
COPY package.json yarn.lock ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/keeper/package.json packages/keeper/
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.workspaces={packages:['packages/sdk','packages/keeper']}; fs.writeFileSync('package.json', JSON.stringify(p,null,4)+'\n');" \
    && yarn install --frozen-lockfile --production --network-timeout 600000 \
    && mkdir -p packages/keeper/node_modules

FROM base AS deps-relayer
COPY package.json yarn.lock ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/relayer/package.json packages/relayer/
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.workspaces={packages:['packages/sdk','packages/relayer']}; fs.writeFileSync('package.json', JSON.stringify(p,null,4)+'\n');" \
    && yarn install --frozen-lockfile --production --network-timeout 600000 \
    && mkdir -p packages/relayer/node_modules

FROM base AS deps-indexer
COPY package.json yarn.lock ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/indexer/package.json packages/indexer/
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.workspaces={packages:['packages/sdk','packages/indexer']}; fs.writeFileSync('package.json', JSON.stringify(p,null,4)+'\n');" \
    && yarn install --frozen-lockfile --production --network-timeout 600000 \
    && mkdir -p packages/indexer/node_modules

FROM base AS deps-message-relayer
COPY package.json yarn.lock ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/message-relayer/package.json packages/message-relayer/
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.workspaces={packages:['packages/sdk','packages/message-relayer']}; fs.writeFileSync('package.json', JSON.stringify(p,null,4)+'\n');" \
    && yarn install --frozen-lockfile --production --network-timeout 600000 \
    && mkdir -p packages/message-relayer/node_modules

# ---- keeper: calls deadline handling and collects tips. No inbound traffic except the optional health check.
FROM node:${NODE_VERSION}-bookworm-slim AS keeper
ENV NODE_ENV=production
WORKDIR /app/packages/keeper
COPY --from=deps-keeper /app/node_modules /app/node_modules
COPY --from=deps-keeper /app/packages/keeper/node_modules ./node_modules
COPY --from=build /app/packages/sdk/package.json /app/packages/sdk/package.json
COPY --from=build /app/packages/sdk/dist /app/packages/sdk/dist
COPY --from=build /app/packages/keeper/package.json ./package.json
COPY --from=build /app/packages/keeper/dist ./dist
USER node
# Healthy when GET /health answers 200. Off (always healthy) when the health server is turned off.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "const p=process.env.KEEPER_HEALTH_PORT||'8789'; if(p==='off') process.exit(0); fetch('http://127.0.0.1:'+p+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/cli.js"]

# ---- relayer: takes signed requests over HTTP and pays the gas.
FROM node:${NODE_VERSION}-bookworm-slim AS relayer
ENV NODE_ENV=production
WORKDIR /app/packages/relayer
COPY --from=deps-relayer /app/node_modules /app/node_modules
COPY --from=deps-relayer /app/packages/relayer/node_modules ./node_modules
COPY --from=build /app/packages/sdk/package.json /app/packages/sdk/package.json
COPY --from=build /app/packages/sdk/dist /app/packages/sdk/dist
COPY --from=build /app/packages/relayer/package.json ./package.json
COPY --from=build /app/packages/relayer/dist ./dist
# The remaining gas budgets are kept here so a restart does not refill them.
RUN mkdir -p /state && chown node:node /state
VOLUME ["/state"]
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.RELAYER_PORT||'8787')+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/cli.js"]

# ---- indexer: folds chain logs into a ledger and serves it over HTTP. The SQLite file lives in /data.
FROM node:${NODE_VERSION}-bookworm-slim AS indexer
ENV NODE_ENV=production \
    INDEXER_HOST=0.0.0.0 \
    INDEXER_DB_FILE=/data/index.db
WORKDIR /app/packages/indexer
COPY --from=deps-indexer /app/node_modules /app/node_modules
COPY --from=deps-indexer /app/packages/indexer/node_modules ./node_modules
COPY --from=build /app/packages/sdk/package.json /app/packages/sdk/package.json
COPY --from=build /app/packages/sdk/dist /app/packages/sdk/dist
COPY --from=build /app/packages/indexer/package.json ./package.json
COPY --from=build /app/packages/indexer/dist ./dist
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.INDEXER_PORT||'8788')+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/cli.js"]

# ---- message-relayer: push relay for the wallet app. Holds the Expo key and the wallet-to-device table (SQLite in /data).
FROM node:${NODE_VERSION}-bookworm-slim AS message-relayer
ENV NODE_ENV=production \
    MESSAGE_RELAYER_HOST=0.0.0.0 \
    MESSAGE_RELAYER_DB=/data/message-relayer.db
WORKDIR /app/packages/message-relayer
COPY --from=deps-message-relayer /app/node_modules /app/node_modules
COPY --from=deps-message-relayer /app/packages/message-relayer/node_modules ./node_modules
COPY --from=build /app/packages/sdk/package.json /app/packages/sdk/package.json
COPY --from=build /app/packages/sdk/dist /app/packages/sdk/dist
COPY --from=build /app/packages/message-relayer/package.json ./package.json
COPY --from=build /app/packages/message-relayer/dist ./dist
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.MESSAGE_RELAYER_PORT||'8788')+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/cli.js"]

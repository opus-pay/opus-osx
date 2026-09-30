FROM node:20-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare yarn@1.22.19 --activate

COPY package.json yarn.lock ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/keeper/package.json packages/keeper/
COPY packages/relayer/package.json packages/relayer/

# The image only runs the keeper and the relayer. Leave the payment app and
# the contract toolchain out so the install does not fetch Next or Hardhat.
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.workspaces={packages:['packages/sdk','packages/keeper','packages/relayer']}; fs.writeFileSync('package.json', JSON.stringify(p,null,4)+'\n');" \
    && yarn install --frozen-lockfile --network-timeout 600000

COPY packages/sdk packages/sdk
COPY packages/keeper packages/keeper
COPY packages/relayer packages/relayer
COPY packages/contracts/deploy/amoy/addresses.json packages/contracts/deploy/amoy/addresses.json

RUN yarn workspace @opus/sdk build \
    && yarn workspace @opus/keeper build \
    && yarn workspace @opus/relayer build

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ARG PACKAGE=keeper
ENV OPUS_PACKAGE=$PACKAGE

USER node
ENTRYPOINT ["/entrypoint.sh"]

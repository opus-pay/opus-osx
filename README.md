# OPUS

**Escrow for cross-border errands, built on the ERC-8183 standard.**

A person in one place asks a person far away, in another country or another region, to do something real: film a place, buy and ship an item, and later accompany family. OPUS locks the client's USDC or USDT when the work is agreed and releases it to the provider when the work is done, or returns it to the client when it is not. No one, including the OPUS team, can move the money any other way.

OPUS implements **ERC-8183 (Agentic Commerce)** unchanged. The standard does not distinguish people from AI agents, so the same contracts will serve people's AI assistants when they start posting errands.

* No admin: no owner, pause, upgrade, or setters
* 1–1,000 USD per job, fixed in code
* No protocol fee; evaluators are paid the same whatever the outcome
* No token at launch

> Status: contracts through #22 are deployed and verified on Polygon Amoy. ERC-8183 is a draft standard.

## Amoy (issue #22)

Addresses are also in `packages/contracts/deploy/amoy/addresses.json`. The reference instance lists Circle Amoy USDC `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582`, with treasury `0` and fee `0`. No admin roles are granted after deploy.

| Contract | Address |
| :--- | :--- |
| `OpusForwarder` | [`0x2042172c8b638f1720A1c468726dbd167d62E63f`](https://amoy.polygonscan.com/address/0x2042172c8b638f1720A1c468726dbd167d62E63f#code) |
| `OpusACPFactory` | [`0xeafFF7cCe71b66dB91c40d09640ae9ae854707ca`](https://amoy.polygonscan.com/address/0xeafFF7cCe71b66dB91c40d09640ae9ae854707ca#code) |
| Reference USDC instance | [`0x7632d054BfE635A1f0394fbcd74678B6567213Fd`](https://amoy.polygonscan.com/address/0x7632d054BfE635A1f0394fbcd74678B6567213Fd#code) |
| `OptimisticEvaluator` | [`0x65819d9199144a66ec17ad39da6bebabc3eef585`](https://amoy.polygonscan.com/address/0x65819d9199144a66ec17ad39da6bebabc3eef585#code) |

## Documents

| Document | Contents |
| :--- | :--- |
| [`WHITEPAPER.md`](./WHITEPAPER.md) / [`WHITEPAPER.ko.md`](./WHITEPAPER.ko.md) | Design, evaluation, security model, products, risks (English / Korean; kept in sync) |
| [`ROADMAP.md`](./ROADMAP.md) | Components, open questions, milestones, week plan, decisions D1–D29 |
| [`GITHUB_ISSUES.md`](./GITHUB_ISSUES.md) | Issues #1–#75 with tasks and acceptance criteria |
| [`.cursor/AGENTS.md`](./.cursor/AGENTS.md) | Context for AI coding agents: invariants I-1–I-9, rules, decisions |
| [`.cursor/CURSOR_BRIEF.md`](./.cursor/CURSOR_BRIEF.md) | Implementation spec for M0–M5 |
| [`packages/contracts/docs/EVM_TARGET.md`](./packages/contracts/docs/EVM_TARGET.md) | D1: Polygon / Amoy `cancun` target and sources |
| [`packages/contracts/docs/ERC8183_CONFORMANCE.md`](./packages/contracts/docs/ERC8183_CONFORMANCE.md) | ERC-8183 MUST/SHOULD map (D11) |
| [`packages/keeper/README.md`](./packages/keeper/README.md) | Keeper: wallet, poll, triggers, alerts (Korean) |
| [`packages/relayer/README.md`](./packages/relayer/README.md) | Relayer: `POST /relay`, budgets, sanctions file (Korean) |
| [`packages/indexer/README.md`](./packages/indexer/README.md) | Indexer: job queries and the events it stores (Korean) |
| [`apps/pay/README.md`](./apps/pay/README.md) | Payment-link app module spec (Korean) |

## Planned packages

| Path | Purpose | Milestone |
| :--- | :--- | :--- |
| `packages/contracts` | ERC-8183 core, factory, `OptimisticEvaluator`, forwarder | M1–M3 |
| `packages/sdk` | TypeScript SDK (viem) | M4 |
| `packages/keeper` | Calls deadline triggers; earns tips | M4 |
| `packages/relayer` | Gasless relaying (ERC-2771) | M4 |
| `packages/indexer` | Job and instance index for status pages | M4 |
| `apps/pay` | Escrow payment links | M5 |
| `apps/errands` | Cross-border errand service | M6 |
| `apps/portal` | OPUS Portal: directory of services built on OPUS | M12 |

Apps use `@opus/sdk` only. Contract types come from typechain output; never copy ABIs by hand.

## Setup

```bash
yarn install
cp packages/contracts/env/.env.sample packages/contracts/env/.env
cp packages/contracts/env/.amoy.env.sample packages/contracts/env/.amoy.env
cp packages/contracts/env/.polygon.env.sample packages/contracts/env/.polygon.env
yarn build
yarn test
```

Amoy and Polygon deployments read `env/.amoy.env` and `env/.polygon.env` via `ENV_NETWORK`. If `*_ADDRESS` variables are set, signing uses a Ledger and no private key.

## Commands

```bash
yarn build                  # compile all workspaces
yarn test                   # test all workspaces
yarn lint                   # solhint + typecheck
yarn formatting:write       # format
yarn contracts test         # contract tests
yarn contracts coverage     # contract coverage
yarn sdk test
yarn keeper test
yarn relayer test
yarn indexer test
yarn pay test
```

Keeper, relayer, and indexer each have an operator guide in that package. Copy `packages/<name>/env/.env.sample` to `env/.env` and export it in the shell that starts that process. The process does not open `env/.env` itself, and `yarn <name> start` runs with the package directory as its working directory. Run each service in its own shell:

```bash
set -a && source packages/keeper/env/.env && set +a && yarn keeper start
set -a && source packages/relayer/env/.env && set +a && yarn relayer start
set -a && source packages/indexer/env/.env && set +a && yarn indexer start
```

Keeper and relayer can instead run as daemons. Images are `mukeunkim/opus-keeper` and `mukeunkim/opus-relayer`, tagged with the 12-character commit hash. `packages/<name>/docker-build.sh` pushes that tag; `docker-buildx.sh` also pushes `linux/amd64` and `linux/arm64` as `latest`. `compose.yaml` restarts them unless they are stopped. It reads `config/keeper.env` and `config/relayer.env`, and mounts `config/addresses.json` plus `config/sanctions.txt`. The `config` directory is not copied into the image. Keys are not copied into the image. The relayer is published only on `127.0.0.1:8787`.

```bash
docker compose up -d --build keeper relayer
docker compose logs -f keeper relayer
docker compose stop keeper relayer
```


## Contributing

One issue, one branch, one pull request. Pull requests that touch `packages/contracts` must state which invariants (I-1–I-9 in `.cursor/AGENTS.md`) their tests cover. When an issue is done, tick it in `GITHUB_ISSUES.md` and add a short resolution note.

## License

MIT (see `LICENSE.md`), decision D7. Solidity files still carry `SPDX-License-Identifier: BUSL-1.1` because changing the header changes the metadata of the contracts already verified on Amoy; they switch to `MIT` with the next deployment.

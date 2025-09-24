# OPUS

**Escrow for cross-border errands, built on the ERC-8183 standard.**

A person in one country asks a person in another to do something real: film a place, buy and ship an item, and later accompany family. OPUS locks the client's USDC or USDT when the work is agreed and releases it to the provider when the work is done, or returns it to the client when it is not. No one, including the OPUS team, can move the money any other way.

OPUS implements **ERC-8183 (Agentic Commerce)** unchanged. The standard does not distinguish people from AI agents, so the same contracts will serve people's AI assistants when they start posting errands.

* No admin: no owner, pause, upgrade, or setters
* 1–1,000 USD per job, fixed in code
* No protocol fee; evaluators are paid the same whatever the outcome
* No token at launch

> Status: planning complete, implementation starting (issue #1). Not deployed. ERC-8183 is a draft standard.

## Documents

| Document | Contents |
| :--- | :--- |
| [`WHITEPAPER.md`](./WHITEPAPER.md) / [`WHITEPAPER.ko.md`](./WHITEPAPER.ko.md) | Design, evaluation, security model, products, risks (English / Korean; kept in sync) |
| [`ROADMAP.md`](./ROADMAP.md) | Components, open questions, milestones, week plan, decisions D1–D28 |
| [`GITHUB_ISSUES.md`](./GITHUB_ISSUES.md) | Issues #1–#75 with tasks and acceptance criteria |

## Planned packages

| Path | Purpose | Milestone |
| :--- | :--- | :--- |
| `packages/contracts` | ERC-8183 core, factory, `OptimisticEvaluator`, forwarder | M1–M3 |
| `packages/sdk` | TypeScript SDK (viem) | M4 |
| `packages/keeper` | Calls deadline triggers; earns tips | M4 |
| `packages/relayer` | Gasless relaying (ERC-2771) | M4 |
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
yarn pay test
```

## Contributing

One issue, one branch, one pull request. Pull requests that touch `packages/contracts` must state which invariants (I-1–I-9) their tests cover. When an issue is done, tick it in `GITHUB_ISSUES.md` and add a short resolution note.

## License

To be decided before the first public release (decision D7; MIT suggested).

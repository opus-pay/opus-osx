# Before the audit: what must be fixed in the code

The external audit (grant milestone M1) checks one frozen version of the core contracts. Anything changed after the audit has to be checked again, so every item below is settled and merged first. Then the code is frozen at one commit, and that commit is what the auditors receive.

## Audit scope

| Contract | File | Lines |
| :--- | :--- | :--- |
| Escrow instance | `packages/contracts/contracts/acp/OpusAgenticCommerce.sol` | 330 |
| Review contract | `packages/contracts/contracts/evaluators/OptimisticEvaluator.sol` | 676 |
| Factory | `packages/contracts/contracts/acp/OpusACPFactory.sol` | 69 |
| Forwarder | `packages/contracts/contracts/forwarder/OpusForwarder.sol` | 9 |
| Interfaces | `IAgenticCommerce`, `IOpusACPExtensions`, `IACPHook`, `IOpusEvaluator`, `IOpusArbiter` | |

Out of scope: `contracts/experimental/KlerosArbiterAdapter.sol` (until D10), `contracts/mocks`, `acp/InterfaceCompileHarness.sol`, and everything off chain (SDK, keeper, relayer, indexer, pay app).

## Values still marked `PLACEHOLDER_`

| Decision | Constant | Contract | Value today | Suggested in the code |
| :--- | :--- | :--- | :--- | :--- |
| D18 | `MAX_EVALUATION_FEE_BP` | `OptimisticEvaluator` | **Decided: 2,000 (20%)** | Done |
| D2 | `PLACEHOLDER_MAX_PLATFORM_FEE_BP` | `OpusAgenticCommerce` | 1,000 (10%) | 1,000 |
| D2 | `PLACEHOLDER_HOOK_GAS_LIMIT` | `OpusAgenticCommerce` | 300,000 gas | 300,000 |
| D3 | `PLACEHOLDER_MIN_JOB_DURATION` / `PLACEHOLDER_MAX_JOB_DURATION` | `OpusAgenticCommerce` | 1 hour / 180 days | 1 hour / 180 days |
| D3 | `PLACEHOLDER_MIN_WINDOW` / `PLACEHOLDER_MAX_WINDOW` | `OptimisticEvaluator` | 1 hour / 180 days | 1 hour / 180 days |
| D3 | `PLACEHOLDER_SAFETY_MARGIN` | `OptimisticEvaluator` | 1 day (raised from 1 hour in the AI-assisted review) | 1 day |

When a value is decided, rename the constant without `PLACEHOLDER_`, update the tests and the SDK constants that mirror it (`packages/sdk/src/constants.ts`), and record the decision.

## Other changes before the freeze

Items 1 and 2 were done on 2026-10-03, together with the fixes in [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md); the review contract's approval is now `approveJob`.

1. **Rename the review contract's `approve(address,uint256)`.** Its selector `0x095ea7b3` is the same as ERC-20 `approve`, so wallets show the client's approval as a token permission. Pick a name such as `approveJob`, and update the SDK, keeper, pay app and tests.
2. **MIT headers.** Change `SPDX-License-Identifier: BUSL-1.1` to `MIT` in every in-scope file.
3. **Threat model and audit pack.** The static analysis results are in [`STATIC_ANALYSIS.md`](STATIC_ANALYSIS.md). Roles, money flows, trust assumptions, known issues and the ERC-8183 conformance map (`packages/contracts/docs/ERC8183_CONFORMANCE.md`).
4. **Freeze.** Tag the commit, for example `audit-v1`, and give the auditors that tag. Record the test count and coverage at that tag.

## Decided off chain, not part of the audit

These are set per job by the SDK and the app, so they do not block the freeze: the evaluation fee and keeper tip (pilot: 0), the dispute deposit, and the default arbiter (D10).

## After the audit

Fix the findings, have the auditors re-check the fixes, publish the report, redeploy on Amoy, and rerun the eight recorded scenarios, including the dispute (`docs/grant/AMOY_EVIDENCE.md`).

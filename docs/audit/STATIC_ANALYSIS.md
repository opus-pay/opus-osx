# Static analysis: Slither and Aderyn

**This is not an external audit.** It is the output of automated tools on one version of the code, with each result read by hand. It belongs in the audit pack (`PRE_AUDIT_FREEZE.md`) next to the AI-assisted review (`SECURITY_REVIEW.md`).

## Slither

| | |
| :--- | :--- |
| Run | 2026-10-14 |
| Code | commit `df5e850` (`main` after #13) |
| Tool | Slither 0.11.6, all detectors, `packages/contracts/slither.config.json` (informational results excluded, `mocks/` and `experimental/` filtered) |
| Command | `slither . --config-file slither.config.json` from `packages/contracts` (CI runs the same) |
| Result | 38 results in 59 contracts (81 detectors): **2 High, 15 Medium, 21 Low** |

| Impact | Detector | Count | Where |
| :--- | :--- | ---: | :--- |
| High | `arbitrary-send-erc20` | 2 | `OpusAgenticCommerce._fund`, `OptimisticEvaluator._pullDeposit` |
| Medium | `reentrancy-no-eth` | 15 | `OptimisticEvaluator.finalize`, `OptimisticEvaluator._reject`, `OptimisticEvaluator.timeoutNoSubmission`, `OptimisticEvaluator._settleDeposits`, `OptimisticEvaluator.resolveMissingDeposit`, `OptimisticEvaluator._complete`, `OptimisticEvaluator.sweep`, `OpusAgenticCommerce.complete`, `OptimisticEvaluator.resolveByDefault` |
| Low | `calls-loop` | 1 | `OpusACPFactory.constructor` |
| Low | `missing-zero-check` | 2 | `OpusAgenticCommerce.factory_`, `OpusACPFactory.trustedForwarder_` |
| Low | `reentrancy-benign` | 3 | `OptimisticEvaluator._pay`, `OptimisticEvaluator.configureWithPermit`, `OpusAgenticCommerce._pay` |
| Low | `return-bomb` | 1 | `OpusAgenticCommerce._callHookWithSelector` |
| Low | `timestamp` | 14 | `OptimisticEvaluator._postDeposit`, `OptimisticEvaluator._scheduleDeadlines`, `OptimisticEvaluator.extendReview`, `OpusAgenticCommerce.claimRefund`, `OptimisticEvaluator.escalateOnSilence`, `OptimisticEvaluator.beforeAction`, `OptimisticEvaluator.resolveByDefault`, `OptimisticEvaluator.timeoutNoSubmission`, `OptimisticEvaluator.object`, `OpusAgenticCommerce._fund`, `OpusAgenticCommerce.createJob`, `OptimisticEvaluator.resolveMissingDeposit`, `OptimisticEvaluator.rule`, `OptimisticEvaluator.finalize` |

### How each was read

**`arbitrary-send-erc20` (High, 2). False positive.** Slither sees `safeTransferFrom(from, …)` with a `from` that is not `msg.sender`. In both places `from` is always the caller or a party the caller's own call authorises:
- `OpusAgenticCommerce._fund` pulls from `job.client`, and the line above requires `_msgSender() == job.client`.
- `OptimisticEvaluator._pullDeposit` is reached from `_postDeposit` (the caller is the client or the provider, and the money comes from that same caller) and from `_ensureClientDeposit`, which only `object` calls, after `_msgSender() == job.client` is required. A third party cannot make the contracts pull from someone else's allowance.

**`reentrancy-no-eth` (Medium, 15). Accepted.** Every flagged path starts at an external entry point that is `nonReentrant` (`finalize`, `timeoutNoSubmission`, `resolveMissingDeposit`, `resolveByDefault`, `sweep` and `complete`/`reject` on the escrow), and the internal helpers (`_complete`, `_reject`, `_settleDeposits`) are only reached from them. State written after a token call cannot be re-entered through another guarded function. A failed payout is credited to `claimable` (I-1), see `SLITHER_BASELINE.md`.

**`timestamp` (Low, 14). Accepted.** The contracts are deadline logic by design. A block producer can move a timestamp by seconds, while the windows are at least one hour (`PLACEHOLDER_MIN_WINDOW`) and the review safety margin is a day.

**`reentrancy-benign` (Low, 3). Accepted.** `_pay` (both contracts) and `configureWithPermit`: the state written after the call is only bookkeeping that cannot be used to take more, and the entry points are `nonReentrant`. Same reasoning as `SLITHER_BASELINE.md`.

**`missing-zero-check` (Low, 2). Accepted.** `factory_` (escrow constructor) and `trustedForwarder_` (factory constructor) are set once at deployment by the deployer, not by a caller afterwards. A zero forwarder means no trusted forwarder.

**`calls-loop` (Low, 1). Accepted.** `OpusACPFactory`'s constructor reads `decimals()` of each listed stablecoin once. The list is given at deployment and has a handful of entries.

**`return-bomb` (Low, 1). Open, for the external auditor.** `OpusAgenticCommerce._callHookWithSelector` caps the hook's gas (`PLACEHOLDER_HOOK_GAS_LIMIT`) but ignores its return data. A hook that returns a very large payload could make the hooked calls of that job run out of gas in the escrow instance. The hook is chosen when the job is created and only affects that job. The contracts are frozen, so this is not changed here. It goes to the auditor.

### What this changes in `SLITHER_BASELINE.md`
Nothing is accepted that was not already, apart from the classes above. No High or Medium result points at a path that moves money for someone who is not the caller.

## Aderyn

Aderyn is run the same way and its result is added here: version, date, commit, the command and the output file.

| | |
| :--- | :--- |
| Run | to be added |
| Result | to be added |

To reproduce from `packages/contracts`:

```bash
aderyn . --src contracts --path-excludes mocks,experimental -o aderyn-report.md
```

## What these tools do not show
Slither and Aderyn find known patterns. They do not know the intended behaviour: who may take which money, in which phase, after how long. That is what `SECURITY_REVIEW.md` (the AI-assisted review that found C-1) and the invariant tests (`test/invariant`, nightly) look at, and it is what the external audit is for.

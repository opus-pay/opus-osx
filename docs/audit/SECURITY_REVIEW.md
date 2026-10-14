# OPUS contracts: AI-assisted security review

**This is not an external audit.** It is a review the founder ran with AI tools on 2026-10-03, before an external audit. No review, external or not, can prove that code has no vulnerabilities. What this document gives is evidence that you can re-run yourself: every issue found is reproduced by a test that fails on the old code and passes on the fixed code.

| | |
| :--- | :--- |
| Scope | `OpusAgenticCommerce`, `OptimisticEvaluator`, `OpusACPFactory`, `OpusForwarder` and their interfaces, about 1,100 lines in `packages/contracts/contracts`. Out of scope: `mocks/`, `experimental/`, everything off chain |
| Code reviewed | The contracts as deployed on Amoy (`docs/grant/AMOY_EVIDENCE.md`), then the fixed version in this repository |
| Compiler | Solidity 0.8.24, OpenZeppelin 5.6.1, EVM target Cancun |
| Result | 1 critical, 2 medium, 2 low issues fixed. 4 design risks documented below. 154 tests pass |

## How the review was done

1. **Static analysis.** [Slither](https://github.com/crytic/slither) with all detectors, informational results excluded. Each result was triaged by hand (below).
2. **Line-by-line reading** of all in-scope code.
3. **Three independent AI reviewers**, each given only the code and one focus, without seeing the others' results:
   - money and accounting: who can take more than they are owed;
   - state machine and timing: phases, deadlines, boundary timestamps;
   - access control, standard conformance and SDK integration.
   Each finding had to come with a concrete scenario, and the serious ones were reproduced with a throwaway test.
4. **Fix, then a fourth independent reviewer** re-checked the fixed code and tried to find new attacks.
5. **Regression tests** for every fixed issue, checked to fail on the old code and pass on the new.

## Findings

| ID | Severity | Issue | Status |
| :--- | :--- | :--- | :--- |
| C-1 | Critical | A fake instance could drain the review contract's pooled USDC | Fixed |
| M-1 | Medium | A late escalation opened deposit and ruling windows that had already closed | Fixed |
| M-2 | Medium | Configs accepted that leave a party no time or no remedy | Fixed |
| L-1 | Low | At the deposit deadline, posting and resolving were both possible | Fixed |
| L-2 | Low | The review contract's `approve(address,uint256)` shared ERC-20 `approve`'s selector | Fixed |
| I-1 | Info | `Conceded` and `Ruled` logged the forwarder instead of the user on relayed calls | Fixed |

### C-1. A fake instance could drain the review contract (Critical, fixed)

**What was wrong.** `OptimisticEvaluator` holds evaluation fees and dispute deposits for every job in one balance. It accepted any contract as an "instance" and trusted its answers. An attacker could:

1. deploy a contract that reports a job and a worthless token;
2. configure a case for it, then call the hook `afterAction(submit)` directly, reaching `Submitted` without funding;
3. object and post the dispute deposits, paid in the worthless token;
4. switch the reported token to USDC and configure again, which was still allowed because the case was never funded;
5. report the job as finished and call `sweep`, which paid the provider's deposit **in USDC** out of other people's money.

Two reviewers found this independently. One reproduced it with 1,000 USDC in the pool: the pool ended at 0.

**Fix** (`OptimisticEvaluator.sol`):
- a case moves only `None → Funded → Submitted`: `beforeAction(fund)` requires `None`, and both submit hooks require `Funded`;
- `configure` is only allowed while the case is still in its first phase;
- a case keeps the token it first held (`TokenChanged`).

Each case can now only pay out what was paid into it, in the same token. The fourth reviewer also tried re-entering from the fake instance's `complete`/`reject` callbacks, reconfiguring after a reject, and the sweep paths, and found no way through.

**Evidence.** `test/unit/OptimisticEvaluator.security.test.ts`, "keeps the pooled USDC when a fake instance replays the old drain", runs the exact attack. Against the old contract the pool falls from 1,000 to 950 USDC. Against the fixed contract it stays at 1,000.

**On Amoy.** The deployed review contract still has this bug, but it holds almost nothing. The fix takes effect at the next deployment.

### M-1. Dispute clocks started at the end of the review, not at escalation (Medium, fixed)

In confirmation mode, if no one called `escalateOnSilence` for more than the deposit window after the review ended, the deposit deadline had already passed when the case opened. The provider could not post, and `resolveMissingDeposit` rejected the job: the provider lost work they had delivered. With an arbiter and no deposit, the ruling deadline could likewise be past on arrival.

**Fix.** The deposit and ruling clocks now start at the end of the review or at escalation, whichever is later. **Evidence:** "starts the dispute clocks at a late escalation" in `OptimisticEvaluator.deposits.test.ts`.

### M-2. Configs that leave a party no time or no remedy (Medium, fixed)

The contract accepted:
- an arbiter with no ruling window (`disputeWindow = 0`): the case could open already expired;
- a dispute deposit with no deposit window: the provider could have one second to post;
- no arbiter with `defaultComplete = false`: the client could object and get a full refund at once, after receiving the work.

**Fix.** An arbiter needs a ruling window, a deposit needs a deposit window, and a job without an arbiter must default to paying the provider. **Evidence:** "rejects configs that leave a party no time or no remedy".

### L-1. Deposit deadline boundary (Low, fixed)

At exactly `depositDeadline`, `postDeposit` and `resolveMissingDeposit` both succeeded, with opposite outcomes. Now posting stops at the deadline and resolving starts there. **Evidence:** "refuses a deposit at the deposit deadline itself".

### L-2. Selector clash with ERC-20 approve (Low, fixed)

Wallets decoded the client's approval as a token spending permission and some flagged it as phishing. Renamed to `approveJob`. The SDK, keeper, relayer tests and pay app follow it. Slither's `erc20-interface` warning is gone.

### Other changes made in the same pass

| Change | Why |
| :--- | :--- |
| Evaluation fee cap: 100% → **20%** of the budget (`MAX_EVALUATION_FEE_BP = 2_000`) | A fee up to the whole budget was a placeholder (D18) |
| Safety margin: 1 hour → **1 day** | Time to call `finalize`/`rule`/`resolveByDefault` before the instance's permissionless `claimRefund` opens. One missed keeper run no longer costs a provider the job |
| Licence headers BUSL-1.1 → **MIT** | Decision D7 |
| SDK `submit` checks the job's evaluator and hook are the OPUS review contract | A client-chosen hook could block payment after delivery (`HookFailed`), then take a refund after expiry |

## Static analysis triage (Slither)

After the fixes Slither reports 38 results (39 before; the `erc20-interface` pair is gone). None is an open issue:

| Detector | Count | Assessment |
| :--- | :--- | :--- |
| arbitrary-send-erc20 | 2 | False positive. `_fund` pulls from `job.client` only when the caller is the client; `_pullDeposit` pulls only from the caller. Both rely on the payer's own allowance |
| reentrancy-no-eth | 15 | Every external entry point that moves money is `nonReentrant`; balances are cleared before paying. The hooks are not `nonReentrant` but move no money and only touch the caller's own cases |
| reentrancy-benign | 3 | Same as above |
| timestamp | 14 | By design: review windows and deadlines are time-based |
| missing-zero-check | 2 | Constructor arguments set by the factory or the deployer |
| calls-loop | 1 | Factory constructor reads `decimals()` of each listed token, once |
| return-bomb | 1 | The hook is chosen by the client for its own job, and is gas-limited. It ignores the hook's return data, so a hook that returns a very large payload could make that job's hooked calls run out of gas; the contracts are frozen, so this is left for the external auditor |

**Re-run on 2026-10-14** (Slither 0.11.6, commit `df5e850`, `packages/contracts/slither.config.json`): the same 38 results (2 High, 15 Medium, 21 Low), each read again against the code. The two `arbitrary-send-erc20` results are in `OpusAgenticCommerce._fund` and `OptimisticEvaluator._pullDeposit`, and in both the money comes only from the caller (`_pullDeposit` is reached from `_postDeposit`, whose caller is the client or the provider, and from `_ensureClientDeposit`, which only `object` calls after it requires the client as caller). Every `reentrancy-no-eth` path starts at a `nonReentrant` entry point: `finalize`, `timeoutNoSubmission`, `resolveMissingDeposit`, `resolveByDefault`, `sweep`, and `complete` on the escrow.

## Static analysis triage (Aderyn)

To be added: the version, the date, the commit and the result of

```bash
cd packages/contracts
aderyn . --src contracts --path-excludes mocks,experimental -o aderyn-report.md
```

with each finding read against the code, as for Slither above.

## Known risks that remain (by design or not fixable here)

1. **`claimRefund` after expiry races the evaluator.** ERC-8183 makes `claimRefund` permissionless and hook-free after `expiredAt`. If nobody calls `finalize`, `rule` or `resolveByDefault` within the one-day margin, the client can take the refund. Run a keeper. A provider in confirmation mode should call `escalateOnSilence` promptly: a very late escalation can push deadlines past expiry.
2. **The client can change the terms before funding.** Until `fund`, the client can reconfigure (arbiter, windows, fees). The provider should read `getConfig` before starting work, and can leave with `withdrawAsProvider`.
3. **The `AfterProviderSetBudget` lock** locks after the first `setBudget` once a provider is set, even if the client sent it.
4. **Hook revert reasons are hidden.** The instance reports every hook failure as `HookFailed`, which makes errors harder to read but does not affect funds.

## Verify it yourself

```bash
yarn install
yarn contracts test                                                    # 154 passing
cd packages/contracts && npx hardhat test test/unit/OptimisticEvaluator.security.test.ts
slither . --filter-paths "node_modules|mocks|test|experimental" --exclude-informational
```

To see the attack work, check out the contracts as deployed on Amoy (before commit `4d1a4b47`), rename `approve` to `approveJob` in `OptimisticEvaluator.sol` so the test compiles, and run the security test: the drain test fails with the pool at 950 of 1,000 USDC.

## Next step

An external audit before any large amounts, as planned in `docs/audit/PRE_AUDIT_FREEZE.md`. Until then the contracts cap each job at 100 USD (`MAX_BUDGET_USD = 100`, raised to 1,000 at the post-audit deployment), and a mainnet beta should be for invited users only.

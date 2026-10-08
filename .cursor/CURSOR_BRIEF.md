# CURSOR_BRIEF — OPUS implementation spec (M0–M5)

> **Audience:** the coding agent working in this repository.
> **Scope:** contracts, evaluator, verification, deployment, SDK, keeper, relayer, and the payment-link app (issues #1–#30, #53, #54). The errand service (M6) and later milestones are described in `GITHUB_ISSUES.md`.
> **Rule:** read this whole file and `.cursor/AGENTS.md` before writing code. One issue = one branch = one PR. Stop and ask at every **[DECISION Dn]**. If this file and another document disagree, this file wins for code; report the conflict in the PR.

---

## 0. Read order

1. `.cursor/AGENTS.md` — invariants I-1 to I-9, rules, open decisions
2. This file
3. ERC-8183 text: https://eips.ethereum.org/EIPS/eip-8183 — read the **current** version and record its date (#3)
4. `GITHUB_ISSUES.md` — tasks and acceptance for the issue you are on
5. `WHITEPAPER.md` §6–§10 — lifecycle, evaluation, security model

---

## 1. What we are building

An admin-free implementation of ERC-8183 plus an evaluator contract, used first by a cross-border errand service.

```text
OpusACPFactory ──creates──▶ OpusAgenticCommerce (one per token + fee config)   ERC-8183 core
                                   ▲        │ hooks
                                   │        ▼
                            OptimisticEvaluator (shared; per-job config)         evaluator + hook
                                   ▲
                                   │ rule()
                            Arbiter: EOA / adapter / later OpusCourt
(optional) OpusForwarder ── ERC-2771 relayed calls for gasless users
```

Fixed decisions you must follow: no admin (I-6); no protocol fee (D13); budget 1–1,000 USD per job (D4); core `evaluatorFeeBP = 0`; voluntary concession (D21); client deposit up front in confirmation mode (D22); no token (D17); no signature-based agreement execution (D16).

---

## 2. Core: `OpusAgenticCommerce` (#6–#10, #12, #13)

### 2.1 Standard surface — must match the EIP exactly

Functions: `createJob`, `setProvider`, `setBudget`, `fund`, `submit`, `complete`, `reject`, `claimRefund`.
Events: `JobCreated`, `ProviderSet`, `BudgetSet`, `JobFunded`, `JobSubmitted`, `JobCompleted`, `JobRejected`, `JobExpired`, `PaymentReleased`, `Refunded`.
States: `Open`, `Funded`, `Submitted`, `Completed`, `Rejected`, `Expired`, with the EIP's transitions and caller rules.

Copy `IAgenticCommerce` and `IACPHook` **verbatim** from the EIP (#3). Resolve the `fund` signature **[DECISION D11]**; if still ambiguous, implement `fund(uint256 jobId, uint256 expectedBudget, bytes calldata optParams)`.

### 2.2 Constructor (all `immutable`)

`token`, `tokenDecimals` (6 or 18), `platformTreasury`, `platformFeeBP`, `trustedForwarder` (zero if D14 = no), `factory`.
Checks: `platformFeeBP <= MAX_PLATFORM_FEE_BP` **[D2]**; `(platformTreasury == 0) == (platformFeeBP == 0)`.
`evaluatorFeeBP` is not a parameter: it is `0` by design.

### 2.3 Constants

| Constant | Value | Status |
| :--- | :--- | :--- |
| `MIN_BUDGET_USD` / `MAX_BUDGET_USD` | 1 / 1,000 (compared in 18-decimal normalized units) | Decided (D4) |
| `MAX_PLATFORM_FEE_BP` | `PLACEHOLDER_MAX_PLATFORM_FEE_BP` (suggest 1,000) | **[D2]** |
| `HOOK_GAS_LIMIT` | `PLACEHOLDER_HOOK_GAS_LIMIT` (suggest 300,000) | **[D2]** |
| `MIN_JOB_DURATION` / `MAX_JOB_DURATION` | `PLACEHOLDER_*` (suggest 1 hour / 180 days) | **[D3]** |

### 2.4 Checks beyond the EIP

* `createJob`: `evaluator != 0`; `now + MIN_JOB_DURATION <= expiredAt <= now + MAX_JOB_DURATION`; provider may be zero.
* `setBudget`: reject amounts outside the budget range (`BudgetBelowMinimum`, `BudgetAboveMaximum`).
* `fund`: EIP checks (provider set, budget equals expected, before expiry); budget range again; pull exactly `budget` with `SafeERC20` and **revert if the balance delta differs** (no fee-on-transfer).
* Every role check uses `_msgSender()` (ERC-2771 aware if a forwarder is set).
* `nonReentrant` on every state-changing function; checks-effects-interactions; custom errors only.

### 2.5 Settlement

* `complete`: `fee = budget * platformFeeBP / 10_000` (round down); `toProvider = budget - fee`; fee to `platformTreasury`.
* `reject`, `claimRefund`: full budget to client; no fee.
* All transfers go through one internal `_pay(to, amount)`:
  1. State is already updated.
  2. Low-level `transfer`; treat revert or `false` as failure.
  3. On failure: `claimable[to] += amount`, emit `PayoutDeferred(to, amount)`; do not revert.
* `withdraw(address to)`: sends `claimable[msg.sender]` to `to` (zero first). Emits `Withdrawn`.

### 2.6 Hooks

* Before/after hooks on `setProvider`, `setBudget`, `fund`, `submit`, `complete`, `reject` with the EIP's `data` encoding.
* Call with `gas: HOOK_GAS_LIMIT`. A reverting or out-of-gas hook reverts the action (EIP behaviour).
* `claimRefund` never calls a hook.

### 2.7 Extensions (`IOpusACPExtensions`)

`withdraw(address)`, `claimable(address)`, `getJob(uint256)`, `supportsInterface` (ERC-165 id for the extension set). Optional `fundWithPermit` only if **[D15]** = yes: `try permit`, then require allowance ≥ budget, then the exact `fund` logic including hooks and events.

---

## 3. Factory: `OpusACPFactory` (#11)

* Constructor: `address[] stablecoins` **[D8]** (non-zero, no duplicates, `decimals()` ∈ {6, 18}), `trustedForwarder`.
* `createInstance(token, treasury, feeBP) returns (address)`: permissionless; token must be listed; deploys `OpusAgenticCommerce` with CREATE2 (salt = hash of the three args); reverts if it already exists; emits `InstanceCreated(instance, token, treasury, feeBP)`.
* `instanceOf(token, treasury, feeBP)` view.
* No owner, no protocol-fee parameter (D13).

---

## 4. Forwarder (#12, **[D14]**)

If D14 = yes: an immutable ERC-2771 forwarder (OpenZeppelin `ERC2771Forwarder` or equivalent) with EIP-712 requests, nonces, and deadlines. Instances and the evaluator trust exactly this address. Tests: forged, expired, replayed, wrong-chain requests fail; role rules hold through the forwarder.

---

## 5. Evaluator: `OptimisticEvaluator` (#14–#17, #53, #54)

One shared contract. It is the job's `evaluator` **and** its `hook`. Per-job state is keyed by `(instance, jobId)`. All money it holds is in the instance's token.

### 5.1 Configuration

`configure(instance, jobId, Config)` — caller must be the job's client; job must be `Open`; `job.evaluator == address(this)` and `job.hook == address(this)`. Replaceable while `Open`; frozen at `fund`.

```solidity
struct Config {
    uint32  submitWindow;        // from fund
    uint32  reviewWindow;        // from submit
    uint32  maxExtension;        // client may extend review once, up to this
    uint32  depositWindow;       // from the escalation base time (5.3), time for missing deposits
    uint32  disputeWindow;       // from the case-open base time (5.3), time for the arbiter
    bool    autoCompleteOnSilence; // true: silence => complete; false: confirmation mode
    bool    defaultComplete;     // outcome when the arbiter does not rule in time
    uint8   budgetLock;          // 0 none, 1 after first quote, 2 from configure (see 5.2)
    address arbiter;             // 0 = no arbiter: objections resolve by default (auto-complete mode only)
    address operator;            // receives the evaluation fee
    uint128 evaluationFee;       // flat, paid whatever the outcome
    uint128 keeperTip;           // per due trigger, paid from evaluationFee
    uint128 disputeDeposit;      // per party
}
```

Validation: windows within bounds **[D3]**; `arbiter != client`, `arbiter != provider` (if set); `keeperTip * MAX_TIPS <= evaluationFee` where `MAX_TIPS = 2`; `evaluationFee <= feeCap(budget)` **[D18]**; confirmation mode (`autoCompleteOnSilence == false`) requires `arbiter != 0` (`ConfirmationNeedsArbiter`); `arbiter == 0` requires `disputeDeposit == 0` (`DepositWithoutArbiter`).

Why confirmation mode needs an arbiter: without one, escalation on silence would go straight to `defaultComplete`. With `true` that is just auto-complete mode; with `false` a client's silence would refund the client after the provider has done the work. Neither is a real confirmation, so the combination is invalid. Jobs without an arbiter use auto-complete mode; an objection there resolves immediately to `defaultComplete` (the service's published policy).

Deposits at configure (pulled from the client): `evaluationFee`, plus `disputeDeposit` when `autoCompleteOnSilence == false` (D22). If the job is rejected or expires while `Open`, the client can reclaim them.

### 5.2 Hook behaviour

| Hook | Rule |
| :--- | :--- |
| `beforeAction(setBudget)` | Enforce `budgetLock`: mode 1 reverts if the budget is already locked; mode 2 always reverts (set the budget before `configure`) |
| `afterAction(setBudget)` | Mode 1: if `job.provider != 0`, lock the budget |
| `beforeAction(fund)` | Config must exist; record `fundedAt`; require `fundedAt + submitWindow + reviewWindow + maxExtension + depositWindow + disputeWindow + SAFETY_MARGIN <= expiredAt` **[D3]**; `evaluationFee <= feeCap(budget)` |
| `beforeAction(submit)` | Revert if `now >= fundedAt + submitWindow` (the `timeoutNoSubmission` time) |
| `afterAction(submit)` | Record `submittedAt` |
| Actions the evaluator itself triggers (`complete`, `reject`) | Must not revert |

**Budget lock.** The standard's `setBudget` hook data is `abi.encode(amount, optParams)`; it does not say who called, so the evaluator cannot tell the client's call from the provider's. Mode 1 therefore means **lock after the first quote**: the first `setBudget` made after a provider is set (and after `configure`) fixes the budget, whoever made it. The other party either funds exactly that amount or walks away (client: `reject` while Open; provider: does not submit, or `withdrawAsProvider` after funding). Mode 2 means **no `setBudget` after `configure`**. In every mode `fund(expectedBudget)` still protects the client. Putting the caller in the hook data is feedback for the standard (D12), not something OPUS changes on its own.

### 5.3 Flow and functions

```text
Funded
  ├─ timeoutNoSubmission()            anyone, at or after fundedAt + submitWindow → reject     [tip]
  └─ withdrawAsProvider()             provider, any time               → reject
Submitted (reviewEnd = submittedAt + reviewWindow + extension)
  ├─ approve()                        client, any time                 → complete
  ├─ withdrawAsProvider()             provider, any time               → reject
  ├─ extendReview(seconds)            client, once, ≤ maxExtension, before reviewEnd
  ├─ object(evidenceHash)             client, before reviewEnd; posts deposit (unless posted at configure) → Escalated
  └─ at or after reviewEnd:
        autoComplete:   finalize()            anyone → complete                 [tip]
        confirmation:   escalateOnSilence()   anyone → Escalated                [tip]
Escalated
  ├─ no arbiter (auto-complete mode only): resolveByDefault() anyone, immediately → defaultComplete
  ├─ postDeposit()                    the party that has not posted, while now < depositDeadline
  ├─ when now >= depositDeadline, one side missing: resolveMissingDeposit() anyone → the missing side loses (table below)
  ├─ both posted (or disputeDeposit == 0) → ArbiterPending
  │     rule(complete|reject, reasonHash)  arbiter, while now < disputeDeadline
  │     resolveByDefault()                 anyone, when now >= disputeDeadline → defaultComplete [tip]
  ├─ approve()                        client concedes → complete
  └─ withdrawAsProvider()             provider concedes → reject
```

**Deadlines are counted from scheduled times, never from when a trigger is called.** A keeper that calls late must not push any deadline past `expiredAt`. Each deadline splits time cleanly: the party action is allowed while `now < deadline`, the trigger that replaces it when `now >= deadline`; no second is open to both.

| Time | Value |
| :--- | :--- |
| `escalationBase` | `object`: the objection time (always before `reviewEnd`). `escalateOnSilence`: `reviewEnd`, even if called later |
| `depositDeadline` | `escalationBase + depositWindow` |
| `caseBase` | the time the second deposit is posted (always < `depositDeadline`); if no deposit is needed, `escalationBase` |
| `disputeDeadline` | `caseBase + disputeWindow` |

Consequences: every evaluator deadline is ≤ `fundedAt + submitWindow + reviewWindow + maxExtension + depositWindow + disputeWindow`, so the fund-time check keeps it at least `SAFETY_MARGIN` before `expiredAt`. If `escalateOnSilence` is called at or after `depositDeadline`, the missing side loses at once through `resolveMissingDeposit`; if a case opens at or after `disputeDeadline`, `resolveByDefault` is immediately due. Whoever benefits from escalation (in confirmation mode, the provider) should make sure the trigger is called; keepers are paid a tip to do it.

**Missing deposit outcomes** (`resolveMissingDeposit`, when `now >= depositDeadline`; tip to the caller, counted in `MAX_TIPS`; arbiter gets nothing):

| Client posted | Provider posted | Outcome | Deposits |
| :--- | :--- | :--- | :--- |
| yes | no | **reject** — client refunded | client's returned |
| no | yes | **complete** — provider paid | provider's returned |
| no | no | `defaultComplete` | none held |
| yes | yes | not callable (case is ArbiterPending) | — |

In practice the first row is the common one: the client always has a deposit posted after `object` (posted with the objection) and in confirmation mode (posted at configure), so a provider who ignores a dispute loses it. Tests must assert this direction explicitly: `JobRejected`, client balance `+ budget + deposit`, arbiter `+ 0`.


### 5.4 Money rules (I-1, I-2)

| Event | Evaluation fee | Deposits |
| :--- | :--- | :--- |
| Job ends through the evaluator (any path) | To `operator`, minus tips already paid | Returned, unless below |
| Due trigger called (`timeoutNoSubmission`, `finalize`, `escalateOnSilence`, `resolveMissingDeposit`, `resolveByDefault`) | `keeperTip` to caller (max `MAX_TIPS` per job) | — |
| Arbiter rules | — | Loser's deposit to arbiter; winner's returned |
| Concession while `ArbiterPending` | — | Conceding party's deposit to arbiter; other returned |
| Concession before both deposits posted | — | All returned |
| Missing deposit | — | Missing side loses (client missing → complete; provider missing → reject); posted deposit returned; arbiter gets nothing |
| No ruling by deadline | — | All returned; default outcome |
| Job ended in core without the evaluator (`claimRefund` after expiry) | `sweep(instance, jobId)` anyone → fee and deposits back to depositors | Returned |

The arbiter's pay never depends on which way it rules.

### 5.5 Arbiter interface (#54)

The evaluator never calls the arbiter. It emits `CaseOpened(instance, jobId, arbiter, disputeDeadline, evidenceHashes)`; the arbiter (EOA, adapter, or later `OpusCourt`) calls `rule`. Define `IOpusArbiter` as documentation of this contract for adapters.

### 5.6 Events

`Configured`, `ReviewExtended`, `Objected`, `Escalated`, `DepositPosted`, `CaseOpened`, `Ruled(arbiter, complete, reasonHash)`, `ResolvedByDefault`, `Conceded(by)`, `TipPaid(to, amount)`, `FeePaid(operator, amount)`, `Swept`.

---

## 6. Verification (#18–#21)

* **Unit:** every function, every custom error; each deadline at `deadline − 1` and `deadline`; budget boundaries 0.999999 / 1 / 1,000 / 1,000.000001 USD for 6- and 18-decimal tokens.
* **Invariants:** I-1, I-2 (instance and evaluator) after every random action; I-4 liveness with maximum windows and only permissionless calls; I-7; I-9 concession from every non-terminal state. Fixed seed in CI, ≥ 10,000 random actions nightly **[D5]**. The random handler must include **every** evaluator function that moves state or money: `configure`, `approve`, `withdrawAsProvider`, `object`, `extendReview`, `finalize`, `escalateOnSilence`, `postDeposit`, `resolveMissingDeposit`, `rule`, `resolveByDefault`, `sweep`, `withdraw`, `timeoutNoSubmission`, plus time jumps and core `claimRefund`; configs are drawn at random (both silence modes, with and without arbiter and deposits).
* **Deadline invariant:** for every job, `depositDeadline` and `disputeDeadline` are ≤ `expiredAt − SAFETY_MARGIN`, including when every trigger is called as late as possible.
* **Direction tests:** each outcome row in 5.3 (missing deposit) and 5.4 has a test that asserts who received what, not only which event fired.
* **Conformance (I-8):** one test per rule in `docs/ERC8183_CONFORMANCE.md`; extension paths emit the same events in the same order and call the same hooks.
* **Hostile cases:** blacklisting token (deferred payouts), reentrant token, reverting / gas-burning / re-entering hooks, forwarder abuse.
* **No-admin check (I-6):** CI grep for forbidden constructs and ABI check for setters.
* **Coverage:** ≥ 95% branches on core, factory, evaluator. Do not lower the threshold in the check script to pass; add tests or explain the uncovered branch in the PR.

---

## 7. Deploy (#22)

Order: forwarder (if D14) → factory → reference USDC instance (`treasury = 0`, `fee = 0`) → `OptimisticEvaluator`. No role grants, no configuration calls after deploy. Write addresses to `deploy/<network>/addresses.json`; verify sources; run the post-deploy check (constructor args, no admin ABI).

---

## 8. Off-chain packages (#23–#26)

**SDK (`@opus/sdk`, #23)**
* viem; types from typechain/ABI only; takes a `WalletClient`; never handles private keys.
* Standard flow: `createJob`, `setProvider`, `quote` (`setBudget`), `fund(expectedBudget)`, `submit`, plus evaluator calls (`configure`, `approveJob` (formerly `approve`), `object`, `extendReview`, `withdrawAsProvider`, `postDeposit`, triggers).
* Presets: AI→AI, AI→person, person→any (confirmation mode, deposit up front), small/no-arbiter **[D10, D18]**.
* Safety: provider may start only if funded amount == agreed amount; warn if evaluator == client; `description` is always a hash or URI of a request document (schema in #68); split work above 1,000 USD into linked jobs.

**Keeper (#24):** watch evaluator jobs; call due triggers; collect tips; alert when a job nears `expiredAt` unresolved.

**Relayer (#25, P0):** accept signed forwarder requests, submit, pay gas; per-integrator budgets and rate limits; screen addresses against applicable sanctions lists before relaying.

**Indexing (#26):** hosted indexer for instances, jobs, evaluator state; used by apps, keeper, and later the Portal.

---

## 9. Payment-link app `apps/pay` (#27–#30)

* Either party drafts terms (counterparty address, amount, deadlines, preset, hash of the agreement made elsewhere); shareable link with expiry; plain-language summary ("paid automatically 3 days after submission unless you object"); prominent address display.
* Flow uses only the SDK: create → quote (or lock from creation) → fund → submit proof hash → approve / object / extend → status and deferred-payout withdrawal.
* Notifications on funding, submission, near deadlines, before auto-completion, escalation, ruling.
* Completion-criteria helper with templates; criteria hashed into the job.
* The errand service (M6) reuses these screens.
* Module versions and call boundaries are `apps/pay/README.md`. Chain calls go through `@opus/sdk`.

---

## 10. Task order

| Week | Issues | Exit check |
| :--- | :--- | :--- |
| 1 | #1–#5 | Build green; `EVM_TARGET.md` and `ERC8183_CONFORMANCE.md` written; D1, D11 decided |
| 2 | #6, #7, #8 | Standard flow passes; deferred payouts work with a frozen party |
| 3 | #9, #10, #11, (#12) | Hostile hooks and budget range tests pass; factory creates instances |
| 4–5 | #14, #15, #16, #53, (#17, #54) | Every evaluator branch tested; fee and deposit flows balance |
| 5–6 | #18–#21 | Invariants, conformance, no-admin check in CI |
| 6–7 | #22–#25, (#26) | Amoy deployment; SDK full flow; keeper earns a tip; zero-POL wallet completes a job |
| 7–9 | #27–#30 | Two people complete a paid job on Amoy through a link |

Do not start #27 before #18–#21 are green.

---

## 11. Conventions

* Pinned Solidity version per #2; no floating `pragma`.
* NatSpec on every external function and event: caller, allowed states, effects, and whether it is **standard** or an **OPUS extension**.
* Constants in `SCREAMING_SNAKE_CASE`; undecided values as `PLACEHOLDER_*` with a comment naming the decision.
* Custom errors only; no revert strings.
* No magic numbers; no `tx.origin`; no logic that depends on sub-minute timestamps.
* After each issue: tick `GITHUB_ISSUES.md` and add a Korean **해결 내용** note.

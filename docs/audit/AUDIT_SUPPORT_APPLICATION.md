# OPUS: application for audit support (Polygon Village)

[한국어](AUDIT_SUPPORT_APPLICATION.ko.md)

Written for a request for an audit voucher or subsidised audit. The facts are the ones in this repository and can be checked there; fields that depend on the application form are marked **[form]**. This is not an audit: the external audit is what is being asked for.

| | |
| :--- | :--- |
| Project | OPUS, an admin-free escrow for small cross-border jobs paid in USDC (ERC-8183) |
| Network | Polygon PoS. Running on Polygon Amoy (chain id 80002) today; nothing on mainnet yet |
| Repository | [github.com/opus-pay/opus-osx](https://github.com/opus-pay/opus-osx), public |
| Licence | MIT. The Solidity files still carry a BUSL-1.1 header so they match the verified Amoy deployment; the header changes to MIT before the audit freeze (`docs/audit/PRE_AUDIT_FREEZE.md`) |
| Contact | Michael Kim, founder. [michael.kim.200518@gmail.com](mailto:michael.kim.200518@gmail.com) **[form: confirm the contact and add Telegram or Discord if asked]** |
| Date | 2026-10-14 |

## 1. What we ask for

An external security audit of the core contracts, as an audit voucher or a subsidised audit. The contracts hold users' USDC, so they must be audited before any real money is locked. The audit is the next milestone of the project (M1) and the gate before mainnet. **[form: amount or voucher size if asked; our scope below is about 1,100 lines.]**

## 2. Audit scope

| Contract | File | Lines |
| :--- | :--- | ---: |
| Escrow instance | `packages/contracts/contracts/acp/OpusAgenticCommerce.sol` | 330 |
| Review contract (optimistic evaluator with an optional arbiter) | `packages/contracts/contracts/evaluators/OptimisticEvaluator.sol` | 676 |
| Factory | `packages/contracts/contracts/acp/OpusACPFactory.sol` | 69 |
| Forwarder (OpenZeppelin `ERC2771Forwarder`, no own logic) | `packages/contracts/contracts/forwarder/OpusForwarder.sol` | 9 |
| Interfaces | `IAgenticCommerce`, `IOpusACPExtensions`, `IACPHook`, `IOpusEvaluator`, `IOpusArbiter` | |

About 1,100 lines (Aderyn counts 1,123 lines of code in the 10 files). Solidity 0.8.24, OpenZeppelin 5.6.1, EVM target Cancun. Out of scope: mocks, `experimental/`, and everything off chain (SDK, keeper, relayer, apps).

## 3. What the contracts do

A client locks USDC for a job. The provider submits proof (its hash is stored on chain). The provider is paid when the client approves, or on its own when the review period ends with no objection. If nothing is submitted by the deadline, the client is refunded. If the client objects, both post a deposit and an arbiter decides; a job with no arbiter has a default outcome. Anyone can trigger an overdue payout or refund, so jobs finish even if the operators are offline.

- **No admin.** There is no owner, pause, upgrade or settings function. Money moves only by the job's rules. Confirming this is a main aim of the audit.
- **Limits written into the code.** Each job is capped at 100 USD until the audit (`MAX_BUDGET_USD`), raised after it.
- **Token handling.** A failed payout (for example a token that blocks one address) is credited to the party's `claimable` balance instead of reverting, so it cannot lock other users' money.

## 4. Work done before the audit

| Item | Result |
| :--- | :--- |
| Tests | 154 tests (unit, ERC-8183 conformance, regression tests for each fixed issue), all passing in CI. Nightly random-seed invariant runs (`test/invariant`) |
| ERC-8183 conformance map | Each MUST and SHOULD mapped to code and tests: `packages/contracts/docs/ERC8183_CONFORMANCE.md` |
| Slither | Runs in CI on every change. 38 results (2 High, 15 Medium, 21 Low), each read against the code; none is an open issue |
| Aderyn 0.6.8 | 2 High and 6 Low categories, each read against the code; none is an open issue |
| AI-assisted security review (2026-10-03) | Three independent AI reviewers, then a fourth on the fixed code. Found **1 critical, 2 medium, 2 low** issues, all fixed with regression tests. The critical one (C-1) let a fake instance drain the review contract's pooled USDC and is reproduced by a test. It never held real money: the deployed Amoy version holds almost nothing |
| On-chain runs on Amoy | Eight scenarios on the first deployment: approval, refund after expiry, auto-payout after silence, refund after no submission, a wallet with no POL, a payment link used by two wallets, a dispute decided by an arbiter, and a provider-created link. Six of them (approval, silent submission, no submission, no-POL wallets, expiry refund, dispute) were run again on a second deployment (2026-10-08) built from the current source after the security fixes. Every transaction: `docs/grant/AMOY_EVIDENCE.md` |
| Audit pack | Threat model, scope, values to settle before the freeze: `docs/audit/PRE_AUDIT_FREEZE.md`. Review and tool results: `docs/audit/SECURITY_REVIEW.md` |

We state plainly that the AI-assisted review and the tools are **not** a substitute for an external audit. They found a critical issue, which is why we expect an audit to find more that tools cannot.

## 5. Known open points we hand to the auditors

- **Hook return data.** `OpusAgenticCommerce._callHookWithSelector` caps the hook's gas but ignores its return data, so a hook returning a huge payload could make that job's hooked calls run out of gas. The hook is the client's choice for its own job. Left for the auditors to judge.
- **Two points a second AI review raised**, both known and small for the OPUS flow: a client-chosen hook can block `complete` (the OPUS flow always uses the review contract as hook, and the SDK checks it), and `claimRefund` can race a very late escalation (a running keeper, and anyone can call `finalize`). A fix would touch ERC-8183 conformance, so we ask the auditors to judge them. Details: `docs/audit/SECURITY_REVIEW.md`.
- **Risks that remain by design** are listed in `docs/audit/SECURITY_REVIEW.md` ("Known risks that remain"): for example `claimRefund` after expiry racing the evaluator unless a keeper runs, and the client's right to change terms before funding.
- **Freeze not yet cut.** A few `PLACEHOLDER_` constants (platform fee ceiling, hook gas, job duration bounds) are settled and renamed before the audit tag is made. We will give the auditors that tag.

## 6. Timeline and what follows

1. Settle the placeholders, change the licence headers, cut the audit tag (about one week).
2. Audit of the frozen version. **[form: preferred start date]**
3. Fix the findings, have the auditors re-check, publish the report.
4. Redeploy on Amoy and rerun the recorded scenarios; then an invite-only mainnet beta with the per-job cap, raised after the audit.

## 7. Other funding for the audit

We have a request open with the Polygon Community Treasury (`docs/grant/APPLICATION.md`) whose use of funds includes an external audit. If that is funded, we will tell the audit provider and Polygon Village, and use only one source for the same work. **[form: state this if the form asks about other grants]**

## 8. Links to check

- Demo and evidence: `docs/grant/README.md` ("Check our claims in five minutes"), with verified contracts on Amoy.
- Whitepaper: `WHITEPAPER.md`.
- Reviews and results: `docs/audit/SECURITY_REVIEW.md`, `docs/audit/PRE_AUDIT_FREEZE.md`.

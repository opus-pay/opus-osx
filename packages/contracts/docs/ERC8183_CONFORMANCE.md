# ERC-8183 conformance map

Recorded 2026-09-26.

| Field | Value |
| :--- | :--- |
| Text | [ERC-8183: Agentic Commerce](https://eips.ethereum.org/EIPS/eip-8183) |
| Created | 2026-02-25 |
| Fetched | 2026-09-26 |
| `ethereum/ERCs` commit | [`a078cab5cc8e9581c15f76c091ed96eed28f02f7`](https://github.com/ethereum/ERCs/commit/a078cab5cc8e9581c15f76c091ed96eed28f02f7) (2026-03-13) |

The EIP is a draft. The specification section is the source of truth. The reference `AgenticCommerce.sol` in the same page uses admin, UUPS, hook allowlists, and a `fund` signature that omits `expectedBudget`. OPUS does **not** copy that reference contract. Interfaces live in `contracts/acp/IAgenticCommerce.sol` and `contracts/acp/IACPHook.sol`.

How OPUS meets each rule:

* **standard** — same as the EIP
* **stricter** — extra check that does not change a successful standard path
* **extension** — extra function or event; standard functions still emit the same events and call the same hooks
* **later** — implemented in a later issue; the rule is recorded here

## D11 — `fund` signature

**Decision:** `fund(uint256 jobId, uint256 expectedBudget, bytes calldata optParams)`.

The specification function list and the “optional provider” section require `expectedBudget` and `job.budget != expectedBudget` as front-running protection. The in-page reference implementation uses `fund(jobId, optParams)` only. Current [hook-contracts](https://github.com/erc-8183/hook-contracts) selectors are `fund(uint256,uint256,bytes)`. OPUS follows the specification and that selector.

## MUST / SHALL

| # | Rule | How OPUS meets it |
| :--- | :--- | :--- |
| S1 | RFC 2119 keywords | This map uses the same words. |
| S2 | A job has exactly one of Open, Funded, Submitted, Completed, Rejected, Expired | **standard** (#6) |
| S3 | Only the listed transitions | **standard** (#6). I-7: terminal jobs do not transition again. |
| S4 | Job has client, provider, evaluator, description, budget, expiredAt, status; hook optional | **standard** (`getJob` extension exposes the same fields, #6) |
| S5 | Provider MAY be zero at creation; `setProvider` before `fund` | **standard** (#6) |
| S6 | One ERC-20 per contract | **standard**. Factory creates one instance per token (#11) |
| S7 | `setProvider`: client only, Open, current provider zero, new provider non-zero, emit `ProviderSet` | **standard**. Operator role is not added (I-6) |
| S8 | `fund` reverts if provider is zero or `budget != expectedBudget` | **standard** (D11) |
| S9 | `createJob` reverts if evaluator is zero or `expiredAt` is not in the future | **standard**, plus duration bounds **stricter** (D3, #6) |
| S10 | `setBudget`: Open; caller is client or provider | **standard** (#6) |
| S11 | `fund`: Open, client, budget ≠ 0, provider set, expected budget matches; pull `job.budget`; set Funded | **standard**. Balance-delta check is **stricter** (#6). Budget range is **stricter** (D4, #10) |
| S12 | `submit`: provider, Funded; set Submitted; emit deliverable | **standard** (#6) |
| S13 | `complete`: evaluator, Submitted; set Completed; pay provider minus optional platform fee | **standard**. `evaluatorFeeBP = 0`. Fee only on complete (#7) |
| S14 | `reject`: client when Open; evaluator when Funded or Submitted; refund if escrowed | **standard** (#6). Client approve / provider withdraw after submit are **extensions** on the evaluator (I-9, later) |
| S15 | `claimRefund`: Funded or Submitted and `now >= expiredAt`; full refund; set Expired | **standard**. Anyone may call (**SHOULD** followed) |
| S16 | Reentrancy guard on token-moving functions | **standard** (#6) |
| S17 | Safe ERC-20 transfers | **standard** (#6) |
| S18 | Hook, if present, SHALL implement `IACPHook` | **standard** interface (#3). Runtime calls (#9) |
| S19 | `beforeAction` / `afterAction` around hookable functions | **standard** (#9) |
| S20 | `claimRefund` SHALL NOT be hookable | **standard** (#9). I-4 |
| S21 | Hook `data` encoding per function | **standard** table below (#9) |
| S22 | Core SHALL NOT interpret `optParams` | **standard** |
| S23 | `hook == 0` skips hook calls | **standard** (#9) |
| S24 | Platform fee, if any, SHALL be deducted only on completion | **standard** (#7). No protocol fee (D13) |
| S25 | Hooks MUST NOT modify core escrow state | **standard** — hook has no privileged core API |
| S26 | If ERC-2771 is supported, all role checks SHALL use `_msgSender()`; forwarder immutable | **extension** (#12, D14 = yes because #12 is in this milestone) |

## SHOULD

| # | Rule | How OPUS meets it |
| :--- | :--- | :--- |
| H1 | Emit the listed job events | **standard**. `JobCreated` includes `hook` to match the current specification interface (the SHOULD list still omits it). |
| H2 | Events include `reason` / `deliverable` | **standard** |
| H3 | `claimRefund` callable by anyone | **standard** |
| H4 | Hook gas limit | **stricter** fixed `PLACEHOLDER_HOOK_GAS_LIMIT` (D2, #9) |
| H5 | `onlyACP` on hooks | **later** (evaluator / hook authors). Not required of the core |
| H6 | Hooks not upgradeable after job creation | **stricter** — OPUS hooks are not proxies (I-6) |
| H7 | ERC-8004 interop | **later** (not in M1) |
| H8 | ERC-2771 meta-transactions | **extension** (#12) |
| H9 | ERC-2612 permit with `fund` | **extension** `fundWithPermit` (#13, D15 = yes because #13 is in this milestone) |

## Hook `data` encoding (S21)

From the specification “Data encoding” table, not the reference contract (which encodes `msg.sender` first).

| Function | `data` |
| :--- | :--- |
| `setProvider` | `abi.encode(address provider, bytes optParams)` |
| `setBudget` | `abi.encode(uint256 amount, bytes optParams)` |
| `fund` | `optParams` (raw bytes) |
| `submit` | `abi.encode(bytes32 deliverable, bytes optParams)` |
| `complete` | `abi.encode(bytes32 reason, bytes optParams)` |
| `reject` | `abi.encode(bytes32 reason, bytes optParams)` |

## OPUS extensions

None of these change a successful standard call’s state, events, or hook order.

| Extension | Issue | Notes |
| :--- | :--- | :--- |
| `getJob` | #6 | View of the spec job fields |
| Job duration bounds | #6 | D3 placeholders |
| Balance-delta `fund` | #6 | Rejects fee-on-transfer |
| Immutable instance fee | #7 | Constructor `platformTreasury` / `platformFeeBP`; `evaluatorFeeBP = 0` |
| `claimable` / `withdraw` / `PayoutDeferred` / `Withdrawn` | #8 | Frozen-token recovery; destinations still I-1 |
| Hook gas cap | #9 | D2 placeholder |
| Budget range 1–1,000 USD | #10 | D4 |
| `OpusACPFactory` | #11 | CREATE2 instances; no admin |
| Trusted forwarder / `_msgSender` | #12 | ERC-8183 optional extension |
| `fundWithPermit` | #13 | `try permit` then the same `fund` path |
| `OptimisticEvaluator` | #14+ | Separate contract; uses standard `complete` / `reject` |
| `fundWithPermit` hook selector | #14 | Core passes `fund.selector` so the extension shares the standard hook path (I-8) |

The in-page reference admin surface (`AccessControl`, UUPS, `setPlatformFee`, hook whitelist, `evaluatorFeeBP` setter) is **not** implemented (I-6, D13).

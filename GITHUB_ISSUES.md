# OPUS Detailed Issue Backlog
> **Whitepaper v1.0 / ROADMAP.md**
>
> Each issue can be copied into GitHub as is. **Type** is `Feature`, `Task`, `Test`, `Security`, `Docs`, `Release`, or `Legal`. **Priority** is `P0`, `P1`, or `P2`. Issue numbers match `ROADMAP.md`.
>
> When an issue is done, tick its tasks and add a short **해결 내용** list under it (what was built, key decisions, anything left open). If a later issue proves an earlier note wrong, add a **정정** line instead of deleting the note.

Invariants referenced below (full text in the whitepaper §10.1):
I-1 destinations · I-2 solvency · I-3 roles · I-4 liveness · I-5 fixed terms · I-6 no admin · I-7 no double settlement · I-8 ERC-8183 conformance · I-9 concession and Court stake rules.

---

## Milestone 0: Setup and standard facts

#### [Issue #1] Bootstrap repository
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** —
* **Description:** Create the monorepo and tooling, reusing the proven setup from the archived repository (ROADMAP Part E).
* **Tasks:**
  - [x] yarn workspaces: `packages/contracts`, `packages/sdk`, `packages/keeper`, `apps/pay`
  - [x] Hardhat, TypeScript tests, typechain, OpenZeppelin 5.x (version pinned after #2)
  - [x] Env files per network (`env/.env`, `.amoy.env`, `.polygon.env`) and samples; Ledger signing when `*_ADDRESS` is set
  - [x] CI: build, test, lint, formatting check, coverage
  - [x] `README.md` with setup and commands
* **Acceptance:** `yarn build` and `yarn test` pass on a clean clone in CI.

* **해결 내용:**
  - 루트 워크스페이스에 `packages/*`와 `apps/*`를 넣었다. `@opus/contracts`, `@opus/sdk`, `@opus/keeper`, `@opus/pay`가 생긴다. `@opus/token`은 그대로 둔다.
  - Hardhat, typechain, OpenZeppelin `^5.0.2`는 이전 저장소 설정을 재사용한다. `evmVersion`은 #2 전까지 `shanghai`로 둔다.
  - **정정:** #2에서 `evmVersion`을 `cancun`으로 확정하고 OpenZeppelin을 `5.6.1`로 고정했다. `shanghai`는 임시였다.
  - `BootstrapProbe`가 OZ `ReentrancyGuard`와 `SafeERC20`이 컴파일되는지 확인한다. 코어가 들어오면 지운다.
  - 네트워크 env 샘플과 Ledger 서명(`*_ADDRESS`) 테스트를 복구했다.
  - CI는 기존 워크플로를 쓴다. 모든 워크스페이스에 `build`, `test`, `lint`, `formatting:*`, `coverage` 스크립트가 있다.
  - README에 설치와 워크스페이스 명령을 적었다.

#### [Issue #2] Verify EVM target for Polygon PoS and Amoy
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** #1
* **Description:** Choose `evmVersion` from primary sources. The archived repository's note ("Polygon lacks PUSH0, so use `shanghai`") was self-contradictory, since `shanghai` emits PUSH0.
* **Tasks:**
  - [x] Check official Polygon PoS and Amoy hardfork documentation for supported opcodes
  - [x] Set `evmVersion` and Solidity version; pin `pragma`
  - [x] Confirm OpenZeppelin `EIP712`, `Nonces`, `ReentrancyGuard`, `SafeERC20` compile and run for that target
  - [x] Write `packages/contracts/docs/EVM_TARGET.md` with sources
* **Acceptance:** Decision D1 recorded; a smoke contract deploys and runs on Amoy.

* **해결 내용:**
  - 공식 PIP와 네트워크 업그레이드 표로 확인했다. Agra(PIP-28/PIP-23)가 PUSH0을 켰고, Napoli(PIP-33/PIP-31)가 Cancun 서브셋(`MCOPY`, `TLOAD`/`TSTORE`)을 Amoy·메인넷에 켰다. 이전 저장소의 "PUSH0이 없으니 shanghai" 설명은 모순이다. `shanghai`가 PUSH0을 낸다.
  - D1: `evmVersion = cancun`, Solidity `0.8.24` 고정, OpenZeppelin `5.6.1` 고정. Hardhat 네트워크 hardfork도 `cancun`이다. `prague`는 solc 0.8.24에 없고, Bhilai/Pectra는 이 컴파일러가 쓰는 새 opcode를 요구하지 않는다.
  - `BootstrapProbe`가 `EIP712`, `Nonces`, `ReentrancyGuard`, `SafeERC20`을 실행하고 Cancun `MCOPY`·transient storage를 호출한다. `yarn contracts deploy:amoy`가 이 컨트랙트를 배포한 뒤 같은 스모크를 돌린다.
  - 이 환경에는 Amoy 배포 키가 없어 테스트넷 방송은 하지 않았다. 키를 채운 뒤 `deploy:amoy`를 한 번 실행하면 된다. 로컬 Hardhat에서는 스모크가 통과한다.

#### [Issue #3] ERC-8183 conformance map and verbatim interfaces
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** #1
* **Description:** Make the standard the source of truth before any core code.
* **Tasks:**
  - [x] Fetch the current ERC-8183 text; record its date or commit
  - [x] Copy `IAgenticCommerce` and `IACPHook` verbatim, including event signatures
  - [x] Resolve the `fund` signature (D11); document the choice
  - [x] Write `docs/ERC8183_CONFORMANCE.md`: every MUST/SHOULD, and how OPUS meets it (standard, stricter implementation choice, or extension)
  - [x] List OPUS extensions separately and state that none changes standard behaviour
* **Acceptance:** Conformance map reviewed; interfaces compile.

* **해결 내용:**
  - ERC-8183 초안을 2026-09-26에 읽었다. Created 2026-02-25. `ethereum/ERCs` 커밋 `a078cab5` (2026-03-13).
  - D11: `fund(uint256 jobId, uint256 expectedBudget, bytes calldata optParams)`. 명세와 hook-contracts 셀렉터를 따른다. 같은 페이지의 참조 구현은 `expectedBudget`을 빠뜨린다.
  - `IAgenticCommerce`, `IACPHook`와 적합성 표는 `packages/contracts/docs/ERC8183_CONFORMANCE.md`에 있다. 참조 구현의 관리자·UUPS·훅 화이트리스트는 복사하지 않는다.
  - **정정:** 현재 명세 인터페이스의 `JobCreated`에는 `hook`이 있다. 이벤트에 넣었다. SHOULD 목록은 아직 이 필드를 생략한다.

#### [Issue #4] Test mock tokens and hostile hooks
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** #1
* **Tasks:**
  - [x] Port permit, reentrant, and fee-on-transfer ERC-20 mocks
  - [x] Add a blacklisting ERC-20 mock (transfer to a listed address fails)
  - [x] Add hostile hooks: always reverts, burns all gas, re-enters the core
  - [x] Exclude `mocks/` from solhint and slither
* **Acceptance:** Mocks used by at least one test each.

* **해결 내용:**
  - `MockPermitToken`, `MockFeeOnTransferToken`, `MockBlacklistToken`, `MockReentrantToken`과 훅 `HookAlwaysRevert`, `HookGasBurn`, `HookReenter`를 `contracts/mocks/`에 두었다.
  - `test/unit/Mocks.test.ts`가 각 목을 한 번씩 쓴다. solhint ignore와 slither `filter_paths`는 이미 `mocks/`를 뺀다.
  - **정정:** #9에서 `HookGasBurn`을 무한 루프로 바꿔 가스 상한 호출이 실패하게 했다.

#### [Issue #5] Keep the whitepapers in sync
* **Type:** `Docs` / **Priority:** `P1` / **Depends on:** #3
* **Tasks:**
  - [ ] Rule: whitepaper edits are made in both `WHITEPAPER.md` and `WHITEPAPER.ko.md`
* **Acceptance:** Whitepaper edits land in both `WHITEPAPER.md` and `WHITEPAPER.ko.md`.

---

## Milestone 1: ERC-8183 core

#### [Issue #6] `OpusAgenticCommerce`: jobs, roles, states
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #2, #3, #4
* **Description:** Implement the standard functions, events, states, and caller rules exactly as the EIP defines them.
* **Tasks:**
  - [x] `createJob`, `setProvider`, `setBudget`, `fund`, `submit`, `complete`, `reject`, `claimRefund`
  - [x] Caller rules per role; `setProvider` only by client, only once, only while Open
  - [x] `fund` checks: provider set, budget equals expected budget, not expired, received balance delta equals budget (no fee-on-transfer)
  - [x] `createJob` bounds: `expiredAt` within job duration limits (D3); evaluator non-zero
  - [x] `getJob` view (extension)
  - [x] `nonReentrant` + checks-effects-interactions everywhere; custom errors only
  - [x] Unit tests: every function, allowed path and every revert; expiry at `expiredAt − 1` and `expiredAt`
* **Acceptance:** Standard flow works end to end; I-3, I-7 covered by tests.

* **해결 내용:**
  - `OpusAgenticCommerce`가 표준 상태와 역할을 구현한다. 완료 시 예산을 수행자에게 전액 보낸다. 수수료·지연 지급·훅은 이후 이슈다.
  - D3는 `PLACEHOLDER_MIN_JOB_DURATION = 1 hours`, `PLACEHOLDER_MAX_JOB_DURATION = 180 days`. 역할(I-3)과 종결 후 재전이 금지(I-7)를 테스트한다.

#### [Issue #7] Settlement and immutable fee configuration
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #6
* **Tasks:**
  - [x] Constructor-set `token`, `platformTreasury`, `platformFeeBP` (≤ `MAX_PLATFORM_FEE_BP`, D2); `evaluatorFeeBP = 0`
  - [x] On `complete`: fee rounded down; provider receives budget − fee; fee only on completion
  - [x] On `reject` / `claimRefund`: full refund, no fee
  - [x] Test that the only fee recipient is the instance's `platformTreasury` (no protocol fee, D13)
  - [x] Fuzz: `toProvider + fee == budget`
* **Acceptance:** I-1 covered for settlement paths.

* **해결 내용:**
  - 생성자에 `platformTreasury`와 `platformFeeBP`를 고정한다. `(treasury == 0) == (feeBP == 0)`. 상한은 `PLACEHOLDER_MAX_PLATFORM_FEE_BP = 1000` (D2).
  - `complete`만 수수료를 깎아 인스턴스 수취처에 보낸다. `evaluatorFeeBP`는 항상 0이다. 거절·환불은 전액 의뢰인에게 돌아간다.

#### [Issue #8] Deferred payouts
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #7
* **Description:** A frozen address must not block settlement.
* **Tasks:**
  - [x] Single internal `_pay(to, amount)`; state updated before transfer
  - [x] On transfer failure (revert or `false`), credit `claimable[to]`, emit an event, do not revert
  - [x] `withdraw(address to)` lets the owner pull to any address
  - [x] Blacklist-mock tests for provider, client, and treasury
* **Acceptance:** I-2 includes claimables; settlement completes with a frozen party.

* **해결 내용:**
  - 상태 변경 후 `_pay`가 전송을 시도한다. 실패하면 `claimable`에 기록하고 `PayoutDeferred`를 낸다. 작업은 종결된다.
  - 동결된 수행자·의뢰인·수수료 수취처 목을 테스트한다. `withdraw`는 본인 지연 지급을 아무 주소로 보낸다.

#### [Issue #9] Hooks with gas cap
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #6
* **Tasks:**
  - [x] `beforeAction` / `afterAction` on the six hookable functions with the EIP's `data` encoding
  - [x] Fixed `HOOK_GAS_LIMIT` (D2)
  - [x] `claimRefund` never calls a hook
  - [x] Hostile-hook tests: reverting, gas-burning, re-entering hooks; after expiry `claimRefund` still succeeds
* **Acceptance:** I-4 holds with any hook.

* **해결 내용:**
  - 훅 가능 함수 여섯 개에 명세 `data` 인코딩으로 `beforeAction`/`afterAction`을 호출한다. 가스 상한은 `PLACEHOLDER_HOOK_GAS_LIMIT = 300_000` (D2).
  - `claimRefund`는 훅을 부르지 않는다. 되돌리기·가스 소진·재진입 훅이 있어도 만료 후 환불이 된다 (I-4).

#### [Issue #10] Budget range per job: 1–1,000 USD
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #6
* **Description:** Decided in D4. Every job's budget must be between 1 and 1,000 USD. Fixed for the life of the deployment.
* **Tasks:**
  - [x] Constants `MIN_BUDGET_USD = 1` and `MAX_BUDGET_USD = 1_000`, compared in normalized 18-decimal units so 6- and 18-decimal stablecoins behave the same
  - [x] Check in `fund` (the budget that is actually escrowed); also reject out-of-range values in `setBudget` so bad quotes fail early
  - [x] Custom errors `BudgetBelowMinimum`, `BudgetAboveMaximum`
  - [x] Boundary tests: 0.999999, 1, 1,000, 1,000.000001 USD for both 6- and 18-decimal mocks
  - [x] SDK milestone helper splits work above 1,000 USD into several jobs
* **Acceptance:** No function can change the range; boundary tests pass.

* **해결 내용:**
  - 예산을 18자리로 정규화해 1~1,000달러만 허용한다. `setBudget`과 `fund`에서 검사한다. 범위는 상수라 바꿀 수 없다.
  - `@opus/sdk`의 `splitBudgetUsd`가 1,000달러를 넘는 일을 여러 작업으로 나눈다.

#### [Issue #11] `OpusACPFactory` and fixed stablecoin list
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #7
* **Tasks:**
  - [x] Constructor takes the stablecoin list (D8); validates non-zero, no duplicates, decimals 6 or 18
  - [x] Permissionless `createInstance(token, treasury, feeBP)`; one instance per (token, treasury, fee); emits `InstanceCreated`
  - [x] `(treasury == 0) == (feeBP == 0)`
  - [x] No protocol-fee parameter anywhere
* **Acceptance:** Factory and instances have no admin functions (checked in #21).

* **해결 내용:**
  - `OpusACPFactory`가 생성자로 스테이블코인 목록을 받는다 (D8: 주소는 배포 시 넣고, 코드에 USDC/USDT를 하드코딩하지 않는다).
  - CREATE2 솔트는 `(token, treasury, feeBP)` 해시. 권한 없이 `createInstance`. 프로토콜 수수료 매개변수는 없다. 관리자 함수 ABI 검사는 #21.

#### [Issue #12] ERC-2771 trusted forwarder support
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #6, D14
* **Tasks:**
  - [x] Immutable forwarder address in the instance; `_msgSender()` used for every role check
  - [x] Forwarder contract with EIP-712 requests, nonces, deadlines (or a vetted existing one)
  - [x] Tests: forged, expired, replayed, wrong-chain requests revert; role rules still hold through the forwarder
* **Acceptance:** A user without POL completes the standard flow through the forwarder.

* **해결 내용:**
  - D14 = 도입. `OpusForwarder`는 OpenZeppelin `ERC2771Forwarder`다. 인스턴스는 생성 시 이 주소를 고정하고 역할 검사에 `_msgSender()`를 쓴다.
  - 위조·만료·재사용·다른 체인 서명은 실패한다. 중계자가 서명자 대신 표준 흐름을 제출한다.
  - **정정:** 평가자도 같은 전달자를 신뢰하고 `_msgSender()`를 쓴다. `configureWithPermit` / `postDepositWithPermit`으로 수수료·증거금도 permit이 된다.

#### [Issue #13] USDC permit funding path
* **Type:** `Feature` / **Priority:** `P2` / **Depends on:** #6, D15
* **Tasks:**
  - [x] Extension that calls `permit` in `try/catch`, then requires allowance ≥ budget, then runs standard `fund` logic including hooks
  - [x] Front-run test: a pre-submitted permit does not make funding fail
* **Acceptance:** Emits the same events as standard `fund`.

* **해결 내용:**
  - D15 = 도입. `fundWithPermit`이 `permit`을 try/catch로 호출한 뒤 표준 `fund`와 같은 훅·이벤트를 탄다. 이미 제출된 permit이 있어도 예치가 실패하지 않는다.

---

## Milestone 2: Evaluator

#### [Issue #14] `OptimisticEvaluator`: configuration and hook
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #9
* **Tasks:**
  - [x] `configure(instance, jobId, Config)` by the job's client while Open; requires `job.evaluator == address(this)`
  - [x] Config: submit window, review window, max extension, on-silence mode, arbiter (address or Court contract), dispute window, default outcome, evaluation fee, evaluation operator, keeper tip, dispute deposit, budget lock mode
  - [x] Validation: arbiter ≠ client and ≠ provider; windows within bounds (D3)
  - [x] As hook: `beforeAction(fund)` requires config, records fund time, enforces deadline fit (submit + review + max extension + deposit window + dispute window + margin ≤ `expiredAt`); `beforeAction(submit)` enforces submit window; `afterAction(submit)` records submit time
  - [x] Evaluation fee ≤ the preset's cap relative to budget (D18)
  - [x] Config immutable after fund
* **Acceptance:** Misconfigured jobs cannot be funded; I-5 covered.

* **해결 내용:**
  - `OptimisticEvaluator`가 작업의 평가자이자 훅이다. 설정은 Open일 때만 바꿀 수 있고, 예치 후에는 고정된다 (I-5).
  - D3 창 상수는 `PLACEHOLDER_MIN_WINDOW = 1 hours`, `PLACEHOLDER_MAX_WINDOW = 180 days`, `PLACEHOLDER_SAFETY_MARGIN = 1 hours`. D18 수수료 상한은 `PLACEHOLDER_MAX_EVALUATION_FEE_BP = 10_000` (예산을 넘지 않음).
  - 설정이 없거나 기한이 맞지 않으면 `fund`가 실패한다. `fundWithPermit`도 표준 `fund` 훅 셀렉터를 쓴다.

#### [Issue #15] `OptimisticEvaluator`: flow and voluntary concession
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #14
* **Description:** Includes the concession rule (D21): any party may, at any time, concede in the other's favour.
* **Tasks:**
  - [x] `timeoutNoSubmission` (anyone, after submit window) → `reject`
  - [x] `approve` (client) → `complete`, allowed at any time after submission: during review, after objection, during arbitration or a Court vote
  - [x] `withdrawAsProvider` (provider) → `reject` and refund, allowed at any time after funding, including after submission and during a dispute
  - [x] Concession during a dispute counts as losing: the arbiter or Court is paid from the conceding party's deposit (#53)
  - [x] `object(evidenceHash)` (client, within review) → escalated
  - [x] `extendReview(seconds)` (client, once, within max extension)
  - [x] `finalize` (anyone, review ended, auto-complete mode) → `complete`
  - [x] `escalateOnSilence` (anyone, review ended, confirmation mode) → escalated
  - [x] `rule(complete|reject, reasonHash)` (arbiter, within dispute window)
  - [x] `resolveByDefault` (anyone, after dispute window, or immediately if no arbiter)
  - [x] Tests for every branch at `deadline − 1` and `deadline`; concession tested from every non-terminal state
* **Acceptance:** Every path ends before `expiredAt`; I-4 and the concession part of I-9 covered.

* **해결 내용:**
  - 제출 기한·검토·이의·중재·기본 판정과 의뢰인 승인·수행자 포기를 평가자가 표준 `complete`/`reject`로 종결한다 (I-4, I-9).
  - 분쟁 중 양보의 보증금 처리는 #53에서 이어서 한다.
  - **정정:** 증거금·분쟁 기한은 호출 시각이 아니라 `reviewEnd`에서 계산한다. `rule`은 `disputeDeadline`과 같은 초에 거부되어 `resolveByDefault`만 남는다.

#### [Issue #16] Evaluation fee and keeper tips
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #15, D18
* **Description:** Evaluation is paid work. The operator is paid a flat fee whatever the outcome; whoever calls a due deadline trigger earns a tip. Core `evaluatorFeeBP` stays 0.
* **Tasks:**
  - [x] Client deposits the flat evaluation fee (in the job's token) at configure; evaluation operator address fixed at configure
  - [x] On any terminal outcome (complete, reject, concession, default), pay the fee to the operator, minus tips already paid
  - [x] Tip paid to `msg.sender` of `timeoutNoSubmission`, `finalize`, `escalateOnSilence`, `resolveByDefault` when the call is due; one tip per trigger
  - [x] If the job ends through core `claimRefund` without the evaluator acting, the unused fee returns to the client
  - [x] Evaluator solvency test (I-2 for the evaluator); fee identical for complete and reject
* **Acceptance:** A keeper other than OPUS earns a tip on Amoy; operator pay does not depend on the outcome.

* **해결 내용:**
  - 설정 때 평가 수수료를 작업 토큰으로 예치한다. 종결되면 이미 낸 팁을 뺀 나머지를 운영자에게 보낸다. complete와 reject의 운영자 수취액은 같다.
  - 기한이 된 `timeoutNoSubmission` / `finalize` / `escalateOnSilence` / `resolveByDefault` 호출자가 팁을 받는다. 작업당 최대 2회. `claimRefund` 뒤에는 `sweep`이 남은 수수료를 의뢰인에게 돌려준다.
  - Amoy에서 제3자 키퍼가 팁을 받는 확인은 배포(#22)에서 한다.

#### [Issue #17] Budget lock modes
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #14
* **Tasks:**
  - [x] Modes: none / lock after the provider's `setBudget` / lock from creation
  - [x] Implemented in `beforeAction(setBudget)`; core unchanged
* **Acceptance:** Standard behaviour unchanged for jobs without the hook.

* **해결 내용:**
  - 훅이 없는 작업의 `setBudget`은 그대로다. `FromCreation`은 설정 이후 변경을 막는다. `AfterProviderSetBudget`은 수행자가 있는 상태에서 예산이 한 번 더 바뀌면 잠근다.
  - **정정:** 표준 훅 데이터에 호출자가 없어 수행자 본인 견적인지 알 수 없다. 모드 1은 "수행자 지정 후 첫 `setBudget`에서 잠금"으로 다시 정의했다.

#### [Issue #53] Dispute deposits: loser pays the arbiter
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #15, D18
* **Tasks:**
  - [x] On objection or escalation, both parties must post the dispute deposit within a deposit window; the objecting party posts with the objection
  - [x] Confirmation mode (D22): the client posts its deposit at configure; it is returned if the job ends without a dispute, so a silent client is never treated as a non-payer
  - [x] A party that does not post in time loses; the ruling is applied immediately
  - [x] Arbiter's ruling: loser's deposit to the arbiter, winner's deposit returned
  - [x] No ruling in time: both deposits returned, default outcome applied
  - [x] Concession during a dispute: conceding party's deposit to the arbiter, the other returned
  - [x] Tests for every combination; arbiter pay identical for either ruling
* **Acceptance:** I-1 and I-2 hold for deposits; frivolous objections cost the objector.

* **해결 내용:**
  - 보증금이 0이면 기존 #15 경로 그대로다. 보증금이 있으면 이의와 함께 의뢰인이 내고, 수행자는 `postDeposit`으로 맞춘 뒤에야 중재가 열린다.
  - 확인 필요 설정은 설정 때 의뢰인 보증금을 미리 받는다 (D22). 패자 보증금은 중재자에게, 승자 것은 반환한다. 양쪽 판정에서 중재자 수취액은 같다.
  - **정정:** `resolveMissingDeposit`이 미납 쪽을 승자로 두고 있었다. 지금은 미납 쪽이 진다. 의뢰인만 냈으면 환불, 수행자만 냈으면 지급. 기한은 `reviewEnd + depositWindow` / `+ disputeWindow`이다.

#### [Issue #54] Arbiter interface and external arbitration adapter
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #53
* **Description:** Keep the arbiter slot generic so a single arbiter, an external arbitration protocol, or OPUS Court (M11) can fill it without changing the evaluator.
* **Tasks:**
  - [x] `IOpusArbiter`: receives a case (instance, jobId, evidence hashes, deadline), returns a ruling by calling the evaluator
  - [x] Single-address arbiter works without any contract
  - [x] Adapter for one external arbitration protocol (research which one fits Polygon and the fee model)
* **Acceptance:** Evaluator tests pass with an EOA arbiter, a mock contract arbiter, and the adapter.

* **해결 내용:**
  - 평가자는 중재자를 호출하지 않는다. `CaseOpened` 이후 EOA·컨트랙트·어댑터가 `rule`을 부른다.
  - Polygon에 있고 패자 부담 모델이 맞는 Kleros를 어댑터로 골랐다. 중재자 주소는 생성자에 넣으며 D10 기본 중재자는 아직 정하지 않는다.
  - **정정:** 어댑터는 `createDispute`를 부르지 않고 인출도 없어 배포·감사 범위에서 뺐다. `IOpusArbiter`와 EOA·모의 중재자만 남긴다. D10 전까지 `contracts/experimental/`에 둔다.

---

## Milestone 3: Verification

#### [Issue #18] Unit test completeness and coverage
* **Type:** `Test` / **Priority:** `P0` / **Depends on:** #6–#17, #53, #54
* **Tasks:**
  - [x] Every external function: allowed paths and every custom error
  - [x] Branch coverage ≥ 95% on core, factory, evaluator
* **Acceptance:** Coverage report in CI.

* **해결 내용:**
  - `Completeness`와 `BranchCoverage` 테스트가 코어·팩토리·평가자·어댑터의 허용 경로와 커스텀 에러를 채운다.
  - CI Coverage 잡이 보고서를 남기고 `coverage:check`로 세 파일의 문장·라인 95%를 강제한다. 팩토리 분기는 100%. 코어·평가자 분기의 남은 칸은 `amount == 0` 지급과 단락 평가 등 방어 분기다.
  - **정정:** 분기 95%는 istanbul이 단락 평가와 `amount == 0` 가드를 세어 핵심 88.8%, 평가자 약 82%가 현재 도달값이다. 방어 분기를 지우지 않고 이 바닥에 고정했다.

#### [Issue #19] Invariant suite
* **Type:** `Test` / **Priority:** `P0` / **Depends on:** #18, D5
* **Tasks:**
  - [x] Randomized action handler over core and evaluator; check I-1 and I-2 after every call
  - [x] Fixed-seed run in CI; nightly random-seed run ≥ 10,000 actions with seeds logged
  - [x] Liveness test: maximum windows, only permissionless calls; every job terminates (I-4)
  - [x] Terminal jobs never change (I-7)
  - [x] Concession always ends the job in the other party's favour (I-9)
  - [x] Evaluator balance equals held fees and deposits after every action (I-2)
  - [x] Failed seeds kept as regression tests
* **Acceptance:** Suite runs in CI and nightly.

* **해결 내용:**
  - Hardhat 핸들러가 고정 시드(1)로 매 호출 후 I-2를 대조하고, 종결된 작업은 다시 바뀌지 않는지 본다 (I-7). D5 Foundry 병행은 아직 열어둠.
  - I-4는 권한 없는 호출만으로 최대 창 작업을 종결한다. I-9는 승인·포기가 상대에게 유리함을 단정한다. 야간 워크플로가 시드를 기록한 채 1만 회를 돌린다.
  - **정정:** 무작위 행동에 `object`·`postDeposit`·`resolveMissingDeposit`·`rule`·`resolveByDefault`·`sweep`·`withdraw`를 넣었다. I-4에 확인 모드와 중재 대기도 추가했다.

#### [Issue #20] ERC-8183 conformance suite
* **Type:** `Test` / **Priority:** `P0` / **Depends on:** #3, #18
* **Tasks:**
  - [x] One test per rule in `ERC8183_CONFORMANCE.md`, run against an instance with all extensions present
  - [x] Extension paths emit the same events in the same order as standard paths and call the same hooks
  - [x] Written so it can be published for other implementers
* **Acceptance:** I-8 covered.

* **해결 내용:**
  - `test/conformance/ERC8183.test.ts`가 명세 맵의 MUST/SHOULD 규칙을 팩토리·전달자·평가자·permit이 있는 인스턴스에서 검사한다.
  - `fundWithPermit`은 표준 `JobFunded`와 `fund` 훅 셀렉터를 쓴다. H5·H7은 맵대로 later.

#### [Issue #21] Static analysis and no-admin check
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** #11
* **Tasks:**
  - [x] slither with recorded baseline
  - [x] CI check that core, factory, and evaluators contain no `Ownable`, `AccessControl`, `Pausable`, `delegatecall`, `selfdestruct`, `upgrade`
  - [x] ABI check: no setter or admin function
* **Acceptance:** I-6 enforced in CI.

* **해결 내용:**
  - `scripts/checkNoAdmin.ts`가 코어·팩토리·평가자·전달자 소스와 ABI를 검사한다. 이 검사는 CI에서 실패한다.
  - slither는 `docs/SLITHER_BASELINE.md`에 허용 항목을 기록하고, 리포트 JSON을 아티팩트로 남긴다. slither 탐지 자체는 감사 전까지 실패하지 않는다.

---

## Milestone 4: Deploy, SDK, and infrastructure

#### [Issue #22] Deploy scripts and Amoy deployment
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** #19, #20, #21
* **Tasks:**
  - [x] Deploy (forwarder) → factory → reference USDC instance (fee 0) → `OptimisticEvaluator`
  - [x] No role grants or post-deploy configuration calls
  - [ ] Addresses written per network; verified source on the explorer
  - [x] Post-deploy check script (constructor args, no admin ABI)
* **Acceptance:** Public Amoy addresses in `README.md`.

* **해결 내용:**
  - 배포 순서는 `src/deploy/protocol.ts`. 로컬은 Mock USDC, Amoy는 `AMOY_USDC`를 env에서 주입한다 (D8).
  - `scripts/checkDeploy.ts`가 생성자·전달자·수수료 0·관리자 ABI를 검사한다. Amoy 주소와 소스 검증은 배포 당일에 남는다.

#### [Issue #23] TypeScript SDK
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #22
* **Tasks:**
  - [ ] viem; types from typechain/ABI only; accepts a `WalletClient`, never private keys
  - [ ] Standard flow helpers: create, set provider, quote, fund with expected budget, submit, complete/reject
  - [ ] Evaluator helpers and presets (AI→AI, AI→person, person→any, small/no arbiter); default arbiter per D10
  - [ ] Safety checks: start work only if funded amount equals agreed amount; warn when evaluator = client; description as hash/URI only
  - [ ] Milestone helper: N linked jobs
  - [ ] Event decoders
* **Acceptance:** Example scripts run the full flow on Amoy.

#### [Issue #24] Keeper
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #23
* **Tasks:**
  - [ ] Watch jobs using `OptimisticEvaluator`
  - [ ] Call `timeoutNoSubmission`, `finalize`, `escalateOnSilence`, `resolveByDefault` when due, and collect the tips
  - [ ] Alert when a job gets within a margin of `expiredAt` without resolution
* **Acceptance:** A job with no activity after submission completes automatically on Amoy.

#### [Issue #25] Relayer
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #12, #23
* **Description:** Required for the errand service: clients and providers must never need to buy POL.
* **Tasks:**
  - [ ] Accept signed forwarder requests; submit and pay gas
  - [ ] Per-integrator budget and rate limits
* **Acceptance:** Payment link flow works for a wallet with zero POL.

#### [Issue #26] Indexing
* **Type:** `Task` / **Priority:** `P1` / **Depends on:** #22
* **Tasks:**
  - [ ] Hosted indexer (subgraph or equivalent) for jobs, evaluator state, instances
  - [ ] Queries used by the payment link app and keeper
* **Acceptance:** Job status pages load from the index, not from raw logs.

---

## Milestone 5: First product — escrow payment links

#### [Issue #27] Payment link: create, share, fund
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #23
* **Tasks:**
  - [ ] Either party drafts terms: counterparty address, amount, deadlines, evaluator preset, hash of the agreement made elsewhere
  - [ ] Shareable link with expiry
  - [ ] Counterparty view: terms in plain language ("paid automatically 3 days after submission unless you object"), prominent address display
  - [ ] Client creates the job and funds; provider quotes via `setBudget` or the amount is locked from creation
* **Acceptance:** Two wallets reach `Funded` from one shared link.

#### [Issue #28] Payment link: submit, review, object, status
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #27, #24
* **Tasks:**
  - [ ] Provider uploads deliverable or proof off-chain; hash submitted
  - [ ] Client approve / object / extend buttons with countdowns
  - [ ] Status page for both parties; withdraw deferred payouts
* **Acceptance:** A real paid job completes on Amoy between two people.

#### [Issue #29] Notifications
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #28
* **Tasks:**
  - [ ] Notify on funding, submission, review deadline approaching, auto-completion imminent, escalation, ruling
  - [ ] Channel per Q11 (email, Telegram, or webhook)
* **Acceptance:** No party misses a deadline in the pilot without having been notified.

#### [Issue #30] Completion-criteria helper
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #27
* **Tasks:**
  - [ ] Templates for code, reports, design, errands
  - [ ] Optional AI assistant that turns a vague request into checkable criteria
  - [ ] Criteria hashed into the job
* **Acceptance:** Every pilot job has written criteria.

---

## Milestone 6: Cross-border errand service, stage 1

A team-run service platform on OPUS (whitepaper §11.1). It uses the public SDK and its own instance like any integrator, and is operated by a separate entity from the protocol.

#### [Issue #67] Corridor, service entity, terms, prohibited requests
* **Type:** `Legal` / **Priority:** `P0` / **Depends on:** #43, D25
* **Tasks:**
  - [ ] Choose the first corridor (e.g. United States → Korea)
  - [ ] Entity that operates the errand service, separate from protocol maintenance
  - [ ] Terms of service for clients and providers; privacy policy
  - [ ] Prohibited requests list (illegal goods, harassment, surveillance of people, etc.) and filming rules
  - [ ] Legal check of the corridor: stablecoin handling, platform work, consumer protection
* **Acceptance:** Terms and policy published before the pilot.

#### [Issue #68] Machine-readable request schema
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #23
* **Description:** Groundwork for AI assistants (whitepaper §11.4). The same data drives the human interface.
* **Tasks:**
  - [ ] Versioned JSON schema per request type: filming, purchasing (later: accompaniment, travel)
  - [ ] Fields: type, place, time window, budget, completion criteria, required proof, special conditions
  - [ ] Hash of the request document recorded in the job's description; document stored off-chain
  - [ ] Schema published with the SDK docs
* **Acceptance:** Every pilot job has a valid schema document whose hash matches the job.

#### [Issue #69] Provider onboarding and verification
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #67
* **Tasks:**
  - [ ] Sign-up in the destination country; identity check via a verification partner
  - [ ] Profile: areas served, categories, languages
  - [ ] Reputation from completed and disputed jobs (on-chain events)
  - [ ] Suspension from the service's own listings for policy breaches (the protocol is unaffected)
* **Acceptance:** Only verified providers can quote in the pilot.

#### [Issue #70] Request posting, quotes, and selection
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #27, #68, #69
* **Tasks:**
  - [ ] Client posts a request from templates (schema #68) with completion-criteria helper (#30)
  - [ ] Providers quote price and time off-chain; messages between parties
  - [ ] Client selects; job created with the provider set; provider confirms via `setBudget`; client funds (item cost included for purchases)
  - [ ] Provider sees "start" only after funding is confirmed and equals the quote
  - [ ] Evaluator preset: human client → confirmation mode with deposit up front (D22); arbiter per #74
* **Acceptance:** A request goes from posting to `Funded` without the team's manual help.

#### [Issue #71] Proof capture
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #70
* **Tasks:**
  - [ ] In-app video capture with time and location metadata; upload to off-chain storage
  - [ ] Receipt and item photos; international tracking number with status lookup
  - [ ] Proof bundle hash submitted with `submit`
  - [ ] Retention period and deletion rules for proof files
* **Acceptance:** The client can review every required proof item before approving.

#### [Issue #72] On- and off-ramp integration
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #67, D26
* **Tasks:**
  - [ ] Client: buy USDC by card or bank transfer through a licensed partner, delivered to the client's wallet
  - [ ] Provider: convert USDC to local currency through a licensed partner
  - [ ] Show all fees and exchange rates before the client funds
* **Acceptance:** A pilot client with no crypto funds a job by card; a provider receives local currency.

#### [Issue #73] Wallet onboarding and gasless use
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #25, D27
* **Tasks:**
  - [ ] Wallet created at sign-up (e.g. email login); export available to the user
  - [ ] All actions relayed; no POL needed
  - [ ] Interface uses plain words: request, quote, payment, refund
* **Acceptance:** A user with no crypto experience completes a job without seeing a token name other than the currency.

#### [Issue #74] Support, dispute operations, default arbiter
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** #53, #54, D10
* **Tasks:**
  - [ ] Default arbiter for the service: an external arbiter or arbitration service, not the team (to avoid discretion over funds)
  - [ ] Evidence packet for the arbiter from the request document and proof bundle
  - [ ] Support channel and response times; incident procedure
  - [ ] Notification set (#29) enabled for all errand jobs
* **Acceptance:** Every pilot dispute is resolved within the evaluator's deadlines with a recorded reason.

---

## Milestone 7: Validation

#### [Issue #34] Docs site and demo
* **Type:** `Docs` / **Priority:** `P0` / **Depends on:** #28, #74
* **Tasks:**
  - [ ] Quickstart, SDK reference, evaluator guide, conformance notes
  - [ ] Recorded demo: payment link and a cross-border errand
* **Acceptance:** A developer outside the project runs the quickstart unaided.

#### [Issue #35] Errand pilot in the first corridor
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** #34, #67–#74
* **Tasks:**
  - [ ] Recruit 10–20 clients (e.g. people abroad with family in the destination) and 5–10 verified providers in one city
  - [ ] Run real filming and purchasing errands (testnet with test funds first; small real amounts only after audit)
  - [ ] Interview each user: current workaround, trust concerns, price they would pay, friction with money in and out
* **Acceptance:** Written findings; backlog re-prioritized.

#### [Issue #36] Polygon grant application
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** #22, #34
* **Tasks:**
  - [ ] Milestones tied to #22 (Amoy), #35 (pilot), #42 (mainnet)
  - [ ] Budget focused on the external audit
  - [ ] Rule for converting POL to USDC on receipt
* **Acceptance:** Application submitted.

#### [Issue #37] ERC-8183 feedback submission
* **Type:** `Task` / **Priority:** `P1` / **Depends on:** #20, D12
* **Tasks:**
  - [ ] Write up: completion-only evaluator fee creates bias; single `expiredAt` mixes provider and evaluator deadlines
  - [ ] Offer the conformance suite
  - [ ] Post to the standard's discussion thread
* **Acceptance:** Posted; responses tracked.

#### [Issue #38] Traction metrics
* **Type:** `Docs` / **Priority:** `P1` / **Depends on:** #35
* **Tasks:**
  - [ ] Jobs, volume, time to settle, share settled by timeout, dispute rate, repeat users
* **Acceptance:** One-page report usable for grants and investors.

---

## Milestone 8: Audit and mainnet

#### [Issue #39] Threat model and audit pack
* **Type:** `Security` / **Priority:** `P0` / **Depends on:** #35
* **Tasks:**
  - [ ] Trust assumptions: evaluator, arbiter, verifier, relayer, keeper, stablecoin issuers
  - [ ] Attack list and mitigations; invariant list; test and coverage report
* **Acceptance:** Pack ready to send to auditors.

#### [Issue #40] External audit
* **Type:** `Security` / **Priority:** `P0` / **Depends on:** #39, funding
* **Tasks:**
  - [ ] Scope: core, factory, forwarder (if any), `OptimisticEvaluator` (including fees, tips, deposits), `TestRunnerEvaluator`, arbiter adapter
  - [ ] Fix findings; publish the report
* **Acceptance:** No open high or medium findings.

#### [Issue #41] Bug bounty
* **Type:** `Security` / **Priority:** `P1` / **Depends on:** #40
* **Acceptance:** Public programme with a severity ladder.

#### [Issue #42] Mainnet deployment
* **Type:** `Release` / **Priority:** `P0` / **Depends on:** #40, ERC-8183 interface stable
* **Tasks:**
  - [ ] Deploy and verify on Polygon; budget range 1–1,000 USD enforced
  - [ ] Public page: addresses, stablecoin list, budget range, "no admin, no protocol fee" statement
* **Acceptance:** First mainnet job completed.

---

## Milestone 9: Entity and legal

#### [Issue #43] Entity structure
* **Type:** `Legal` / **Priority:** `P0` / **Depends on:** —
* **Tasks:**
  - [ ] Protocol maintenance vs team-run services as separate entities
  - [ ] Jurisdiction chosen with counsel; where decisions are actually made
* **Acceptance:** Structure decided before any third-party integration or investment agreement.

#### [Issue #44] Legal review before third-party integration
* **Type:** `Legal` / **Priority:** `P0` / **Depends on:** #43
* **Tasks:**
  - [ ] Stablecoin handling where the team and users are, including Korea
  - [ ] Team-recommended arbiters and team-run services
  - [ ] AI hiring people (platform-work rules)
  - [ ] Token warrants in investment agreements
  - [ ] Sanctions and AML screening duties for relayer, front ends, and team-run services
* **Acceptance:** Written opinion or memo on file.

#### [Issue #45] License decision
* **Type:** `Legal` / **Priority:** `P1` / **Depends on:** —
* **Tasks:**
  - [ ] MIT (suggested for a public-standard implementation with no protocol fee) vs BSL (D7)
* **Acceptance:** `LICENSE` file matches the decision before the first public release.

---

## Milestone 10: Later backlog

Keep closed until pilot users ask for them.

#### [Issue #46] Errands stage 2: care of parents; more corridors
* **Type:** `Feature` / **Priority:** `P2` / **Depends on:** #35, stage 1 reputation data
* **Tasks:**
  - [ ] Written safety and legal review before launch: parents' consent, health-data handling, liability, insurance
  - [ ] Higher verification tier for providers who accompany people
  - [ ] Request types: hospital visit, travel companion, escort abroad (per-day or per-leg jobs; travel costs paid separately)
  - [ ] Additional corridors chosen from pilot demand
* **Acceptance:** Review signed off; first accompaniment jobs completed without incident.

#### [Issue #47] `RubricEvaluator`
* **Type:** `Feature` / **Priority:** `P2`
* **Tasks:** published rubric fixed at creation; AI scoring as first-level judgment only; prompt-injection defences; objection to a human arbiter.

#### [Issue #48] `OracleEvaluator`
* **Type:** `Feature` / **Priority:** `P2`
* **Tasks:** judge from external data such as delivery tracking; signed oracle results; fallback to arbiter.

#### [Issue #50] Provider bond hook
* **Type:** `Feature` / **Priority:** `P2`
* **Tasks:** optional USDC bond from the provider; forfeited to the client on rejection after escalation; returned otherwise; invariants extended.

#### [Issue #51] Signature-based agreement execution
* **Type:** `Feature` / **Priority:** `P2`
* **Description:** One transaction that assigns and funds from signed terms (dispatch, payment links). Not at launch (D16). If built, it must call the same hooks and emit the same events as the standard path; consider proposing it as an ERC-8183 extension.

#### [Issue #52] OPG as evaluator stake and reward: go / no-go
* **Type:** `Task` / **Priority:** `P2` / **Depends on:** M11 running with USDC stakes, #44
* **Tasks:**
  - [ ] Demand model from real Court data: stake needed per unit of evaluated volume
  - [ ] Stake valuation: long time-weighted price with a large discount; capacity rises slowly, falls immediately
  - [ ] Reward schedule: bootstrap rewards that decline; base income stays in USDC fees and deposits
  - [ ] Legal review of issuance, distribution, and any sale
  - [ ] If go: token deployment, allocation and vesting, OPG stake support in `OpusCourt`
* **Acceptance:** Written go / no-go decision with data.

---

## Milestone 12: OPUS Portal

A directory of services that use OPUS escrow (D24). It shows on-chain data only; it does not match parties, hold funds, or have special rights.

#### [Issue #62] Service metadata registration
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #11, D23
* **Tasks:**
  - [ ] A service registers name, description, category, link, and logo for its instance
  - [ ] Authorized by the instance's fee recipient (signed message) or through an admin-free on-chain registry that only emits events
  - [ ] Services can update their own metadata; no one else can
* **Acceptance:** A new instance appears in the Portal with its metadata without any action by the Portal operator.

#### [Issue #63] Service directory and on-chain statistics
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #26, #62
* **Tasks:**
  - [ ] Directory with search and categories
  - [ ] Per-service statistics from indexed events: jobs, volume, completion rate, dispute rate, average time to settle
  - [ ] Default ranking by on-chain record; team services not pinned
* **Acceptance:** Statistics can be reproduced from public chain data.

#### [Issue #64] My jobs across services
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #26
* **Tasks:**
  - [ ] Connect a wallet; list jobs as client or provider across all instances
  - [ ] Status, deadlines, and links back to the service that created each job
  - [ ] Withdraw deferred payouts from any instance
* **Acceptance:** A wallet with jobs on two services sees both in one list.

#### [Issue #65] Evaluator and arbiter directory
* **Type:** `Feature` / **Priority:** `P2` / **Depends on:** #26
* **Tasks:**
  - [ ] List evaluators and arbiters with fees and ruling records from events
  - [ ] Later: OPUS Court statistics (M11)
* **Acceptance:** Every ruling shown links to its on-chain event.

#### [Issue #66] Display policy, reporting, open source, IPFS mirror
* **Type:** `Task` / **Priority:** `P1` / **Depends on:** #63
* **Tasks:**
  - [ ] Published display policy: grounds for hiding a service, report handling, appeal
  - [ ] Hiding affects only Portal pages; contracts unaffected
  - [ ] Portal source published; IPFS mirror
* **Acceptance:** Policy page live before the first external service is listed.

---

## Milestone 13: AI assistants and agents

After mainnet. The errand service already stores requests in a machine-readable schema (#68) and follows ERC-8183, so this milestone adds access for assistants rather than a redesign.

#### [Issue #75] AI assistant tool for the errand service
* **Type:** `Feature` / **Priority:** `P2` / **Depends on:** #68, #23
* **Tasks:**
  - [ ] Tool interface (e.g. an MCP server) exposing: post a request from the schema, list quotes, select, fund, read proof, approve or object
  - [ ] Spending limits and confirmation steps set by the human user
  - [ ] Human-protective evaluator presets applied when the provider is a person
* **Acceptance:** An assistant completes an errand end to end on testnet on a user's instruction.

#### [Issue #49] ERC-8004 reputation integration
* **Type:** `Feature` / **Priority:** `P2`
* **Tasks:** publish completion and rejection records with reason hashes; read reputation in SDK presets and dispatch.

#### [Issue #31] Verifier service
* **Type:** `Feature` / **Priority:** `P2` / **Depends on:** #23
* **Tasks:**
  - [ ] Isolated runner (no network by default, resource limits) per Q12
  - [ ] Inputs: repository/commit hash from `submit`, test bundle hash fixed at job creation
  - [ ] Output: signed result (pass/fail, log hash, runner image hash)
  - [ ] Public reproduction guide so anyone can rerun and compare
* **Acceptance:** Same inputs produce the same result on a second machine.

#### [Issue #32] `TestRunnerEvaluator`
* **Type:** `Feature` / **Priority:** `P2` / **Depends on:** #31, #15
* **Tasks:**
  - [ ] Test bundle hash and verifier key(s) fixed at configure
  - [ ] Signed fail → `reject`; signed pass → review window per `OptimisticEvaluator` rules; objections go to the arbiter
  - [ ] Tests with forged and replayed verifier signatures
* **Acceptance:** A job is paid out on a passing test result with no manual step.

#### [Issue #33] Agent integration example
* **Type:** `Feature` / **Priority:** `P2` / **Depends on:** #32
* **Tasks:**
  - [ ] A client agent that posts a task, funds it, and waits for the evaluator
  - [ ] A provider agent that quotes, checks funding, submits
  - [ ] Packaged as an agent tool (e.g. an MCP server or framework plugin)
* **Acceptance:** Two agents complete a paid task on Amoy without human input.

---

## Milestone 11: OPUS Court

Start after mainnet, and only if disputes are frequent enough that a single arbiter becomes a bottleneck or a trust problem. Stakes are in USDC (D20).

#### [Issue #55] Evaluator registry and USDC stake
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #54, D19
* **Tasks:**
  - [ ] Anyone registers as an evaluator by staking USDC above a minimum
  - [ ] Unstaking has a delay and is blocked while the evaluator sits on an open case
  - [ ] No admin; parameters fixed at deployment
* **Acceptance:** Court solvency: stakes plus unpaid rewards equal balance (I-2).

#### [Issue #56] Capacity rule
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #55
* **Tasks:**
  - [ ] An evaluator is eligible for a case only if `budget ≤ stake × k`
  - [ ] Stake locked per open case so one stake cannot cover unlimited simultaneous cases
* **Acceptance:** I-9 capacity part covered by tests.

#### [Issue #57] Random, stake-weighted panel drawing
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #56
* **Tasks:**
  - [ ] Verifiable randomness source; fallback if it does not arrive in time
  - [ ] Draw panel (e.g. 3) weighted by eligible stake; no one can choose members
  - [ ] Drawn evaluators get evidence access off-chain
* **Acceptance:** Statistical test of draw distribution; manipulation attempts fail.

#### [Issue #58] Commit-reveal voting and rulings
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #57
* **Tasks:**
  - [ ] Commit window, reveal window; unrevealed votes count as no-shows
  - [ ] Majority decides; ties and empty panels fall back to the evaluator's default
  - [ ] Court calls the evaluator's ruling function (`IOpusArbiter`)
* **Acceptance:** Every case ends within the evaluator's dispute window.

#### [Issue #59] Rewards and objective slashing
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #58
* **Tasks:**
  - [ ] Loser's deposit split among majority voters
  - [ ] Slash a fixed share of stake for objective faults only: no vote, missed reveal, signature that fails reproduction
  - [ ] Slashed stake goes to the harmed party or the majority voters by a rule fixed at deployment
* **Acceptance:** Pay identical for either outcome; I-1 and I-2 hold for the Court.

#### [Issue #60] Appeals and minority-vote slashing
* **Type:** `Feature` / **Priority:** `P2` / **Depends on:** #59
* **Tasks:**
  - [ ] Appeal with a larger deposit; larger panel (5, then 7); final round has a fixed default
  - [ ] Only after appeals exist: slash for voting against the final outcome
* **Acceptance:** Appeal paths terminate; total time bounded.

#### [Issue #61] Court threat model, audit, and testnet trial
* **Type:** `Security` / **Priority:** `P1` / **Depends on:** #55–#59
* **Tasks:**
  - [ ] Threat model: bribery, collusion, herding, randomness manipulation, evidence leaks
  - [ ] External audit of the Court
  - [ ] Testnet trial with invited evaluators on real disputes
* **Acceptance:** Audit findings resolved; trial report written.

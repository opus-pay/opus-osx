# OPUS Detailed Issue Backlog
> **Whitepaper v1.0 / ROADMAP.md**
>
> Each issue can be copied into GitHub as is. **Type** is `Feature`, `Task`, `Test`, `Security`, `Docs`, `Release`, or `Legal`. **Priority** is `P0`, `P1`, or `P2`. Issue numbers match `ROADMAP.md`.
>
> When an issue is done, tick its tasks and add a short **해결 내용** list under it (what was built, key decisions, anything left open). If a later issue proves an earlier note wrong, add a **정정** line instead of deleting the note.

Invariants referenced below (full text in the whitepaper §10.1 and `.cursor/AGENTS.md`):
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
  - **정정:** 그 확인은 #22 배포에 포함되지 않았다. #24 키퍼의 Amoy 수용 기준과 함께 트랜잭션 해시를 남긴다.
  - **정정:** `resolveMissingDeposit`도 기한이 된 처리 함수라 팁을 준다 (작업당 최대 2회에 포함).
  - **정정:** Amoy 작업 3의 [`finalize`](https://amoy.polygonscan.com/tx/0x93a058e01f2f9ac447e0fd22a2ccc2eca9ae8dd2e557c1fc9668088fdbec7335)와 작업 4의 [`timeoutNoSubmission`](https://amoy.polygonscan.com/tx/0xab783631acdb531036eae59bcfb11b0e7e2129f24a08c1c94c54c56b7a6991ea)을 배포자가 아닌 키퍼가 호출했다. 팁은 그 호출자에게 간다. 키퍼는 배포자 주소와 같으면 시작을 거부한다.

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
  - **정정:** 확인 필요 설정(`autoCompleteOnSilence == false`)은 중재자 없이 설정할 수 없다. `_validateConfig`가 `ConfirmationNeedsArbiter`로 거절한다.

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
  - **정정 (2026-10-07):** 야간 실행이 두 번 시간 초과로 실패했다. 계약 오류가 아니라 검사가 매번 지금까지 만든 모든 작업을 훑어서(`assertI2`) 시간이 행동 수의 **제곱**으로 늘기 때문이다. 실제 측정(GitHub 실행기): 1,000번에 9분, 2,000번에 33분. 그래서 야간 실행을 2,000번으로 줄이고 테스트 시간 제한을 행동 수의 제곱(ms)으로 잡았다. **인수 기준의 "≥ 10,000번"은 아직 충족하지 못했다.** 충족하려면 검사를 건드린 작업만 다시 읽도록(증분) 바꾸는 별도 작업이 필요하다.

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
  - [x] Addresses written per network; verified source on the explorer
  - [x] Post-deploy check script (constructor args, no admin ABI)
* **Acceptance:** Public Amoy addresses in `README.md`.

* **해결 내용:**
  - 배포 순서는 `src/deploy/protocol.ts`. 로컬은 Mock USDC, Amoy는 `AMOY_USDC`를 env에서 주입한다 (D8).
  - `scripts/checkDeploy.ts`가 생성자·전달자·수수료 0·관리자 ABI를 검사한다.
  - Amoy에 전달자, 팩토리, 수수료 0 USDC 인스턴스, 평가자를 배포했다. Polygonscan에서 소스를 검증했고, 주소는 `deploy/amoy/addresses.json`과 README에 있다. 배포 후 역할 부여는 없다.
  - **정정:** 공식 Amoy RPC는 내려갔다. dRPC의 가스 견적은 약 400 gwei라서 배포 가스는 체인 최소인 25 gwei로 고정한다. 소스 검증은 Etherscan API v2를 쓴다.

#### [Issue #23] TypeScript SDK
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #22
* **Description:** The only way apps (`apps/*`), the keeper, and the relayer talk to the contracts. Addresses come from `packages/contracts/deploy/<network>/addresses.json`; ABIs and types come from typechain output only.
* **Tasks:**
  - [x] viem; accepts a `WalletClient` / `PublicClient`, never private keys; network config for Amoy and local Hardhat
  - [x] Standard flow helpers: `createJob`, `setProvider`, `quote` (`setBudget`), `fund(expectedBudget)`, `fundWithPermit`, `submit`
  - [x] Evaluator helpers: `configure` / `configureWithPermit`, `approve`, `object`, `extendReview`, `withdrawAsProvider`, `postDeposit` / `postDepositWithPermit`, triggers (`timeoutNoSubmission`, `finalize`, `escalateOnSilence`, `resolveMissingDeposit`, `resolveByDefault`), `sweep`
  - [x] Token approvals: budget to the instance; evaluation fee (+ deposit in confirmation mode) to the evaluator; permit path when the token supports it
  - [x] Presets (AI→AI, AI→person, person→any, small/no arbiter) that always pass contract validation: person→any = confirmation mode **with an arbiter**; no-arbiter presets = auto-complete and `disputeDeposit = 0`. Arbiter (D10) and amounts (D18) are required parameters or `PLACEHOLDER_` defaults, never guessed
  - [x] Deadline helper: minimum `expiredAt` = now + all windows + safety margin, so `fund` does not revert with `DeadlineDoesNotFit`
  - [x] Budget helpers: 1–1,000 USD range per token decimals; reuse `splitBudgetUsd` for linked milestone jobs
  - [x] Status helper: for a job and a wallet, return the current phase, the next deadline, and the actions that wallet may take now (used by apps and the keeper)
  - [x] Safety checks: provider may start only if funded amount equals agreed amount; warn when evaluator = client or arbiter = a party; check `evaluator == hook == OptimisticEvaluator` before `configure`; `description` must be a hash or URI (helper hashes a request document)
  - [x] Deferred payouts: read `claimable` and `withdraw` on both the instance and the evaluator
  - [x] Forwarder helper: build and sign `OpusForwarder` EIP-712 requests (used by the relayer in #25)
  - [x] Event decoders and custom-error decoding into readable messages
  - [x] Tests against a local Hardhat node for every helper
* **Acceptance:** Example scripts run on Amoy: (1) create → configure → fund → submit → approve; (2) expiry → `claimRefund` → `sweep` returns the evaluation fee. Transaction hashes recorded in the resolution note.

* **해결 내용:**
  - `@opus/sdk`의 `Opus`가 viem `PublicClient`와 `WalletClient`만 받는다. 개인키는 받지 않는다. 주소는 `deploy/<network>/addresses.json`, 호출 ABI는 인터페이스와 같은 `parseAbi`이며 컴파일된 셀렉터와 테스트로 맞춘다.
  - 표준 흐름, 평가자, 승인·permit, 프리셋, 만료 시각, 예산, 상태, 안전 검사, 지연 지급, 전달자 EIP-712, 이벤트·커스텀 오류 해석을 넣었다. 중재자(D10)와 금액(D18)은 인자가 없으면 `PLACEHOLDER_`다. 사람→누구나 프리셋은 중재자가 있어야 하고, 중재자 없는 프리셋은 자동 완료에 분쟁 보증금 0이다.
  - 로컬 Hardhat에서 두 수용 흐름(승인, 만료 후 `claimRefund`·`sweep`)과 나머지 헬퍼를 검증했다. Amoy 예시 서명은 `packages/sdk/examples/amoy.ts`에 있으나, 라이브 서명이 없어 트랜잭션 해시는 아직 없다.
  - **정정:** Amoy 작업 1은 `Completed`다. [`createJob`](https://amoy.polygonscan.com/tx/0x069f81554874b63e4e599537dda0e3959bbbfc3a5cfc8e87ed14f3c7ca82d14d), [`configure`](https://amoy.polygonscan.com/tx/0xca64f3e128cb902d1a55fa32732b4d3fce1c3b13a22f1887ce201ff30f6defdd), [`fund`](https://amoy.polygonscan.com/tx/0xa7142b8dacdede06df163d03863694e27091744d6dcdbb4c018ce63517610467), [`submit`](https://amoy.polygonscan.com/tx/0xbb89fc9ec436928def56f276708983fa01c053eb2b0f9d47bc87efc86b1771cf), [`approve`](https://amoy.polygonscan.com/tx/0x9fb80d767d49a15db8cdab089a4afcc3a9a43274b1ad4b775471f3064c954f9c). 견적과 예산 승인은 `deploy/amoy/acceptance.old-2026-10.json`의 `jobs.approve`에 있다.
  - **정정:** Amoy 작업 2는 `Expired`다. [`claimRefund`](https://amoy.polygonscan.com/tx/0x993153c5925677aa09201f46cafa0fa43913641cd9eadfaebbae616a790dcc1e) 뒤 [`sweep`](https://amoy.polygonscan.com/tx/0x0725df716b5d395412ac5d102a066caeaf8e6be30eb9a678eb4eb9ae83d63ad4)이 평가 수수료를 의뢰인에게 돌려준다. 생성부터 예치까지의 해시는 `jobs.sweep`에 있다.

#### [Issue #24] Keeper
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #23
* **Tasks:**
  - [x] Watch jobs whose evaluator is `OptimisticEvaluator`, using the SDK status helper (no deadline logic of its own)
  - [x] Call `timeoutNoSubmission`, `finalize`, `escalateOnSilence`, `resolveMissingDeposit`, `resolveByDefault` when due, and collect the tips
  - [x] Deadlines come from the evaluator's scheduled times (`reviewEnd`, `depositDeadlineOf`, `disputeDeadlineOf`); never assume call time
  - [x] Runs from its own hot wallet with a small POL balance, separate from the deployer; key from env, never committed
  - [x] Gas price floor for Amoy (25 gwei, see #22) and retry with backoff
  - [x] Alert when a job gets within a margin of `expiredAt` without resolution, or when the keeper's POL balance is low
* **Acceptance:** On Amoy: (1) a job with no activity after submission completes automatically; (2) a job whose submit window passed is rejected by the keeper, which is not the deployer and receives the tip. Transaction hashes recorded here, and #16's Amoy acceptance ticked with them.

* **해결 내용:**
  - `@opus/keeper`는 인스턴스의 작업을 돌며 `Opus.status`가 돌려준 기한 처리만 호출한다. 기한을 따로 계산하지 않는다. 호출은 SDK를 통하므로 Amoy 가스는 25 gwei 바닥을 쓴다. 전송 실패는 기다렸다가 다시 시도하고, 컨트랙트가 거절한 호출은 다시 보내지 않는다.
  - 키는 `KEEPER_PRIVATE_KEY`에서만 읽는다. 샘플은 `packages/keeper/env/.env.sample`이고 실제 키는 커밋하지 않는다. 배포자 주소와 같으면 시작을 거부한다. POL 잔고가 낮거나, 예치·제출 상태의 작업이 만료 여유 안에 들어오면 경고한다.
  - 로컬 Hardhat에서 침묵한 제출은 `finalize`로 완료되고, 제출 기한을 넘긴 작업은 `timeoutNoSubmission`으로 거절된다. 팁은 배포자가 아닌 키퍼 주소가 받는다. Amoy 트랜잭션 해시와 #16 수용 기준은 라이브 실행 후에 남긴다.
  - **정정:** Amoy 작업 3은 제출 후 침묵했고, 키퍼가 [`finalize`](https://amoy.polygonscan.com/tx/0x93a058e01f2f9ac447e0fd22a2ccc2eca9ae8dd2e557c1fc9668088fdbec7335)로 완료했다. 작업 4는 제출 기한을 넘겼고, 키퍼가 [`timeoutNoSubmission`](https://amoy.polygonscan.com/tx/0xab783631acdb531036eae59bcfb11b0e7e2129f24a08c1c94c54c56b7a6991ea)으로 거절했다. 이 프로세스는 배포자 주소와 같으면 시작하지 않으며, 팁은 호출자인 그 키퍼가 받는다. #16의 Amoy 수용 기준은 이 두 해시다.

#### [Issue #25] Relayer
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #12, #23
* **Description:** Required for the errand service: clients and providers must never need to buy POL.
* **Tasks:**
  - [x] Accept `OpusForwarder` requests signed with the SDK forwarder helper; submit and pay gas
  - [x] Only relay calls whose target is a known OPUS instance, the factory, or the evaluator (from `addresses.json`); reject anything else so the gas wallet cannot be drained
  - [x] Per-integrator budget and rate limits
  - [x] Screen signer addresses against applicable sanctions lists before relaying (whitepaper §13.2)
  - [x] Gas price floor and nonce management for the relayer wallet; key from env
* **Acceptance:** A wallet with zero POL completes the payment-link flow through the relayer on Amoy (also satisfies #12's acceptance).

* **해결 내용:**
  - `@opus/relayer`는 SDK가 서명한 `OpusForwarder` 요청만 받아 가스 지갑으로 `execute`를 보낸다. 대상이 주소 파일의 인스턴스, 팩토리, 평가자가 아니거나 `value`가 0이 아니면 거절한다. 그래서 토큰 승인처럼 다른 컨트랙트로는 가스 지갑이 빠져나가지 않고, 예치가 필요하면 `fundWithPermit`을 쓴다.
  - 연동사는 id와 토큰으로 구분하고, 가스 예산과 시간창 안의 호출 횟수로 제한한다. 이 한도는 프로토콜 상수가 아니다. 서명자 주소는 운영자가 넣는 제재 목록에 있으면 중계하지 않는다. 목록 파일이 없으면 프로세스는 시작하지 않는다.
  - 키는 `RELAYER_PRIVATE_KEY`에서만 읽는다. 샘플은 `packages/relayer/env/.env.sample`이고 실제 키는 커밋하지 않는다. 배포자 주소와 같으면 시작을 거부한다. Amoy에서는 가스 가격 바닥을 25 gwei로 두고, 지갑 nonce는 대기 중인 개수에서 이어서 올린다.
  - 로컬 Hardhat에서 POL 잔고가 0인 의뢰인과 수행자가 생성, 설정, 예산, `fundWithPermit`, 제출, 승인까지 마친다. 대금은 수행자에게 간다. Amoy에서 POL이 없는 지갑으로 끝내는 인수 기준과 #12의 라이브 해시는 아직 없다.
  - **추가 (2026-10-07):** 토큰 없는 연동사(`"public": true`)와 사람(서명 주소)별 요청·가스 한도를 넣었다. 모바일 앱처럼 비밀을 지킬 수 없는 호출자용이다. 사람별 한도는 서명 확인 뒤에 세고, 연동사 총 예산(`budgetWei`)이 최악의 손실을 막는다. 토큰이 있는 연동사는 그대로다. 사람별 기록은 메모리에만 있어 재시작하면 초기화된다. (opus-osx `602180b`)
  - Prometheus 지표(`/metrics`)와 Grafana·Alertmanager→텔레그램 감시는 opus-network `monitoring/`에 있다.

#### [Issue #26] Indexing
* **Type:** `Task` / **Priority:** `P1` / **Depends on:** #22
* **Tasks:**
  - [x] Hosted indexer (subgraph or equivalent) for instances (`InstanceCreated`), jobs (all ERC-8183 events), and evaluator events (`Configured`, `Escalated`, `CaseOpened`, `DepositPosted`, `Ruled`, `TipPaid`, `FeePaid`, `Swept`)
  - [x] Queries used by the payment link app and keeper
* **Acceptance:** Job status pages load from the index, not from raw logs.

* **해결 내용:**
  - `@opus/indexer`는 서브그래프와 같은 역할의 읽기 전용 서비스다. 팩토리 `InstanceCreated`, ERC-8183 작업 이벤트, 평가자 `Configured`·`Escalated`·`CaseOpened`·`DepositPosted`·`Ruled`·`TipPaid`·`FeePaid`·`Swept`를 장부로 접는다. 상태 페이지는 `GET /jobs/:instance/:id`로 이 장부를 읽으며, 응답에 원본 로그는 없다.
  - 결제 링크가 쓸 지갑별 목록은 `GET /jobs?account=`이고, 키퍼가 아직 볼 예치·제출 작업은 `GET /active?instance=&evaluator=`다. 키퍼 프로세스는 계속 온체인 `Opus.status`로 기한을 판단한다. 인덱스는 그 대상을 로그 스캔 없이 고르는 조회다.
  - 개인키는 없다. 주소 파일과 RPC만으로 15초마다 이어서 읽고, 이미 반영한 블록은 다시 적용하지 않는다. `JobCreated`에 설명 URI가 없어 의뢰 문구는 인덱스에 없다.
  - 로컬 Hardhat에서 예치 후 제출한 작업을 동기화하면 상태 페이지가 `Submitted`이고, 완료 뒤에는 `Completed`이며 활성 목록에서 빠진다. 공개 호스트에 올린 인덱서는 아직 없고, 결제 링크 앱(#27)이 이 조회를 붙인다.
  - **추가 (2026-10-07):** 인덱서와 키퍼도 `/metrics`를 낸다. 감시와 경보는 opus-network `monitoring/`에서 한다.

---

## Milestone 5: First product — escrow payment links
#### [Issue #27] Payment link: create, share, fund
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #23
* **Tasks:**
  - [x] Either party drafts terms: counterparty address, amount, deadlines, evaluator preset, hash of the agreement made elsewhere
  - [x] Shareable link with expiry
  - [x] Counterparty view: terms in plain language ("paid automatically 3 days after submission unless you object"), prominent address display
  - [x] Client creates the job, configures the evaluator from an SDK preset, and funds; either the provider quotes via `setBudget` (budget lock mode 1 locks the first quote), or the client sets the amount before `configure` and uses lock mode 2
  - [x] Expiry set with the SDK deadline helper; approvals or permits for budget and evaluation fee handled in one step for the user
  - [x] Where link drafts are stored (Q10) decided and documented
* **Acceptance:** Two wallets reach `Funded` from one shared link.

* **해결 내용:**
  - 서명 전 초안은 공유 링크의 URL fragment다(D30). 서버는 초안을 보관하지 않는다. 만료 시각이 지나면 그 링크로는 작업을 만들지 않는다. 체인에는 합의 문구의 해시만 올라간다.
  - 상대 화면은 프리셋의 검토 창으로 “Paid automatically … after submission unless you object.”를 보여주고, 의뢰인과 수행자 주소를 크게 표시한다. 사람→누구나 프리셋은 중재자(D10)가 있어야 하므로 화면의 프리셋은 자동 완료 세 가지다.
  - 의뢰인이 금액을 정하면 잠금 2로 설정 전에 `setBudget`하고, 수행자가 견적이면 잠금 1로 설정 뒤에 첫 견적이 잠긴다. 작업 만료는 `minimumExpiredAt`이다. 평가 수수료가 있으면 `configureWithPermit`, 예치는 `fundWithPermit`을 같은 버튼에서 이어서 보낸다.
  - 로컬 Hardhat에서 링크 하나로부터 두 지갑이 `Funded`에 도달한다. Amoy에서 두 사람이 끝내는 인수 기준은 #28이다.

#### [Issue #28] Payment link: submit, review, object, status
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #27, #24
* **Tasks:**
  - [x] Provider uploads deliverable or proof off-chain; hash submitted
  - [x] Client approve / object / extend buttons with countdowns
  - [x] Dispute path: provider sees the deposit deadline and posts the deposit (`postDeposit` / permit); both see the arbiter's deadline and the ruling
  - [x] Status page for both parties from the SDK status helper; withdraw deferred payouts from the instance and the evaluator
* **Acceptance:** A real paid job completes on Amoy between two people.

* **해결 내용:**
  - 상태 페이지는 `Opus.status`가 돌려준 단계, 다음 기한, 지금 가능한 동작만 보여 준다. 남은 시간은 그 기한에서 센다.
  - 수행자는 파일을 고르고, 그 바이트의 keccak256을 `submit`한다. 의뢰인은 승인, 이의(문구의 해시), 검토 연장을 같은 페이지에서 보낸다. 보증금이 필요하면 `postDepositWithPermit`이다.
  - 인스턴스나 평가자에 찾아갈 잔액이 있으면 `withdraw`가 그 쪽만 인출한다.
  - 로컬 Hardhat에서 예치된 작업이 증빙 해시 제출과 승인 뒤 `Completed`가 된다. Amoy에서 두 사람이 끝내는 인수 기준은 라이브 실행 후에 해시를 남긴다.

#### [Issue #29] Notifications
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #28
* **Tasks:**
  - [x] Notify on funding, submission, review deadline approaching, auto-completion imminent, escalation, **deposit deadline approaching for the party that has not posted** (missing it loses the job), ruling
  - [x] Channel per Q11 (email, Telegram, or webhook)
* **Acceptance:** No party misses a deadline in the pilot without having been notified.

* **해결 내용:**
  - 파일럿 채널은 HTTPS 웹훅이다(D31). 이메일과 텔레그램은 뒤로 둔다.
  - 상태 페이지는 웹훅 주소가 있으면 예치, 제출, 검토 기한, 자동 완료, 상향, 아직 보증금을 내지 않은 쪽의 보증금 기한, 판정을 POST한다. 여유는 3600초다.
  - 보증금 기한 알림은 분쟁 보증금이 있고 한쪽이 아직 내지 않았을 때 나간다. 그 기한을 놓치면 그 작업은 그 쪽의 패배다.
  - **추가 (2026-10-07):** SDK에 모바일 푸시 라이브러리(`packages/sdk/src/push.ts`, Expo 푸시)를 넣었다. 메시지 검사, 100개씩 전송과 재시도, 죽은 토큰 목록, 영수증 확인이 있고 메시지에 `{ app, path, payload }` 길을 담아 지갑 앱이 미니앱으로 나눠 준다. 사용법은 `docs/push.md`.
  - **추가 (2026-10-07):** 서비스가 Expo 키와 기기 토큰을 갖지 않도록 메시지 중계 서버(`packages/message-relayer`)를 만들었다. 서비스 키(미니앱 id에 묶임), 지갑 서명으로 기기 등록, 서비스별 끄기, 서비스·지갑별 한도, 영수증 정리, `/metrics`가 있고, SDK에 서비스용 클라이언트(`MessageRelayerClient`)와 서명 문구(`deviceMessage`)를 넣었다. 언어 조회(`/v1/languages`), 기기 확인(`status`)과 1년 삭제 규칙(마지막 푸시·확인 시각만 기록)을 넣었다. Docker와 monitoring 연결, opus-app의 서비스별 끄기 화면은 남았다.

#### [Issue #30] Completion-criteria helper
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #27
* **Tasks:**
  - [x] Templates for code, reports, design, errands
  - [x] Optional AI assistant that turns a vague request into checkable criteria
  - [x] Criteria hashed into the job
* **Acceptance:** Every pilot job has written criteria.

* **해결 내용:**
  - 코드, 보고서, 디자인, 심부름 템플릿이 완료 기준 문장을 만든다. 작성자가 고른 문장은 합의 칸에 들어가고, 작업을 만들 때 SDK `descriptionOf`가 그 문장을 해시로 체인에 넣는다.
  - 도우미 URL이 없으면 템플릿이 기준이다. URL이 있으면 `{ vague, template }`을 POST하고 `{ criteria }` 문장을 받아 같은 칸에 넣는다.

---

## Milestone 6: Cross-border errand service, stage 1

A team-run service platform on OPUS (whitepaper §11.1). It uses the public SDK and its own instance like any integrator, and is operated by a separate entity from the protocol.

#### [Issue #67] Corridor, service entity, terms, prohibited requests
* **Type:** `Legal` / **Priority:** `P0` / **Depends on:** #43, D25
* **Tasks:**
  - [ ] Choose the first corridor: cross-border (e.g. United States → Korea) or domestic (e.g. a Korean provincial city ↔ Seoul)
  - [ ] Entity that operates the errand service, separate from protocol maintenance
  - [ ] Terms of service for clients and providers; privacy policy
  - [ ] Prohibited requests list (illegal goods, harassment, surveillance of people, etc.) and filming rules
  - [ ] Legal check of the corridor: stablecoin handling, platform work, consumer protection; for a domestic corridor, domestic virtual-asset rules and a won ↔ USDC on/off-ramp
* **Acceptance:** Terms and policy published before the pilot.

* **메모 (2026-10-03, 결정 아님):**
  - 첫 구간은 해외 구매대행·해외 심부름 쪽으로 기울었다. 국내 심부름은 한국 사용자가 USDC를 사야 하는 불편과 기존 서비스와의 경쟁이 크다. D25는 아직 열려 있다.
  - 투자는 프로토콜(OPUS)이 아니라 심부름 서비스를 운영하는 법인으로 받는 방향이다. OPUS는 운영자 없는 공개 인프라로 남고, 심부름 서비스가 그 첫 사용처다.
  - 앱 이름은 아직 없다. 화면에는 `[앱 이름]`으로 비워 두었다(#82).

* **해결 내용 (일부):**
  - **진행 (2026-10-07):** 금지 요청 목록은 운영 규칙 파일 `config/errand-rules.json`(4개 언어 금지어, 연락처 패턴)과 AI 검사로 일부 적용했다. 약관·개인정보 페이지는 초안만 있고 변호사 검토 전이다. 열린 나라는 일본·한국이다. 운영 주체, 법률 검토는 아직이다.

#### [Issue #68] Machine-readable request schema
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #23
* **Description:** Groundwork for AI assistants (whitepaper §11.4). The same data drives the human interface.
* **Tasks:**
  - [ ] Versioned JSON schema per request type: filming, purchasing (later: accompaniment, travel)
  - [ ] Fields: type, place, time window, budget, completion criteria, required proof, special conditions
  - [ ] Hash of the request document recorded in the job's description; document stored off-chain
  - [ ] Schema published with the SDK docs
* **Acceptance:** Every pilot job has a valid schema document whose hash matches the job.

* **해결 내용 (일부, 2026-10-03):**
  - `apps/errand`의 API 타입(`src/api/types.ts`)과 OpenAPI 3.1(`/api/v1/openapi.json`)이 요청 필드(분류, 나라·도시, 기한, 금액, 완료 증빙)를 기계가 읽는 형태로 낸다. 화면도 같은 API를 쓴다(#76).
  - 남은 것: 요청 종류별 버전 붙은 스키마, 요청 문서 해시를 job description에 기록. 실제 에스크로를 연결할 때 함께 한다.

#### [Issue #69] Provider onboarding and verification
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #67
* **Tasks:**
  - [ ] Sign-up in the destination country; identity check via a verification partner
  - [x] Profile: areas served, categories, languages
  - [ ] Reputation from completed and disputed jobs (on-chain events)
  - [x] Suspension from the service's own listings for policy breaches (the protocol is unaffected)
* **Acceptance:** Only verified providers can quote in the pilot.

* **해결 내용 (일부):**
  - **진행 (2026-10-07):** 프로필(나라·종류·언어, 목록 선택만)과 관리자의 지원 제한(진행 중 작업·에스크로에는 영향 없음)을 만들었다. 평판은 서버 기록에서 셈하며 체인 이벤트로 바꾸는 일은 #77과 함께다. 본인 확인 파트너 연동과 가입 절차는 남았다.

#### [Issue #70] Request posting, quotes, and selection
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #27, #68, #69
* **Tasks:**
  - [ ] Client posts a request from templates (schema #68) with completion-criteria helper (#30)
  - [ ] Providers quote price and time off-chain; messages between parties
  - [ ] Client selects; job created with the provider set; provider confirms via `setBudget`; client funds (item cost included for purchases)
  - [ ] Provider sees "start" only after funding is confirmed and equals the quote
  - [ ] Evaluator preset: human client → confirmation mode with deposit up front (D22); arbiter per #74
* **Acceptance:** A request goes from posting to `Funded` without the team's manual help.

* **해결 내용 (일부, 시험판, 2026-10-03):**
  - 등록 → 지원 → 선택 → 예치 → 완료 제출 → 확인 흐름이 화면과 비공개 API로 된다(#76). 지원 메모는 의뢰인만 본다.
  - 시험판이라 예치는 서버에 기록만 하고 체인에 job을 만들지 않는다(`ERRAND_TRIAL`). 견적(가격 제안)과 당사자 간 메시지는 아직 없다.
  - **정정:** 위 Evaluator preset 줄은 사람 의뢰인에게 확인 모드 + 선납 보증금(D22) + 중재인(#74)을 쓰라고 했다. 2026-10-03 결정으로 시험판과 첫 시범은 중재인 없이 시작한다. 이의가 있어도 수행자에게 지급되는 규칙(결제 앱 `smallNoArbiter`와 같은 규칙)이고, 한 건 100 USD 상한과 분쟁 예치금이 분쟁을 줄인다. 중재인 선택과 이의 제기는 화면에 "준비 중"으로 비활성 표시한다. 확인 모드는 #74가 끝난 뒤 켠다.
  - **결정 (2026-10-03):** 확인 기간과 1회 연장 한도는 의뢰인이 심부름을 올릴 때 정한다(opus-errand `0ec9745`). 수행자는 지원 전에, 의뢰인은 예치 전에 다시 본다. 에스크로가 예치 때 `reviewWindow`와 `maxExtension`으로 고정하는 값과 같다. 기본값은 구매대행 3일 + 최대 7일, 그 밖에는 1일 + 최대 2일. 확인 화면에서 한 번 연장(`extendReview`)할 수 있다.
  - **결정 (2026-10-03):** 구매대행은 중재인(#74)과 배송 기준 완료(#71)가 생길 때까지 열지 않는다. 수행자가 물건값을 먼저 쓰고, "보냈다"고 해도 실제 발송을 확인하기 어렵기 때문이다. 현지 확인과 서류·발송은 지금 규칙(중재인 없음, 사진·송장 증빙)으로 시작할 수 있다. 서류는 이미 가진 서류를 보내는 일까지만 허용하고, 대리 발급처럼 신분이 필요한 일은 금지 목록(#80)에 넣는다.

#### [Issue #71] Proof capture
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #70
* **Tasks:**
  - [ ] In-app video capture with time and location metadata; upload to off-chain storage
  - [ ] Receipt and item photos; international tracking number with status lookup
  - [ ] Proof bundle hash submitted with `submit`
  - [ ] Retention period and deletion rules for proof files
* **Acceptance:** The client can review every required proof item before approving.

* **해결 내용 (일부, 2026-10-03):**
  - 수행자는 사진(최대 6장, 브라우저에서 긴 변 1024px로 줄임), 송장번호, 메모를 올린다. 서버는 JPEG·PNG·WebP data URL만 받는다. 증빙은 의뢰인과 수행자만 보고 공개 API에는 나오지 않는다.
  - 남은 것: 영상과 시간·위치 메타데이터, 송장 상태 조회, 증빙 묶음 해시를 `submit`에 기록, 보관 기간과 삭제 규칙, 사진을 서버 파일 대신 별도 저장소에 두기.
  - 구매대행 완료 기준 (2026-10-03 논의): 발송이 아니라 택배사 "배달 완료" 뒤에 완료를 올린다. 송장 조회로 출발·도착 국가와 무게를 심부름 내용과 대조한다. 물건, 포장 상자, 송장이 붙은 상자를 한 장면에 찍는다. 에스크로 기한은 구매·배송 14일 + 확인 3일 + 연장 최대 7일 + 분쟁 단계를 담는다(약 31일). 분쟁은 택배사 기록과 사진으로 중재인이 판정한다.

#### [Issue #72] On- and off-ramp integration
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #67, D26
* **Tasks:**
  - [ ] Client: buy USDC by card or bank transfer through a licensed partner, delivered to the client's wallet
  - [ ] Provider: convert USDC to local currency through a licensed partner
  - [ ] Show all fees and exchange rates before the client funds
  - [ ] Partners are integrated under their licences, funded by investment (D29); OPUS and the service never hold or exchange funds
  - [ ] Until partners are in place: guide for users who buy USDC on an exchange and withdraw to their wallet (travel-rule registration), and for providers who sell USDC on an exchange
* **Acceptance:** A pilot client with no crypto funds a job by card; a provider receives local currency.

#### [Issue #73] Wallet onboarding and gasless use
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #25, D27
* **Tasks:**
  - [x] Wallet created at sign-up (e.g. email login); export available to the user
  - [ ] All actions relayed; no POL needed
  - [ ] Interface uses plain words: request, quote, payment, refund
* **Acceptance:** A user with no crypto experience completes a job without seeing a token name other than the currency.

* **해결 내용 (일부):**
  - **진행 (2026-10-07):** `opus-pay/opus-app`(Expo)이 앱 안 지갑을 만든다(복구 문구, 기기 보안 저장소, 개인키 가져오기·내보내기). 이메일 로그인 지갑은 아니다(D27의 비수탁, 표준 지갑). OPUS 계약 호출은 relayer의 토큰 없는 연동사로 보내 POL 없이 되지만, 거래소 등 다른 주소로 USDC를 보내는 일반 전송은 POL이 필요하다. 실제 기기·relayer 운영 시험은 아직 못 했다.

#### [Issue #74] Support, dispute operations, default arbiter
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** #53, #54, D10
* **Tasks:**
  - [ ] Default arbiter for the service: an external arbiter or arbitration service, not the team (to avoid discretion over funds)
  - [ ] Evidence packet for the arbiter from the request document and proof bundle
  - [ ] Support channel and response times; incident procedure
  - [ ] Notification set (#29) enabled for all errand jobs
* **Acceptance:** Every pilot dispute is resolved within the evaluator's deadlines with a recorded reason.

* **해결 내용 (일부, 2026-10-03):**
  - 결제 앱(`3b2e77cf`)과 심부름 앱(#76)에 중재인 선택과 중재인 신청 화면을 "준비 중"으로 비활성 표시했다. 중재인 주소 칸은 항상 "없음"이다.
  - 운영 원칙 메모: 팀은 판정하지 않는다. 중재인은 의뢰인이 고르고, 서비스는 신청을 받아 목록과 체인 기록(기한 내 판정률, 판정 시간, 불참)만 보여 준다. 진 쪽 보증금이 중재인 보수가 된다. 별점식 평가는 쓰지 않는다.

#### [Issue #76] Errand app trial: screens and public/private API
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #23, #68
* **Description:** The errand service's web app in `apps/errand`, built API-first so people and AI agents use the same operations (groundwork for #75). Trial mode moves no money.
* **Tasks:**
  - [x] Screens: open errands, post, my errands, my jobs, errand, fund, submit proof, confirm; phone and desktop; English, Korean, Japanese, Chinese
  - [x] Browser wallet connection; my address at the top right; client, provider, arbiter and escrow contract addresses with copy and explorer links
  - [x] Wallet sign-in (EIP-4361) returning a 24-hour bearer token
  - [x] Public API (read-only; hides applicant notes and proof), private API for every screen action, OpenAPI with an `operationId` per action, `/llms.txt`, `actions` list on each errand, stable error codes, `Idempotency-Key`
  - [x] Trial helpers so one person can walk the whole flow
  - [x] Replace the JSON file store with a database
  - [ ] Real escrow: create the job at selection, fund and confirm with transactions, read money state from chain (indexer); request and proof hashes per #68 and #71
  - [x] WalletConnect for phones without a wallet browser
  - [x] Rate limits on the public and auth endpoints
* **Acceptance:** An outside tester completes an errand on Amoy through the app, and an agent does the same through the API alone.

* **해결 내용 (진행 중, 2026-10-03):**
  - 커밋 `48ce9e74`(화면 시험판), `8d657d04`(API·지갑·다국어).
  - 규칙은 `src/lib/errands.ts`의 순수 함수 하나로 화면·API·테스트가 같이 쓴다. 라우트는 `src/server/service.ts`의 함수 하나씩을 부르는 얇은 껍데기다.
  - 원칙: 돈과 약속의 증거는 체인, 일의 내용(목록, 지원, 메모, 사진)은 서버. 사진·주소·메시지는 체인에 올리지 않는다.
  - 테스트 33개(규칙, 권한, 정보 숨김, 시험판 흐름, 서명 위조·재사용 거부, 4개 언어, 동시 저장). 실제 서버에서 에이전트처럼 API로, 테스트 지갑을 넣은 브라우저로 화면에서 전체 흐름을 확인했다. 그 과정에서 새 서버에 요청이 동시에 들어오면 저장이 실패하던 버그를 고쳤다.
  - **정정:** ROADMAP의 앱 경로 `apps/errands`는 `apps/errand`로 만들었다. ROADMAP을 맞췄다.
  - **정정 (2026-10-03):** 심부름 앱을 별도 비공개 저장소 `opus-pay/opus-errand`로 옮겼다(커밋 기록 포함). 이 저장소의 `apps/errand`는 지웠다. 새 저장소는 SDK를 `file:../opus-osx/packages/sdk`로, 컨트랙트 주소는 사본(`config/deployments`)으로 참조만 한다. 사본이 이 저장소의 배포 기록과 같은지는 `yarn check:deployments`가 확인하고, CI는 `opus-osx.ref`에 고정한 커밋으로 이 저장소를 받는다. 심부름 서비스는 프로토콜과 따로 운영한다는 M6 원칙과 맞춘 것이다.
  - **정정 (2026-10-05):** 저장소 이름을 `opus-pay/wayhand`로 바꿨다. OPUS는 중립 프로토콜이고 WayHand는 그 위의 서비스이므로 `opus-` 접두어를 뺐다. 위 기록의 `opus-errand`는 같은 저장소다.
  - **진행 (2026-10-07):** 저장소는 SQLite(`.data/errands.db`, 스키마 버전 3)로 바꿨고 옛 JSON은 처음 열 때 옮겨 온다. 휴대폰용 WalletConnect는 `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`가 있을 때 켜지며 실기기는 확인하지 못했다. 호출 제한은 공개·로그인·쓰기 구분으로 있다(프로세스 메모리 기준). 실제 에스크로 연결은 코드가 끝났고(#77) 체인에서는 아직 한 번도 실행하지 못했다.

#### [Issue #77] Errand app: connect the real escrow
* **Type:** `Feature` / **Priority:** `P0` / **Depends on:** #76, #68, #71, #25, #26
* **Description:** Replace the trial's recorded steps with OPUS escrow transactions. Money facts come from the chain; the server keeps the rest (#76 principle).
* **Tasks:**
  - [ ] When the client chooses, create the job with the provider set and the agreed amount; store `jobId` with the errand
  - [ ] Request document hash (#68) in the job's description; proof bundle hash (#71) as the `submit` deliverable
  - [ ] Evaluator preset for the trial rules (no arbiter, objection pays the provider); confirmation mode only after #74
  - [ ] `fund` and `confirm` take a transaction hash; the server checks it on chain before changing status
  - [ ] Read status, deadlines and payouts from the indexer (#26); when the server and the chain differ, show the chain
  - [ ] Refund path after `expiredAt` shown to the client; keeper (#24) keeps finalizing on time
  - [ ] Relayed calls (#25) so users need no POL
  - [ ] Turn `ERRAND_TRIAL` off per environment; keep trial on for demos
* **Acceptance:** On Amoy, a client and a provider finish an errand through the app and the USDC moves; the app's status matches the chain at every step.

#### [Issue #78] Errand data: database and proof storage
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** #76
* **Description:** The trial keeps everything in one JSON file on one server. Move to storage that survives restarts, more than one server, and growth.
* **Tasks:**
  - [x] Database behind the existing `Repository` interface (errands, applicants, idempotency keys); migrations
  - [ ] Proof photos and video in object storage with signed, expiring links instead of data URLs in the database
  - [ ] Sign-in nonces in shared storage so several servers can run
  - [ ] Backups and a tested restore
  - [ ] Retention and deletion rules for personal data and proof files (with #71 and #67)
* **Acceptance:** Restarting or adding a server loses nothing; a deleted account's proof files are gone after the retention period.

* **해결 내용 (일부):**
  - **진행 (2026-10-07):** SQLite 저장소가 `Repository` 인터페이스 뒤에 들어갔다(스키마 번호로 자동 올림). 증빙 사진은 아직 DB 안 data URL이다. 객체 저장소, 공유 nonce 저장소, 백업·복구 시험, 보관 규칙은 남았다. 서버 프로세스 하나가 파일을 독점하는 전제다.

#### [Issue #79] Errand app: hosting, security and operations
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** #76, #78
* **Tasks:**
  - [ ] Hosting with HTTPS and a domain; `ERRAND_AUTH_SECRET` required outside development (refuse to start without it)
  - [x] Rate limits on public, auth and write endpoints; request size limits kept
  - [ ] CORS policy for the private API (today: any origin) decided and documented
  - [ ] Error logging and uptime alerts; no personal data or tokens in logs
  - [ ] Security review of the server code before real money, alongside the contract audit (#39, #40)
* **Acceptance:** A load and abuse test does not take the service down; secrets live only in the host's settings.

* **해결 내용 (일부):**
  - **진행 (2026-10-07):** 호출 제한(로그인 20, 쓰기 40, 읽기 240회/분, 프로세스 메모리 기준), 본문 크기 제한, `/metrics`(토큰으로 켬)가 있다. 호스팅·도메인·CORS 결정·알림·보안 검토는 남았다.

#### [Issue #80] Errand content rules, reports and moderation
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** #67
* **Description:** Today anyone with a wallet can post anything. The service needs the prohibited-requests list from #67 enforced in the product.
* **Tasks:**
  - [x] Checks at posting time against the prohibited list (illegal goods, surveillance of people, harassment, etc.)
  - [ ] Report button on errands and applicants; review queue for the service operator
  - [ ] Hiding an errand or blocking a wallet in the service's own listings only (the escrow is unaffected, as in #69)
  - [ ] Personal details (addresses, phone numbers) discouraged in public text, with a warning in the form
* **Acceptance:** A test post from the prohibited list is refused or hidden, and a report reaches the operator within the published response time.

* **해결 내용 (일부):**
  - **진행 (2026-10-07):** 올릴 때 규칙 검사와 AI 검사(`ok/review/block`)를 하고, `review`는 관리자 승인 전까지 공개되지 않는다. 신고 버튼, 심부름 숨기기, 주소·연락처 경고 문구는 남았다.

#### [Issue #81] Errand notifications
* **Type:** `Feature` / **Priority:** `P1` / **Depends on:** #76, #29
* **Tasks:**
  - [ ] Events: new applicant, chosen, funded, proof submitted, review deadline approaching, paid, refunded
  - [ ] Channels: email first; web push or a messenger later (#29 uses webhooks)
  - [ ] Users choose which events they get; every message links to the errand
* **Acceptance:** In the pilot, both sides learn about each step without opening the app.

* **해결 내용 (일부):**
  - **진행 (2026-10-07):** 앱 안 알림(종 아이콘, 종류별 끄기, 4개 언어)은 구현됐다. 이메일 통로, 환불 알림, 마감 임박 알림(시계 필요)은 남았다.

#### [Issue #82] Errand service name, domain and brand
* **Type:** `Task` / **Priority:** `P1` / **Depends on:** #67
* **Tasks:**
  - [ ] Service name in the four languages; trademark check in Korea and the first corridor
  - [ ] Domain; replace `[App name]` placeholders in the app
  - [ ] Present the service as cross-border escrow payments; blockchain as the implementation, not the headline
* **Acceptance:** The pilot runs under its own name and domain.

* **해결 내용 (일부, 2026-10-03):**
  - 작업 이름을 **WayHand**(웨이핸드, ウェイハンド)로 정하고 opus-errand 화면, API 이름, 에이전트 안내에 넣었다.
  - 웹 검색으로 후보를 걸렀다. Lendhand는 미국 가사 서비스 앱 "Lend Hands"와 네덜란드 금융 플랫폼 "Lendahand"와 겹치고, "Lend"가 대출로 읽혀 뺐다. Farhand는 주문형 서비스(farhand.live) 등과 겹쳐 뺐다. Errandia는 같은 이름의 심부름 앱이 있어 뺐다. WayHand는 같은 이름의 앱·회사·상표가 검색되지 않았다.
  - 남은 것: KIPRIS·USPTO·J-PlatPat 상표 검색(9·35·36·39류), wayhand.com·wayhand.app 도메인과 SNS 계정 확보, 법인 설립(#67) 때 상표 출원.

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
  - [ ] Recruit 10–20 clients (e.g. people abroad with family in the destination, or people outside a large city who need something done there) and 5–10 verified providers in one city
  - [ ] Run real filming and purchasing errands (testnet with test funds first; small real amounts only after audit)
  - [ ] Interview each user: current workaround, trust concerns, price they would pay, friction with money in and out
* **Acceptance:** Written findings; backlog re-prioritized.

#### [Issue #36] Polygon grant application
* **Type:** `Task` / **Priority:** `P0` / **Depends on:** #22, #34
* **Tasks:**
  - [ ] Milestones tied to #22 (Amoy, done: verified addresses in README), #35 (pilot), #42 (mainnet)
  - [ ] Check which Polygon funding programme is open at the time (grants moved to funds and programme directors in 2025)
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
  - [ ] Revisit #18: raise branch coverage toward 95% or list each uncovered branch with a reason (unreachable guards removed, short-circuit branches tested)
  - [ ] Confirm the nightly invariant run really completes 10,000 actions (mocha timeout) — **2,000 is what fits today** (the check is quadratic, see #19); 10,000 needs an incremental check
* **Acceptance:** Pack ready to send to auditors.

#### [Issue #40] External audit
* **Type:** `Security` / **Priority:** `P0` / **Depends on:** #39, funding
* **Tasks:**
  - [ ] Scope: core, factory, forwarder, `OptimisticEvaluator` (including fees, tips, deposits, permit paths). `TestRunnerEvaluator` and any arbiter adapter are audited separately when they are built (the Kleros adapter is in `contracts/experimental/` and out of scope)
  - [ ] Fix findings; publish the report
  - **결정 (2026-10-05, D33):** 외부 감사는 수익이 나거나 투자를 받은 뒤에 한다. 그 전에는 #42의 조건으로 메인넷 시범 운영을 한다. 감사 후 건당 상한을 100달러에서 1,000달러로 올린 버전을 배포한다.
* **Acceptance:** No open high or medium findings.

#### [Issue #41] Bug bounty
* **Type:** `Security` / **Priority:** `P1` / **Depends on:** #40
* **Acceptance:** Public programme with a severity ladder.

#### [Issue #42] Mainnet deployment
* **Type:** `Release` / **Priority:** `P0` / **Depends on:** #39, ERC-8183 interface stable (#40 after revenue, D33)
* **Tasks:**
  - [ ] Deploy and verify on Polygon (`POLYGON_USDC` and any other stablecoins injected per D8); budget range 1–1,000 USD enforced; D2, D3, D18 placeholders replaced with decided values first
  - [ ] Public page: addresses, stablecoin list, budget range, "no admin, no protocol fee" statement
  - [ ] Before deploying without #40 (D33): AI deep review with independent reviewers, attack tests and fuzzing; report published
  - [ ] Keep the 100 USD per-job cap until #40; services cap the total funded value at once, start with invited users, and state that the contracts are not externally audited
  - [ ] Indexer alerts for unexpected payouts or balance mismatches; written steps to move services to a new deployment
  - **결정 (2026-10-05):** 감사 전 메인넷 시범 운영을 허용한다(D33). 이 저장소가 만드는 기준 에스크로는 수수료 0%를 유지하고, 서비스별 수수료 에스크로와 Splitter는 서비스 쪽 저장소에서 만든다(D32).
* **Acceptance:** First mainnet job completed.

---

## Milestone 9: Entity and legal

#### [Issue #43] Entity structure
* **Type:** `Legal` / **Priority:** `P0` / **Depends on:** —
* **Tasks:**
  - [ ] Protocol maintenance vs team-run services as separate entities
  - [ ] Jurisdiction chosen with counsel; where decisions are actually made
  - [ ] Needed before equity investment and before any contract with payment or exchange partners (D29)
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
  - [x] MIT (suggested for a public-standard implementation with no protocol fee) vs BSL (D7). `LICENSE.md` is currently BUSL-1.1 (MIT from 2030-01-01); if BUSL stays, fix its "Licensed Work" text, which still describes the previous project
* **Acceptance:** `LICENSE` file matches the decision before the first public release.

* **해결 내용:**
  - D7은 MIT로 정했다. `LICENSE.md`를 MIT 전문으로 바꿨고 저작권자는 opus-pay다. 각 `package.json`의 `SEE LICENSE IN LICENSE.md`는 그대로 MIT를 가리킨다.
  - 솔리디티 파일 8개의 `SPDX-License-Identifier: BUSL-1.1`은 남겼다. 헤더를 바꾸면 메타데이터 해시가 바뀌어 Amoy에 검증한 소스와 어긋난다. 다음 배포(메인넷 #42 또는 Amoy 재배포) 때 `MIT`로 바꾸고, `.cursor/rules/solidity-standards.mdc`의 헤더 예시도 함께 바꾼다.

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

#### [Issue #62] Service listing by contact and agreement
* **Type:** `Task` / **Priority:** `P1` / **Depends on:** D23
* **Decision (2026-10-07, D23):** The Portal does not read its list from the chain. An open on-chain registry cannot stop abuse (spam, copies of real services, scams), so a service is listed only after the operator has talked with the team behind it and agreed terms.
* **Tasks:**
  - [ ] A "list your service" contact on the Portal
  - [ ] Written listing terms: what is checked before listing (who runs it, the instance address, what it does), what is expected of a listed service, and when it is removed
  - [ ] Each listing is an entry in a public file in the Portal repository (name, description in four languages, category, link, logo, instance address) added by pull request, so every change is visible
  - [ ] A service can ask to change or remove its entry; the operator can remove one under the display policy (#66)
* **Acceptance:** Every service on the Portal has an agreed listing and a public entry; nobody can list a service without the operator's action.

* **해결 내용 (일부):**
  - **진행 (2026-10-07):** 포털(`opus-pay/opus-portal`)이 `services.ts`에서 서비스를 4개 언어로 나열한다(WayHand active, 나머지 planned). 목록은 온체인 자동 읽기가 아니라 문의와 합의 뒤 PR로만 추가한다(D23). "서비스 등록 문의" 버튼과 안내 문구는 화면에서 뺐고, 서면 등록 조건과 인스턴스 주소 필드는 남았다.

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

* **해결 내용 (일부, 앞당김, 2026-10-03):**
  - #76의 API가 이 도구의 바탕이다. 요청 등록, 지원자 목록, 선택, 예치, 증빙 읽기, 승인이 HTTP API로 있고, OpenAPI `operationId`를 도구 이름으로 쓸 수 있다. 에이전트용 안내는 `/llms.txt`.
  - 남은 것: MCP 서버로 감싸기, 사람이 정하는 지출 한도와 확인 단계, 이의 제기(#74 이후).

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

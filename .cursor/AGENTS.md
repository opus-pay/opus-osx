# OPUS — Agent Context

이 문서는 AI 에이전트(Cursor 등)가 이 저장소에서 작업할 때 매 세션 처음 읽어야 하는 컨텍스트입니다.
이슈 하나를 받으면 이 문서와 `.cursor/CURSOR_BRIEF.md`만으로 바로 구현에 착수할 수 있어야 합니다.

## 다음 작업을 시작할 때 (#22 이후)

1. 이 문서의 불변식 I-1~I-9와 아래 결정 표를 읽습니다.
2. `.cursor/CURSOR_BRIEF.md` §7~§9와 `GITHUB_ISSUES.md`의 해당 이슈를 읽습니다. 순서: #22 Amoy 배포 → #23 SDK → #24 키퍼 → #25 릴레이어 → (#26 인덱싱) → #27~#30 결제 링크.
3. 배포 주소는 `packages/contracts/deploy/amoy/addresses.json`에 있습니다. SDK와 앱은 이 파일과 typechain 결과만 씁니다. 주소나 ABI를 손으로 복사하지 마십시오.
4. 컨트랙트는 감사 전까지 고칠 수 있지만, 고치면 Amoy에 다시 배포하고 주소 파일과 README 표를 갱신합니다.
5. SDK 프리셋의 기본 중재자(D10)와 금액(D18)은 `PLACEHOLDER_` 값으로 두고 추측하지 마십시오. D3 기한 값도 컨트랙트의 `PLACEHOLDER_*`를 그대로 따릅니다.

## 프로젝트 요약

**OPUS는 국경 너머 심부름을 위한 에스크로 프로토콜입니다.** 의뢰인이 USDC/USDT를 작업 하나에 맡기고, 수행자가 일을 마치면 지급하며, 마치지 못하면 의뢰인에게 돌려줍니다.

* **표준:** 이더리움 **ERC-8183 (Agentic Commerce, 초안)**의 인터페이스를 그대로 구현합니다. 표준은 의뢰인과 수행자가 사람인지 AI인지 구분하지 않으므로, 지금은 사람이 쓰고 나중에는 AI 비서가 같은 컨트랙트를 씁니다.
* **관리자 없음:** 소유자, 역할, 일시정지, 업그레이드, 설정 함수가 없습니다. 모든 한도는 코드의 상수입니다.
* **결제:** USDC/USDT만. 작업당 예산은 **1~1,000달러**로 고정입니다.
* **수수료:** 프로토콜 수수료는 없습니다. 서비스 수수료는 서비스가 만든 인스턴스별로 고정되고, 평가 수수료는 평가 일을 한 쪽에게 결과와 무관하게 지급됩니다.
* **토큰:** 출시 시 토큰을 발행하지 않습니다. OPG는 이후 OPUS Court의 평가자 예치·보상으로만 검토합니다.
* **첫 서비스:** 팀이 운영하는 국경 너머 심부름 서비스(`apps/errands`). 이 서비스도 일반 연동사와 똑같이 공개 SDK와 자기 인스턴스를 씁니다.

문서:
* `WHITEPAPER.md` (영문), `WHITEPAPER.ko.md` (한국어) — 설계와 배경. **백서를 고칠 때는 두 파일을 함께 고칩니다.**
* `ROADMAP.md` — 마일스톤, 일정, 결정 항목(D1~D29)
* `GITHUB_ISSUES.md` — 이슈 #1~#75의 상세 작업과 완료 기준
* `.cursor/CURSOR_BRIEF.md` — M0~M5 구현 명세 (컨트랙트, 평가자, 테스트, SDK)

## 역할과 용어

| 코드 | 한국어 | 뜻 |
| :--- | :--- | :--- |
| Client | 의뢰인 | 작업을 만들고 예산을 예치하는 쪽 |
| Provider | 수행자 | 일을 하고 대금을 받는 쪽 |
| Evaluator | 평가자 | 제출된 작업을 `complete` 또는 `reject`하는 주체. OPUS에서는 평가자 컨트랙트 |
| Arbiter | 중재자 | 평가자 안에서 이의를 판정하는 주소 (단일 주소, 외부 중재 어댑터, 이후 OPUS Court) |
| Instance | 인스턴스 | 토큰 하나와 수수료 설정 하나를 가진 코어 컨트랙트 |
| Keeper | 키퍼 | 기한 처리 함수를 호출하는 누구나. 호출하면 팁을 받음 |
| Deferred payout | 지연 지급 | 전송 실패 시 기록되어 나중에 본인이 인출하는 금액 |

## 절대 위반해서는 안 되는 불변식

구현 중 판단이 필요할 때 이 규칙이 다른 모든 고려사항보다 우선합니다. `packages/contracts`를 건드리는 PR은 해당 불변식을 검증하는 테스트를 포함해야 합니다.

* **I-1 도착지.** 인스턴스는 의뢰인(환불), 수행자(완료 시 수수료 차감 후), 인스턴스의 고정 수수료 수령처(완료 시만), 자기 지연 지급을 인출하는 본인에게만 토큰을 보냅니다. 평가자는 맡은 돈을 평가 운영자(평가 수수료), 기한이 된 처리 함수의 호출자(팁), 중재자(진 쪽 보증금), 또는 그 돈을 맡긴 당사자에게만 보냅니다. 이 밖의 전송 경로를 만들지 마십시오.
* **I-2 잔고.** 인스턴스: `Σ(Funded·Submitted 예산) + Σ claimable == token.balanceOf(instance)`. 평가자: `Σ(평가 수수료 + 분쟁 보증금) == token.balanceOf(evaluator)` (토큰별). OPUS Court: `Σ 예치금 + Σ 미지급 보상 == 잔고`.
* **I-3 역할.** 각 함수는 ERC-8183이 정한 역할만 호출할 수 있습니다. 누구나 호출할 수 있는 것은 `claimRefund`와 평가자의 기한 처리 함수뿐입니다. 다른 특권 주소는 없습니다.
* **I-4 활성성.** 예치·제출 상태의 모든 작업은 평가자의 기한 처리로, 그리고 어떤 경우에도 훅을 걸 수 없는 `claimRefund`로 반드시 종결됩니다.
* **I-5 조건 고정.** 예치 후 수행자, 평가자, 예산, 만료, 훅, 평가 규칙은 바뀌지 않습니다. 의뢰인의 검토 기한 1회 연장만 예외입니다.
* **I-6 관리자 없음.** 코어, 팩토리, 평가자, 전달자에 `Ownable`, `AccessControl`, `Pausable`, 프록시, `delegatecall`, `selfdestruct`, 전역 설정 함수를 넣지 마십시오.
* **I-7 이중 정산 금지.** 종결된 작업은 다시 전이하지 않습니다.
* **I-8 표준 준수.** 표준 함수와 이벤트는 ERC-8183 명세대로 동작합니다. 확장 기능은 표준 동작을 바꾸지 않으며, 표준 경로와 같은 훅과 이벤트를 거칩니다.
* **I-9 양보와 법정 규칙.** 제출 후 의뢰인의 승인, 또는 수행자의 포기는 언제나 상대에게 유리하게 작업을 종결합니다. OPUS Court에서 평가자는 예치금이 감당하는 작업에만 선정되고, 예치금은 배포 시 고정된 규칙으로만 삭감됩니다.

### 추가 금지 사항

* 코어, 팩토리, 평가자 어디에도 **프로토콜 수수료**(팀·재단·기타 주소로 가는 수수료)나 수수료 스위치를 넣지 마십시오 (D13).
* 코어는 외부로 호출하지 않습니다. 예외는 결제 토큰의 전송·`permit`과, 표준이 정한 훅 호출(가스 상한 적용)뿐입니다.
* 온체인에는 해시와 URI만 둡니다. 의뢰 내용, 증빙, 개인정보, 자유 텍스트를 저장하지 마십시오.
* OPG 토큰, 오라클, 가격 조회를 코어와 평가자에 넣지 마십시오.

## 저장소 구조

yarn workspaces 모노레포입니다. 아래는 목표 구조이며, 각 패키지는 해당 이슈에서 만들어집니다.

```text
packages/
  contracts/                 코어, 팩토리, 평가자, 전달자 (@opus/contracts). 감사 후 불변 배포
    contracts/
      acp/                   OpusAgenticCommerce, OpusACPFactory, IAgenticCommerce, IACPHook, IOpusACPExtensions
      evaluators/            OptimisticEvaluator, IOpusEvaluator, IOpusArbiter
      forwarder/             OpusForwarder (D14 결정 시)
      libraries/             TokenAmountLib 등
      mocks/                 테스트 전용 토큰과 악성 훅. solhint·slither 제외
    test/
      unit/                  함수별 단위 테스트 (허용 경로 + 모든 revert)
      invariant/             I-1, I-2, I-4, I-7, I-9
      conformance/           ERC-8183 적합성 (I-8)
    deploy/<network>/        배포 스크립트와 주소 기록
    docs/                    EVM_TARGET.md, ERC8183_CONFORMANCE.md
    env/                     .env, .amoy.env, .polygon.env (커밋 금지, 샘플만 커밋)
  sdk/                       TypeScript SDK (@opus/sdk, viem)
  keeper/                    기한 처리 호출기. 운영 문서는 packages/keeper/README.md
  relayer/                   가스 대납 중계 (ERC-2771). 운영 문서는 packages/relayer/README.md
  indexer/                   작업·인스턴스 조회 인덱스. 운영 문서는 packages/indexer/README.md
  verifier/                  테스트 실행 검증 서버 (M13)
apps/
  pay/                       에스크로 결제 링크
  errands/                   국경 너머 심부름 서비스
  portal/                    OPUS Portal (서비스 목록)
  docs/                      개발자 문서
```

앱(`apps/*`)은 컨트랙트 소스를 직접 import하지 않고 `@opus/sdk`만 씁니다. 컨트랙트 타입은 typechain 결과만 쓰고, ABI를 손으로 복사하지 마십시오.

## 작업 방식

1. 이슈 번호를 확인하고 `GITHUB_ISSUES.md`의 작업 목록과 완료 기준, `.cursor/CURSOR_BRIEF.md`의 해당 절을 읽습니다.
2. 아래 "미확정 결정 사항"이 구현에 영향을 주면 추측하지 말고 질문합니다. 값이 필요하면 `PLACEHOLDER_` 접두어가 붙은 이름 있는 상수를 쓰고 PR에 결정 필요를 적습니다.
3. **테스트를 먼저 작성합니다.** 불변식에 해당하는 항목은 invariant 테스트를 구현과 함께 제출합니다.
4. `yarn build`, `yarn test`, `yarn lint`, `yarn formatting:check`를 통과시킵니다.
5. 이슈 하나 = 브랜치 하나(`feat/#6-core-jobs` 형식) = PR 하나. PR 설명에 바뀐 파일과, 테스트가 다루는 불변식 번호를 적습니다.
6. 끝나면 `GITHUB_ISSUES.md`의 체크리스트를 체크하고, 이슈 아래에 짧은 **해결 내용**을 한국어로 남깁니다. 이전 기록이 틀렸으면 지우지 말고 **정정** 줄을 추가합니다.
7. 커밋 메시지: `feat(contracts): ... (#6)`, `test(contracts): ...`, `docs: ...`.
8. 핵심 불변식과 적합성 테스트는 사람이 직접 읽고 확인합니다. AI가 쓴 코드와 AI가 쓴 테스트가 같은 착각을 공유할 수 있습니다.

## 명령어

루트에서 실행하면 모든 워크스페이스에 적용됩니다 (#1에서 구성).

```bash
yarn install                # 의존성 설치
yarn build                  # 전체 컴파일
yarn test                   # 전체 테스트
yarn lint                   # solhint + 타입 체크
yarn formatting:write       # 포매팅
```

```bash
yarn contracts build                                   # hardhat compile + typechain
yarn contracts test                                    # 컨트랙트 테스트
yarn contracts test test/unit/OpusAgenticCommerce.test.ts
yarn contracts coverage
yarn contracts node                                    # 로컬 체인
yarn contracts deploy:amoy                             # Amoy 배포
```

기한 테스트에는 `@nomicfoundation/hardhat-network-helpers`의 `time.increaseTo()`를 쓰고, 모든 기한은 `deadline − 1`과 `deadline` 두 시점을 모두 확인합니다. 커스텀 에러는 `revertedWithCustomError`로 단정합니다.

## 기술 스택

* **컨트랙트:** Solidity 0.8.24, Hardhat, OpenZeppelin Contracts 5.6.1
* **테스트:** TypeScript + Mocha/Chai, typechain, hardhat-network-helpers. 불변식 퍼징용 Foundry 병행 여부는 D5
* **EVM 타깃:** `cancun` (D1). Polygon PoS·Amoy는 Agra에서 PUSH0, Napoli에서 Cancun 서브셋을 활성화했다. 근거와 출처는 `packages/contracts/docs/EVM_TARGET.md`.
* **서명:** EIP-712, OpenZeppelin `EIP712` + `Nonces`
* **네트워크:** Polygon Amoy (테스트넷) → Polygon PoS
* **SDK:** TypeScript + viem
* **앱:** Next.js App Router, Tailwind, shadcn/ui, wagmi + viem. 모듈 버전과 경계는 `apps/pay/README.md`

## 기술 결정 기록

확정된 사항입니다. 재논의가 필요하면 근거와 함께 이 표와 `ROADMAP.md` D.4를 갱신하십시오.

| 결정 | 내용 | 근거 |
| :--- | :--- | :--- |
| 표준 | ERC-8183 인터페이스를 그대로 구현. 확장은 표준 동작을 바꾸지 않음 | 연동 호환성, AI 비서 대비 |
| 사업 중심 (D28) | 국경 너머 심부름이 먼저, AI 비서는 같은 표준 위의 성장 경로 | 지금 수요는 사람, 표준은 미래 대비 |
| 관리자 | 없음. 상수만 | 누구도 열린 작업이나 자금을 바꿀 수 없게 |
| 예산 범위 (D4) | 작업당 1~1,000달러, 고정 상수 | 긴급 정지 없이 피해 상한, 소액·고빈도 집중 |
| 프로토콜 수수료 (D13) | 없음. 수수료 스위치도 없음 | 중립성, 표준 수수료 계산 유지, 포크 유인 제거 |
| 평가자 보상 | 정액 평가 수수료(결과 무관), 키퍼 팁, 분쟁은 진 쪽 보증금으로 중재자 보수. 코어 `evaluatorFeeBP = 0` | 표준의 완료 편향 제거 |
| 자발적 양보 (D21) | 의뢰인은 제출 후 언제든 승인, 수행자는 언제든 포기 | 자기에게 불리한 결론은 평가가 필요 없음 |
| 확인 필요 설정의 보증금 (D22) | 의뢰인이 설정 시 미리 납부, 분쟁 없으면 반환 | 사람 의뢰인의 침묵이 자동 패배가 되지 않게 |
| 서명 합의 실행 (D16) | 출시 시 제외 (#51) | 표준 흐름 + SDK 확인 + 선택적 금액 잠금으로 충분 |
| 토큰 (D17, D20) | 출시 시 없음. OPUS Court 예치는 USDC 먼저, OPG는 이후 검토 | 규제·수요 리스크 |
| 돈을 넣고 빼는 방법 (D29) | 직접 라이선스를 받지 않고, 투자금으로 인가받은 결제 파트너·거래소와 연동. 그 전까지 파일럿은 거래소에서 USDC를 사는 사용자로 | VASP·PG 부담 없이 비수탁 구조 유지 |
| 포털 역할 (D24) | 서비스 목록만. 매칭·보관·특권 없음 | 마켓플레이스 의무는 각 서비스에 |
| EVM 타깃 (D1) | Solidity 0.8.24, `evmVersion`/`hardfork` `cancun`, OpenZeppelin 5.6.1 | Agra(PUSH0) + Napoli(Cancun 서브셋)가 Amoy·PoS에 이미 활성. `shanghai`는 PUSH0을 내므로 옛 메모는 모순 |
| `fund` 서명 (D11) | `fund(jobId, expectedBudget, optParams)` | 명세와 hook-contracts 셀렉터. 참조 구현은 `expectedBudget`을 빠뜨림 |
| 팩토리 스테이블코인 (D8) | 생성자 목록. 주소는 배포 시 주입 | 코드에 메인넷 토큰을 하드코딩하지 않음 |
| ERC-2771 전달자 (D14) | 도입. `OpusForwarder` + `_msgSender()` | 심부름 가스 대납 |
| USDC permit 예치 (D15) | `fundWithPermit` 확장. 표준 `fund`와 같은 훅·이벤트 | 프론트런된 permit도 허용 |
| 툴체인 | Hardhat + TypeScript, yarn workspaces | 팀이 운영해 온 스택 |
| 라이브 서명 | Ledger (`@nomicfoundation/hardhat-ledger`). `*_ADDRESS`가 있으면 개인키 미사용 | 운영 키를 디스크에 두지 않음 |

## 불변식 검증 방법

* 무작위 행동열 핸들러를 두고 **매 호출 직후** 잔고와 장부를 대조합니다. 마지막에 한 번만 확인하면 어느 호출이 깨뜨렸는지 알 수 없습니다.
* CI는 고정 시드로 실행하고, 야간 실행은 무작위 시드로 1만 회 이상 돌리며 시드를 기록합니다. 실패한 시드는 회귀 테스트로 남깁니다.
* 핸들러에 모든 상태 전이 함수, 모든 기한 처리 함수, 양보 함수, 보증금 함수를 등록합니다. 자금을 움직이는 함수를 추가하면 핸들러 등록을 빠뜨리지 마십시오.
* 경계 조건: 예산 1달러와 1,000달러 경계, 6자리·18자리 토큰, 각 기한의 `deadline − 1`과 `deadline`, 블랙리스트 토큰, 재진입 토큰, 악성 훅, 중재자 없는 작업, 수수료 0과 최대치.
* 활성성: 모든 기한을 최대값으로 둔 작업들을 여러 상태에 두고, 시간을 끝까지 진행한 뒤 제3자 호출만으로 모두 종결되는지 확인합니다.

## 미확정 결정 사항

관련 코드를 쓸 때 임의로 정하지 말고 확인을 요청하십시오. 번호는 `ROADMAP.md` D.4와 같습니다.

| # | 항목 | 막는 작업 |
| :--- | :--- | :--- |
| D2 | `MAX_PLATFORM_FEE_BP`, `HOOK_GAS_LIMIT` | #7, #9 |
| D3 | 작업 기간 범위, 평가자 기한 범위, 안전 여유 | #6, #14 |
| D5 | 불변식용 Foundry 병행 | #19 |
| D7 | 라이선스 (MIT 권장 vs BSL) | #45 |
| D10 | 기본 중재자 | #23, #74 |
| D12 | ERC-8183 논의에 의견 제출 | #37 |
| D18 | 평가 수수료, 키퍼 팁, 분쟁 보증금 금액 (예산 대비 상한 포함) | #16, #53 |
| D19 | OPUS Court 세부 설정 | M11 |
| D23 | 서비스 정보 등록 방식 | #62 |
| D25 | 첫 심부름 경로: 국경 너머 또는 국내 지방↔대도시 (보류, #67 전까지) | #67 |
| D26 | 환전 파트너 | #72 |
| D27 | 지갑 가입 방식 | #73 |

# OPUS: 감사 지원 신청서 (Polygon Village)

[English](AUDIT_SUPPORT_APPLICATION.md)

감사 바우처 또는 지원 감사를 신청하기 위해 쓴 자료입니다. 내용은 이 저장소에서 확인할 수 있는 사실이고, 신청 양식에 따라 달라지는 칸은 **[양식]** 으로 표시했습니다. 이 문서는 감사가 아닙니다. 우리가 요청하는 것이 바로 외부 감사입니다.

| | |
| :--- | :--- |
| 프로젝트 | OPUS, 소액 해외 작업을 USDC로 정산하는 관리자 없는 에스크로 (ERC-8183) |
| 네트워크 | Polygon PoS. 지금은 Polygon Amoy(체인 ID 80002)에서 동작하며, 메인넷에는 아직 아무것도 없음 |
| 저장소 | [github.com/opus-pay/opus-osx](https://github.com/opus-pay/opus-osx), 공개 |
| 라이선스 | MIT. Solidity 파일에는 Amoy에 검증된 배포와 맞추기 위해 아직 BUSL-1.1 머리말이 남아 있고, 감사 동결 전에 MIT로 바꿉니다(`docs/audit/PRE_AUDIT_FREEZE.md`) |
| 연락처 | Michael Kim, 창업자. [michael.kim.200518@gmail.com](mailto:michael.kim.200518@gmail.com) **[양식: 연락처 확인, 요청하면 텔레그램·디스코드 추가]** |
| 날짜 | 2026-10-14 |

## 1. 요청하는 것

핵심 컨트랙트의 외부 보안 감사를, 감사 바우처 또는 지원 감사 형태로 요청합니다. 컨트랙트가 사용자의 USDC를 보관하므로, 실제 돈이 잠기기 전에 감사를 받아야 합니다. 감사는 프로젝트의 다음 단계(M1)이자 메인넷 전의 관문입니다. **[양식: 요청 금액이나 바우처 규모를 묻는 경우 기재. 우리 범위는 약 1,100줄입니다.]**

## 2. 감사 범위

| 컨트랙트 | 파일 | 줄 수 |
| :--- | :--- | ---: |
| 에스크로 인스턴스 | `packages/contracts/contracts/acp/OpusAgenticCommerce.sol` | 330 |
| 검토 컨트랙트 (선택적 중재인이 있는 낙관적 평가자) | `packages/contracts/contracts/evaluators/OptimisticEvaluator.sol` | 676 |
| 팩토리 | `packages/contracts/contracts/acp/OpusACPFactory.sol` | 69 |
| 포워더 (OpenZeppelin `ERC2771Forwarder`, 자체 로직 없음) | `packages/contracts/contracts/forwarder/OpusForwarder.sol` | 9 |
| 인터페이스 | `IAgenticCommerce`, `IOpusACPExtensions`, `IACPHook`, `IOpusEvaluator`, `IOpusArbiter` | |

약 1,100줄입니다(Aderyn은 10개 파일에서 1,123줄을 셉니다). Solidity 0.8.24, OpenZeppelin 5.6.1, EVM 대상 Cancun. 범위 밖: 목업, `experimental/`, 체인 밖의 모든 것(SDK, 키퍼, 릴레이어, 앱).

## 3. 컨트랙트가 하는 일

의뢰인이 작업 하나에 USDC를 잠급니다. 수행자가 증빙을 제출하면 그 해시가 체인에 저장됩니다. 의뢰인이 승인하거나, 이의 없이 확인 기간이 끝나면 수행자에게 지급됩니다. 기한까지 아무것도 제출되지 않으면 의뢰인에게 환불됩니다. 의뢰인이 이의를 제기하면 양쪽이 보증금을 내고 중재인이 결정하며, 중재인이 없는 작업에는 기본 결과가 정해져 있습니다. 기한이 지난 지급과 환불은 누구나 실행할 수 있어서, 운영자가 꺼져 있어도 작업이 끝납니다.

- **관리자 없음.** 소유자, 정지, 업그레이드, 설정 변경 기능이 없습니다. 돈은 작업의 규칙으로만 움직입니다. 이를 확인하는 것이 감사의 주요 목적입니다.
- **한도가 코드에 있음.** 감사 전까지 작업 하나는 100달러로 제한되고(`MAX_BUDGET_USD`), 감사 뒤에 올립니다.
- **토큰 처리.** 지급이 실패하면(예: 한 주소를 막는 토큰) 되돌리지 않고 그 당사자의 `claimable` 잔액에 적립합니다. 그래서 다른 사용자의 돈이 묶이지 않습니다.

## 4. 감사 전에 해 둔 일

| 항목 | 결과 |
| :--- | :--- |
| 테스트 | 154개(단위, ERC-8183 적합성, 고친 문제마다의 회귀 테스트). CI에서 모두 통과. 매일 밤 임의 값으로 불변식 시험(`test/invariant`) |
| ERC-8183 적합성 표 | 표준의 MUST와 SHOULD를 각각 코드와 테스트에 연결: `packages/contracts/docs/ERC8183_CONFORMANCE.md` |
| Slither | 변경마다 CI에서 실행. 38건(높음 2, 중간 15, 낮음 21)을 하나씩 코드와 대조했고 열려 있는 문제는 없음 |
| Aderyn 0.6.8 | 높음 2종, 낮음 6종을 하나씩 코드와 대조했고 열려 있는 문제는 없음 |
| AI 보조 보안 검토 (2026-10-03) | 서로 독립된 AI 검토자 3명, 수정된 코드를 다시 본 네 번째. **치명 1, 중간 2, 낮음 2건**을 찾아 모두 회귀 테스트와 함께 고침. 치명 건(C-1)은 가짜 인스턴스가 검토 컨트랙트에 모인 USDC를 빼 갈 수 있는 것이었고 테스트로 재현됨. 실제 돈이 들어 있지는 않았음(Amoy에 배포된 것은 거의 비어 있음) |
| Amoy 실거래 | 첫 번째 배포에서 8가지: 승인, 만료 환불, 침묵 시 자동 지급, 미제출 환불, POL 없는 지갑, 두 지갑이 쓰는 결제 링크, 중재인이 결정한 이의 제기, 수행자가 만든 링크. 이 중 6가지(승인, 침묵 제출, 미제출, POL 없는 지갑, 만료 환불, 이의 제기)는 보안 수정 뒤의 현재 소스로 만든 두 번째 배포(2026-10-08)에서 다시 실행. 모든 거래: `docs/grant/AMOY_EVIDENCE.md` |
| 감사 자료 | 위협 모델, 범위, 동결 전에 정할 값: `docs/audit/PRE_AUDIT_FREEZE.md`. 검토와 도구 결과: `docs/audit/SECURITY_REVIEW.md` |

AI 보조 검토와 도구는 외부 감사를 **대신하지 못한다**고 분명히 밝힙니다. 이들이 치명적인 문제를 하나 찾았으므로, 도구가 못 찾는 문제가 더 있을 수 있다고 보고 감사를 요청하는 것입니다.

## 5. 감사인에게 넘기는 열린 항목

- **훅 반환값.** `OpusAgenticCommerce._callHookWithSelector`는 훅의 가스를 제한하지만 반환값은 무시합니다. 매우 큰 값을 돌려주는 훅이 있으면 그 작업의 훅 호출이 가스 부족으로 실패할 수 있습니다. 훅은 의뢰인이 자기 작업에 고르는 것입니다. 감사인의 판단에 맡깁니다.
- **두 번째 AI 검토가 지적한 두 가지**: 의뢰인이 고른 훅이 `complete`를 막을 수 있는 것(OPUS 흐름은 항상 검토 컨트랙트를 훅으로 쓰고 SDK가 이를 확인함), 그리고 아주 늦은 분쟁 시작과 `claimRefund`가 겹치는 것(키퍼가 돌고, 누구나 `finalize`를 호출할 수 있음). 둘 다 이미 알려진 위험이고 OPUS 흐름에서는 작습니다. 고치면 ERC-8183 적합성에 영향이 있어 감사인의 판단을 구합니다. 자세한 내용: `docs/audit/SECURITY_REVIEW.md`.
- **설계상 남는 위험**은 `docs/audit/SECURITY_REVIEW.md`의 "Known risks that remain"에 있습니다. 예: 키퍼가 없으면 만료 뒤 `claimRefund`가 평가자와 경쟁하는 것, 의뢰인이 예치 전에 조건을 바꿀 수 있는 것.
- **동결은 아직 안 함.** 몇몇 `PLACEHOLDER_` 상수(플랫폼 수수료 상한, 훅 가스, 작업 기간 범위)는 감사 태그를 만들기 전에 정하고 이름을 바꿉니다. 그 태그를 감사인에게 드립니다.

## 6. 일정과 그 뒤

1. 값 확정, 라이선스 머리말 변경, 감사 태그 생성(약 1주).
2. 동결된 버전의 감사. **[양식: 희망 시작일]**
3. 지적 사항 수정, 감사인의 재확인, 보고서 공개.
4. Amoy 재배포와 기록된 시나리오 재실행. 이어서 작업당 한도를 둔 초대 전용 메인넷 베타를 하고, 감사 뒤 한도를 올립니다.

## 7. 감사에 대한 다른 자금

감사비가 포함된 Polygon 커뮤니티 재무 신청(`docs/grant/APPLICATION.md`)이 열려 있습니다. 그것이 선정되면 감사 업체와 Polygon Village에 알리고, 같은 일에는 한 곳의 자금만 씁니다. **[양식: 다른 그랜트를 묻는 경우 기재]**

## 8. 확인할 수 있는 곳

- 데모와 증빙: `docs/grant/README.md`("Check our claims in five minutes"), Amoy에 검증된 컨트랙트 포함.
- 백서: `WHITEPAPER.md`.
- 검토와 결과: `docs/audit/SECURITY_REVIEW.md`, `docs/audit/PRE_AUDIT_FREEZE.md`.

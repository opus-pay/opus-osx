# OPUS

[English](README.md) · 한국어

**국경 너머 심부름을 위한 에스크로. ERC-8183 표준 위에 만들었습니다.**

한곳에 있는 사람이 멀리 있는 사람(다른 나라나 먼 지역)에게 실제 일을 부탁합니다. 장소를 촬영하기, 물건을 사서 보내기, 나중에는 가족 동행까지. OPUS는 일을 정할 때 의뢰인의 USDC나 USDT를 잠가 두었다가, 일이 끝나면 수행자에게 풀어 주고, 끝나지 않으면 의뢰인에게 돌려줍니다. OPUS 팀을 포함해 누구도 그 돈을 다른 방식으로 움직일 수 없습니다.

OPUS는 **ERC-8183(Agentic Commerce)** 을 바꾸지 않고 그대로 구현합니다. 이 표준은 사람과 AI 에이전트를 구분하지 않으므로, 사람들의 AI 비서가 심부름을 올리기 시작하면 같은 컨트랙트가 그대로 쓰입니다.

* 관리자 없음: 소유자, 일시정지, 업그레이드, 설정 함수가 없습니다
* 작업당 1~1,000달러를 코드에 고정. 외부 감사 전까지는 작업당 100달러
* 프로토콜 수수료 없음. 평가자는 결과와 상관없이 같은 보수를 받습니다
* 출시 시점에 토큰 없음

> 상태: 컨트랙트는 Polygon Amoy에 배포하고 검증했습니다. 첫 번째 배포에서는 테스트 작업 8건이 끝까지 돌았고, 중재인이 판정한 분쟁도 포함됩니다. 두 번째 배포(2026-10-08, 2026-10-03의 보안 수정 포함)는 승인, 키퍼의 마무리와 시간 초과, 가스 없는 실행, 만료 환불, 중재인이 판정한 분쟁을 통과했습니다([증거](./docs/grant/AMOY_EVIDENCE.md)). 그 실행에는 SDK, 키퍼, 릴레이어, 결제 링크 앱을 썼고, 인덱서는 작성되어 있습니다. 같은 컨트랙트를 Polygon 메인넷(2026-10-23)에도 배포하고 검증했습니다. 아직 그곳에서 돌아간 작업은 없습니다. 키퍼, 릴레이어, 인덱서는 메인넷을 대상으로 돌릴 수 있습니다. 첫 서비스인 WayHand는 Amoy에서 시험판으로 돌았고, 실제 돈을 쓰는 파일럿(작업당 100달러 상한)은 2026년 11월에 하려고 계획 중입니다. 외부 감사는 받지 않았습니다(결정 D33: 상한을 둔 파일럿을 먼저 하고, 수익이나 투자가 생기면 감사). ERC-8183은 초안 표준입니다.

## Polygon 메인넷 (2026-10-23)

주소는 `packages/contracts/deploy/polygon/addresses.json`에도 있습니다. 두 번째 Amoy 배포와 같은 코드, 같은 배포 절차이고, Ledger로 서명했습니다. 기준 인스턴스는 Circle USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`(브리지된 USDC.e가 아닙니다)를 쓰고, 트레저리 `0`, 수수료 `0`입니다. 배포 뒤에 어떤 관리자 역할도 부여하지 않습니다. 감사 전이므로 외부 감사 전까지 작업당 100달러입니다.

| 컨트랙트 | 주소 |
| :--- | :--- |
| `OpusForwarder` | [`0x819e1e7e5779B24430125C529830B41Ed7F769d0`](https://polygonscan.com/address/0x819e1e7e5779B24430125C529830B41Ed7F769d0#code) |
| `OpusACPFactory` | [`0xf564509aF5e8846087a7d3b5e4fEe5cd53cD3AA5`](https://polygonscan.com/address/0xf564509aF5e8846087a7d3b5e4fEe5cd53cD3AA5#code) |
| 기준 USDC 인스턴스 | [`0xd293959476CBeb5a4271Fab6cE991Be5e51aAbf7`](https://polygonscan.com/address/0xd293959476CBeb5a4271Fab6cE991Be5e51aAbf7#code) |
| `OptimisticEvaluator` | [`0x33A27198F5920dFbfD6512506F06B60e28e2Eb04`](https://polygonscan.com/address/0x33A27198F5920dFbfD6512506F06B60e28e2Eb04#code) |

## Amoy (이슈 #22)

주소는 `packages/contracts/deploy/amoy/addresses.json`에도 있습니다. 이것은 두 번째 배포(2026-10-08)입니다. 2026-10-03의 보안 수정과 작업당 100달러 상한이 들어 있고, 첫 번째 배포는 그 이전 것입니다. 증거 문서의 테스트 작업은 첫 번째 배포에서 돌았고, 그 주소는 증거 문서에 있습니다. 기준 인스턴스는 Circle Amoy USDC `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582`를 쓰고, 트레저리 `0`, 수수료 `0`입니다. 배포 뒤에 어떤 관리자 역할도 부여하지 않습니다.

| 컨트랙트 | 주소 |
| :--- | :--- |
| `OpusForwarder` | [`0xD1172323dc6B5C39f8F015C0C3ada071079c830C`](https://amoy.polygonscan.com/address/0xD1172323dc6B5C39f8F015C0C3ada071079c830C#code) |
| `OpusACPFactory` | [`0x8Cae2EBe1b3D13e3EAf9Fc765a577dc30c6a5218`](https://amoy.polygonscan.com/address/0x8Cae2EBe1b3D13e3EAf9Fc765a577dc30c6a5218#code) |
| 기준 USDC 인스턴스 | [`0x4D54D2BD919024742070c63878903483d456d3fC`](https://amoy.polygonscan.com/address/0x4D54D2BD919024742070c63878903483d456d3fC#code) |
| `OptimisticEvaluator` | [`0x8A4a02D544145ed668b059A7A1753E1f4470da3B`](https://amoy.polygonscan.com/address/0x8A4a02D544145ed668b059A7A1753E1f4470da3B#code) |

## 문서

| 문서 | 내용 |
| :--- | :--- |
| [`WHITEPAPER.md`](./WHITEPAPER.md) / [`WHITEPAPER.ko.md`](./WHITEPAPER.ko.md) | 설계, 평가, 보안 모델, 제품, 위험 (영문 / 한글, 서로 맞춰 둠) |
| [`docs/grant/`](./docs/grant/README.md) | Amoy 증거: 모든 시험 트랜잭션과 확인하는 방법 |
| [`ROADMAP.md`](./ROADMAP.md) | 구성 요소, 열린 질문, 마일스톤, 주간 계획, 결정 D1~D33 |
| [`GITHUB_ISSUES.md`](./GITHUB_ISSUES.md) | 이슈 #1~#82와 할 일, 완료 기준 |
| [`.cursor/AGENTS.md`](./.cursor/AGENTS.md) | AI 코딩 에이전트용 안내: 불변식 I-1~I-9, 규칙, 결정 |
| [`.cursor/CURSOR_BRIEF.md`](./.cursor/CURSOR_BRIEF.md) | M0~M5 구현 명세 |
| [`packages/contracts/docs/EVM_TARGET.md`](./packages/contracts/docs/EVM_TARGET.md) | D1: Polygon / Amoy `cancun` 대상과 근거 |
| [`packages/contracts/docs/ERC8183_CONFORMANCE.md`](./packages/contracts/docs/ERC8183_CONFORMANCE.md) | ERC-8183 MUST/SHOULD 대응표 (D11) |
| [`packages/keeper/README.md`](./packages/keeper/README.md) | 키퍼: 지갑, 점검, 트리거, 알림 (한국어) |
| [`packages/relayer/README.md`](./packages/relayer/README.md) | 릴레이어: `POST /relay`, 예산, 제재 목록 파일 (한국어) |
| [`packages/indexer/README.md`](./packages/indexer/README.md) | 인덱서: 작업 조회와 저장하는 이벤트 (한국어) |
| [`apps/pay/README.md`](./apps/pay/README.md) | 결제 링크 앱 모듈 명세 (한국어) |

## 패키지

| 경로 | 용도 | 마일스톤 | 상태 |
| :--- | :--- | :--- | :--- |
| `packages/contracts` | ERC-8183 코어, 팩토리, `OptimisticEvaluator`, 포워더 | M1~M3 | Amoy와 Polygon 메인넷에 배포. 외부 감사 전 |
| `packages/sdk` | TypeScript SDK (viem) | M4 | 작성됨 |
| `packages/keeper` | 기한 트리거 호출. 팁을 받음 | M4 | Amoy에서 돌았음. Polygon 메인넷 지원 |
| `packages/relayer` | 가스 없는 중계(ERC-2771)와 토큰 permit | M4 | Amoy에서 돌았음. Polygon 메인넷 지원 |
| `packages/indexer` | 상태 화면용 작업·인스턴스 색인 | M4 | 작성됨. Polygon 메인넷 지원 |
| `apps/pay` | 에스크로 결제 링크 | M5 | 작성됨. Amoy에서 돌았음 |
| `wayhand` (별도 저장소) | WayHand, 국경 너머 심부름 서비스(한국–일본) | M6 | Amoy 시험판. 메인넷 파일럿은 2026년 11월 예정 |
| `opus-portal` (별도 저장소) | OPUS Portal: OPUS 위에 만든 서비스 목록 | M12 | 만들어 둠. 서비스는 합의로 등록(D23) |

앱은 `@opus/sdk`만 씁니다. 컨트랙트 타입은 typechain 출력에서 가져오고, ABI를 손으로 복사하지 않습니다.

## 설정

```bash
yarn install
cp packages/contracts/env/.env.sample packages/contracts/env/.env
cp packages/contracts/env/.amoy.env.sample packages/contracts/env/.amoy.env
cp packages/contracts/env/.polygon.env.sample packages/contracts/env/.polygon.env
yarn build
yarn test
```

Amoy와 Polygon 배포는 `ENV_NETWORK`로 `env/.amoy.env`와 `env/.polygon.env`를 읽습니다. `*_ADDRESS` 변수를 설정하면 개인키 없이 Ledger로 서명합니다.

## 명령

```bash
yarn build                  # 모든 워크스페이스 컴파일
yarn test                   # 모든 워크스페이스 테스트
yarn lint                   # solhint + 타입 검사
yarn formatting:write       # 서식 맞추기
yarn contracts test         # 컨트랙트 테스트
yarn contracts coverage     # 컨트랙트 커버리지
yarn sdk test
yarn keeper test
yarn relayer test
yarn indexer test
yarn pay test
```

키퍼, 릴레이어, 인덱서는 각 패키지에 운영 안내가 있습니다. `packages/<이름>/env/.env.sample`을 `env/.env`로 복사하고, 그 프로세스를 시작하는 셸에서 값을 내보내세요. 프로세스가 `env/.env`를 직접 열지는 않으며, `yarn <이름> start`는 패키지 폴더를 작업 폴더로 해서 돕니다. 서비스마다 셸을 따로 쓰세요.

```bash
set -a && source packages/keeper/env/.env && set +a && yarn keeper start
set -a && source packages/relayer/env/.env && set +a && yarn relayer start
set -a && source packages/indexer/env/.env && set +a && yarn indexer start
```

키퍼, 릴레이어, 인덱서는 각각 자기 이미지로 데몬처럼 돌 수 있습니다. 이미지는 `mukeunkim/opus-keeper`, `mukeunkim/opus-relayer`, `mukeunkim/opus-indexer`이고 커밋 해시 12자리를 태그로 씁니다. Dockerfile에는 서비스마다 타깃이 하나씩 있습니다(`docker build --target relayer .`). 각 이미지에는 그 서비스와 SDK와 운영용 의존성만 들어 있고, Node 22에서 컴파일된 JavaScript를 실행하며, 일반 사용자 권한으로 돌고, 상태 확인을 갖습니다. `docker/build-all.sh`는 세 개를 푸시 없이 로컬에서 빌드하고, `packages/<이름>/docker-build.sh`는 그 태그와 `latest`를 푸시하며, `docker-buildx.sh`는 `linux/amd64`와 `linux/arm64`도 함께 빌드합니다.

`compose.yaml`은 멈추지 않는 한 데몬을 다시 시작합니다. `config/keeper.env`, `config/relayer.env`, `config/indexer.env`를 읽고(`.sample` 파일을 복사), `config/addresses.json`과 `config/sanctions.txt`를 마운트합니다. `config` 폴더와 키는 이미지에 복사되지 않습니다. 인덱서의 장부(SQLite)와 릴레이어의 남은 가스 예산은 볼륨 `indexer-data`와 `relayer-state`에 있습니다. 키퍼 상태 확인(8789), 릴레이어(8787), 인덱서(8788)는 `127.0.0.1`에만 열려 있으므로, 릴레이어나 인덱서를 외부에 열기 전에 TLS를 지원하는 리버스 프록시를 앞에 두세요. 새로 배포한 뒤에는 `config/addresses.json`을 고치고 `INDEXER_FROM_BLOCK`을 팩토리가 배포된 블록으로 정하세요.

```bash
docker compose up -d --build keeper relayer indexer
docker compose logs -f keeper relayer indexer
docker compose stop keeper relayer indexer
```

## 기여

이슈 하나에 브랜치 하나, 풀 리퀘스트 하나입니다. `packages/contracts`를 건드리는 풀 리퀘스트는 시험이 어떤 불변식(`.cursor/AGENTS.md`의 I-1~I-9)을 다루는지 밝혀야 합니다. 이슈가 끝나면 `GITHUB_ISSUES.md`에서 체크하고 짧은 해결 메모를 적으세요.

## 라이선스

MIT(`LICENSE.md` 참조), 결정 D7. Solidity 파일의 헤더는 `SPDX-License-Identifier: MIT`입니다. Amoy 시험 배포는 `BUSL-1.1` 헤더가 있던 이전 소스로 검증되어, 검증된 소스와 이 저장소는 그 한 줄만 다릅니다.

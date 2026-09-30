# @opus/indexer

팩토리, 인스턴스, 평가자 로그를 장부로 접어 HTTP로 내놓는 읽기 전용 프로세스입니다. 이슈 #26. 서브그래프를 대신하는 조회 서비스이고, 개인키는 없습니다.

상태 페이지와 지갑별 목록은 이 장부를 읽습니다. 응답에 원본 로그는 없습니다. 키퍼는 기한 판단을 계속 온체인 `Opus.status`로 합니다. 인덱스의 `GET /active`는 그 키퍼가 로그를 훑지 않고 예치·제출 작업을 고를 때 씁니다.

## 실행

저장소 루트에서 합니다. `yarn indexer start`의 작업 디렉터리는 `packages/indexer`입니다. 프로세스는 `env/.env`를 직접 열지 않습니다.

```bash
cp packages/indexer/env/.env.sample packages/indexer/env/.env

set -a
source packages/indexer/env/.env
set +a
yarn indexer start
```

기본 바인딩은 `127.0.0.1:8788`입니다. 기동 직후 블록 0부터 2000블록씩 주소 파일의 팩토리, 인스턴스, 평가자 로그를 읽습니다. 주소가 0이면 그 컨트랙트는 건너뜁니다. 셋 다 0이면 시작이 실패합니다. 새 이벤트가 반영되면 `indexed N`을 찍습니다. 기본 주기는 15초(`INDEXER_POLL_MS`)이고, 이미 반영한 블록은 다시 적용하지 않습니다.

장부는 프로세스 메모리에만 있습니다. 재시작하면 블록 0부터 다시 읽습니다.

`chainId`가 80002이면 Amoy 체인을 쓰고, 그 외에는 로컬 Hardhat 체인을 씁니다.

## 조회

모두 `GET`입니다. 정수 필드는 10진 문자열입니다.

| 경로 | 200 | 그 외 |
| :--- | :--- | :--- |
| `/health` | `{"ok":true}` | |
| `/instances` | 팩토리가 만든 인스턴스 배열 | |
| `/jobs?account=0x…` | 그 주소가 의뢰인이거나 수행자인 작업 | `400` `account is required` |
| `/active?instance=0x…&evaluator=0x…` | 그 인스턴스·평가자에서 상태가 `Funded` 또는 `Submitted`인 작업 | `400` `instance and evaluator are required` |
| `/jobs/0x인스턴스/작업번호` | 작업 하나 | `404` `job not in the index` |

그 밖의 경로는 `404` `not found`입니다.

인스턴스 원소는 `instance`, `token`, `treasury`, `feeBP`입니다.

작업 원소:

| 필드 | 의미 |
| :--- | :--- |
| `instance`, `jobId` | 작업 위치 |
| `client`, `provider`, `evaluator`, `hook` | `JobCreated`와 이후 변경 |
| `expiredAt` | 체인 만료 시각(초) |
| `budget` | 최근 `BudgetSet` 또는 `JobFunded` 금액 |
| `status` | `Open`, `Funded`, `Submitted`, `Completed`, `Rejected`, `Expired` |
| `phase` | `None`, `Funded`, `Submitted`, `Escalated`, `ArbiterPending`, `Resolved` |
| `configured` | 평가자 `Configured`를 봤으면 true |
| `deliverable` | 제출 해시. 아직 없으면 필드가 빠진다 |
| `disputeDeadline` | `CaseOpened`의 기한. 아직 없으면 필드가 빠진다 |
| `deposit` | `DepositPosted` 금액 합 |
| `tipPaid`, `feePaid` | `TipPaid`, `FeePaid` 금액 합 |
| `swept` | `Swept`를 봤으면 true |

`JobCreated`에 설명 URI가 없어서 의뢰 문구는 이 장부에 없습니다. `PaymentReleased`와 `Refunded`는 반영 횟수에만 포함되고 금액을 따로 저장하지 않습니다. 금액은 그때의 `budget`과 `status`로 봅니다.

## 반영하는 이벤트

팩토리 `InstanceCreated`.

ERC-8183 작업 이벤트 `JobCreated`, `ProviderSet`, `BudgetSet`, `JobFunded`, `JobSubmitted`, `JobCompleted`, `JobRejected`, `JobExpired`, `PaymentReleased`, `Refunded`.

평가자 `Configured`, `Escalated`, `CaseOpened`, `DepositPosted`, `Ruled`, `TipPaid`, `FeePaid`, `Swept`.

장부에 넣는 로그는 위 이벤트입니다.

## 환경 변수

| 변수 | 필수 | 의미 |
| :--- | :--- | :--- |
| `INDEXER_ADDRESSES` | 예 | 샘플은 `../contracts/deploy/amoy/addresses.json` |
| `INDEXER_RPC_URL` | 아니오 | 비우면 체인 기본 RPC |
| `INDEXER_HOST` | 아니오 | 비우면 `127.0.0.1` |
| `INDEXER_PORT` | 아니오 | 비우면 `8788` |
| `INDEXER_POLL_MS` | 아니오 | 비우면 15000 |

## 테스트

```bash
yarn indexer test
yarn contracts test test/unit/Indexer.test.ts
```

단위 테스트는 이벤트를 장부로 접고 `GET /jobs/:instance/:id`와 `GET /active`가 그 장부를 내는지 봅니다. Hardhat 테스트는 예치 후 제출한 작업을 동기화하면 `Submitted`이고, 완료 뒤에는 `Completed`이며 활성 목록에서 빠지는지 봅니다. 공개 호스트는 아직 없고, 결제 링크 앱(#27)이 이 조회를 붙입니다.

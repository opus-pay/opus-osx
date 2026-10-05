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

기본 바인딩은 `127.0.0.1:8788`입니다. 기동 직후 `INDEXER_FROM_BLOCK`부터 2000블록씩 주소 파일의 팩토리, 인스턴스, 평가자 로그를 읽습니다. Amoy에서는 이 값이 필수이고, 샘플은 팩토리 배포 블록 `48650402`입니다. 로컬 Hardhat에서 값을 비우면 블록 0부터 읽습니다. 주소가 0이면 그 컨트랙트는 건너뜁니다. 셋 다 0이면 시작이 실패합니다. 새 이벤트가 반영되면 `indexed N`을 찍습니다. 기본 주기는 15초(`INDEXER_POLL_MS`)이고, 이미 반영한 블록은 다시 적용하지 않습니다.

장부는 메모리에 있고, `INDEXER_STATE_FILE`을 정하면 구간을 반영할 때마다 파일에 저장합니다. 재시작하면 그 파일에서 읽은 블록 번호와 장부를 되살려 이어서 읽습니다. 파일이 없거나, 다른 체인·주소 파일의 것이거나, 깨져 있으면 무시하고 `INDEXER_FROM_BLOCK`부터 다시 읽습니다. 저장은 임시 파일에 쓴 뒤 이름을 바꾸는 방식이라 중간에 죽어도 반쪽 파일이 남지 않습니다.

## 믿을 수 있게 읽는 방법

-   **구간 단위로 통째로 반영합니다.** 블록 구간의 로그를 전부 가져온 뒤에 장부에 넣고 읽은 위치를 옮깁니다. 요청이 중간에 실패하면 그 구간을 처음부터 다시 읽으므로 같은 이벤트를 두 번 세지 않습니다 (예치·팁 같은 합산 값이 틀어지지 않습니다).
-   **오류가 나도 죽지 않습니다.** RPC 요청이 실패하면 이유를 찍고 다음 주기에 다시 시도합니다. 연속으로 실패하면 간격을 두 배씩, 최대 5분까지 늘립니다.
-   **확정 깊이.** 체인의 마지막 블록은 곧 다른 블록으로 바뀔 수 있습니다. `INDEXER_CONFIRMATIONS`(Amoy 기본 5, 로컬 0)만큼 머리보다 뒤까지만 읽어서, 바뀐 블록의 이벤트가 장부에 들어가지 않게 합니다.
-   **팩토리가 만든 모든 인스턴스를 읽습니다.** 주소 파일의 인스턴스와 평가자에 더해, 팩토리의 `InstanceCreated`로 알게 된 인스턴스의 로그도 읽습니다. 알려지는 바로 그 구간의 로그도 같은 구간 안에서 함께 가져옵니다.

`chainId`가 80002이면 Amoy 체인을 쓰고, 그 외에는 로컬 Hardhat 체인을 씁니다.

## 상태 확인

`/health`는 인증 없이 열려 있습니다. 최근 `max(2분, 4주기)` 안에 깨끗한 동기화가 있고 연속 실패가 5번 미만이면 `200`, 아니면 이유와 함께 `503`입니다. 본문에 `synced`가 있어서, 처음 읽는 중이라 장부가 아직 불완전한지(`false`) 따라잡았는지(`true`)를 알 수 있습니다. `head`, `indexedTo`, `lag`, `jobs`, `lastOkAgeSeconds`, `lastError`도 줍니다. 읽는 서비스는 `synced`가 `true`일 때만 `/jobs` 결과를 신뢰하세요.

## 조회

모두 `GET`입니다. 정수 필드는 10진 문자열입니다.

| 경로 | 200 | 그 외 |
| :--- | :--- | :--- |
| `/health` | 위 상태 확인 | `503` 문제 있음 |
| `/instances` | 팩토리가 만든 인스턴스 배열 (`limit`, `offset`) | |
| `/jobs?account=0x…` | 그 주소가 의뢰인이거나 수행자인 작업 (`limit`, `offset`) | `400` `account is required` |
| `/active?instance=0x…&evaluator=0x…` | 그 인스턴스·평가자에서 상태가 `Funded` 또는 `Submitted`인 작업 | `400` `instance and evaluator are required` |
| `/jobs/0x인스턴스/작업번호` | 작업 하나 | `404` `job not in the index` |

그 밖의 경로는 `404` `not found`입니다.

`/instances`와 `/jobs`는 `?limit=`(기본·최대 1000)과 `?offset=`으로 나눠 가져올 수 있고, 전체 개수는 응답 헤더 `X-Total-Count`에 있습니다. `/active`는 키퍼가 전부 필요로 하므로 나누지 않습니다.

`INDEXER_API_TOKEN`을 정하면 `/health`를 뺀 모든 경로가 `Authorization: Bearer <토큰>`을 요구하고, 없거나 틀리면 `401`입니다. 바깥에 열 때는 이 값과 프록시를 함께 쓰세요.

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
| `INDEXER_FROM_BLOCK` | Amoy에서는 예 | 이 블록부터 로그를 읽습니다. 새로 배포했다면 새 팩토리의 배포 블록으로 바꿉니다. |
| `INDEXER_STATE_FILE` | 아니오 | 장부와 읽은 위치를 저장할 파일. 비우면 저장하지 않습니다 |
| `INDEXER_CONFIRMATIONS` | 아니오 | 머리보다 이만큼 뒤까지만 읽습니다. Amoy 기본 5, 로컬 0 |
| `INDEXER_API_TOKEN` | 아니오 | 정하면 `/health` 외 조회에 Bearer 토큰이 필요합니다 |

## 테스트

```bash
yarn indexer test
yarn contracts test test/unit/Indexer.test.ts
```

단위 테스트는 이벤트를 장부로 접고 `GET /jobs/:instance/:id`와 `GET /active`가 그 장부를 내는지 봅니다. Hardhat 테스트는 예치 후 제출한 작업을 동기화하면 `Submitted`이고, 완료 뒤에는 `Completed`이며 활성 목록에서 빠지는지 봅니다. 새 테스트는 요청 실패 뒤 재시도에서 이벤트를 두 번 세지 않는지, 구간 안에서 알려진 인스턴스의 이벤트를 놓치지 않는지, 확정 깊이, 재시작 복원, 페이지 나누기, 토큰, 상태 확인을 봅니다. 공개 호스트는 아직 없고, 결제 링크 앱(#27)이 이 조회를 붙입니다.

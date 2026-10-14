# @opus/relayer

서명이 끝난 `OpusForwarder` 요청을 받아 가스 지갑으로 `execute`를 보내는 HTTP 서비스입니다. 이슈 #25.

의뢰인과 수행자는 POL 없이 서명만 합니다. 가스는 이 프로세스의 지갑이 냅니다. 호출 대상은 주소 파일의 인스턴스, 팩토리, 평가자이고, `value`는 0입니다. 예치가 필요하면 인스턴스의 `fundWithPermit`을 서명합니다.

## 지갑

`RELAYER_PRIVATE_KEY`의 핫 월렛입니다. 배포자 주소와 같으면 시작을 거부합니다. 의뢰인·수행자 Ledger 지갑과 키퍼 지갑을 여기 넣지 않습니다. 이 주소에만 POL을 둡니다. 잔고는 운영자가 감당하는 가스 한도입니다.

키 파일은 `packages/relayer/env/.env`입니다. `**/env/.env`는 gitignore입니다.

## 실행

저장소 루트에서 합니다. `yarn relayer start`의 작업 디렉터리는 `packages/relayer`입니다. 프로세스는 `env/.env`를 직접 열지 않습니다. 샘플의 `RELAYER_INTEGRATORS`는 셸이 읽도록 작은따옴표로 감싸 두었습니다.

```bash
cp packages/relayer/env/.env.sample packages/relayer/env/.env
# 키, DEPLOYER_ADDRESS, 연동사 token 을 채운다.

set -a
source packages/relayer/env/.env
set +a
yarn relayer start
```

데몬은 패키지 `env/.env`를 쓰지 않습니다. `config/relayer.env.sample`을 `config/relayer.env`로 복사해 키를 채웁니다. 주소 파일은 `config/addresses.json`, 제재 목록은 `config/sanctions.txt`이고, Compose가 둘을 `/config`에 붙입니다. 키는 이미지에 들어가지 않습니다. 태그는 커밋 해시 12자이고, 호스트에는 `127.0.0.1:8787`만 엽니다. `restart: unless-stopped`라서 프로세스가 죽거나 호스트가 재부팅되어도 다시 뜹니다. `docker-build.sh`를 실행하려면 `docker login`이 되어 있어야 합니다.

```bash
docker compose up -d --build relayer
docker compose logs -f relayer
docker compose stop relayer
```

레지스트리에 올릴 때는 `packages/relayer/docker-build.sh`입니다. `linux/amd64`와 `linux/arm64`를 함께 올리려면 `packages/relayer/docker-buildx.sh`입니다.

셸로 직접 띄우면 기본 바인딩은 `127.0.0.1:8787`입니다. 기동하면 지갑 주소, 네트워크, RPC, 컨트랙트 주소, `listening 127.0.0.1:8787`을 표준 출력에 찍습니다. 개인키와 연동사 토큰은 찍지 않습니다.

`RELAYER_SANCTIONS_FILE`이 없으면 시작하지 않습니다. 샘플 `env/sanctions.txt`는 주석뿐이라 모든 서명자를 중계합니다. 운영 목록은 적용할 제재 주소이고, 한 줄에 주소 하나, `#`으로 시작하는 줄은 무시합니다. 주소가 아닌 줄이 있으면 시작이 실패합니다.

## 토큰 없는 연동사 (모바일 앱용)

앱에는 비밀 토큰을 넣을 수 없습니다(앱을 풀어 보면 꺼낼 수 있음). 그래서 `"public": true` 연동사는 토큰 없이 요청을 받되, **사람(서명 주소)별 한도가 필수**입니다.

-   `signer.maxRequests` / `windowSeconds`: 한 서명 주소가 창 안에서 보낼 수 있는 횟수.
-   `signer.gasWei`: 한 서명 주소가 창 안에서 쓸 수 있는 가스(wei).
-   서명 주소는 전달자가 서명을 확인(`verify`)한 **뒤에** 센다. 남의 주소를 `from`에 써서 그 사람의 몫을 소진시킬 수 없다.
-   주소는 공짜로 만들 수 있으므로, 최악의 손실은 연동사의 `budgetWei`로 막는다. 처음에는 작게 잡고 소진 경보(모니터링)를 받는다.
-   `token`이 있는 연동사는 그대로 토큰이 필요하다. 토큰이 비어 있다고 통과하지 않는다.

## HTTP

`GET /health` → 가스 지갑 잔고와 노드 응답을 보고 `200` `{"ok":true,"rpc":true,"wallet":"0x…","balanceWei":"…","lowBalance":false}`. 노드가 응답하지 않거나 잔고가 `RELAYER_MIN_BALANCE_WEI` 이하이면 `503`입니다. 답은 10초 동안 재사용해서 감시가 노드를 몰아세우지 않습니다. 잔고가 바닥나기 전에 알림을 받는 용도로 감시 서비스에 등록하세요.

`GET /metrics` → Prometheus가 읽는 지표입니다. `opus_relayer_up`, 노드 응답, 가스 지갑 잔고와 최소 잔고(POL), 통합 서비스별 가스 예산의 남은 양과 총량, 통합 서비스·HTTP 상태별 요청 횟수와 처리 시간을 줍니다. 토큰은 지표에 나오지 않습니다. 이 서버는 외부에도 열릴 수 있으니 프록시에서 `/metrics`는 내부 망에서만 닿게 하세요.

`POST /relay`

헤더 `Authorization: Bearer <연동사 token>`과 `Content-Type: application/json`.

```json
{
    "integratorId": "errands",
    "request": {
        "from": "0x의뢰인",
        "to": "0x인스턴스",
        "value": "0",
        "gas": "200000",
        "deadline": 1893456000,
        "data": "0x호출데이터",
        "signature": "0x서명"
    }
}
```

`request`는 SDK `signForwardRequest`가 만든 값입니다. nonce는 서명한 뒤 체인에서 읽으므로 본문에 없습니다. `from`은 서명한 지갑과 같아야 합니다. `value`, `gas`는 정수 문자열로 보내면 안전합니다.

성공은 `200` `{"hash":"0x…"}`입니다. 릴레이어가 거절하면 `400` `{"error":"…"}`입니다. 그 밖의 전송 실패는 `500`입니다.

거절 문구:

| 조건                                                               | `error`                                                                              |
| :----------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| id나 토큰이 다름                                                   | `The integrator is not allowed to relay`                                             |
| `value`가 0이 아님                                                 | `The relayer does not forward native value`                                          |
| `to`가 인스턴스·팩토리·평가자가 아님                               | `The call target is not a known OPUS contract`                                       |
| `from`이 제재 목록에 있음                                          | `The signer is on the sanctions list`                                                |
| 시간창 안의 횟수를 넘김                                            | `The integrator rate limit is spent`                                                 |
| 전달자 `verify` 실패                                               | `The forwarder rejected the signature`                                               |
| 가스 예산이 모자람                                                 | `The integrator budget is spent`                                                     |
| 전달된 호출이 되돌아옴                                             | `The forwarded call reverted`                                                        |
| 한 요청이 `RELAYER_MAX_GAS`(기본 1,500,000)보다 많은 가스를 요구함 | `The request asks for more gas than the relayer allows`                              |
| 서명의 `deadline`이 지남                                           | `The forward request has expired`                                                    |
| 본문이 JSON이 아니거나 필드가 잘못됨                               | `The request body is not valid JSON`, `The forward request has a bad …` (모두 `400`) |

그 밖의 상태: 본문이 64KB보다 크면 `413`. 가스 지갑이 바닥이면 `503` `The relayer is out of gas funds`. 트랜잭션은 보냈지만 `RELAYER_RECEIPT_TIMEOUT_MS`(기본 120초) 안에 블록에 들어가지 않으면 `504`와 `hash`를 줍니다. 나중에 들어갈 수 있으므로 가스 예산은 그대로 잡아 둡니다. `500`은 내부 사유를 응답에 싣지 않고 로그에만 남깁니다.

## 서명 승인(permit) 전달: `POST /permit`

USDC 같은 서명 승인(EIP-2612 `permit`)을 지원하는 토큰은 **승인**을 서명만으로 할 수 있고, `permit`은 누가 보내도 됩니다. 토큰은 전달자를 믿지 않아서 `approve`를 `/relay`로 보낼 수 없지만, 서명한 `permit`은 이 가스 지갑이 토큰에 직접 보낼 수 있습니다. 서명자는 POL 없이 에스크로에 USDC 사용을 승인합니다. 예: 의뢰인이 `object`(추가금을 가져감) 전에 승인.

헤더와 연동사 규칙은 `/relay`와 같습니다.

```json
{
    "integratorId": "errands",
    "permit": {
        "owner": "0x서명한 지갑",
        "spender": "0x인스턴스, 팩토리 또는 평가자",
        "value": "4000000",
        "deadline": 1893456000,
        "v": 27,
        "r": "0x…",
        "s": "0x…"
    }
}
```

성공은 `200` `{"hash":"0x…"}`입니다. 받는 곳은 주소 파일의 USDC 하나이고, `spender`는 주소 파일의 인스턴스·팩토리·평가자만 됩니다. 금액은 `RELAYER_MAX_PERMIT_VALUE`(기본 1,000 USDC, 토큰 단위)까지, 유효 시간은 지금부터 `RELAYER_MAX_PERMIT_SECONDS`(기본 3600)까지입니다. 토큰이 서명을 받아들이지 않으면(서명 오류, 이미 쓴 nonce) 가스를 잡기 전에 거절합니다. 연동사 예산·횟수·서명자 한도는 `/relay`와 같이 셉니다.

| 조건                                    | `error`                                                 |
| :-------------------------------------- | :------------------------------------------------------ |
| `spender`가 알려진 OPUS 컨트랙트가 아님 | `The permit spender is not a known OPUS contract`       |
| 금액이 0                                | `The permit opens nothing`                              |
| 금액이 한도를 넘음                      | `The permit opens more than the relayer allows`         |
| `deadline`이 지남                       | `The permit has expired`                                |
| `deadline`이 너무 멂                    | `The permit stays valid longer than the relayer allows` |
| 토큰이 서명을 거절함                    | `The token rejected the permit`                         |
| 그 밖(연동사, 제재, 횟수, 예산, 본문)   | `/relay`와 같음                                         |

## 운영

-   요청마다 한 줄 JSON 로그를 찍습니다 (`event`, 연동사 id, 서명자, 상태, 걸린 시간, 해시, 사유). 토큰과 키는 없습니다.
-   `RELAYER_STATE_FILE`을 정하면 연동사별 남은 가스 예산을 파일에 보관해, 재시작해도 예산이 다시 가득 차지 않습니다. 설정한 예산보다 큰 값은 쓰지 않습니다.
-   `SIGTERM`/`SIGINT`를 받으면 새 요청을 받지 않고, 진행 중인 요청을 마친 뒤 종료합니다 (30초 안에).
-   느리거나 멈춘 연결은 15초 뒤 끊습니다.

## 한도

`RELAYER_INTEGRATORS`는 연동사 객체의 JSON 배열입니다. 한 명 이상이어야 합니다. 이 숫자는 프로토콜 상수가 아닙니다.

| 필드            | 의미                                                               |
| :-------------- | :----------------------------------------------------------------- |
| `id`            | `integratorId`와 같은 문자열                                       |
| `token`         | Bearer 토큰. 비교는 길이가 같을 때만 상수 시간에 한다              |
| `budgetWei`     | 이 프로세스가 살아 있는 동안 그 연동사가 쓸 수 있는 가스 상한(wei) |
| `maxRequests`   | `windowSeconds` 안의 최대 요청 수. 1 이상의 정수                   |
| `windowSeconds` | 그 창의 길이(초). 1 이상의 정수                                    |

예산은 예상 가스(`estimateGas * gasPrice`)를 먼저 잡고, 영수증의 `gasUsed * effectiveGasPrice`로 정산합니다. 호출이 되돌아가면 실제 가스를 정산합니다. 전송 자체가 실패하면 잡아 둔 예산을 돌려줍니다. 횟수와 예산은 프로세스 메모리에만 있습니다. 재시작하면 초기 예산으로 돌아갑니다.

요청은 한 줄로 처리합니다. nonce는 대기 중인 개수에서 읽고, 성공하면 1을 더합니다. 실패하면 다음 요청이 체인에서 다시 읽습니다.

Amoy(`chainId` 80002)에서는 SDK의 `amoyGasPrice`로 가스 가격을 정합니다. 최신 기본 수수료에 25% 여유와 팁 30 gwei를 더합니다(2026-10-08부터. 그 전의 25 gwei 고정은 기본 수수료가 오르면 거래가 들어가지 않았습니다).

## 환경 변수

| 변수                     | 필수                   | 의미                                             |
| :----------------------- | :--------------------- | :----------------------------------------------- |
| `RELAYER_PRIVATE_KEY`    | 예                     | `0x`와 64자리 hex                                |
| `DEPLOYER_ADDRESS`       | 예, 배포자와 구분할 때 | 키에서 나온 주소와 같으면 시작 거부              |
| `RELAYER_ADDRESSES`      | 예                     | 샘플은 `../contracts/deploy/amoy/addresses.json` |
| `RELAYER_SANCTIONS_FILE` | 예                     | 샘플은 `env/sanctions.txt`                       |
| `RELAYER_INTEGRATORS`    | 예                     | 연동사 JSON 배열                                 |
| `RELAYER_RPC_URL`        | 아니오                 | 비우면 체인 기본 RPC                             |
| `RELAYER_HOST`           | 아니오                 | 비우면 `127.0.0.1`                               |
| `RELAYER_PORT`           | 아니오                 | 비우면 `8787`                                    |

## 테스트

```bash
yarn relayer test
yarn contracts test test/unit/Relayer.test.ts
```

로컬 Hardhat에서 POL 잔고가 0인 의뢰인과 수행자가 생성, 설정, 예산, `fundWithPermit`, 제출, 승인까지 마칩니다. 대금은 수행자에게 갑니다. Amoy에서 POL이 없는 지갑으로 끝내는 인수 기준은 라이브 실행 후에 남깁니다.

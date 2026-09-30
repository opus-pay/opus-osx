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

기본 바인딩은 `127.0.0.1:8787`입니다. 기동 로그는 `relayer listening on 127.0.0.1:8787`입니다.

`RELAYER_SANCTIONS_FILE`이 없으면 시작하지 않습니다. 샘플 `env/sanctions.txt`는 주석뿐이라 모든 서명자를 중계합니다. 운영 목록은 적용할 제재 주소이고, 한 줄에 주소 하나, `#`으로 시작하는 줄은 무시합니다. 주소가 아닌 줄이 있으면 시작이 실패합니다.

## HTTP

`GET /health` → `200` `{"ok":true}`

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

| 조건 | `error` |
| :--- | :--- |
| id나 토큰이 다름 | `The integrator is not allowed to relay` |
| `value`가 0이 아님 | `The relayer does not forward native value` |
| `to`가 인스턴스·팩토리·평가자가 아님 | `The call target is not a known OPUS contract` |
| `from`이 제재 목록에 있음 | `The signer is on the sanctions list` |
| 시간창 안의 횟수를 넘김 | `The integrator rate limit is spent` |
| 전달자 `verify` 실패 | `The forwarder rejected the signature` |
| 가스 예산이 모자람 | `The integrator budget is spent` |
| 전달된 호출이 되돌아옴 | `The forwarded call reverted` |

## 한도

`RELAYER_INTEGRATORS`는 연동사 객체의 JSON 배열입니다. 한 명 이상이어야 합니다. 이 숫자는 프로토콜 상수가 아닙니다.

| 필드 | 의미 |
| :--- | :--- |
| `id` | `integratorId`와 같은 문자열 |
| `token` | Bearer 토큰. 비교는 길이가 같을 때만 상수 시간에 한다 |
| `budgetWei` | 이 프로세스가 살아 있는 동안 그 연동사가 쓸 수 있는 가스 상한(wei) |
| `maxRequests` | `windowSeconds` 안의 최대 요청 수. 1 이상의 정수 |
| `windowSeconds` | 그 창의 길이(초). 1 이상의 정수 |

예산은 예상 가스(`estimateGas * gasPrice`)를 먼저 잡고, 영수증의 `gasUsed * effectiveGasPrice`로 정산합니다. 호출이 되돌아가면 실제 가스를 정산합니다. 전송 자체가 실패하면 잡아 둔 예산을 돌려줍니다. 횟수와 예산은 프로세스 메모리에만 있습니다. 재시작하면 초기 예산으로 돌아갑니다.

요청은 한 줄로 처리합니다. nonce는 대기 중인 개수에서 읽고, 성공하면 1을 더합니다. 실패하면 다음 요청이 체인에서 다시 읽습니다.

Amoy(`chainId` 80002)에서는 가스 가격을 25 gwei로 둡니다.

## 환경 변수

| 변수 | 필수 | 의미 |
| :--- | :--- | :--- |
| `RELAYER_PRIVATE_KEY` | 예 | `0x`와 64자리 hex |
| `DEPLOYER_ADDRESS` | 예, 배포자와 구분할 때 | 키에서 나온 주소와 같으면 시작 거부 |
| `RELAYER_ADDRESSES` | 예 | 샘플은 `../contracts/deploy/amoy/addresses.json` |
| `RELAYER_SANCTIONS_FILE` | 예 | 샘플은 `env/sanctions.txt` |
| `RELAYER_INTEGRATORS` | 예 | 연동사 JSON 배열 |
| `RELAYER_RPC_URL` | 아니오 | 비우면 체인 기본 RPC |
| `RELAYER_HOST` | 아니오 | 비우면 `127.0.0.1` |
| `RELAYER_PORT` | 아니오 | 비우면 `8787` |

## 테스트

```bash
yarn relayer test
yarn contracts test test/unit/Relayer.test.ts
```

로컬 Hardhat에서 POL 잔고가 0인 의뢰인과 수행자가 생성, 설정, 예산, `fundWithPermit`, 제출, 승인까지 마칩니다. 대금은 수행자에게 갑니다. Amoy에서 POL이 없는 지갑으로 끝내는 인수 기준은 라이브 실행 후에 남깁니다.

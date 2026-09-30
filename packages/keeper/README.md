# @opus/keeper

기한이 된 평가자 처리를 호출하고 팁을 받는 프로세스입니다. 이슈 #24.

매 주기마다 인스턴스의 작업을 읽고, SDK `Opus.status`가 이 지갑에게 허용한 기한 처리만 보냅니다. Amoy 가스 가격 바닥(25 gwei)은 SDK 전송 경로에 있습니다.

## 지갑

`KEEPER_PRIVATE_KEY`의 핫 월렛입니다. 배포자 주소와 같으면 시작을 거부합니다. 의뢰인·수행자 Ledger 지갑의 키를 이 파일에 넣지 않습니다. Amoy에서는 이 주소에 호출 몇 번을 낼 POL이 있어야 합니다. 샘플의 잔고 경고는 0.05 POL입니다.

키 파일은 `packages/keeper/env/.env`입니다. `**/env/.env`는 gitignore입니다.

## 실행

저장소 루트에서 합니다. `yarn keeper start`의 작업 디렉터리는 `packages/keeper`이고, 샘플의 주소 파일 경로는 그 기준입니다. 프로세스는 `env/.env`를 직접 열지 않으므로 셸이 변수를 넘깁니다.

```bash
cp packages/keeper/env/.env.sample packages/keeper/env/.env
# env/.env 에 키와 DEPLOYER_ADDRESS 를 채운다.

set -a
source packages/keeper/env/.env
set +a
yarn keeper start
```

성공한 호출은 표준 출력에 `finalize job 1 0x…` 형태로 찍힙니다. 동작 이름은 `timeoutNoSubmission`, `finalize`, `escalateOnSilence`, `resolveMissingDeposit`, `resolveByDefault`입니다.

평가자 주소가 주소 파일의 `evaluator`와 다른 작업은 건너뜁니다.

## 한 주기

기본 간격은 30초(`KEEPER_POLL_MS`)입니다.

1. 지갑 POL 잔고가 `KEEPER_LOW_BALANCE_WEI`보다 작으면 표준 오류에 JSON 경고를 찍습니다. 종류는 `low-balance`이고 `balance`, `minimum`이 있습니다. 잔고가 낮아도 호출은 계속 시도합니다.
2. `jobCount`까지 작업을 순서대로 봅니다.
3. 상태가 `Funded` 또는 `Submitted`이고 `expiredAt`까지 남은 시간이 여유 이하이면 `near-expiry` 경고를 찍습니다. `jobId`, `expiredAt`, `now`가 있습니다. `KEEPER_EXPIRY_MARGIN_SECONDS`가 비어 있으면 여유는 3600초입니다.
4. `Opus.status`가 돌려준 동작 가운데 기한 처리만 전송합니다. 영수증이 성공이면 그 해시를 출력합니다.

전송이 네트워크에서 실패하면 1초, 2초, 4초를 두고 최대 4번 다시 시도합니다. 컨트랙트가 상태나 기한으로 거절하거나 영수증이 실패하면 그 호출은 다시 보내지 않고, 그 주기의 해당 작업에서 예외로 빠집니다. 다음 주기에서 상태가 여전히 그 호출을 허용하면 다시 시도합니다.

## 환경 변수

| 변수 | 필수 | 의미 |
| :--- | :--- | :--- |
| `KEEPER_PRIVATE_KEY` | 예 | `0x`와 64자리 hex. 프로세스 환경에만 둔다 |
| `DEPLOYER_ADDRESS` | 예, 배포자와 구분할 때 | 키에서 나온 주소와 같으면 시작 거부 |
| `KEEPER_ADDRESSES` | 예 | `addresses.json`. 샘플은 `../contracts/deploy/amoy/addresses.json` |
| `KEEPER_RPC_URL` | 아니오 | 비우면 체인 기본 RPC. `chainId`가 80002이면 Amoy |
| `KEEPER_LOW_BALANCE_WEI` | 아니오 | 경고 기준. 비우면 `50000000000000000` (0.05 POL) |
| `KEEPER_EXPIRY_MARGIN_SECONDS` | 아니오 | 만료 경고 여유. 비우면 3600 |
| `KEEPER_POLL_MS` | 아니오 | 주기. 비우면 30000 |

## 테스트

```bash
yarn keeper test
```

로컬 Hardhat에서 침묵한 제출은 `finalize`로 완료되고, 제출 기한을 넘긴 작업은 `timeoutNoSubmission`으로 거절됩니다. 팁은 이 지갑이 받습니다. Amoy 트랜잭션 해시와 이슈 #16의 수용 기준은 라이브 실행 후에 남깁니다.

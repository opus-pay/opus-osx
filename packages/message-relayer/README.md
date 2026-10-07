# @opus/message-relayer

OPUS 지갑 앱(`opus-app`)으로 가는 **푸시 중계 서버**입니다. 서비스(WayHand 등)는 지갑 주소와 문구만 보내고, 이 서버가 **Expo 접근 키**와 **지갑 주소 ↔ 기기 토큰** 연결을 보관합니다. 서비스는 기기 토큰도 Expo 키도 갖지 않습니다.

```
서비스 ──서비스 키──▶ 메시지 중계 서버 ──Expo 키──▶ Expo ──▶ 폰(opus-app)
opus-app ──(지갑 서명으로 기기 등록)──▶ 메시지 중계 서버
```

## 왜 이렇게 나눴나

-   서비스는 지갑 주소로 사람을 알아보고, 폰은 기기 토큰으로 알아본다. 둘을 맞추는 표가 필요하고, 그 표를 한곳에 둔다.
-   서비스가 뚫려도 Expo 키와 기기 토큰은 새지 않는다. 서비스가 중계 서버를 건너뛰고 Expo로 직접 보낼 수도 없다.
-   죽은 토큰 정리, 받는 사람별 한도, 서비스별 끄기를 한곳에서 지킨다.
-   **대가:** 이 서버에 "어느 주소가 어느 기기를 쓰는지"가 모인다. 이 서버를 운영하는 쪽이 그 정보를 책임진다. 푸시 문구에는 개인정보를 넣지 않는다(서비스 키 발급 조건으로 요구할 것).

## 서비스 키

서비스 키는 이 서버의 **운영자가 발급**합니다 (SDK가 발급하지 않습니다). 키는 한 번만 보여 주고 서버에는 SHA-256 해시만 둡니다.

```bash
yarn message-relayer keys new wayhand wayhand   # <서비스 id> <미니앱 id>
```

출력된 키는 서비스에 전하고, 출력된 한 줄은 `MESSAGE_RELAYER_SERVICES`에 넣습니다. **서비스 키는 그 서비스의 미니앱 id로만 보낼 수 있습니다.** WayHand 키로 다른 서비스인 척할 수 없습니다.

## 실행

```bash
cp packages/message-relayer/env/.env.sample packages/message-relayer/env/.env
# MESSAGE_RELAYER_SERVICES, EXPO_ACCESS_TOKEN 을 채운다. (env/.env 는 gitignore)
set -a; source packages/message-relayer/env/.env; set +a
yarn message-relayer start
```

기본은 `127.0.0.1:8788`입니다. 공개하려면 HTTPS를 끝내 주는 프록시 뒤에 두고, `MESSAGE_RELAYER_TRUST_PROXY=1`로 호출자 주소를 읽게 합니다. 기기 표는 SQLite 파일 하나(`MESSAGE_RELAYER_DB`)이고 프로세스 하나가 독점합니다. 백업하세요. Node 22.5 이상이 필요합니다.

## HTTP

| 경로               | 누가           | 인증                         | 하는 일                                            |
| :----------------- | :------------- | :--------------------------- | :------------------------------------------------- |
| `POST /v1/push`    | 서비스         | `Authorization: Bearer <키>` | 지갑 주소들(최대 100)에 푸시. 답은 **개수만**      |
| `POST /v1/devices` | 지갑(opus-app) | 지갑 서명 (EIP-191)          | 기기 등록·삭제 (`action`: `register`/`unregister`) |
| `POST /v1/mutes`   | 지갑(opus-app) | 지갑 서명                    | 서비스별 알림 끄기·켜기                            |
| `GET /health`      | 운영           | 없음                         | 살아 있는지, 등록된 기기 수                        |
| `GET /metrics`     | 운영           | 없음 (프록시에서 내부 망만)  | Prometheus 지표                                    |

서명하는 글은 SDK의 `deviceMessage`, `muteMessage`가 만드는 고정 형식이고, 서명은 5분 안에서만 유효합니다. 한 지갑에 기기는 5대까지입니다. 같은 토큰을 다른 지갑이 등록하면 마지막 지갑으로 옮겨 갑니다.

### 저장하는 값과 언어 조회

기기를 등록하면 **기기 토큰, 지갑 주소, 사용자 언어(en·ko·ja·zh), 플랫폼**이 SQLite에 저장됩니다. 서비스는 주소로 언어를 물어 그 언어로 문구를 만들어 보냅니다.

```json
POST /v1/languages   { "to": ["0x지갑주소"] }
→ { "languages": { "0x지갑주소": "ko" } }
```

-   지갑에 기기가 여러 대면 **가장 최근에 등록한 기기의 언어**를 줍니다.
-   등록된 기기가 없거나 그 지갑이 이 서비스를 끈 경우 `null`입니다. 서비스는 `null`인 지갑에는 푸시를 보내지 않으면 됩니다.
-   이 조회도 서비스의 분당 요청 한도에 들어갑니다. 언어와 "기기가 있음"이 서비스에 드러나므로, 키는 서비스 서버에만 둡니다.

### 푸시 요청

```json
{
    "to": ["0x지갑주소"],
    "title": { "en": "New applicant", "ko": "새 지원자" },
    "body": "Open the errand.",
    "path": "/errand/7",
    "payload": { "errandId": 7 }
}
```

`title`과 `body`는 문장 하나이거나 언어별 문장(`en`, `ko`, `ja`, `zh`)입니다. 기기가 등록한 언어에 맞춰 고르고, 없으면 영어입니다. `path`는 서비스 사이트 안의 경로여야 합니다. 답:

```json
{ "accepted": 1, "noDevice": 0, "muted": 0, "limited": 0, "failed": 0 }
```

서비스는 어느 주소가 기기를 가졌는지 알 수 없습니다 (`noDevice`는 개수일 뿐). 한 요청 안에서 잘못된 것이 있으면 아무것도 보내지 않고 400을 돌려줍니다.

## SDK로 쓰기

```ts
// opus-app (지갑 쪽): 기기와 언어를 등록한다. 언어나 토큰이 바뀔 때마다 다시 부른다.
import { registerDevice } from "@opus/sdk";
await registerDevice({ url, signer: account, token: expoPushToken, lang: "ko", platform: "ios" });

// 서비스 서버 (WayHand 등): 지갑마다 언어를 확인해서 그 언어의 문구로 보낸다.
import { MessageRelayerClient } from "@opus/sdk";
const relayer = new MessageRelayerClient({ url, key: process.env.MESSAGE_RELAYER_KEY! });
await relayer.pushLocalized({
    to: [walletAddress],
    message: (lang) => texts[lang], // { title, body }
    path: "/errand/7",
});
```

`unregisterDevice`(기기 삭제)와 `setServiceMuted`(서비스별 끄기)도 같은 방식입니다. 서명하는 쪽(`signer`)은 `address`와 `signMessage({ message })`가 있는 것이면 되고 viem 계정이 맞습니다.

## 한도

운영 값입니다 (`MESSAGE_RELAYER_SERVICES`의 각 줄).

-   `maxRequestsPerMinute`: 서비스 하나가 1분에 보낼 수 있는 요청 수 (초과하면 429).
-   `perWalletPerDay`: 지갑 하나가 한 서비스에서 24시간에 받을 수 있는 푸시 수 (초과하면 `limited`로 세고 보내지 않음).
-   등록·끄기 호출은 호출자 주소당 분당 `MESSAGE_RELAYER_PUBLIC_PER_MINUTE`(기본 30).
-   한도 기록은 메모리에 있어서 재시작하면 초기화됩니다.

## 보관과 삭제 (개인정보)

저장하는 것은 기기 토큰, 지갑 주소, 언어, 플랫폼, **등록 시각, 마지막 푸시 시각**, 그리고 서비스별 끄기뿐입니다. **푸시 문구와 "누구에게 보냈는지"의 기록은 남기지 않습니다** (푸시 시각은 기기마다 하나만 덮어씁니다. 영수증을 기다리는 티켓은 하루가 지나면 지웁니다).

-   **삭제 규칙:** 마지막 활동(등록 또는 서비스가 받아 준 푸시 가운데 늦은 시각)이 `MESSAGE_RELAYER_RETENTION_DAYS`(기본 365일) 넘게 없는 기기를 지우고, 기기가 하나도 남지 않은 지갑의 "끄기" 기록도 지웁니다. 시작할 때와 매일 한 번 돌립니다.
-   앱이 켜질 때마다 기기를 다시 등록하면(`registerDevice`) 쓰는 기기는 지워지지 않습니다.
-   앱을 지웠거나 알림을 끈 기기는 Expo가 "등록 안 됨"이라고 알려 줄 때 바로 지워집니다.
-   지갑 앱이 `unregisterDevice`를 부르면 그 기기는 즉시 삭제됩니다.
-   개인정보 처리방침의 보관 기간 문구는 이 값과 같아야 합니다.

## 영수증

보낸 푸시는 티켓으로 남기고, 15분이 지난 것부터 20분마다 Expo에 영수증을 물어 봅니다. `DeviceNotRegistered`이면 그 기기를 지웁니다. 보낼 때 같은 응답이 오면 바로 지웁니다.

## 지킬 것

-   Expo 접근 키(`EXPO_ACCESS_TOKEN`)와 서비스 키는 서버 설정에만 둡니다. 로그와 `/metrics`에 나오지 않습니다.
-   OPUS는 중립 프로토콜이므로 이 서버는 특정 서비스의 알림 정책을 모릅니다. 서비스가 언제 무엇을 보낼지 정합니다.
-   서버가 멈추면 모든 서비스의 푸시가 멈춥니다. 서비스는 푸시 실패가 본 작업을 막지 않게 만들어야 합니다.
-   아직 없는 것: Docker 이미지와 compose 항목, opus-network 모니터링 연결.

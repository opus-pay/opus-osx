# 모바일 푸시 (SDK)

> **서비스는 Expo에 직접 보내지 않고 메시지 중계 서버(`packages/message-relayer`)를 거칩니다.** 서비스는 지갑 주소와 문구만 보내고(`MessageRelayerClient`), Expo 키와 "주소 ↔ 기기" 표는 중계 서버만 가집니다. 아래의 `sendPush` 등은 중계 서버 안에서 쓰는 부품이고, 서비스가 Expo 키를 갖는 구조가 아닙니다. 서비스는 지갑 주소로 사용자의 언어를 물어(`languages`) 그 언어의 문구로 보내고(`pushLocalized`), 앱은 `registerDevice`로 기기와 언어를 등록합니다. 자세한 것은 [message-relayer README](../packages/message-relayer/README.md).

`@opus/sdk`의 푸시 라이브러리(`packages/sdk/src/push.ts`)는 Expo 푸시 서비스로 알림을 보냅니다. iOS와 Android에 모두 닿고, OPUS 지갑 앱(`opus-pay/opus-app`)이 이 방식으로 등록합니다. 의존성을 추가하지 않고 전역 `fetch`를 씁니다. 서버(키퍼, 서비스 백엔드)에서 쓰는 라이브러리이며 앱 안에 넣지 않습니다.

## 쓰는 법

```ts
import { pushToDevices, getPushReceipts } from "@opus/sdk";

const { results, invalidTokens } = await pushToDevices(
    deviceTokens, // 앱이 등록한 ExponentPushToken[...] 목록
    { title: "증빙이 올라왔어요", body: "확인해 주세요.", route: { app: "wayhand", path: "/errand/123" } },
    { accessToken: process.env.EXPO_ACCESS_TOKEN } // 프로젝트가 요구할 때만
);
// invalidTokens(앱이 지워졌거나 알림을 끈 기기)는 목록에서 지웁니다.

// 15분 이상 지난 뒤 실제로 Apple/Google에 닿았는지 확인합니다.
const ids = results.flatMap((r) => (r.ok ? [r.ticketId] : []));
const receipts = await getPushReceipts(ids);
```

| 함수                              | 하는 일                                                                          |
| :-------------------------------- | :------------------------------------------------------------------------------- |
| `buildPushMessage`                | 토큰·글자 수·경로·크기를 검사하고 Expo가 받는 메시지로 만듭니다 (`PushError`)    |
| `sendPush`                        | 100개씩 나눠 보내고 메시지별 결과를 같은 순서로 돌려줍니다. 429·5xx는 3번 재시도 |
| `pushToDevices`                   | 같은 내용을 여러 기기에 한 번씩 보내고, 지울 토큰을 돌려줍니다                   |
| `getPushReceipts`                 | 영수증을 `delivered`·`failed`·`pending`으로 나눕니다                             |
| `isExpoPushToken`, `isInsidePath` | 토큰 모양, "미니앱 사이트 안의 경로" 검사                                        |

## 메시지의 길(route)

`data`에 `{ app, path?, payload? }`가 들어갑니다. 지갑 앱은 `app`에 맞는 미니앱을 열고, `path`(미니앱 사이트 안의 경로)로 이동하며, `payload`를 전해 줍니다. 앱이 모르는 `app`이면 열지 않고, 다른 사이트로 나가는 경로(`//`, `https://` 등)는 앱이 막습니다. 라이브러리도 같은 규칙으로 먼저 거절합니다.

## 지킬 것

-   **개인정보를 넣지 않습니다.** 알림은 Expo와 Apple·Google을 거칩니다. 제목·본문·payload에 주소, 금액, 이름을 넣지 말고 id만 보낸 뒤 앱이 열린 다음 가져가게 합니다.
-   **토큰과 접근 키는 서버에만 둡니다.** `accessToken`을 앱에 넣지 않습니다.
-   기기 토큰은 앱이 서버에 등록해 줘야 알 수 있습니다. 등록과 저장은 이 라이브러리가 하지 않고 서비스가 맡습니다. 죽은 토큰(`invalidTokens`)은 보낼 때마다 지웁니다.
-   OPUS는 중립 프로토콜이라 이 라이브러리는 특정 서비스의 알림 정책을 모릅니다. 언제 무엇을 알릴지는 서비스가 정합니다.

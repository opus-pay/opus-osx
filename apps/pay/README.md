# @opus/pay 모듈 스펙

결제 링크 앱(#27–#30)이 쓰는 모듈입니다. 버전은 2026-09-30 npm 안정판입니다. 화면 구현 전에 이 범위를 설치합니다.

컨트랙트 호출은 `@opus/sdk`만 거칩니다. 앱은 `packages/contracts` 소스를 import하지 않습니다.

## 런타임

| 모듈                    | 범위       | 하는 일                                                          |
| :---------------------- | :--------- | :--------------------------------------------------------------- |
| `next`                  | `^16.3.7`  | App Router. Node.js 20.9 이상                                    |
| `react`, `react-dom`    | `^19.3.0`  | 화면                                                             |
| `wagmi`                 | `^3.7.7`   | 지갑 연결. 훅은 `"use client"` 컴포넌트 안에서만 호출            |
| `viem`                  | `^2.37.5`  | `@opus/sdk`와 같은 범위. 앱이 다른 2.x 버전을 따로 고정하지 않음 |
| `@tanstack/react-query` | `^5.104.0` | wagmi 피어. `QueryClientProvider`로 감쌈                         |
| `@opus/sdk`             | `0.1.0`    | 작업 생성·설정·예치·제출·상태·EIP-712 서명                       |

`wagmi` 피어는 `viem` 2.x, `react` 18 이상, `typescript` 5.9.3 이상, `@tanstack/react-query` 5 이상입니다.

## 화면

`shadcn`은 실행 의존성이 아닙니다. CLI가 컴포넌트 소스를 `apps/pay` 안에 복사합니다. 스타일은 `new-york`입니다.

| 모듈                       | 범위      | 하는 일          |
| :------------------------- | :-------- | :--------------- |
| `tailwindcss`              | `^4.3.3`  | 스타일. `@theme` |
| `tw-animate-css`           | `^1.4.0`  | 모션             |
| `class-variance-authority` | `^0.7.1`  | 컴포넌트 변형    |
| `clsx`                     | `^2.1.1`  | 클래스 조합      |
| `tailwind-merge`           | `^3.7.0`  | 클래스 충돌 정리 |
| `lucide-react`             | `^1.49.0` | 아이콘           |
| `sonner`                   | `^2.0.8`  | 토스트           |

버튼, 입력, 카드, 라벨은 화면이 필요할 때 CLI로 추가합니다. 주소 표시는 복사된 컴포넌트 위에 앱이 만들고, 주소는 SDK가 체크섬한 값을 씁니다.

## 개발

| 모듈         | 범위    | 하는 일                                                                   |
| :----------- | :------ | :------------------------------------------------------------------------ |
| `typescript` | `5.9.3` | 이 앱의 `tsc`만. 컨트랙트·SDK·키퍼·릴레이어·인덱서는 기존 `^5.4.5`를 유지 |

`apps/pay`의 타입 검사는 이 패키지에 설치된 TypeScript 5.9.3으로 돌립니다.

## 프로세스 경계

지갑이 연결되면 그 계정을 `Opus`의 `WalletClient`로 넘깁니다. 앱 코드는 개인키를 받지 않습니다.

| 프로세스        | 앱이 쓰는 면                                                                                              |
| :-------------- | :-------------------------------------------------------------------------------------------------------- |
| `@opus/sdk`     | 생성, 예산, 설정, `fund` 또는 `fundWithPermit`, 제출, 승인·이의·연장, `status`, 전달자 서명               |
| `@opus/indexer` | `GET /jobs/:instance/:id`, `GET /jobs?account=`, `GET /active?instance=&evaluator=`                       |
| `@opus/relayer` | POL이 없을 때 `POST /relay`. 본문은 SDK `signForwardRequest` 결과. 헤더는 `Authorization: Bearer <token>` |

주소는 `packages/contracts/deploy/<network>/addresses.json`입니다. 파일럿 네트워크는 Polygon Amoy(`chainId` 80002)이고, 이후 대상은 Polygon PoS입니다.

## 링크 초안 (D30)

서명 전 초안은 공유 링크의 URL fragment입니다. 서버는 그 초안을 저장하지 않고, 브라우저는 fragment를 요청에 실어 보내지 않습니다. 체인에는 `descriptionOf`가 만든 설명 해시만 올라갑니다. 링크의 `expiresAt`이 지나면 그 초안으로는 작업을 만들지 않습니다.

알림 채널(D31)은 HTTPS 웹훅이다. 상태 페이지가 기한 안에 들어온 사건을 그 URL로 POST한다. 이메일과 텔레그램은 그 다음이다.

# EVM target (decision D1)

Recorded 2026-09-26. Primary sources are Polygon Improvement Proposals and the official network-upgrade table. The archived note ("Polygon lacks PUSH0, so use `shanghai`") is wrong on both counts: `shanghai` is the fork that **introduced** PUSH0, and Polygon PoS enabled PUSH0 in the Agra hardfork.

## Decision

| Item | Value |
| :--- | :--- |
| `evmVersion` | `cancun` |
| Solidity | `0.8.24` (pinned `pragma`, no `^`) |
| OpenZeppelin Contracts | `5.6.1` |
| Hardhat network `hardfork` | `cancun` |
| Applies to | `@opus/contracts` compiler settings |

`cancun` bytecode is valid on Polygon PoS and Amoy today. Those chains have been past Cancun (Napoli) since 2024 and past Pectra (Bhilai) since 2025.

## Why not `shanghai`

Solidity `shanghai` emits PUSH0 (EIP-3855). Using it does **not** avoid PUSH0. Polygon PoS already executes PUSH0:

* [PIP-23](https://github.com/maticnetwork/Polygon-Improvement-Proposals/blob/main/PIPs/PIP-23.md) (Final, 2023-09-22) activates Ethereum Shanghai features, including EIP-3855 PUSH0, EIP-3651, EIP-3860, and EIP-6049. Beacon withdrawals (EIP-4895) are excluded.
* [PIP-28 Agra](https://github.com/maticnetwork/Polygon-Improvement-Proposals/blob/main/PIPs/PIP-28.md) (Final) includes PIP-23. Activation: Mumbai `41,874,000`; mainnet `50,523,000` (live January 2024).
* Official table: [Network upgrade process](https://docs.polygon.technology/pos/reference/network-upgrade-process/).

`shanghai` would also block Cancun opcodes (`MCOPY`, `TLOAD`/`TSTORE`) that OpenZeppelin 5.x and this repo are allowed to use.

## Why `cancun` (not `prague`)

[PIP-31](https://github.com/maticnetwork/Polygon-Improvement-Proposals/blob/main/PIPs/PIP-31.md) (Final, 2024-01-11) activates the Cancun EVM subset:

| Included | Excluded (no beacon chain / blobs) |
| :--- | :--- |
| EIP-1153 transient storage (`TLOAD`/`TSTORE`) | EIP-4788 beacon root |
| EIP-5656 `MCOPY` | EIP-4844 blobs |
| EIP-6780 `SELFDESTRUCT` same-tx only | EIP-7516 `BLOBBASEFEE` |

[PIP-33 Napoli](https://github.com/maticnetwork/Polygon-Improvement-Proposals/blob/main/PIPs/PIP-33.md) ships PIP-31. Activation: Amoy `5,423,600`; mainnet `54,876,000` (March 2024).

Solidity **0.8.24** is the first solc release that supports `evmVersion: "cancun"`. It does not define `prague`. Polygon later activated a Pectra subset in [PIP-61](https://github.com/maticnetwork/Polygon-Improvement-Proposals/blob/main/PIPs/PIP-61.md) via [PIP-63 Bhilai](https://github.com/maticnetwork/Polygon-Improvement-Proposals/blob/main/PIPs/PIP-63.md) (Amoy `22,765,056`; mainnet `73,440,256`, 2025-07-01). Those additions are precompiles, calldata pricing, and EIP-7702 — not opcodes that 0.8.24 would emit. Compiling to `cancun` stays inside the live instruction set.

Do not raise Solidity or `evmVersion` to Prague/Osaka without a new D1 review.

## OpenZeppelin 5.6.1

Pinned (no caret) so a later 5.x cannot silently pull a compiler requirement this repo has not reviewed.

Confirmed on this target:

* `EIP712` (`pragma ^0.8.24`) — domain separator and EIP-5267 `eip712Domain()`
* `Nonces`
* `ReentrancyGuard`
* `SafeERC20`

The deployed contracts (`OpusAgenticCommerce`, `OptimisticEvaluator`, `OpusACPFactory`, `OpusForwarder`) use these modules, and their unit, conformance and invariant tests exercise them on this target. The early `BootstrapProbe` toolchain check was removed once the real contracts covered it.

## Deploy check

`yarn contracts deploy:amoy` deploys the protocol and records the addresses in `deploy/amoy/deployed_contracts.json`. `yarn contracts check:deploy` checks that address file and that no contract exposes an owner, role or upgrade function.

## Sources

1. PIP-23 Shanghai — https://github.com/maticnetwork/Polygon-Improvement-Proposals/blob/main/PIPs/PIP-23.md
2. PIP-28 Agra — https://github.com/maticnetwork/Polygon-Improvement-Proposals/blob/main/PIPs/PIP-28.md
3. PIP-31 Cancun EIPs — https://github.com/maticnetwork/Polygon-Improvement-Proposals/blob/main/PIPs/PIP-31.md
4. PIP-33 Napoli — https://github.com/maticnetwork/Polygon-Improvement-Proposals/blob/main/PIPs/PIP-33.md
5. PIP-61 Pectra EIPs — https://github.com/maticnetwork/Polygon-Improvement-Proposals/blob/main/PIPs/PIP-61.md
6. PIP-63 Bhilai — https://github.com/maticnetwork/Polygon-Improvement-Proposals/blob/main/PIPs/PIP-63.md
7. Polygon docs, network upgrades — https://docs.polygon.technology/pos/reference/network-upgrade-process/
8. EIP-3855 PUSH0 — https://eips.ethereum.org/EIPS/eip-3855
9. EIP-5656 MCOPY — https://eips.ethereum.org/EIPS/eip-5656
10. EIP-1153 transient storage — https://eips.ethereum.org/EIPS/eip-1153

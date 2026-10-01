# OPUS on Polygon Amoy

OPUS is an ERC-8183 escrow with no administrator and no protocol fee. A client locks USDC for one provider. The provider is paid when the job completes, and the client is refunded when it does not. This page records what already ran on Polygon Amoy, chain id 80002. The operator procedure is `docs/runbooks/AMOY_LIVE_ACCEPTANCE.md`.

Block explorer: [amoy.polygonscan.com](https://amoy.polygonscan.com).

## Contracts

The deployed contracts are immutable for this record. Each address below opens the verified source.

| Contract | Address |
| :--- | :--- |
| Forwarder | [`0x2042172c8b638f1720A1c468726dbd167d62E63f`](https://amoy.polygonscan.com/address/0x2042172c8b638f1720A1c468726dbd167d62E63f#code) |
| Factory | [`0xeafFF7cCe71b66dB91c40d09640ae9ae854707ca`](https://amoy.polygonscan.com/address/0xeafFF7cCe71b66dB91c40d09640ae9ae854707ca#code) |
| USDC instance | [`0x7632d054BfE635A1f0394fbcd74678B6567213Fd`](https://amoy.polygonscan.com/address/0x7632d054BfE635A1f0394fbcd74678B6567213Fd#code) |
| Optimistic evaluator | [`0x65819d9199144a66ec17ad39da6bebabc3eef585`](https://amoy.polygonscan.com/address/0x65819d9199144a66ec17ad39da6bebabc3eef585#code) |
| Circle Amoy USDC | [`0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582`](https://amoy.polygonscan.com/address/0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582) |

## What these jobs show

A non-zero evaluation fee moves when the client calls `configure`, while the job is still `Open`. `fund` locks the budget in the instance and does not move that fee. USDC uses 6 decimals.

| Job | Ending | Budget | Evaluation fee |
| :--- | :--- | :--- | :--- |
| 1. Client approves | `Completed` | 1.00 USDC to the provider | None |
| 2. Expiry refund | `Expired` | 1.00 USDC back to the client | 1.00 USDC back to the client. The keeper did not take it |
| 3. Silent submission | `Completed` | 1.00 USDC to the provider | 0.50 USDC to the operator, 0.50 USDC tip to the keeper |
| 4. No submission | `Rejected` | 1.00 USDC back to the client | 0.50 USDC to the operator, 0.50 USDC tip to the keeper |

The keeper that sent jobs 3 and 4 is [`0x87775F236D38526f48F702EE36FD195c75882cBc`](https://amoy.polygonscan.com/address/0x87775F236D38526f48F702EE36FD195c75882cBc). The deployer is [`0x88dDAc5963D578cb62Cf1e6515127d9485aa9Fba`](https://amoy.polygonscan.com/address/0x88dDAc5963D578cb62Cf1e6515127d9485aa9Fba).

## Where the USDC went

| Movement | Log | Transaction |
| :--- | :--- | :--- |
| Job 1: 1.00 USDC from the instance to the provider | `PaymentReleased` | [`0x9fb80d76…4c954f9c`](https://amoy.polygonscan.com/tx/0x9fb80d767d49a15db8cdab089a4afcc3a9a43274b1ad4b775471f3064c954f9c#eventlog) |
| Job 2: 1.00 USDC from the client to the evaluator at `configure` | `Transfer` | [`0xfb663371…705ac7ea`](https://amoy.polygonscan.com/tx/0xfb66337163c5d92fa8f2fee7ada7138e9148ed49bc56415beb85061a705ac7ea#eventlog) |
| Job 2: 1.00 USDC from the client to the instance at `fund` | `JobFunded` | [`0x527252d8…7fac9746`](https://amoy.polygonscan.com/tx/0x527252d85a65ed1df4443db139257871a210873553f63508806b705b7fac9746#eventlog) |
| Job 2: 1.00 USDC from the instance to the client | `Refunded` | [`0x993153c5…790dcc1e`](https://amoy.polygonscan.com/tx/0x993153c5925677aa09201f46cafa0fa43913641cd9eadfaebbae616a790dcc1e#eventlog) |
| Job 2: 1.00 USDC from the evaluator to the client | `Swept` | [`0x0725df71…83d63ad4`](https://amoy.polygonscan.com/tx/0x0725df716b5d395412ac5d102a066caeaf8e6be30eb9a678eb4eb9ae83d63ad4#eventlog) |
| Job 3: 0.50 tip to the keeper, 0.50 fee to the operator, 1.00 budget to the provider | `TipPaid`, `FeePaid`, `PaymentReleased` | [`0x93a058e0…dbec7335`](https://amoy.polygonscan.com/tx/0x93a058e01f2f9ac447e0fd22a2ccc2eca9ae8dd2e557c1fc9668088fdbec7335#eventlog) |
| Job 4: 0.50 tip to the keeper, 0.50 fee to the operator, 1.00 budget to the client | `TipPaid`, `FeePaid`, `Refunded` | [`0xab783631…7a6991ea`](https://amoy.polygonscan.com/tx/0xab783631acdb531036eae59bcfb11b0e7e2129f24a08c1c94c54c56b7a6991ea#eventlog) |

## Job 1. The client approves

The provider submitted and the client approved. The provider received the budget. There was no evaluation fee.

| Step | Transaction |
| :--- | :--- |
| createJob | [`0x069f81554874b63e4e599537dda0e3959bbbfc3a5cfc8e87ed14f3c7ca82d14d`](https://amoy.polygonscan.com/tx/0x069f81554874b63e4e599537dda0e3959bbbfc3a5cfc8e87ed14f3c7ca82d14d) |
| configure | [`0xca64f3e128cb902d1a55fa32732b4d3fce1c3b13a22f1887ce201ff30f6defdd`](https://amoy.polygonscan.com/tx/0xca64f3e128cb902d1a55fa32732b4d3fce1c3b13a22f1887ce201ff30f6defdd) |
| quote | [`0xed9164458acf936b72b2afaf40f2f907b5a4c2622eaa2559c8667b2ddfaaf8a1`](https://amoy.polygonscan.com/tx/0xed9164458acf936b72b2afaf40f2f907b5a4c2622eaa2559c8667b2ddfaaf8a1) |
| fund | [`0xa7142b8dacdede06df163d03863694e27091744d6dcdbb4c018ce63517610467`](https://amoy.polygonscan.com/tx/0xa7142b8dacdede06df163d03863694e27091744d6dcdbb4c018ce63517610467) |
| submit | [`0xbb89fc9ec436928def56f276708983fa01c053eb2b0f9d47bc87efc86b1771cf`](https://amoy.polygonscan.com/tx/0xbb89fc9ec436928def56f276708983fa01c053eb2b0f9d47bc87efc86b1771cf) |
| approve | [`0x9fb80d767d49a15db8cdab089a4afcc3a9a43274b1ad4b775471f3064c954f9c`](https://amoy.polygonscan.com/tx/0x9fb80d767d49a15db8cdab089a4afcc3a9a43274b1ad4b775471f3064c954f9c) |

## Job 2. Expiry returns the fee

The provider never submitted. After expiry the client took the budget back and swept the unused evaluation fee. `configure` had already moved that fee to the evaluator.

| Step | Transaction |
| :--- | :--- |
| createJob | [`0xe4a2c4f2e68968d83401d734352956de3f68ca45f61f28ff608fecc36b3196dd`](https://amoy.polygonscan.com/tx/0xe4a2c4f2e68968d83401d734352956de3f68ca45f61f28ff608fecc36b3196dd) |
| configure | [`0xfb66337163c5d92fa8f2fee7ada7138e9148ed49bc56415beb85061a705ac7ea`](https://amoy.polygonscan.com/tx/0xfb66337163c5d92fa8f2fee7ada7138e9148ed49bc56415beb85061a705ac7ea) |
| fund | [`0x527252d85a65ed1df4443db139257871a210873553f63508806b705b7fac9746`](https://amoy.polygonscan.com/tx/0x527252d85a65ed1df4443db139257871a210873553f63508806b705b7fac9746) |
| claimRefund | [`0x993153c5925677aa09201f46cafa0fa43913641cd9eadfaebbae616a790dcc1e`](https://amoy.polygonscan.com/tx/0x993153c5925677aa09201f46cafa0fa43913641cd9eadfaebbae616a790dcc1e) |
| sweep | [`0x0725df716b5d395412ac5d102a066caeaf8e6be30eb9a678eb4eb9ae83d63ad4`](https://amoy.polygonscan.com/tx/0x0725df716b5d395412ac5d102a066caeaf8e6be30eb9a678eb4eb9ae83d63ad4) |

## Job 3. A keeper completes a silent submission

The provider submitted. Nobody reviewed. A keeper that is not the deployer called `finalize`. The provider was paid, and the tip came out of the evaluation fee.

| Step | Transaction |
| :--- | :--- |
| createJob | [`0x80e0b0a9e852b93115bc5c2c871fde6a85b57c4979fc17e7e584ecef14ed0e0a`](https://amoy.polygonscan.com/tx/0x80e0b0a9e852b93115bc5c2c871fde6a85b57c4979fc17e7e584ecef14ed0e0a) |
| configure | [`0xae1e0ac0f0609e7dbdfe8bdd7f42ad5df7ece969ba08e42f47f3d93a04975d34`](https://amoy.polygonscan.com/tx/0xae1e0ac0f0609e7dbdfe8bdd7f42ad5df7ece969ba08e42f47f3d93a04975d34) |
| fund | [`0x99d2c9f625911754b351c198ae0c4572dc3fb15d22402bbaca8c17deb1036e03`](https://amoy.polygonscan.com/tx/0x99d2c9f625911754b351c198ae0c4572dc3fb15d22402bbaca8c17deb1036e03) |
| submit | [`0xb72db09f86abd8dce1f554de4e636127c1b019d94f07cf41191d271536c78118`](https://amoy.polygonscan.com/tx/0xb72db09f86abd8dce1f554de4e636127c1b019d94f07cf41191d271536c78118) |
| finalize | [`0x93a058e01f2f9ac447e0fd22a2ccc2eca9ae8dd2e557c1fc9668088fdbec7335`](https://amoy.polygonscan.com/tx/0x93a058e01f2f9ac447e0fd22a2ccc2eca9ae8dd2e557c1fc9668088fdbec7335) |

## Job 4. A keeper rejects a job with no submission

The provider never submitted. The same keeper called `timeoutNoSubmission`. The budget returned to the client. The tip again came out of the evaluation fee.

| Step | Transaction |
| :--- | :--- |
| createJob | [`0x5e8bb10744f334abdb61f5ba0fe61ae938fd8ffd764a50d2fd00caad21693bef`](https://amoy.polygonscan.com/tx/0x5e8bb10744f334abdb61f5ba0fe61ae938fd8ffd764a50d2fd00caad21693bef) |
| configure | [`0x503d32138cfb690873f17a2b549fbb58430ee23a394c55fb0e09ca0e167b4b40`](https://amoy.polygonscan.com/tx/0x503d32138cfb690873f17a2b549fbb58430ee23a394c55fb0e09ca0e167b4b40) |
| fund | [`0x97e866a4da9cb314c8775e23bf28d2134ce28eced7d3a3ceca59a0a1ca552cb4`](https://amoy.polygonscan.com/tx/0x97e866a4da9cb314c8775e23bf28d2134ce28eced7d3a3ceca59a0a1ca552cb4) |
| timeoutNoSubmission | [`0xab783631acdb531036eae59bcfb11b0e7e2129f24a08c1c94c54c56b7a6991ea`](https://amoy.polygonscan.com/tx/0xab783631acdb531036eae59bcfb11b0e7e2129f24a08c1c94c54c56b7a6991ea) |

## Not yet recorded on Amoy

Three demonstrations are still open. Their hashes will be added here after they are sent.

| Demonstration | What it will show |
| :--- | :--- |
| Gasless payment | A client and a provider who hold no POL finish a job. A relayer pays the gas. |
| Shared payment link | Two wallets finish one job from one link. One run is quoted by the client, and one run is quoted by the provider. |
| Dispute | The client objects, both sides post a deposit, and an arbiter rules. |

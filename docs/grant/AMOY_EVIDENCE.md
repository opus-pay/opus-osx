# OPUS on Polygon Amoy

OPUS is an ERC-8183 escrow with no administrator and no protocol fee. A client locks USDC for one provider. The provider is paid when the job completes, and the client is refunded when it does not. This page records what already ran on Polygon Amoy, chain id 80002. The operator procedure is `docs/runbooks/AMOY_LIVE_ACCEPTANCE.md`.

Block explorer: [amoy.polygonscan.com](https://amoy.polygonscan.com).

Steps are numbered 1–8 in this record. The job number is the id the chain gave the job. Step 6 is on-chain job 7, because on-chain job 6 was a rehearsal of the same payment-link run. Step 8 is on-chain job 10; job 9 was an unfunded attempt (see step 8).

## Contracts

The deployed contracts are immutable for this record. Each address below opens the verified source.

| Contract | Address |
| :--- | :--- |
| Forwarder | [`0x2042172c8b638f1720A1c468726dbd167d62E63f`](https://amoy.polygonscan.com/address/0x2042172c8b638f1720A1c468726dbd167d62E63f#code) |
| Factory | [`0xeafFF7cCe71b66dB91c40d09640ae9ae854707ca`](https://amoy.polygonscan.com/address/0xeafFF7cCe71b66dB91c40d09640ae9ae854707ca#code) |
| USDC instance | [`0x7632d054BfE635A1f0394fbcd74678B6567213Fd`](https://amoy.polygonscan.com/address/0x7632d054BfE635A1f0394fbcd74678B6567213Fd#code) |
| Optimistic evaluator | [`0x65819d9199144a66ec17ad39da6bebabc3eef585`](https://amoy.polygonscan.com/address/0x65819d9199144a66ec17ad39da6bebabc3eef585#code) |
| Circle Amoy USDC | [`0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582`](https://amoy.polygonscan.com/address/0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582) |

Every step on this page ran on the contracts above, which predate the 2026-10-03 security fixes. On 2026-10-08 the current source was deployed: it closes the fake-instance drain, fixes dispute timing, caps the evaluation fee at 20% of the budget (it was 100%), sets the safety margin to one day, and caps each job at 100 USD until the external audit. New work uses the second deployment; this record keeps the first.

| Contract (second deployment, 2026-10-08) | Address |
| :--- | :--- |
| Forwarder | [`0xD1172323dc6B5C39f8F015C0C3ada071079c830C`](https://amoy.polygonscan.com/address/0xD1172323dc6B5C39f8F015C0C3ada071079c830C#code) |
| Factory | [`0x8Cae2EBe1b3D13e3EAf9Fc765a577dc30c6a5218`](https://amoy.polygonscan.com/address/0x8Cae2EBe1b3D13e3EAf9Fc765a577dc30c6a5218#code) |
| USDC instance | [`0x4D54D2BD919024742070c63878903483d456d3fC`](https://amoy.polygonscan.com/address/0x4D54D2BD919024742070c63878903483d456d3fC#code) |
| Optimistic evaluator | [`0x8A4a02D544145ed668b059A7A1753E1f4470da3B`](https://amoy.polygonscan.com/address/0x8A4a02D544145ed668b059A7A1753E1f4470da3B#code) |

## What these steps show

A non-zero evaluation fee moves when the client calls `configure`, while the job is still `Open`. `fund` locks the budget in the instance and does not move that fee. USDC uses 6 decimals.

| Step | On-chain job | Ending | Budget | Evaluation fee |
| :--- | :--- | :--- | :--- | :--- |
| 1. Client approves | 1 | `Completed` | 1.00 USDC to the provider | None |
| 2. Expiry refund | 2 | `Expired` | 1.00 USDC back to the client | 1.00 USDC back to the client. The keeper did not take it |
| 3. Silent submission | 3 | `Completed` | 1.00 USDC to the provider | 0.50 USDC to the operator, 0.50 USDC tip to the keeper |
| 4. No submission | 4 | `Rejected` | 1.00 USDC back to the client | 0.50 USDC to the operator, 0.50 USDC tip to the keeper |
| 5. Gasless payment | 5 | `Completed` | 1.00 USDC to the provider | None. The signing wallets held no POL |
| 6. Shared payment link | 7 | `Completed` | 5.00 USDC to the provider | None |
| 7. Dispute | 8 | `Rejected` | 1.00 USDC back to the client | None. Deposits: the client's 0.10 back to the client, the provider's 0.10 to the arbiter |
| 8. Provider's link | 10 | `Completed` | 5.00 USDC to the provider | None |

The keeper that sent steps 3 and 4 is [`0x87775F236D38526f48F702EE36FD195c75882cBc`](https://amoy.polygonscan.com/address/0x87775F236D38526f48F702EE36FD195c75882cBc). The deployer is [`0x88dDAc5963D578cb62Cf1e6515127d9485aa9Fba`](https://amoy.polygonscan.com/address/0x88dDAc5963D578cb62Cf1e6515127d9485aa9Fba).

## Where the USDC went

| Movement | Log | Transaction |
| :--- | :--- | :--- |
| Step 1 (job 1): 1.00 USDC from the instance to the provider | `PaymentReleased` | [`0x9fb80d76…4c954f9c`](https://amoy.polygonscan.com/tx/0x9fb80d767d49a15db8cdab089a4afcc3a9a43274b1ad4b775471f3064c954f9c#eventlog) |
| Step 2 (job 2): 1.00 USDC from the client to the evaluator at `configure` | `Transfer` | [`0xfb663371…705ac7ea`](https://amoy.polygonscan.com/tx/0xfb66337163c5d92fa8f2fee7ada7138e9148ed49bc56415beb85061a705ac7ea#eventlog) |
| Step 2 (job 2): 1.00 USDC from the client to the instance at `fund` | `JobFunded` | [`0x527252d8…7fac9746`](https://amoy.polygonscan.com/tx/0x527252d85a65ed1df4443db139257871a210873553f63508806b705b7fac9746#eventlog) |
| Step 2 (job 2): 1.00 USDC from the instance to the client | `Refunded` | [`0x993153c5…790dcc1e`](https://amoy.polygonscan.com/tx/0x993153c5925677aa09201f46cafa0fa43913641cd9eadfaebbae616a790dcc1e#eventlog) |
| Step 2 (job 2): 1.00 USDC from the evaluator to the client | `Swept` | [`0x0725df71…83d63ad4`](https://amoy.polygonscan.com/tx/0x0725df716b5d395412ac5d102a066caeaf8e6be30eb9a678eb4eb9ae83d63ad4#eventlog) |
| Step 3 (job 3): 0.50 tip to the keeper, 0.50 fee to the operator, 1.00 budget to the provider | `TipPaid`, `FeePaid`, `PaymentReleased` | [`0x93a058e0…dbec7335`](https://amoy.polygonscan.com/tx/0x93a058e01f2f9ac447e0fd22a2ccc2eca9ae8dd2e557c1fc9668088fdbec7335#eventlog) |
| Step 4 (job 4): 0.50 tip to the keeper, 0.50 fee to the operator, 1.00 budget to the client | `TipPaid`, `FeePaid`, `Refunded` | [`0xab783631…7a6991ea`](https://amoy.polygonscan.com/tx/0xab783631acdb531036eae59bcfb11b0e7e2129f24a08c1c94c54c56b7a6991ea#eventlog) |
| Step 5 (job 5): 1.00 USDC from the instance to the provider. The client and provider signed only | `PaymentReleased` | [`0x983c81d0…a45264b7`](https://amoy.polygonscan.com/tx/0x983c81d0b76f26f13c964e31d03755a8f5a1ce06e07644bc5a6ebf73a45264b7#eventlog) |
| Step 6 (job 7): 5.00 USDC from the client to the instance at `fundWithPermit` | `JobFunded` | [`0x240ff0c2…b705537e`](https://amoy.polygonscan.com/tx/0x240ff0c20f66fb14be4bb5d07578f077d35676c0948b5a4269936471b705537e#eventlog) |
| Step 6 (job 7): 5.00 USDC from the instance to the provider | `PaymentReleased` | [`0x5f732701…f78849ef`](https://amoy.polygonscan.com/tx/0x5f7327017ea1e4efe49b812e82d54f9819b0ea39703106e2eca1d15cf78849ef#eventlog) |
| Step 7 (job 8): 0.10 USDC deposit from the client to the evaluator at `configure` | `Transfer` | [`0xebf42fde…2b2581cc`](https://amoy.polygonscan.com/tx/0xebf42fdefe9463ad8983f2871fafa6f6f93608df7a7173f1545ed8292b2581cc#eventlog) |
| Step 7 (job 8): 1.00 USDC from the client to the instance at `fund` | `JobFunded` | [`0xfbbd3bf3…16ef8f3c`](https://amoy.polygonscan.com/tx/0xfbbd3bf3e9111e9c2c1369275b8225e5d397cd899999c3e1b9ca5c8516ef8f3c#eventlog) |
| Step 7 (job 8): 0.10 USDC deposit from the provider to the evaluator | `DepositPosted` | [`0x8c959271…039a7246`](https://amoy.polygonscan.com/tx/0x8c95927118d74253390649bf4b9dc177da7810c4630c339a8c95e6a2039a7246#eventlog) |
| Step 7 (job 8): 1.00 budget and 0.10 deposit to the client, 0.10 deposit to the arbiter | `Ruled`, `Refunded` | [`0xd0d90bd8…13ee16bf`](https://amoy.polygonscan.com/tx/0xd0d90bd8a54f4ea9dd79c76f0b5890ac0b0606315ed96eeb6ac2245c13ee16bf#eventlog) |
| Step 8 (job 10): 5.00 USDC from the client to the instance at `fundWithPermit` | `JobFunded` | [`0xd2191b97…97984790`](https://amoy.polygonscan.com/tx/0xd2191b97ad51e748a3795258205974636e34af9bfb1cbcf1d7da18f497984790#eventlog) |
| Step 8 (job 10): 5.00 USDC from the instance to the provider | `PaymentReleased` | [`0x7402ada7…296f8e9e`](https://amoy.polygonscan.com/tx/0x7402ada71d04c4152da4dbaf98344f4a1bdac184997c5cfce4c41214296f8e9e#eventlog) |

## Step 1. The client approves

On-chain job: **1**

The provider submitted and the client approved. The provider received the budget. There was no evaluation fee.

| Call | Transaction |
| :--- | :--- |
| createJob | [`0x069f81554874b63e4e599537dda0e3959bbbfc3a5cfc8e87ed14f3c7ca82d14d`](https://amoy.polygonscan.com/tx/0x069f81554874b63e4e599537dda0e3959bbbfc3a5cfc8e87ed14f3c7ca82d14d) |
| configure | [`0xca64f3e128cb902d1a55fa32732b4d3fce1c3b13a22f1887ce201ff30f6defdd`](https://amoy.polygonscan.com/tx/0xca64f3e128cb902d1a55fa32732b4d3fce1c3b13a22f1887ce201ff30f6defdd) |
| quote | [`0xed9164458acf936b72b2afaf40f2f907b5a4c2622eaa2559c8667b2ddfaaf8a1`](https://amoy.polygonscan.com/tx/0xed9164458acf936b72b2afaf40f2f907b5a4c2622eaa2559c8667b2ddfaaf8a1) |
| fund | [`0xa7142b8dacdede06df163d03863694e27091744d6dcdbb4c018ce63517610467`](https://amoy.polygonscan.com/tx/0xa7142b8dacdede06df163d03863694e27091744d6dcdbb4c018ce63517610467) |
| submit | [`0xbb89fc9ec436928def56f276708983fa01c053eb2b0f9d47bc87efc86b1771cf`](https://amoy.polygonscan.com/tx/0xbb89fc9ec436928def56f276708983fa01c053eb2b0f9d47bc87efc86b1771cf) |
| approve | [`0x9fb80d767d49a15db8cdab089a4afcc3a9a43274b1ad4b775471f3064c954f9c`](https://amoy.polygonscan.com/tx/0x9fb80d767d49a15db8cdab089a4afcc3a9a43274b1ad4b775471f3064c954f9c) |

## Step 2. Expiry returns the fee

On-chain job: **2**

The provider never submitted. After expiry the client took the budget back and swept the unused evaluation fee. `configure` had already moved that fee to the evaluator.

| Call | Transaction |
| :--- | :--- |
| createJob | [`0xe4a2c4f2e68968d83401d734352956de3f68ca45f61f28ff608fecc36b3196dd`](https://amoy.polygonscan.com/tx/0xe4a2c4f2e68968d83401d734352956de3f68ca45f61f28ff608fecc36b3196dd) |
| configure | [`0xfb66337163c5d92fa8f2fee7ada7138e9148ed49bc56415beb85061a705ac7ea`](https://amoy.polygonscan.com/tx/0xfb66337163c5d92fa8f2fee7ada7138e9148ed49bc56415beb85061a705ac7ea) |
| fund | [`0x527252d85a65ed1df4443db139257871a210873553f63508806b705b7fac9746`](https://amoy.polygonscan.com/tx/0x527252d85a65ed1df4443db139257871a210873553f63508806b705b7fac9746) |
| claimRefund | [`0x993153c5925677aa09201f46cafa0fa43913641cd9eadfaebbae616a790dcc1e`](https://amoy.polygonscan.com/tx/0x993153c5925677aa09201f46cafa0fa43913641cd9eadfaebbae616a790dcc1e) |
| sweep | [`0x0725df716b5d395412ac5d102a066caeaf8e6be30eb9a678eb4eb9ae83d63ad4`](https://amoy.polygonscan.com/tx/0x0725df716b5d395412ac5d102a066caeaf8e6be30eb9a678eb4eb9ae83d63ad4) |

## Step 3. A keeper completes a silent submission

On-chain job: **3**

The provider submitted. Nobody reviewed. A keeper that is not the deployer called `finalize`. The provider was paid, and the tip came out of the evaluation fee.

| Call | Transaction |
| :--- | :--- |
| createJob | [`0x80e0b0a9e852b93115bc5c2c871fde6a85b57c4979fc17e7e584ecef14ed0e0a`](https://amoy.polygonscan.com/tx/0x80e0b0a9e852b93115bc5c2c871fde6a85b57c4979fc17e7e584ecef14ed0e0a) |
| configure | [`0xae1e0ac0f0609e7dbdfe8bdd7f42ad5df7ece969ba08e42f47f3d93a04975d34`](https://amoy.polygonscan.com/tx/0xae1e0ac0f0609e7dbdfe8bdd7f42ad5df7ece969ba08e42f47f3d93a04975d34) |
| fund | [`0x99d2c9f625911754b351c198ae0c4572dc3fb15d22402bbaca8c17deb1036e03`](https://amoy.polygonscan.com/tx/0x99d2c9f625911754b351c198ae0c4572dc3fb15d22402bbaca8c17deb1036e03) |
| submit | [`0xb72db09f86abd8dce1f554de4e636127c1b019d94f07cf41191d271536c78118`](https://amoy.polygonscan.com/tx/0xb72db09f86abd8dce1f554de4e636127c1b019d94f07cf41191d271536c78118) |
| finalize | [`0x93a058e01f2f9ac447e0fd22a2ccc2eca9ae8dd2e557c1fc9668088fdbec7335`](https://amoy.polygonscan.com/tx/0x93a058e01f2f9ac447e0fd22a2ccc2eca9ae8dd2e557c1fc9668088fdbec7335) |

## Step 4. A keeper rejects a job with no submission

On-chain job: **4**

The provider never submitted. The same keeper called `timeoutNoSubmission`. The budget returned to the client. The tip again came out of the evaluation fee.

| Call | Transaction |
| :--- | :--- |
| createJob | [`0x5e8bb10744f334abdb61f5ba0fe61ae938fd8ffd764a50d2fd00caad21693bef`](https://amoy.polygonscan.com/tx/0x5e8bb10744f334abdb61f5ba0fe61ae938fd8ffd764a50d2fd00caad21693bef) |
| configure | [`0x503d32138cfb690873f17a2b549fbb58430ee23a394c55fb0e09ca0e167b4b40`](https://amoy.polygonscan.com/tx/0x503d32138cfb690873f17a2b549fbb58430ee23a394c55fb0e09ca0e167b4b40) |
| fund | [`0x97e866a4da9cb314c8775e23bf28d2134ce28eced7d3a3ceca59a0a1ca552cb4`](https://amoy.polygonscan.com/tx/0x97e866a4da9cb314c8775e23bf28d2134ce28eced7d3a3ceca59a0a1ca552cb4) |
| timeoutNoSubmission | [`0xab783631acdb531036eae59bcfb11b0e7e2129f24a08c1c94c54c56b7a6991ea`](https://amoy.polygonscan.com/tx/0xab783631acdb531036eae59bcfb11b0e7e2129f24a08c1c94c54c56b7a6991ea) |

## Step 5. A wallet with no POL finishes the job

On-chain job: **5**

The client [`0xF304B61b7889B3B11D9F074e049Ee022AcC8830e`](https://amoy.polygonscan.com/address/0xF304B61b7889B3B11D9F074e049Ee022AcC8830e) and the provider [`0xA84a2dC2Da35f79fF315F377Ae99b8ac3DcE87a3`](https://amoy.polygonscan.com/address/0xA84a2dC2Da35f79fF315F377Ae99b8ac3DcE87a3) held no POL. They signed. The relayer [`0x942fa17cf26b6b0CbEA6A11141007501fe064577`](https://amoy.polygonscan.com/address/0x942fa17cf26b6b0CbEA6A11141007501fe064577) paid the gas. The provider received 1.00 USDC.

| Call | Transaction |
| :--- | :--- |
| createJob | [`0x2e174752817f82b9b4396e2908e46b8343464c4c10d5395b0206bc7e2582ae99`](https://amoy.polygonscan.com/tx/0x2e174752817f82b9b4396e2908e46b8343464c4c10d5395b0206bc7e2582ae99) |
| configure | [`0x9c6af37508c3a91422abaa652c6ef5fe7f7b099d38b4ab9efe72475cc33d164e`](https://amoy.polygonscan.com/tx/0x9c6af37508c3a91422abaa652c6ef5fe7f7b099d38b4ab9efe72475cc33d164e) |
| setBudget | [`0x6803a9f2f1d2944137f6b85a34767ffa284db5137cadb2b3f6e6ebfd89a6c926`](https://amoy.polygonscan.com/tx/0x6803a9f2f1d2944137f6b85a34767ffa284db5137cadb2b3f6e6ebfd89a6c926) |
| fundWithPermit | [`0x7b094a18da620c192b778c9faa518face0e7eec10a0ccf472c1bc9a1b50eb03a`](https://amoy.polygonscan.com/tx/0x7b094a18da620c192b778c9faa518face0e7eec10a0ccf472c1bc9a1b50eb03a) |
| submit | [`0xf307c382a673baf4a03ac97b897432b16a49f681084405c7e0f09b7673905694`](https://amoy.polygonscan.com/tx/0xf307c382a673baf4a03ac97b897432b16a49f681084405c7e0f09b7673905694) |
| approve | [`0x983c81d0b76f26f13c964e31d03755a8f5a1ce06e07644bc5a6ebf73a45264b7`](https://amoy.polygonscan.com/tx/0x983c81d0b76f26f13c964e31d03755a8f5a1ce06e07644bc5a6ebf73a45264b7) |

## Step 6. Two wallets finish a job from one payment link

On-chain job: **7**

The client filled in the payment link form in the OPUS pay app and sent the link. The terms travel in the link after `#`, so they never reach a server. The client opened the link, read the terms and signed each call from that page, which opened on-chain job 7. The provider attached the deliverable file and submitted its hash. The client approved, and the provider received the full 5.00 USDC. No evaluation fee was charged.

| Term | Value |
| :--- | :--- |
| Client | [`0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0`](https://amoy.polygonscan.com/address/0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0) |
| Provider | [`0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be`](https://amoy.polygonscan.com/address/0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be) |
| Budget | 5.00 USDC, set by the client before the review rules |
| Review rules | `smallNoArbiter`: paid automatically 1 hour after submission. This preset has no arbiter, so an objection resolves to the default, which is payment |
| Agreement | "Deliver a text file whose contents are exactly: Amoy client quote." |
| Deliverable | [`AmoyClientQuote.txt`](AmoyClientQuote.txt), keccak256 `0x52baa0e5f62955a6f6412081035036f5a0bd99d235d0c3ebd20ff30f6a1dd770` |

| Call | Signer | Time (UTC, 2026-10-01) | Transaction |
| :--- | :--- | :--- | :--- |
| createJob | Client | 12:34:50 | [`0x27235c1f3fb657500e3cca9aeaca05eaabcec30fca2386e787de42fe93dc696c`](https://amoy.polygonscan.com/tx/0x27235c1f3fb657500e3cca9aeaca05eaabcec30fca2386e787de42fe93dc696c) |
| quote (`setBudget`) | Client | 12:35:09 | [`0x82c6ccc4034b89d7eb51a65e5f58810ef0dd0d176ceba133f6e582fdf65ffc45`](https://amoy.polygonscan.com/tx/0x82c6ccc4034b89d7eb51a65e5f58810ef0dd0d176ceba133f6e582fdf65ffc45) |
| configure | Client | 12:35:25 | [`0x71c97b09cba1312d631a7c1a0ad4d4a954935e48a8fc37d7bf9e750f42d9ba3a`](https://amoy.polygonscan.com/tx/0x71c97b09cba1312d631a7c1a0ad4d4a954935e48a8fc37d7bf9e750f42d9ba3a) |
| fundWithPermit | Client | 12:36:16 | [`0x240ff0c20f66fb14be4bb5d07578f077d35676c0948b5a4269936471b705537e`](https://amoy.polygonscan.com/tx/0x240ff0c20f66fb14be4bb5d07578f077d35676c0948b5a4269936471b705537e) |
| submit | Provider | 12:37:09 | [`0x0f08a15e4a432eb1e2957f89990fc20838c1968f0851a5deb4b09b0d1c7593ef`](https://amoy.polygonscan.com/tx/0x0f08a15e4a432eb1e2957f89990fc20838c1968f0851a5deb4b09b0d1c7593ef) |
| approve | Client | 12:37:54 | [`0x5f7327017ea1e4efe49b812e82d54f9819b0ea39703106e2eca1d15cf78849ef`](https://amoy.polygonscan.com/tx/0x5f7327017ea1e4efe49b812e82d54f9819b0ea39703106e2eca1d15cf78849ef) |

The USDC allowance for `fundWithPermit` is an off-chain permit signature, so it has no transaction of its own. The `submit` input carries job id 7 and the deliverable hash above, which is the keccak256 of `AmoyClientQuote.txt`. The whole run took three minutes. The client paid 0.0243955 POL in gas over five transactions and the provider 0.0022593 POL, each under one US cent at any POL price below USD 0.37.

Known wallet display issue: the evaluator's `approve(address,uint256)` has the same function selector (`0x095ea7b3`) as the ERC-20 and ERC-721 `approve`. MetaMask therefore showed the client's approval as a token permission request. The call itself is correct, and the funds moved as shown above. Renaming the function is planned before mainnet, and the rename needs a new deployment.

## Step 7. An arbiter decides a dispute

On-chain job: **8**

The job used `presetPersonToAny`: no evaluation fee, a 0.10 USDC dispute deposit from each side, and an arbiter that is neither the client nor the provider. The client's deposit was taken at `configure`. After the provider submitted, the client objected. The provider posted its deposit, which sent the case to the arbiter. The arbiter ruled for the client: the client got the 1.00 USDC budget and its own deposit back, and the provider's deposit paid the arbiter. The run was sent by `packages/contracts/scripts/amoyDispute.ts` on 2026-10-03, with the keeper stopped.

| Term | Value |
| :--- | :--- |
| Client | [`0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0`](https://amoy.polygonscan.com/address/0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0) |
| Provider | [`0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be`](https://amoy.polygonscan.com/address/0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be) |
| Arbiter | [`0x31923881A21A28254b2330cd41084Cafe0a64644`](https://amoy.polygonscan.com/address/0x31923881A21A28254b2330cd41084Cafe0a64644) |
| Budget | 1.00 USDC |
| Dispute deposit | 0.10 USDC from each side |
| Ruling | Reject: refund the client |

| Call | Signer | Transaction |
| :--- | :--- | :--- |
| createJob | Client | [`0x443bf6e36aae848b80f0af630e804dd513574a9dc0e64172baeaa2a00aac3d60`](https://amoy.polygonscan.com/tx/0x443bf6e36aae848b80f0af630e804dd513574a9dc0e64172baeaa2a00aac3d60) |
| setBudget | Client | [`0x3cabe093b044aabe7c19b336a51933bd06cc15702d44a029e44f20ec667009ae`](https://amoy.polygonscan.com/tx/0x3cabe093b044aabe7c19b336a51933bd06cc15702d44a029e44f20ec667009ae) |
| USDC approve (deposit) | Client | [`0x013604cb2e9327a46c111f9d15ab05fff17e5c350314c9abdc2fae2a0f4bc42b`](https://amoy.polygonscan.com/tx/0x013604cb2e9327a46c111f9d15ab05fff17e5c350314c9abdc2fae2a0f4bc42b) |
| configure | Client | [`0xebf42fdefe9463ad8983f2871fafa6f6f93608df7a7173f1545ed8292b2581cc`](https://amoy.polygonscan.com/tx/0xebf42fdefe9463ad8983f2871fafa6f6f93608df7a7173f1545ed8292b2581cc) |
| USDC approve (budget) | Client | [`0x160fc5f24b0d049abbf9cbe649b034182d72257678871b722c708c6c546e1c36`](https://amoy.polygonscan.com/tx/0x160fc5f24b0d049abbf9cbe649b034182d72257678871b722c708c6c546e1c36) |
| fund | Client | [`0xfbbd3bf3e9111e9c2c1369275b8225e5d397cd899999c3e1b9ca5c8516ef8f3c`](https://amoy.polygonscan.com/tx/0xfbbd3bf3e9111e9c2c1369275b8225e5d397cd899999c3e1b9ca5c8516ef8f3c) |
| submit | Provider | [`0xe82aa1c5e38637d8f4794ec01723c6d1ca7bc4119f359ca079b129faf73638ae`](https://amoy.polygonscan.com/tx/0xe82aa1c5e38637d8f4794ec01723c6d1ca7bc4119f359ca079b129faf73638ae) |
| object | Client | [`0xbdcbd92358286ea922fa1b651434bd31ce9c3a02d94b04870d0d6902b0443a4d`](https://amoy.polygonscan.com/tx/0xbdcbd92358286ea922fa1b651434bd31ce9c3a02d94b04870d0d6902b0443a4d) |
| USDC approve (deposit) | Provider | [`0xfd155148c38673ae8c50357c9ed86042c8e083b28f3709c0f207c68d5db8d742`](https://amoy.polygonscan.com/tx/0xfd155148c38673ae8c50357c9ed86042c8e083b28f3709c0f207c68d5db8d742) |
| postDeposit | Provider | [`0x8c95927118d74253390649bf4b9dc177da7810c4630c339a8c95e6a2039a7246`](https://amoy.polygonscan.com/tx/0x8c95927118d74253390649bf4b9dc177da7810c4630c339a8c95e6a2039a7246) |
| rule | Arbiter | [`0xd0d90bd8a54f4ea9dd79c76f0b5890ac0b0606315ed96eeb6ac2245c13ee16bf`](https://amoy.polygonscan.com/tx/0xd0d90bd8a54f4ea9dd79c76f0b5890ac0b0606315ed96eeb6ac2245c13ee16bf) |

USDC after the ruling: the client's balance was back where it started, the provider had 0.10 less, and the arbiter held 0.10.

## Step 8. The provider's link, funded by the client

On-chain job: **10**

The provider filled in the payment link form and sent the link to the client. The client opened it in another wallet, read the terms and signed each call, which opened on-chain job 10. The provider submitted the deliverable file, and the client approved. The provider received the full 5.00 USDC, and no evaluation fee was charged. This run is the [demo video](https://www.youtube.com/watch?v=bbnYn5qXpR4).

The link used the default amount rule, "Client, before the review rules are set": the amount is fixed in the link, so the client's wallet sends `setBudget`. The other rule, where the provider sets the price on chain after `configure`, is listed under "Not yet recorded" below.

| Term | Value |
| :--- | :--- |
| Client | [`0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0`](https://amoy.polygonscan.com/address/0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0) |
| Provider | [`0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be`](https://amoy.polygonscan.com/address/0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be) |
| Link created by | The provider |
| Budget | 5.00 USDC |
| Review rules | `smallNoArbiter`: paid automatically 1 hour after submission. This preset has no arbiter, so an objection resolves to the default, which is payment |
| Deliverable | [`AmoyClientQuote.txt`](AmoyClientQuote.txt), keccak256 `0x52baa0e5f62955a6f6412081035036f5a0bd99d235d0c3ebd20ff30f6a1dd770` |

| Call | Signer | Time (UTC, 2026-10-03) | Transaction |
| :--- | :--- | :--- | :--- |
| createJob | Client | 02:03:12 | [`0x23d836b16ad4e7a99903d88f6b00cfd82844007126548d10028278954fa4a461`](https://amoy.polygonscan.com/tx/0x23d836b16ad4e7a99903d88f6b00cfd82844007126548d10028278954fa4a461) |
| quote (`setBudget`) | Client | 02:03:32 | [`0xca7b7f713518ebb09c025042d1d5e6efe0755bb3c8060b07414cda587e4fad7f`](https://amoy.polygonscan.com/tx/0xca7b7f713518ebb09c025042d1d5e6efe0755bb3c8060b07414cda587e4fad7f) |
| configure | Client | 02:03:48 | [`0xf3d581797c9a54cea927b1f611792d447f17ab8ac57924fd95837c29153aeefc`](https://amoy.polygonscan.com/tx/0xf3d581797c9a54cea927b1f611792d447f17ab8ac57924fd95837c29153aeefc) |
| fundWithPermit | Client | 02:04:16 | [`0xd2191b97ad51e748a3795258205974636e34af9bfb1cbcf1d7da18f497984790`](https://amoy.polygonscan.com/tx/0xd2191b97ad51e748a3795258205974636e34af9bfb1cbcf1d7da18f497984790) |
| submit | Provider | 02:05:27 | [`0x0ab0e58a40e4f2bb9385311b8de8b8a8453d6ceda84fbbb6df8953d0e692ece1`](https://amoy.polygonscan.com/tx/0x0ab0e58a40e4f2bb9385311b8de8b8a8453d6ceda84fbbb6df8953d0e692ece1) |
| approve | Client | 02:06:04 | [`0x7402ada71d04c4152da4dbaf98344f4a1bdac184997c5cfce4c41214296f8e9e`](https://amoy.polygonscan.com/tx/0x7402ada71d04c4152da4dbaf98344f4a1bdac184997c5cfce4c41214296f8e9e) |

The whole run took under three minutes. Gas was the same as in step 6: 0.0243955 POL for the client's five transactions and 0.0022593 POL for the provider's one, at 25 gwei. On-chain job 9, about 20 minutes earlier (01:42–01:43 UTC), was opened by the same link flow and stopped after `configure` when a public RPC endpoint failed a read. It was never funded, so no USDC moved, and it expires unused.

## Second deployment (2026-10-08)

The contracts listed under "second deployment" above were deployed on 2026-10-08 from the current source, after the 2026-10-03 security fixes. Every run below used them. Budgets are 1.00 USDC. The evaluation fee is 0.20 USDC (the cap is now 20% of the budget) and the keeper tip is 0.10 USDC. Gas was priced from the base fee: about 69 gwei while the base fee was about 31 gwei.

| Flow | On-chain job | Ending | Where the USDC went |
| :--- | :--- | :--- | :--- |
| Client approves | 1 | `Completed` | 1.00 to the provider. No fee |
| Silent submission, keeper finalizes | 4 | `Completed` | 1.00 to the provider. Fee: 0.10 tip to the keeper, 0.10 to the operator |
| No submission, keeper times out | 5 | `Rejected` | 1.00 back to the client. Fee: 0.10 tip to the keeper, 0.10 to the operator |
| Gasless payment through the relayer | 6 | `Completed` | 1.00 to the zero-POL provider. Both signing wallets still hold 0 POL |
| Expiry refund and fee sweep, no keeper | 7 | `Funded`, expires 2026-10-09 03:55 UTC | Pending: `claimRefund` and `sweep` after expiry |
| Dispute decided by an arbiter | — | Not run yet | — |

Two attempts did not reach their ending. Both are kept:

* **Job 2** was configured with the old 1.00 USDC fee. The 20% cap refuses that at `fund`, so the client rejected the job while it was `Open` and swept the fee back.
* **Job 3** was the first expiry-refund try. When the keeper ran for jobs 4 and 5, job 3's submit window had also closed, so the keeper timed it out: the client got 1.00 back and the 0.20 fee went to the operator. The submit window always ends before expiry, so the client's own `claimRefund` happens only when no keeper acts. Job 7 repeats the flow with every keeper stopped.

### Job 1. Client approves

| Step | Signer | Transaction |
| :--- | :--- | :--- |
| `createJob` | Client (Ledger) | [`0x258bfc33c270a147405e264cfde28efa25cf9cd31c945d8b52d591a55706504c`](https://amoy.polygonscan.com/tx/0x258bfc33c270a147405e264cfde28efa25cf9cd31c945d8b52d591a55706504c) |
| `configure` | Client (Ledger) | [`0xc3266b0f11323a913aebb1695f7b163324eaaf7c60dba8108e1a7a080ce2aaad`](https://amoy.polygonscan.com/tx/0xc3266b0f11323a913aebb1695f7b163324eaaf7c60dba8108e1a7a080ce2aaad) |
| `quote` | Client (Ledger) | [`0xed2d9b978840ca3513d40fe98dc739bcd4bfad6b078b9901a8db99991cea765a`](https://amoy.polygonscan.com/tx/0xed2d9b978840ca3513d40fe98dc739bcd4bfad6b078b9901a8db99991cea765a) |
| `approveBudget` | Client (Ledger) | [`0x1f1800c629e3c0d67cc9146d16ba5588e36299f5ddb850b67157f8e9e6750d6c`](https://amoy.polygonscan.com/tx/0x1f1800c629e3c0d67cc9146d16ba5588e36299f5ddb850b67157f8e9e6750d6c) |
| `fund` | Client (Ledger) | [`0x7074d310f35c616c7242962a34a59c24d50b6a9f23fc79517e69742a69a1ab90`](https://amoy.polygonscan.com/tx/0x7074d310f35c616c7242962a34a59c24d50b6a9f23fc79517e69742a69a1ab90) |
| `submit` | Provider (Ledger) | [`0x5c85a545060735fd29e30b4e6c8f79254dabcd6187a630f3e1d874e29699277a`](https://amoy.polygonscan.com/tx/0x5c85a545060735fd29e30b4e6c8f79254dabcd6187a630f3e1d874e29699277a) |
| `approve` | Client (Ledger) | [`0xc152c3ed04b909f3d7c1506622b57966514d3c7721e637e10d27853c9d402b26`](https://amoy.polygonscan.com/tx/0xc152c3ed04b909f3d7c1506622b57966514d3c7721e637e10d27853c9d402b26) |

### Job 4. A keeper completes a silent submission

| Step | Signer | Transaction |
| :--- | :--- | :--- |
| `createJob` | Client (Ledger) | [`0xb8cd700841b694936470f7b62fc2d1af55d54b83e1df6001994e2ff77a4adf57`](https://amoy.polygonscan.com/tx/0xb8cd700841b694936470f7b62fc2d1af55d54b83e1df6001994e2ff77a4adf57) |
| `approveEvaluation` | Client (Ledger) | [`0x90811a72a98b961b0e9c41e1893071d41b899916745bb595e4fce38b358675cc`](https://amoy.polygonscan.com/tx/0x90811a72a98b961b0e9c41e1893071d41b899916745bb595e4fce38b358675cc) |
| `configure` | Client (Ledger) | [`0xfb1d5a462de1f23d07cf7e1dfa4235b6296073ab03e483e64a71628551331e7c`](https://amoy.polygonscan.com/tx/0xfb1d5a462de1f23d07cf7e1dfa4235b6296073ab03e483e64a71628551331e7c) |
| `quote` | Client (Ledger) | [`0x8b0d6d354e3f021908940ed59106eb6d9e471ebdce329a74dd0b42c09b3858fe`](https://amoy.polygonscan.com/tx/0x8b0d6d354e3f021908940ed59106eb6d9e471ebdce329a74dd0b42c09b3858fe) |
| `approveBudget` | Client (Ledger) | [`0x5b0087dc828ec4fa1dc8a6f2247165e65813fc17f64b528f4afcc98c35b1d105`](https://amoy.polygonscan.com/tx/0x5b0087dc828ec4fa1dc8a6f2247165e65813fc17f64b528f4afcc98c35b1d105) |
| `fund` | Client (Ledger) | [`0xff60138949e7b2a2d2dd6aabad0992eaad99ba6e6da4a1f18f434d7d81acc338`](https://amoy.polygonscan.com/tx/0xff60138949e7b2a2d2dd6aabad0992eaad99ba6e6da4a1f18f434d7d81acc338) |
| `submit` | Provider (Ledger) | [`0xb0d5c2aac9f43133abd133746a65cbfb29e95da342bdbabcc2abbd1514d60743`](https://amoy.polygonscan.com/tx/0xb0d5c2aac9f43133abd133746a65cbfb29e95da342bdbabcc2abbd1514d60743) |
| `finalize` | Keeper | [`0xeef77db320237b0cb64b164e80ce1757563ce9ee1d143a2ebe82af74796292b1`](https://amoy.polygonscan.com/tx/0xeef77db320237b0cb64b164e80ce1757563ce9ee1d143a2ebe82af74796292b1) |

### Job 5. A keeper rejects a job with no submission

| Step | Signer | Transaction |
| :--- | :--- | :--- |
| `createJob` | Client (Ledger) | [`0x71f4caa6579d9d02f6d42aeca9f74a223631b7cd69065845d5352c7f4eaa8f8b`](https://amoy.polygonscan.com/tx/0x71f4caa6579d9d02f6d42aeca9f74a223631b7cd69065845d5352c7f4eaa8f8b) |
| `approveEvaluation` | Client (Ledger) | [`0x0b5ec15bbf7b416d1466aff22f109222fe926ae1e3cae01928ea1a1269841e97`](https://amoy.polygonscan.com/tx/0x0b5ec15bbf7b416d1466aff22f109222fe926ae1e3cae01928ea1a1269841e97) |
| `configure` | Client (Ledger) | [`0xe10a7a43dda65144b0dbf6b0d2b42b73f443ff00c390e5823df185ba2e6bb0c7`](https://amoy.polygonscan.com/tx/0xe10a7a43dda65144b0dbf6b0d2b42b73f443ff00c390e5823df185ba2e6bb0c7) |
| `quote` | Client (Ledger) | [`0xa9c8e7f7712bbbd45434caa502cd9e37351eaa0fbde70bdd96dda66650cfac32`](https://amoy.polygonscan.com/tx/0xa9c8e7f7712bbbd45434caa502cd9e37351eaa0fbde70bdd96dda66650cfac32) |
| `approveBudget` | Client (Ledger) | [`0xc725e4176079ea69e9b94574fab602920fc3466115b9edf2a21768b232d62b00`](https://amoy.polygonscan.com/tx/0xc725e4176079ea69e9b94574fab602920fc3466115b9edf2a21768b232d62b00) |
| `fund` | Client (Ledger) | [`0x144add430b5945691b315412a32e195ebcd67c5db1cb54f707b3f260e117139d`](https://amoy.polygonscan.com/tx/0x144add430b5945691b315412a32e195ebcd67c5db1cb54f707b3f260e117139d) |
| `timeoutNoSubmission` | Keeper | [`0x5ca01057a799b8f545ed2b65af0f6fd2702919066d1d84777013c77a869c4b98`](https://amoy.polygonscan.com/tx/0x5ca01057a799b8f545ed2b65af0f6fd2702919066d1d84777013c77a869c4b98) |

### Job 6. Wallets with no POL finish a job through the relayer

The relayer wallet [`0x942fa17cf26b6b0CbEA6A11141007501fe064577`](https://amoy.polygonscan.com/address/0x942fa17cf26b6b0CbEA6A11141007501fe064577) sent each transaction to the forwarder and paid the gas.

| Step | Signer | Transaction |
| :--- | :--- | :--- |
| `createJob` | Zero-POL client, relayed | [`0x0fe2601a94429e6ec9f25e891b2827e1b1856cd22cbd452267e0dcf73f9ffd7a`](https://amoy.polygonscan.com/tx/0x0fe2601a94429e6ec9f25e891b2827e1b1856cd22cbd452267e0dcf73f9ffd7a) |
| `configure` | Zero-POL client, relayed | [`0xb9981c5bdb8cff67261dfc58aa51fc51f291d18c076260bc8312a09b16fd2458`](https://amoy.polygonscan.com/tx/0xb9981c5bdb8cff67261dfc58aa51fc51f291d18c076260bc8312a09b16fd2458) |
| `setBudget` | Zero-POL client, relayed | [`0x441ced4b8a89c0ca018a0c2f366b1fda6d78b9f049301678d639a1b93b504370`](https://amoy.polygonscan.com/tx/0x441ced4b8a89c0ca018a0c2f366b1fda6d78b9f049301678d639a1b93b504370) |
| `fundWithPermit` | Zero-POL client, relayed | [`0xbc9ec7988c72e1481764f61e00fb8df82b9c278e13ef50d5acbcde58f51b997b`](https://amoy.polygonscan.com/tx/0xbc9ec7988c72e1481764f61e00fb8df82b9c278e13ef50d5acbcde58f51b997b) |
| `submit` | Zero-POL provider, relayed | [`0x2a0abe982d55fa5d35eece46ef0296253792d6d945f1e67587f47b8e74ceb321`](https://amoy.polygonscan.com/tx/0x2a0abe982d55fa5d35eece46ef0296253792d6d945f1e67587f47b8e74ceb321) |
| `approve` | Zero-POL client, relayed (`approveJob`) | [`0x1e8e19ee8fdba150a3e2995662d09a21beb973da6ea5ffae28e75cb77e480efb`](https://amoy.polygonscan.com/tx/0x1e8e19ee8fdba150a3e2995662d09a21beb973da6ea5ffae28e75cb77e480efb) |

### Job 7. Expiry refund with no keeper (in progress)

| Step | Signer | Transaction |
| :--- | :--- | :--- |
| `createJob` | Client (Ledger) | [`0x39146e54e21930509fcb975c6f55624ebcf7729fe4875e405a43883fe2430de7`](https://amoy.polygonscan.com/tx/0x39146e54e21930509fcb975c6f55624ebcf7729fe4875e405a43883fe2430de7) |
| `approveEvaluation` | Client (Ledger) | [`0x9685ea03f7156eb6a252e504e3b9691da0ef32ae1dc3d9834e9cab611e168ffe`](https://amoy.polygonscan.com/tx/0x9685ea03f7156eb6a252e504e3b9691da0ef32ae1dc3d9834e9cab611e168ffe) |
| `configure` | Client (Ledger) | [`0xe83c3610659a4a879cf544bfcd95cc5ead2a6a3dadf19aa4953752e2c9a38e8a`](https://amoy.polygonscan.com/tx/0xe83c3610659a4a879cf544bfcd95cc5ead2a6a3dadf19aa4953752e2c9a38e8a) |
| `quote` | Client (Ledger) | [`0xf513ee7ce72fd6682d9bf2b90b0c9142dbcc865d91a884ee0446ceb6a4ee0808`](https://amoy.polygonscan.com/tx/0xf513ee7ce72fd6682d9bf2b90b0c9142dbcc865d91a884ee0446ceb6a4ee0808) |
| `approveBudget` | Client (Ledger) | [`0x8e58bbfdbc1fc6b11c5d61b40984beb3ab2545d373309c66fa580a9fde58afdf`](https://amoy.polygonscan.com/tx/0x8e58bbfdbc1fc6b11c5d61b40984beb3ab2545d373309c66fa580a9fde58afdf) |
| `fund` | Client (Ledger) | [`0x899208667c2bfd54b20eaa44290f6a36d5b6c21549abee0b13596ba9938a461b`](https://amoy.polygonscan.com/tx/0x899208667c2bfd54b20eaa44290f6a36d5b6c21549abee0b13596ba9938a461b) |

### Job 2. Configured with the old fee, then rejected and swept

| Step | Signer | Transaction |
| :--- | :--- | :--- |
| `createJob` | Client (Ledger) | [`0x3085ddc778ae4fcc820587cce912c84d90016aa52978fce30acd126275b0891b`](https://amoy.polygonscan.com/tx/0x3085ddc778ae4fcc820587cce912c84d90016aa52978fce30acd126275b0891b) |
| `approveEvaluation` | Client (Ledger) | [`0x637ae69099e650d9f9b730895fed67632a38745fd5468744de01127e673e4adb`](https://amoy.polygonscan.com/tx/0x637ae69099e650d9f9b730895fed67632a38745fd5468744de01127e673e4adb) |
| `configure` | Client (Ledger) | [`0x02702cabc3fafc0253d7868f80afd6fa56ced372dbbd8dd68cf1b56d284b8d65`](https://amoy.polygonscan.com/tx/0x02702cabc3fafc0253d7868f80afd6fa56ced372dbbd8dd68cf1b56d284b8d65) |
| `quote` | Client (Ledger) | [`0x7e9b425924c782d15512cd42214b7361f738093d22980107ea4d1943d9982e7c`](https://amoy.polygonscan.com/tx/0x7e9b425924c782d15512cd42214b7361f738093d22980107ea4d1943d9982e7c) |
| `approveBudget` | Client (Ledger) | [`0xb24a1b31e03e7d9ede324f99fa874301214a7637147cc91547078fafc4e736e3`](https://amoy.polygonscan.com/tx/0xb24a1b31e03e7d9ede324f99fa874301214a7637147cc91547078fafc4e736e3) |
| `reject` | Client (Ledger) | [`0x2ad752c4a26dd98d3e9bc76c17e7e619baf3e13dd0a097540379fc91586c2e2f`](https://amoy.polygonscan.com/tx/0x2ad752c4a26dd98d3e9bc76c17e7e619baf3e13dd0a097540379fc91586c2e2f) |
| `sweep` | Client (Ledger) | [`0xd7b3d530ffda29579730116c8db9da56fd411a899aefe9fac7228bdf37f63582`](https://amoy.polygonscan.com/tx/0xd7b3d530ffda29579730116c8db9da56fd411a899aefe9fac7228bdf37f63582) |

### Job 3. Timed out by the keeper before it expired

| Step | Signer | Transaction |
| :--- | :--- | :--- |
| `createJob` | Client (Ledger) | [`0xc518d6d78e36aacf57fb0080b1c1d47924028caa763f2e899bdfd537c4e40c66`](https://amoy.polygonscan.com/tx/0xc518d6d78e36aacf57fb0080b1c1d47924028caa763f2e899bdfd537c4e40c66) |
| `approveEvaluation` | Client (Ledger) | [`0x4252b68755724bc85059b553230ad2621ef3f4be2775f2c0189772f0635f4328`](https://amoy.polygonscan.com/tx/0x4252b68755724bc85059b553230ad2621ef3f4be2775f2c0189772f0635f4328) |
| `configure` | Client (Ledger) | [`0x0015eabe0b0fb644ab89386df7f3ec8267c932c313fe9e379ce5c607e7d3d76c`](https://amoy.polygonscan.com/tx/0x0015eabe0b0fb644ab89386df7f3ec8267c932c313fe9e379ce5c607e7d3d76c) |
| `quote` | Client (Ledger) | [`0x83125b20cbe9509ba92dfd4f6f777dbff68c8d1713d725d323afd68f79cd290f`](https://amoy.polygonscan.com/tx/0x83125b20cbe9509ba92dfd4f6f777dbff68c8d1713d725d323afd68f79cd290f) |
| `approveBudget` | Client (Ledger) | [`0x10f643e1649d8f794e659d454927e54e7575b704cd1f51de71b6f1aa1e2c4de8`](https://amoy.polygonscan.com/tx/0x10f643e1649d8f794e659d454927e54e7575b704cd1f51de71b6f1aa1e2c4de8) |
| `fund` | Client (Ledger) | [`0xb15e919f59a95b11737eab5be3df543909186514a4ed0b3b02be8edf3d9d63cc`](https://amoy.polygonscan.com/tx/0xb15e919f59a95b11737eab5be3df543909186514a4ed0b3b02be8edf3d9d63cc) |
| `timeoutNoSubmission` | Keeper | [`0x3e37ef5fee0281ab0aa74be1c3c2fd0b2d0edc9060d182ff7be479c5aeb61063`](https://amoy.polygonscan.com/tx/0x3e37ef5fee0281ab0aa74be1c3c2fd0b2d0edc9060d182ff7be479c5aeb61063) |

### Balances after these runs

Read on 2026-10-08 at 10:26 KST with `yarn balances:amoy`.

| Wallet | Address | POL | USDC |
| :--- | :--- | ---: | ---: |
| Client (Ledger) | [`0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0`](https://amoy.polygonscan.com/address/0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0) | 0.1360 | 17.20 |
| Provider (Ledger) | [`0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be`](https://amoy.polygonscan.com/address/0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be) | 0.2824 | 18.90 |
| Arbiter (Ledger #2) | [`0x31923881A21A28254b2330cd41084Cafe0a64644`](https://amoy.polygonscan.com/address/0x31923881A21A28254b2330cd41084Cafe0a64644) | 0.0897 | 0.10 |
| Keeper | [`0x87775F236D38526f48F702EE36FD195c75882cBc`](https://amoy.polygonscan.com/address/0x87775F236D38526f48F702EE36FD195c75882cBc) | 0.0752 | 1.20 |
| Relayer | [`0x942fa17cf26b6b0CbEA6A11141007501fe064577`](https://amoy.polygonscan.com/address/0x942fa17cf26b6b0CbEA6A11141007501fe064577) | 0.2164 | 0.00 |
| Zero-POL client | [`0xF304B61b7889B3B11D9F074e049Ee022AcC8830e`](https://amoy.polygonscan.com/address/0xF304B61b7889B3B11D9F074e049Ee022AcC8830e) | 0 | 18.00 |
| Zero-POL provider | [`0xA84a2dC2Da35f79fF315F377Ae99b8ac3DcE87a3`](https://amoy.polygonscan.com/address/0xA84a2dC2Da35f79fF315F377Ae99b8ac3DcE87a3) | 0 | 2.00 |
| Deployer | [`0x88dDAc5963D578cb62Cf1e6515127d9485aa9Fba`](https://amoy.polygonscan.com/address/0x88dDAc5963D578cb62Cf1e6515127d9485aa9Fba) | 0.0137 | 0.00 |

## Not yet recorded on Amoy

One variant is still open. Its hashes will be added here after it is sent.

| Demonstration | What it will show |
| :--- | :--- |
| Provider sets the price on chain | The link uses the amount rule "Provider quote, locked after the first quote". The provider's wallet sends `setBudget` after `configure`, then the client funds. |

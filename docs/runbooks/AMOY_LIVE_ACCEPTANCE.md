# Amoy live acceptance

Network: Polygon Amoy, chain id 80002. Block explorer: [amoy.polygonscan.com](https://amoy.polygonscan.com).

These flows run on the contracts already deployed there. Do not change the contracts. Keep keys only in `env` and `config/*.env`, and do not commit them. A person sends the transactions. This file is the operator runbook. The public evidence, with purposes, results, and transaction links, is `docs/grant/AMOY_EVIDENCE.md`.

The tables before the features name the contracts, the wallets, the deadlines, the payment stages, the evaluation stages, and every call that moves them. The run table then says which job proved which ending, and where the USDC went. Each feature uses the same four parts: purpose, test steps, result, and transactions. A transaction row names the payment stage and the evaluation stage after that step. A transaction cell is the hash and its explorer page. A dash means that step has not been sent on Amoy.

## Contracts

| Contract | Address |
| :--- | :--- |
| Forwarder | [`0xD1172323dc6B5C39f8F015C0C3ada071079c830C`](https://amoy.polygonscan.com/address/0xD1172323dc6B5C39f8F015C0C3ada071079c830C) |
| Factory | [`0x8Cae2EBe1b3D13e3EAf9Fc765a577dc30c6a5218`](https://amoy.polygonscan.com/address/0x8Cae2EBe1b3D13e3EAf9Fc765a577dc30c6a5218) |
| USDC instance | [`0x4D54D2BD919024742070c63878903483d456d3fC`](https://amoy.polygonscan.com/address/0x4D54D2BD919024742070c63878903483d456d3fC) |
| Optimistic evaluator | [`0x8A4a02D544145ed668b059A7A1753E1f4470da3B`](https://amoy.polygonscan.com/address/0x8A4a02D544145ed668b059A7A1753E1f4470da3B) |
| Circle Amoy USDC | [`0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582`](https://amoy.polygonscan.com/address/0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582) |

These are the contracts deployed on 2026-10-08 from the current source, which includes the 2026-10-03 security fixes: the evaluation fee is now at most 20% of the budget, so the acceptance run uses a 0.20 USDC fee and 0.10 USDC tips instead of 1.00 and 0.50. New runs use them. The transactions recorded below ran on the first deployment, which stays on chain and verified:

| Contract (first deployment) | Address |
| :--- | :--- |
| Forwarder | `0x2042172c8b638f1720A1c468726dbd167d62E63f` |
| Factory | `0xeafFF7cCe71b66dB91c40d09640ae9ae854707ca` |
| USDC instance | `0x7632d054BfE635A1f0394fbcd74678B6567213Fd` |
| Optimistic evaluator | `0x65819d9199144a66ec17ad39da6bebabc3eef585` |

## Records of the first deployment

The runs recorded on this page used the first deployment. Their files were renamed on 2026-10-08 so that runs on the second deployment start with empty records: `packages/contracts/deploy/amoy/acceptance.old-2026-10.json`, `packages/contracts/deploy/amoy/dispute.old-2026-10.json` and `docs/runbooks/amoy-live-results.old-2026-10.json`. The acceptance and dispute scripts refuse a record made on another instance.

## Second deployment: acceptance run of 2026-10-08

Setup ran on 2026-10-08 (KST 07:00). Every hash is in `packages/contracts/deploy/amoy/acceptance.json` and `docs/runbooks/amoy-live-results.json`.

| Flow | On-chain job | Result | Transactions |
| :--- | :--- | :--- | :--- |
| Client approves | 1 | `Completed` | in the record |
| Silent submission (finalize) | 4 | `Completed`: the keeper called `finalize` on 2026-10-08 08:18 KST | [`0xeef77db3…`](https://amoy.polygonscan.com/tx/0xeef77db320237b0cb64b164e80ce1757563ce9ee1d143a2ebe82af74796292b1) |
| No submission (timeout) | 5 | `Rejected`: the keeper called `timeoutNoSubmission` with a tip | [`0x5ca01057…`](https://amoy.polygonscan.com/tx/0x5ca01057a799b8f545ed2b65af0f6fd2702919066d1d84777013c77a869c4b98) |
| Gasless payment | 6 | `Completed` on 2026-10-08 10:14 KST: two zero-POL wallets signed every step and the relayer paid the gas | [`approve 0x1e8e19ee…`](https://amoy.polygonscan.com/tx/0x1e8e19ee8fdba150a3e2995662d09a21beb973da6ea5ffae28e75cb77e480efb), every hash in `amoy-live-results.json` |
| Expiry refund and sweep | new job (second try) | Set up again on 2026-10-08 | `ACCEPTANCE_PHASE=finish` after it expires, about 26 hours later |

Job 3 was the first try at the expiry refund. Its submit window had closed when the keeper ran for jobs 4 and 5, so the keeper timed it out too ([`0x3e37ef5f…`](https://amoy.polygonscan.com/tx/0x3e37ef5fee0281ab0aa74be1c3c2fd0b2d0edc9060d182ff7be479c5aeb61063)): the client got the budget back and the 0.20 USDC fee went to the operator, so `claimRefund` and `sweep` could not run. The submit window always ends before expiry, so the expiry refund only happens when no keeper acts on the job. The second try runs with every keeper stopped until the job expires.

Job 2 was the first try at the sweep flow. It was configured with the old 1.00 USDC fee, which the 20% cap refuses at `fund`, so the client rejected it and swept the fee back; its hashes are under `abandoned` in the record.

## Wallets

| Wallet | Address | POL | USDC | Role |
| :--- | :--- | :--- | :--- | :--- |
| Client | [`0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0`](https://amoy.polygonscan.com/address/0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0) | at least 0.15 | at least 7 | Ledger. Signs create, configure, fund, approve, refund, and sweep |
| Provider | [`0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be`](https://amoy.polygonscan.com/address/0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be) | at least 0.03 | 0 | Ledger. Signs submission |
| Operator | [`0x32Ca3774918733a14Cb7D414E57D96086C1205e9`](https://amoy.polygonscan.com/address/0x32Ca3774918733a14Cb7D414E57D96086C1205e9) | 0 | 0 | Receives the evaluation fee. Does not sign |
| Keeper | [`0x87775F236D38526f48F702EE36FD195c75882cBc`](https://amoy.polygonscan.com/address/0x87775F236D38526f48F702EE36FD195c75882cBc) | at least 0.1 | 0 | Pays gas for deadline calls and receives the tip |
| Deployer | [`0x88dDAc5963D578cb62Cf1e6515127d9485aa9Fba`](https://amoy.polygonscan.com/address/0x88dDAc5963D578cb62Cf1e6515127d9485aa9Fba) | — | — | Deployed the contracts. Does not sign these jobs |
| Relayer | [`0x942fa17cf26b6b0CbEA6A11141007501fe064577`](https://amoy.polygonscan.com/address/0x942fa17cf26b6b0CbEA6A11141007501fe064577) | at least 0.5 | 0 | Pays gas for wallets that hold no POL |
| Zero-POL client | [`0xF304B61b7889B3B11D9F074e049Ee022AcC8830e`](https://amoy.polygonscan.com/address/0xF304B61b7889B3B11D9F074e049Ee022AcC8830e) | 0 | at least 1 | Signs only. Job 5 |
| Zero-POL provider | [`0xA84a2dC2Da35f79fF315F377Ae99b8ac3DcE87a3`](https://amoy.polygonscan.com/address/0xA84a2dC2Da35f79fF315F377Ae99b8ac3DcE87a3) | 0 | 0 | Signs only. Job 5 |

Keys stay on this machine:

1. Copy `config/keeper.env.sample` to `config/keeper.env` and fill the keeper key.
2. Copy `config/relayer.env.sample` to `config/relayer.env` and fill the relayer key and the integrator token.
3. Copy `packages/contracts/env/.amoy.relay.env.sample` to `packages/contracts/env/.amoy.relay.env` and fill the two zero-POL keys and the same integrator token.

The keeper is not the deployer. The relayer is not the deployer, the keeper, the client, or the provider. The zero-POL wallets are new addresses. Do not send them POL.

Faucets: [POL on Amoy](https://faucet.polygon.technology/) and [Circle USDC on Polygon Amoy](https://faucet.circle.com/).

## Deadlines

`presetAiToAi` passes `PLACEHOLDER_MIN_WINDOW` (3600 seconds). That is also the contract minimum. Do not change the constants.

| Deadline | Length | Effect |
| :--- | :--- | :--- |
| Submit window | 1 hour after funding | An unsubmitted job becomes due for `timeoutNoSubmission` |
| Review window | 1 hour after submission | A silent submitted job becomes due for `finalize` |
| Job expiry | about 3 hours 10 minutes after creation | Submit window + review window + 1 hour safety margin + 10 minutes of creation slack. `claimRefund` is available only after this |

## Payment stages

These are the job statuses on the USDC instance. A quote and a token approval do not change the stage.

| Stage | Meaning | Where the budget is |
| :--- | :--- | :--- |
| Open | The job exists. The client has not locked the budget. | Still in the client's wallet |
| Funded | The client deposited the quoted budget. The provider may submit. | Held by the instance |
| Submitted | The provider recorded a deliverable hash. The client cannot take the budget back alone. | Held by the instance |
| Completed | The evaluator completed the job. | Paid to the provider |
| Rejected | The evaluator rejected the job. | Returned to the client |
| Expired | Anyone called `claimRefund` after `expiredAt`. | Returned to the client |

## Evaluation stages

These are the phases on the optimistic evaluator. `presetAiToAi` uses auto-complete on silence, so these Amoy jobs do not enter `Escalated` or `ArbiterPending`.

| Stage | Meaning | Where the evaluation fee is |
| :--- | :--- | :--- |
| None | The phase has not started. `configure` may already have stored the rules. | A charged fee is already at the evaluator after `configure`. Before that, it is still with the client, or the job charges no fee |
| Funded | The submit window is running. The provider has not submitted. | Held by the evaluator |
| Submitted | The review window is running. The client may approve or object. | Held by the evaluator |
| Escalated | The client objected, or silence was escalated. Dispute deposits may be due. | Held by the evaluator |
| ArbiterPending | An arbiter has a deadline to rule. | Held by the evaluator, with the deposits |
| Resolved | Evaluation ended. The fee is paid to the operator, a tip is paid to the caller, or the remainder is swept back to the client. | Settled |

## Calls

The step name in a feature table is the acceptance script's label. Polygonscan shows the chain call.

| Step | Chain call | Who | Meaning | Payment after | Evaluation after |
| :--- | :--- | :--- | :--- | :--- | :--- |
| createJob | `createJob` | Client | Creates one job with one provider, this evaluator, and `expiredAt`. | Open | None |
| approveEvaluation | USDC `approve` to the evaluator | Client | Allows the evaluator to pull the evaluation fee. Does not move a stage. | unchanged | unchanged |
| configure | `configure` | Client | Pulls a non-zero evaluation fee from the client into the evaluator, then stores the windows, the fee, and the tip. The phase stays `None` until `fund`. | Open | None |
| quote | `setBudget` | Client or provider | Records the budget. `fund` reverts if that amount changes first. Jobs 1–4 were quoted by the client. The shared-link test also quotes once as the provider. | Open | None |
| approveBudget | USDC `approve` to the instance | Client | Allows the instance to pull the budget. Does not move a stage. | unchanged | unchanged |
| fund | `fund` | Client | Locks the budget in the instance and starts the evaluation phase. It does not move the evaluation fee. | Funded | Funded |
| fundWithPermit | `fundWithPermit` | Client | Same as `fund`. The USDC permit is a signature inside this call, not its own transaction. | Funded | Funded |
| submit | `submit` | Provider | Records the deliverable hash and starts the review window. | Submitted | Submitted |
| approve | evaluator `approve` | Client | Completes the job. Pays the budget to the provider and any fee to the operator. | Completed | Resolved |
| finalize | `finalize` | Anyone. Here, the keeper | After a silent review, completes the job. The tip comes out of the fee first. | Completed | Resolved |
| timeoutNoSubmission | `timeoutNoSubmission` | Anyone. Here, the keeper | After a missed submit window, rejects the job. The tip comes out of the fee first. | Rejected | Resolved |
| claimRefund | `claimRefund` | Anyone. Here, the client | After `expiredAt`, returns the budget. Leaves the evaluation fee where it is. | Expired | Funded |
| sweep | `sweep` | Anyone. Here, the client | After the job has ended, returns a fee that was never paid out. | unchanged | Resolved |

`presetAiToAi` sets the maximum review extension to 0 and auto-completes on silence. These calls exist on the evaluator and were not sent on Amoy.

| Call | Who | Meaning | Evaluation after |
| :--- | :--- | :--- | :--- |
| withdrawAsProvider | Provider | Rejects the job in the client's favour. | Resolved |
| object | Client | During review, opens a dispute. | Escalated |
| extendReview | Client | Extends review once. This preset would revert `ExtensionTooLarge`. | Submitted |
| escalateOnSilence | Anyone | Confirmation mode only. This preset would revert `WrongMode`. | Escalated |
| postDeposit | Client or provider | Posts a dispute deposit while `Escalated`. | Escalated |
| resolveMissingDeposit | Anyone | The side that did not post its deposit loses. | Resolved |
| resolveByDefault | Anyone | Closes a dispute when the arbiter does not rule in time, or when there is no arbiter. | Resolved |
| rule | Arbiter | Completes or rejects while `ArbiterPending`. | Resolved |

## This run

One setup created four jobs. Finish job 2 before starting the keeper. The keeper watches every open job, and job 2's submit window was already over, so an early keeper would reject it and pay the evaluation fee to the operator.

| Order | Command | What it closes |
| :--- | :--- | :--- |
| 1 | `yarn contracts acceptance:amoy` | Creates jobs 1–4. Job 1 is already `Completed`. Jobs 2, 3, and 4 stay open. The keeper stays stopped. |
| 2 | `ACCEPTANCE_PHASE=finish yarn contracts acceptance:amoy` | After 2026-10-01 14:01:07 KST, the client refunds and sweeps job 2. |
| 3 | `docker compose up -d keeper` | After job 2 is `Expired`, the keeper finalizes job 3 and rejects job 4. |
| 4 | `docker compose stop keeper` | Stop it after both log lines. |

Amounts are USDC. A 0.5 tip is taken from the 1.00 evaluation fee, so the operator receives the other 0.5.

| Job | Chain id | Description | Budget | Fee | Tip | Budget to | Fee to | Tip to | Payment | Evaluation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Approval | 1 | `ipfs://amoy/approve` | 1.00 | 0 | 0 | Provider | — | — | Completed | Resolved |
| Expiry refund | 2 | `ipfs://amoy/sweep` | 1.00 | 1.00 | 0 | Client | Client | — | Expired | Resolved |
| Silent submission | 3 | `ipfs://amoy/finalize` | 1.00 | 1.00 | 0.50 | Provider | Operator | Keeper | Completed | Resolved |
| No submission | 4 | `ipfs://amoy/timeout` | 1.00 | 1.00 | 0.50 | Client | Operator | Keeper | Rejected | Resolved |
| Gasless | 5 | `ipfs://amoy/gasless` | 1.00 | 0 | 0 | Provider | — | — | Completed | Resolved |
| Shared link, client quote | 7 | Entered in the form | 5.00 | 0 | 0 | Provider | — | — | Completed | Resolved |
| Shared link created by the provider, client quote | 10 | Entered in the form | 5.00 | 0 | 0 | Provider | — | — | Completed | Resolved |
| Shared link, provider quote | — | Entered in the form | 1.00 | 0 | 0 | — | — | — | Not run | Not run |
| Dispute | 8 | `ipfs://amoy/dispute` | 1.00 | 0 | 0 | Client | — | — | Rejected | Resolved |

Job 2 expired at 2026-10-01 14:01:07 KST (`expiredAt` 1790830867). Job 3's review ended at 2026-10-01 11:53:25 KST (`dueAt` 1790823205). Job 4's submit window ended at 2026-10-01 11:54:39 KST (`dueAt` 1790823279).

## USDC movements

These amounts are the `Transfer`, `TipPaid`, `FeePaid`, `Swept`, `PaymentReleased`, and `Refunded` logs in the transactions below. USDC uses 6 decimals, so `1000000` is 1.00 USDC.

| Job | What moved | Log | Transaction |
| :--- | :--- | :--- | :--- |
| 1 | 1.00 USDC from the instance to the provider | `PaymentReleased` | [`approve`](https://amoy.polygonscan.com/tx/0x9fb80d767d49a15db8cdab089a4afcc3a9a43274b1ad4b775471f3064c954f9c#eventlog) |
| 2 | 1.00 USDC from the client to the evaluator | `Transfer` on `configure` | [`configure`](https://amoy.polygonscan.com/tx/0xfb66337163c5d92fa8f2fee7ada7138e9148ed49bc56415beb85061a705ac7ea#eventlog) |
| 2 | 1.00 USDC from the client to the instance | `JobFunded` | [`fund`](https://amoy.polygonscan.com/tx/0x527252d85a65ed1df4443db139257871a210873553f63508806b705b7fac9746#eventlog) |
| 2 | 1.00 USDC from the instance to the client | `Refunded` | [`claimRefund`](https://amoy.polygonscan.com/tx/0x993153c5925677aa09201f46cafa0fa43913641cd9eadfaebbae616a790dcc1e#eventlog) |
| 2 | 1.00 USDC from the evaluator to the client | `Swept` | [`sweep`](https://amoy.polygonscan.com/tx/0x0725df716b5d395412ac5d102a066caeaf8e6be30eb9a678eb4eb9ae83d63ad4#eventlog) |
| 3 | 0.50 USDC tip to the keeper, 0.50 USDC fee to the operator, 1.00 USDC budget to the provider | `TipPaid`, `FeePaid`, `PaymentReleased` | [`finalize`](https://amoy.polygonscan.com/tx/0x93a058e01f2f9ac447e0fd22a2ccc2eca9ae8dd2e557c1fc9668088fdbec7335#eventlog) |
| 4 | 0.50 USDC tip to the keeper, 0.50 USDC fee to the operator, 1.00 USDC budget to the client | `TipPaid`, `FeePaid`, `Refunded` | [`timeoutNoSubmission`](https://amoy.polygonscan.com/tx/0xab783631acdb531036eae59bcfb11b0e7e2129f24a08c1c94c54c56b7a6991ea#eventlog) |
| 7 | 5.00 USDC from the client to the instance | `JobFunded` | [`fundWithPermit`](https://amoy.polygonscan.com/tx/0x240ff0c20f66fb14be4bb5d07578f077d35676c0948b5a4269936471b705537e#eventlog) |
| 7 | 5.00 USDC from the instance to the provider | `PaymentReleased` | [`approve`](https://amoy.polygonscan.com/tx/0x5f7327017ea1e4efe49b812e82d54f9819b0ea39703106e2eca1d15cf78849ef#eventlog) |

`finalize` and `timeoutNoSubmission` were sent by the keeper `0x87775F236D38526f48F702EE36FD195c75882cBc`.

## 1. Approval

**Purpose.** The client completes a job after the provider submits. The 1 USDC budget is paid to the provider. There is no evaluation fee.

**Test.**

1. From the repository root, run `yarn contracts acceptance:amoy`.
2. The client confirms `createJob` on the Ledger. The provider is the counterparty. The evaluator is the optimistic evaluator.
3. The client confirms `configure` with `presetAiToAi` and a zero evaluation fee.
4. The client confirms `quote` for 1 USDC, then `approveBudget`, then `fund`.
5. The provider confirms `submit`.
6. The client confirms `approve`.

**Result.** Chain job 1 is `Completed`. The provider received the 1.00 USDC budget. There was no evaluation fee.

| Step | Signer | Payment | Evaluation | Transaction |
| :--- | :--- | :--- | :--- | :--- |
| 1. createJob | Client | Open | None | [`0x069f81554874b63e4e599537dda0e3959bbbfc3a5cfc8e87ed14f3c7ca82d14d`](https://amoy.polygonscan.com/tx/0x069f81554874b63e4e599537dda0e3959bbbfc3a5cfc8e87ed14f3c7ca82d14d) |
| 2. configure | Client | Open | None | [`0xca64f3e128cb902d1a55fa32732b4d3fce1c3b13a22f1887ce201ff30f6defdd`](https://amoy.polygonscan.com/tx/0xca64f3e128cb902d1a55fa32732b4d3fce1c3b13a22f1887ce201ff30f6defdd) |
| 3. quote | Client | Open | None | [`0xed9164458acf936b72b2afaf40f2f907b5a4c2622eaa2559c8667b2ddfaaf8a1`](https://amoy.polygonscan.com/tx/0xed9164458acf936b72b2afaf40f2f907b5a4c2622eaa2559c8667b2ddfaaf8a1) |
| 4. approveBudget | Client | Open | None | [`0xd72db5e6f68e7e7dfaf20c132894b42e38117caac7f4dab25a92441ea030d39a`](https://amoy.polygonscan.com/tx/0xd72db5e6f68e7e7dfaf20c132894b42e38117caac7f4dab25a92441ea030d39a) |
| 5. fund | Client | Funded | Funded | [`0xa7142b8dacdede06df163d03863694e27091744d6dcdbb4c018ce63517610467`](https://amoy.polygonscan.com/tx/0xa7142b8dacdede06df163d03863694e27091744d6dcdbb4c018ce63517610467) |
| 6. submit | Provider | Submitted | Submitted | [`0xbb89fc9ec436928def56f276708983fa01c053eb2b0f9d47bc87efc86b1771cf`](https://amoy.polygonscan.com/tx/0xbb89fc9ec436928def56f276708983fa01c053eb2b0f9d47bc87efc86b1771cf) |
| 7. approve | Client | Completed | Resolved | [`0x9fb80d767d49a15db8cdab089a4afcc3a9a43274b1ad4b775471f3064c954f9c`](https://amoy.polygonscan.com/tx/0x9fb80d767d49a15db8cdab089a4afcc3a9a43274b1ad4b775471f3064c954f9c) |

## 2. Expiry refund

**Purpose.** The provider never submits. After expiry the client takes the 1 USDC budget back with `claimRefund` and the unused 1 USDC evaluation fee back with `sweep`. The keeper does not act, so the fee does not go to the operator.

**Test.**

1. The same `yarn contracts acceptance:amoy` run creates job 2.
2. The client confirms `approveEvaluation` for 1 USDC, then `configure`, `quote`, `approveBudget`, and `fund`.
3. Leave the job funded. Do not submit. Keep the keeper stopped.
4. Wait until job expiry, about 3 hours 10 minutes after creation.
5. Run `ACCEPTANCE_PHASE=finish yarn contracts acceptance:amoy`.
6. The client confirms `claimRefund`, then `sweep`.

**Result.** Chain job 2 is `Expired`. The client received the 1.00 USDC budget from `claimRefund` and the 1.00 USDC fee from `sweep`.

| Step | Signer | Payment | Evaluation | Transaction |
| :--- | :--- | :--- | :--- | :--- |
| 1. createJob | Client | Open | None | [`0xe4a2c4f2e68968d83401d734352956de3f68ca45f61f28ff608fecc36b3196dd`](https://amoy.polygonscan.com/tx/0xe4a2c4f2e68968d83401d734352956de3f68ca45f61f28ff608fecc36b3196dd) |
| 2. approveEvaluation | Client | Open | None | [`0x7635ad684bdc363d9012f5755a4bb259d0720b6f58476b0dbcb3cff8aff4a987`](https://amoy.polygonscan.com/tx/0x7635ad684bdc363d9012f5755a4bb259d0720b6f58476b0dbcb3cff8aff4a987) |
| 3. configure | Client | Open | None | [`0xfb66337163c5d92fa8f2fee7ada7138e9148ed49bc56415beb85061a705ac7ea`](https://amoy.polygonscan.com/tx/0xfb66337163c5d92fa8f2fee7ada7138e9148ed49bc56415beb85061a705ac7ea) |
| 4. quote | Client | Open | None | [`0xb02cf4354c14b401cc33f52c15aab0fa5294e251bcaf2deadfae4c6473645642`](https://amoy.polygonscan.com/tx/0xb02cf4354c14b401cc33f52c15aab0fa5294e251bcaf2deadfae4c6473645642) |
| 5. approveBudget | Client | Open | None | [`0xf54feed009019611352e1367b6597e2d5d5bebeeab1eb976e35deb09aa04d2ab`](https://amoy.polygonscan.com/tx/0xf54feed009019611352e1367b6597e2d5d5bebeeab1eb976e35deb09aa04d2ab) |
| 6. fund | Client | Funded | Funded | [`0x527252d85a65ed1df4443db139257871a210873553f63508806b705b7fac9746`](https://amoy.polygonscan.com/tx/0x527252d85a65ed1df4443db139257871a210873553f63508806b705b7fac9746) |
| 7. claimRefund | Client | Expired | Funded | [`0x993153c5925677aa09201f46cafa0fa43913641cd9eadfaebbae616a790dcc1e`](https://amoy.polygonscan.com/tx/0x993153c5925677aa09201f46cafa0fa43913641cd9eadfaebbae616a790dcc1e) |
| 8. sweep | Client | Expired | Resolved | [`0x0725df716b5d395412ac5d102a066caeaf8e6be30eb9a678eb4eb9ae83d63ad4`](https://amoy.polygonscan.com/tx/0x0725df716b5d395412ac5d102a066caeaf8e6be30eb9a678eb4eb9ae83d63ad4) |

If the keeper is running before step 7, it calls `timeoutNoSubmission` and the evaluation fee goes to the operator. Run the refund first.

## 3. Keeper finalizes a silent submission

**Purpose.** The provider submits and nobody reviews the work. After the review window the keeper calls `finalize`. The job completes, the provider is paid, and the keeper receives a 0.5 USDC tip. The caller is not the deployer.

**Test.**

1. The same `yarn contracts acceptance:amoy` run creates job 3.
2. The client confirms `approveEvaluation` for 1 USDC, then `configure` with a 0.5 USDC keeper tip, `quote` for 1 USDC, `approveBudget`, and `fund`.
3. The provider confirms `submit`.
4. Do not approve and do not object.
5. Wait 1 hour for the review window.
6. Run `docker compose up -d keeper`. The keeper sends `finalize`.
7. Run `docker compose stop keeper`.

**Result.** Chain job 3 is `Completed`. The provider received the 1.00 USDC budget. The operator received 0.50 USDC of the fee, and the keeper received the 0.50 USDC tip.

| Step | Signer | Payment | Evaluation | Transaction |
| :--- | :--- | :--- | :--- | :--- |
| 1. createJob | Client | Open | None | [`0x80e0b0a9e852b93115bc5c2c871fde6a85b57c4979fc17e7e584ecef14ed0e0a`](https://amoy.polygonscan.com/tx/0x80e0b0a9e852b93115bc5c2c871fde6a85b57c4979fc17e7e584ecef14ed0e0a) |
| 2. approveEvaluation | Client | Open | None | [`0x599dad882c784ea46aa1287330b638ce195776ced66276fc2476adb28b7ee825`](https://amoy.polygonscan.com/tx/0x599dad882c784ea46aa1287330b638ce195776ced66276fc2476adb28b7ee825) |
| 3. configure | Client | Open | None | [`0xae1e0ac0f0609e7dbdfe8bdd7f42ad5df7ece969ba08e42f47f3d93a04975d34`](https://amoy.polygonscan.com/tx/0xae1e0ac0f0609e7dbdfe8bdd7f42ad5df7ece969ba08e42f47f3d93a04975d34) |
| 4. quote | Client | Open | None | [`0xed7a6a063f7c9f19627c0409b3d2d1917db9740d364e68b006c7ef77debe1fc5`](https://amoy.polygonscan.com/tx/0xed7a6a063f7c9f19627c0409b3d2d1917db9740d364e68b006c7ef77debe1fc5) |
| 5. approveBudget | Client | Open | None | [`0x346cbec969429326bc641d951da528568ae3921577ddf472be7ddca1aec19764`](https://amoy.polygonscan.com/tx/0x346cbec969429326bc641d951da528568ae3921577ddf472be7ddca1aec19764) |
| 6. fund | Client | Funded | Funded | [`0x99d2c9f625911754b351c198ae0c4572dc3fb15d22402bbaca8c17deb1036e03`](https://amoy.polygonscan.com/tx/0x99d2c9f625911754b351c198ae0c4572dc3fb15d22402bbaca8c17deb1036e03) |
| 7. submit | Provider | Submitted | Submitted | [`0xb72db09f86abd8dce1f554de4e636127c1b019d94f07cf41191d271536c78118`](https://amoy.polygonscan.com/tx/0xb72db09f86abd8dce1f554de4e636127c1b019d94f07cf41191d271536c78118) |
| 8. finalize | Keeper | Completed | Resolved | [`0x93a058e01f2f9ac447e0fd22a2ccc2eca9ae8dd2e557c1fc9668088fdbec7335`](https://amoy.polygonscan.com/tx/0x93a058e01f2f9ac447e0fd22a2ccc2eca9ae8dd2e557c1fc9668088fdbec7335) |

## 4. Keeper rejects a job that was never submitted

**Purpose.** The client funds a job and the provider never submits. After the submit window the keeper calls `timeoutNoSubmission`. The job is rejected, the budget returns to the client, and the keeper receives a 0.5 USDC tip. The caller is not the deployer.

**Test.**

1. The same `yarn contracts acceptance:amoy` run creates job 4.
2. The client confirms `approveEvaluation` for 1 USDC, then `configure` with a 0.5 USDC keeper tip, `quote` for 1 USDC, `approveBudget`, and `fund`.
3. Do not submit.
4. Wait 1 hour for the submit window.
5. The same `docker compose up -d keeper` process sends `timeoutNoSubmission`.
6. Run `docker compose stop keeper` after the log line appears.

**Result.** Chain job 4 is `Rejected`. The client received the 1.00 USDC budget. The operator received 0.50 USDC of the fee, and the keeper received the 0.50 USDC tip.

| Step | Signer | Payment | Evaluation | Transaction |
| :--- | :--- | :--- | :--- | :--- |
| 1. createJob | Client | Open | None | [`0x5e8bb10744f334abdb61f5ba0fe61ae938fd8ffd764a50d2fd00caad21693bef`](https://amoy.polygonscan.com/tx/0x5e8bb10744f334abdb61f5ba0fe61ae938fd8ffd764a50d2fd00caad21693bef) |
| 2. approveEvaluation | Client | Open | None | [`0x054db826c3f8c097752f527c171de6db65eefaaad4b2ae7ee8431ac09675f419`](https://amoy.polygonscan.com/tx/0x054db826c3f8c097752f527c171de6db65eefaaad4b2ae7ee8431ac09675f419) |
| 3. configure | Client | Open | None | [`0x503d32138cfb690873f17a2b549fbb58430ee23a394c55fb0e09ca0e167b4b40`](https://amoy.polygonscan.com/tx/0x503d32138cfb690873f17a2b549fbb58430ee23a394c55fb0e09ca0e167b4b40) |
| 4. quote | Client | Open | None | [`0xe085526a5878fc29313235c097ded4ab16a713430fc1462a1e381ea80b7850c0`](https://amoy.polygonscan.com/tx/0xe085526a5878fc29313235c097ded4ab16a713430fc1462a1e381ea80b7850c0) |
| 5. approveBudget | Client | Open | None | [`0xca7fe5ff099b51c235bb3b1395d0cefbf92ac7c78543ef2b39bf4ab416926343`](https://amoy.polygonscan.com/tx/0xca7fe5ff099b51c235bb3b1395d0cefbf92ac7c78543ef2b39bf4ab416926343) |
| 6. fund | Client | Funded | Funded | [`0x97e866a4da9cb314c8775e23bf28d2134ce28eced7d3a3ceca59a0a1ca552cb4`](https://amoy.polygonscan.com/tx/0x97e866a4da9cb314c8775e23bf28d2134ce28eced7d3a3ceca59a0a1ca552cb4) |
| 7. timeoutNoSubmission | Keeper | Rejected | Resolved | [`0xab783631acdb531036eae59bcfb11b0e7e2129f24a08c1c94c54c56b7a6991ea`](https://amoy.polygonscan.com/tx/0xab783631acdb531036eae59bcfb11b0e7e2129f24a08c1c94c54c56b7a6991ea) |

## 5. Gasless payment through the relayer

**Purpose.** A client and a provider who hold no POL sign the whole job. The relayer submits the signatures and pays the gas. The budget is 1 USDC. The evaluation fee is 0, so `configure` moves no USDC. The preset is `presetAiToAi`. The description stored on the job is `ipfs://amoy/gasless`.

**Code.** `packages/contracts/scripts/amoyRelayAcceptance.ts`. From the repository root, `yarn contracts acceptance:relay` runs it inside `packages/contracts`. It reads `OPERATOR_ADDRESS` from the filled copy of `packages/contracts/env/.amoy.env.sample`, then the filled copy of `packages/contracts/env/.amoy.relay.env.sample`. It does not print either key. Each finished step is written to the `gasless` flow in `docs/runbooks/amoy-live-results.json`. Running the command again skips a step that already has a hash.

**Method.** The zero-POL wallet signs an EIP-712 forward request. `from` is that wallet, `value` is 0, and `gas` is 2,000,000 (1,200,000 since 2026-10-08, under the relayer's 1,500,000 cap). The script posts the signature to `POST http://127.0.0.1:8787/relay` with `Authorization: Bearer` set to the integrator token and `integratorId` `errands`. The relayer wallet calls `forwarder.execute` and pays the POL. The two signing wallets never send a transaction.

`fundWithPermit` carries an EIP-2612 permit for 1 USDC. The spender is the USDC instance, the domain version is the token's `version()` (`2` on Circle Amoy USDC), and the deadline is one hour. The permit is a signature, not its own transaction. If the token rejects that domain, the permit is ignored and `fundWithPermit` reverts `InsufficientAllowance`, because these wallets never call `approve`.

**Procedure.** This run used two new wallets. Do not use the Ledger client, the Ledger provider, the deployer, the keeper, or the relayer. Do not send them POL. Send at least 1 USDC to the zero-POL client only. The relayer wallet pays the gas, so it still needs POL.

1. Copy `config/relayer.env.sample` to `config/relayer.env`. Fill `RELAYER_PRIVATE_KEY` and `DEPLOYER_ADDRESS`. In `RELAYER_INTEGRATORS`, keep the id `errands` and replace `replace-me` with a token.
2. Copy `packages/contracts/env/.amoy.relay.env.sample` to `packages/contracts/env/.amoy.relay.env`. Fill `RELAY_CLIENT_PRIVATE_KEY` and `RELAY_PROVIDER_PRIVATE_KEY` with `0x` and 64 hex characters. Set `RELAY_INTEGRATOR_TOKEN` to the same token as step 1. Leave `RELAY_INTEGRATOR_ID=errands` and `RELAY_URL=http://127.0.0.1:8787/relay`.
3. Confirm `OPERATOR_ADDRESS` is set in the filled copy of `packages/contracts/env/.amoy.env.sample`. The script reads it and does not take it from the relay file.
4. From the repository root, run `docker compose up -d relayer`.
5. Check `GET http://127.0.0.1:8787/health`. It returns `{"ok":true}`.
6. From the repository root, run `yarn contracts acceptance:relay`.
7. The script stops before any signature if either wallet's POL balance is not exactly 0, or if the client has less than 1 USDC.
8. The zero-POL client signs `createJob` on the instance. The counterparty is the zero-POL provider. The evaluator and the hook are the optimistic evaluator.
9. The zero-POL client signs `configure` on the evaluator with `presetAiToAi` and a zero evaluation fee.
10. The zero-POL client signs `setBudget` for 1 USDC.
11. The zero-POL client signs the USDC permit, then `fundWithPermit`. One relay call carries both.
12. The zero-POL provider signs `submit` with an empty deliverable hash.
13. The zero-POL client signs `approve` on the evaluator.
14. The script checks the job is `Completed`, the provider holds at least 1 USDC, and both signing wallets still have 0 POL.
15. Run `docker compose stop relayer`.

**Result.** Chain job 5 is `Completed`. The provider holds 1.00 USDC. Both signing wallets still have 0 POL. The relayer paid the gas.

| Step | Signer | Payment | Evaluation | Transaction |
| :--- | :--- | :--- | :--- | :--- |
| 1. createJob | Zero-POL client | Open | None | [`0x2e174752817f82b9b4396e2908e46b8343464c4c10d5395b0206bc7e2582ae99`](https://amoy.polygonscan.com/tx/0x2e174752817f82b9b4396e2908e46b8343464c4c10d5395b0206bc7e2582ae99) |
| 2. configure | Zero-POL client | Open | None | [`0x9c6af37508c3a91422abaa652c6ef5fe7f7b099d38b4ab9efe72475cc33d164e`](https://amoy.polygonscan.com/tx/0x9c6af37508c3a91422abaa652c6ef5fe7f7b099d38b4ab9efe72475cc33d164e) |
| 3. setBudget | Zero-POL client | Open | None | [`0x6803a9f2f1d2944137f6b85a34767ffa284db5137cadb2b3f6e6ebfd89a6c926`](https://amoy.polygonscan.com/tx/0x6803a9f2f1d2944137f6b85a34767ffa284db5137cadb2b3f6e6ebfd89a6c926) |
| 4. fundWithPermit | Zero-POL client | Funded | Funded | [`0x7b094a18da620c192b778c9faa518face0e7eec10a0ccf472c1bc9a1b50eb03a`](https://amoy.polygonscan.com/tx/0x7b094a18da620c192b778c9faa518face0e7eec10a0ccf472c1bc9a1b50eb03a) |
| 5. submit | Zero-POL provider | Submitted | Submitted | [`0xf307c382a673baf4a03ac97b897432b16a49f681084405c7e0f09b7673905694`](https://amoy.polygonscan.com/tx/0xf307c382a673baf4a03ac97b897432b16a49f681084405c7e0f09b7673905694) |
| 6. approve | Zero-POL client | Completed | Resolved | [`0x983c81d0b76f26f13c964e31d03755a8f5a1ce06e07644bc5a6ebf73a45264b7`](https://amoy.polygonscan.com/tx/0x983c81d0b76f26f13c964e31d03755a8f5a1ce06e07644bc5a6ebf73a45264b7) |

## 6. Shared payment link

**Purpose.** Two people finish one job from one link: the terms are shared, the job is funded, the provider submits proof, and the client approves. The connected wallets send the transactions, so both need POL. Use the Ledger client and provider. Do not use the zero-POL pair.

**Test.** The client-quote path ran on Amoy as chain job 7 on 2026-10-01, 21:34:50 to 21:37:54 KST. A link created by the provider, with the same client-quote lock, ran as chain job 10 on 2026-10-03, 11:03:12 to 11:06:04 KST, and is the demo video. Chain job 9, about 20 minutes earlier (10:42 to 10:43 KST), stopped after `configure` when a public RPC endpoint failed a read; it was never funded. The provider-quote lock has not run. Chain job 6, from 20:39 to 20:49 KST the same evening, was a rehearsal of the client-quote path by the same two wallets. It also completed and paid the provider 5.00 USDC, and it is not used as evidence.

1. Run `NEXT_PUBLIC_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com yarn pay dev`.
2. Open `http://localhost:3000` in the client profile.
3. Enter the client address, the provider address, an amount in USDC, the review rules, and the completion criteria. Job 7 used 5 USDC and `smallNoArbiter`.
4. Create the link and open it in the provider profile.
5. Each person connects a wallet and presses the sign button, which names the next call ("Sign: Open the job", "Sign: Set the amount", ...), until the job is funded. On the job page the provider submits a proof file from the Provider tab, and the client approves from the Client tab.
6. Repeat with the budget lock set to "Provider quote, locked after the first quote". The provider signs `setBudget` after `configure`.

**Result.** Client quote: chain job 7 is `Completed` and `Resolved`. The provider received the 5.00 USDC budget in the `approve` transaction, and there was no evaluation fee. The `submit` input carries job id 7 and deliverable `0x52baa0e5f62955a6f6412081035036f5a0bd99d235d0c3ebd20ff30f6a1dd770`, the keccak256 of [`docs/grant/AmoyClientQuote.txt`](../grant/AmoyClientQuote.txt). Every hash below was read back from Polygonscan, and each call's input or `JobCreated` log names job 7. Gas was 0.0243955 POL for the client's five transactions and 0.0022593 POL for the provider's one. Provider quote: not run.

The USDC allowance for `fundWithPermit` is an off-chain permit signature, so it has no transaction of its own. MetaMask labels the evaluator `approve` as a token permission request, because its selector `0x095ea7b3` is the same as the ERC-20 and ERC-721 `approve`.

The form default, lock "Client, before the review rules are set", makes the client quote.

| Step | Signer | Payment | Evaluation | Transaction |
| :--- | :--- | :--- | :--- | :--- |
| 1. createJob | Client | Open | None | [`0x27235c1f3fb657500e3cca9aeaca05eaabcec30fca2386e787de42fe93dc696c`](https://amoy.polygonscan.com/tx/0x27235c1f3fb657500e3cca9aeaca05eaabcec30fca2386e787de42fe93dc696c) |
| 2. quote | Client | Open | None | [`0x82c6ccc4034b89d7eb51a65e5f58810ef0dd0d176ceba133f6e582fdf65ffc45`](https://amoy.polygonscan.com/tx/0x82c6ccc4034b89d7eb51a65e5f58810ef0dd0d176ceba133f6e582fdf65ffc45) |
| 3. configure | Client | Open | None | [`0x71c97b09cba1312d631a7c1a0ad4d4a954935e48a8fc37d7bf9e750f42d9ba3a`](https://amoy.polygonscan.com/tx/0x71c97b09cba1312d631a7c1a0ad4d4a954935e48a8fc37d7bf9e750f42d9ba3a) |
| 4. fundWithPermit | Client | Funded | Funded | [`0x240ff0c20f66fb14be4bb5d07578f077d35676c0948b5a4269936471b705537e`](https://amoy.polygonscan.com/tx/0x240ff0c20f66fb14be4bb5d07578f077d35676c0948b5a4269936471b705537e) |
| 5. submit | Provider | Submitted | Submitted | [`0x0f08a15e4a432eb1e2957f89990fc20838c1968f0851a5deb4b09b0d1c7593ef`](https://amoy.polygonscan.com/tx/0x0f08a15e4a432eb1e2957f89990fc20838c1968f0851a5deb4b09b0d1c7593ef) |
| 6. approve | Client | Completed | Resolved | [`0x5f7327017ea1e4efe49b812e82d54f9819b0ea39703106e2eca1d15cf78849ef`](https://amoy.polygonscan.com/tx/0x5f7327017ea1e4efe49b812e82d54f9819b0ea39703106e2eca1d15cf78849ef) |

The other lock, "Provider quote, locked after the first quote", makes the provider quote after `configure`.

| Step | Signer | Payment | Evaluation | Transaction |
| :--- | :--- | :--- | :--- | :--- |
| 1. createJob | Client | Open | None | — |
| 2. configure | Client | Open | None | — |
| 3. quote | Provider | Open | None | — |
| 4. fundWithPermit | Client | Funded | Funded | — |
| 5. submit | Provider | Submitted | Submitted | — |
| 6. approve | Client | Completed | Resolved | — |

## 7. Dispute

**Purpose.** The client objects during review. Both sides post a dispute deposit. The arbiter rules, and the loser's deposit pays the arbiter. This is the path `presetAiToAi` does not take. It ran on Amoy as on-chain job 8.

**Test.** Ran on 2026-10-03 as on-chain job 8, with the keeper stopped so it could not close the case early. `scripts/amoyDispute.ts` runs the whole case in a few minutes, inside the one-hour windows. The person who runs it chooses an arbiter that is neither the client nor the provider: a third Ledger HD account with about 0.02 POL. The job uses `presetPersonToAny` with a 0.1 USDC dispute deposit and no evaluation fee, so silence escalates instead of auto-completing. The window constants stay unchanged.

```bash
DISPUTE_ARBITER=0x... yarn contracts dispute:amoy                       # run, or continue a stopped run
DISPUTE_ARBITER=0x... DISPUTE_PHASE=status yarn contracts dispute:amoy  # print the job and hashes
```

`DISPUTE_RULING=reject` (the default) refunds the client and pays the provider's deposit to the arbiter. `DISPUTE_RULING=complete` pays the provider and pays the client's deposit to the arbiter. The client needs 1.1 USDC and about 0.1 POL; the provider needs 0.1 USDC and about 0.03 POL. Each hash is saved to `deploy/amoy/dispute.json` and `amoy-live-results.json` as soon as it is mined.

1. The client creates the job, sets the budget, approves the 0.1 USDC deposit and configures the preset. In confirmation mode `configure` takes the client's deposit.
2. The client approves and funds 1 USDC.
3. The provider submits.
4. The client calls `object` during the review window. Its deposit is already held, so the case waits for the provider.
5. The provider approves and posts its 0.1 USDC deposit. The case goes to the arbiter.
6. The arbiter calls `rule`.

**Result.** On-chain job 8 ended `Rejected` and `Resolved`. The arbiter [`0x31923881A21A28254b2330cd41084Cafe0a64644`](https://amoy.polygonscan.com/address/0x31923881A21A28254b2330cd41084Cafe0a64644), Ledger account #2, ruled for the client. The client got the 1.00 USDC budget and its 0.10 deposit back. The provider's 0.10 deposit went to the arbiter. Every hash is also in `deploy/amoy/dispute.old-2026-10.json`.

| Step | Signer | Payment | Evaluation | Transaction |
| :--- | :--- | :--- | :--- | :--- |
| 1. createJob | Client | Open | None | [`0x443bf6e3…0aac3d60`](https://amoy.polygonscan.com/tx/0x443bf6e36aae848b80f0af630e804dd513574a9dc0e64172baeaa2a00aac3d60) |
| 2. configure | Client | Open | None | [`0xebf42fde…2b2581cc`](https://amoy.polygonscan.com/tx/0xebf42fdefe9463ad8983f2871fafa6f6f93608df7a7173f1545ed8292b2581cc) |
| 3. quote and fund | Client | Funded | Funded | [`0x3cabe093…667009ae`](https://amoy.polygonscan.com/tx/0x3cabe093b044aabe7c19b336a51933bd06cc15702d44a029e44f20ec667009ae), [`0xfbbd3bf3…16ef8f3c`](https://amoy.polygonscan.com/tx/0xfbbd3bf3e9111e9c2c1369275b8225e5d397cd899999c3e1b9ca5c8516ef8f3c) |
| 4. submit | Provider | Submitted | Submitted | [`0xe82aa1c5…f73638ae`](https://amoy.polygonscan.com/tx/0xe82aa1c5e38637d8f4794ec01723c6d1ca7bc4119f359ca079b129faf73638ae) |
| 5. object | Client | Submitted | Escalated | [`0xbdcbd923…b0443a4d`](https://amoy.polygonscan.com/tx/0xbdcbd92358286ea922fa1b651434bd31ce9c3a02d94b04870d0d6902b0443a4d) |
| 6. postDeposit | Provider (the client's deposit was taken at configure) | Submitted | ArbiterPending | [`0x8c959271…039a7246`](https://amoy.polygonscan.com/tx/0x8c95927118d74253390649bf4b9dc177da7810c4630c339a8c95e6a2039a7246) |
| 7. rule | Arbiter | Rejected | Resolved | [`0xd0d90bd8…13ee16bf`](https://amoy.polygonscan.com/tx/0xd0d90bd8a54f4ea9dd79c76f0b5890ac0b0606315ed96eeb6ac2245c13ee16bf) |

## Local processes

No public host is required. Run these from the repository root. Do not commit a filled key file.

```bash
docker compose up -d keeper
docker compose logs -f keeper
docker compose stop keeper

docker compose up -d relayer
docker compose logs -f relayer
docker compose stop relayer

cp packages/indexer/env/.env.sample packages/indexer/env/.env
set -a && source packages/indexer/env/.env && set +a
yarn indexer start
```

The indexer listens on `127.0.0.1:8788` and the relayer on `127.0.0.1:8787`. The indexer keeps its ledger in memory. After a restart it reads again from `INDEXER_FROM_BLOCK`. On Amoy that block is the factory deployment: `48650402` for the first deployment, and the factory creation block on polygonscan for the second. The same hashes are also written to `docs/runbooks/amoy-live-results.json`.

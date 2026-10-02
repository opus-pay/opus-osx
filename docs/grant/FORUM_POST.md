<!--
How to use this file
- Post it in the Polygon Community Forum, Community Treasury category: https://forum.polygon.technology/c/community-treasury/94
- Title: Grant Request | OPUS | Escrow for small cross-border stablecoin payments on Polygon
- Before posting, check whether a funding season or programme is open, and adjust the ask to its format.
- Make the repository public first. Fill every TODO. Delete this comment block.
-->

# Grant Request | OPUS | Escrow for small cross-border stablecoin payments on Polygon

**TL;DR.** OPUS is escrow for small cross-border jobs (1 to 1,000 USD) paid in USDC on Polygon. It follows the ERC-8183 standard, has no admin keys and no protocol fee, and already runs on Polygon Amoy: six test jobs, including a payment link that paid a provider 5 USDC about three minutes after the job was opened, for 0.0267 POL of gas in total. We ask for **USD 35,000 in POL, in three milestones**, mainly for an external audit before mainnet.

## Problem

When someone pays a stranger far away to buy, ship, film or fetch something, one side must pay or work first and carry the risk. Sending USD 200 across borders already costs 6.36 percent on average ([World Bank, Q3 2025](https://remittanceprices.worldbank.org/homepage)) and buys no protection. A platform's safe payment works only inside that platform, and escrow services are too expensive for a 10 USD job.

## How it works

* The client locks USDC in an escrow contract, and the provider submits proof, whose hash is stored on chain.
* The client approves. If the client stays silent, the provider is paid when the review period ends. If nothing is submitted in time, the client is refunded. If the client objects and the job has an arbiter, both sides post a deposit and the arbiter decides; without one, the job's default applies.
* Anyone can trigger a payout or refund that is due, so jobs finish even if OPUS is offline.
* Users can sign with a wallet that holds only USDC while a relayer pays the gas, and can share the terms as a payment link. The app is in four languages.
* No owner, pause, upgrade or protocol fee.

## Proof on Polygon Amoy

| Test job | On-chain job | Result |
| :--- | :--- | :--- |
| Client approves | 1 | Provider paid |
| Refund after expiry | 2 | Client refunded; unused fee returned |
| Auto-payout after a silent review | 3 | Provider paid; the caller received a tip |
| Refund when nothing was submitted | 4 | Client refunded; the caller received a tip |
| Wallets holding no POL | 5 | Provider paid; the relayer paid the gas |
| Payment link, 5 USDC | 7 | Provider paid; gas 0.0244 POL for the client and 0.0023 POL for the provider |

Every hash: [docs/grant/AMOY_EVIDENCE.md](https://github.com/opus-pay/opus-osx/blob/main/docs/grant/AMOY_EVIDENCE.md). The contracts are source-verified on Amoy Polygonscan, with 145 contract test cases including ERC-8183 conformance and invariants. Not yet shown on chain: the counterparty opening a link created by the other side, and a dispute. Both will run before M1 ends.

## Why Polygon

Polygon's 2026 strategy centres on stablecoin payments and cross-border transfers (the Open Money Stack). OPUS adds buyer and seller protection to those payments, at a cost that only works on a cheap chain. It brings USDC volume, wallets that never need POL, and an open-source ERC-8183 implementation that other Polygon builders and AI-agent projects can reuse.

## Business model

The protocol stays free, and the pilot charges no fee. Revenue comes from an optional review fee per job (already working on Amoy; set after the pilot from its data), gas relaying for apps, business tools for errand and freelance services, and partner fees from licensed on- and off-ramps. OPUS never holds customer funds.

## Ask and milestones

We propose the USD 35,000 as an investment rather than a gift. Before the first tranche, the founder signs a letter committing to a SAFE. OPUS's company, formed at the seed round (or within 18 months at the latest), issues the Treasury that SAFE for the full amount, with the valuation cap agreed up front. Until then the founder receives the funds personally, keeps them in a wallet used only for OPUS, and lists every payment from it in the reports.

| Milestone | Deliverable | Check | USD |
| :--- | :--- | :--- | :--- |
| M1. Audit (weeks 0–8) | External audit of about 1,100 lines of core Solidity, fixes, MIT headers, Amoy rerun including a dispute | Public report and new hashes | 22,000 |
| M2. Mainnet and pilot (weeks 8–14) | Polygon PoS deployment, relayer, keeper and indexer live, pilot in one corridor | ≥ 12 completed jobs, ≥ 10 wallets, ≥ 360 USDC settled, all on chain | 8,000 |
| M3. Reporting and reuse (weeks 14–20) | Public metrics dashboard, docs and demo, SDK examples, ERC-8183 feedback, final report | URLs and repository | 5,000 |

POL is converted to USDC within 7 days of each tranche to pay dollar-priced work, and the transactions are reported. If M2's targets are missed, we do not request M3 and we publish why. The full budget breakdown is in the application.

## Risks

Funds stay in the contracts, and cash in and out goes through licensed partners. The contracts are audited before mainnet and capped at 1,000 USD per job. ERC-8183 is still a draft, so we track changes and send feedback. Adoption starts with one corridor and is measured in public.

## Reporting

Targets after the pilot: 5 completed jobs a week for six months, then 10 a week for six more, about 400 completed jobs in total including the pilot. A monthly forum update, and a public dashboard computed from on-chain events by our open-source indexer: jobs by outcome, USDC settled, distinct wallets, share of jobs signed without a gas token, and time to settle.

## Team

**Michael Kim**, founder, Seoul ([@MichaelKim20](https://github.com/MichaelKim20)). A software engineer for more than 30 years. He worked on the Agora chain clients and the DMS loyalty-point contracts and SDKs as technical director of the company contracted to build and operate the BOSAGORA Foundation's technology, and recently on LLM and generative-AI tooling. OPUS commits come from his project account [@science-oneday](https://github.com/science-oneday). In December 2025 the BOSAGORA Foundation's bridge, which he built and ran as that contractor's technical director, lost about 990 million BOA: during a system migration its operator key was on his development machine, and malware hidden in a fake job assignment most likely stole it. The Foundation, which was responsible for the bridge, reissued BOA at once as a new token that every holder received in exchange for the old one, leaving out the 89 percent of the stolen amount that was still in the attacker's wallets or at an exchange. The police investigation closed without identifying the attacker. OPUS, which is independent of BOSAGORA, is designed so that no admin or operator key can move escrowed funds, its deployer and grant-wallet keys stay on a hardware wallet, and it is developed on a different computer. After the incident he wiped every computer and replaced every key. He builds OPUS alone for now; the budget pays outside specialists for the audit, legal review and pilot support.

## Links

* Full application: [docs/grant/APPLICATION.md](https://github.com/opus-pay/opus-osx/blob/main/docs/grant/APPLICATION.md)
* Repository: [github.com/opus-pay/opus-osx](https://github.com/opus-pay/opus-osx)
* Demo video: TODO (YouTube link), on-chain job 7 from link to payment (5 min 47 s)
* Contact: Michael Kim, [michael.kim.200518@gmail.com](mailto:michael.kim.200518@gmail.com)

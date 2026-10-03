# OPUS: funding request to the Polygon Community Treasury

| | |
| :--- | :--- |
| Project | OPUS, escrow for small cross-border jobs paid in USDC |
| Category | Stablecoin payments; agentic commerce (ERC-8183) |
| Network | Polygon PoS. Running on Polygon Amoy (chain id 80002) today |
| Ask | USD 35,000, paid in POL in three milestone tranches, preferably as an investment that converts to equity (SAFE) when the company is formed, or as a standard grant if the Treasury's programme does not take equity |
| Use of funds | External security audit, then mainnet launch and a public pilot |
| Repository | [github.com/opus-pay/opus-osx](https://github.com/opus-pay/opus-osx) |
| Licence | MIT (`LICENSE.md`). The Solidity files, on Amoy and in the repository, still carry a BUSL-1.1 header so that they match the verified deployment; the header changes to MIT at the post-audit redeploy (M1) |
| Recipient | Michael Kim, the founder, personally, until the company exists. The company is formed at the seed round, or within 18 months of the first tranche at the latest. The code, any rights in the OPUS name and unspent funds then move to it, and it issues the Treasury's SAFE (section 10) |
| Contact | Michael Kim, [michael.kim.200518@gmail.com](mailto:michael.kim.200518@gmail.com) |
| Date | 2026-10-02 |

## 1. Summary

OPUS lets two people who have never met settle a small job, from 1 to 1,000 USD, in USDC on Polygon without trusting each other or a platform. The client locks USDC in an escrow contract. The provider is paid when the client approves, or automatically when the review period ends without an objection. If nothing is delivered in time, the client gets the money back.

The contracts are already live on Polygon's test network. Seven test jobs ran end to end, including a dispute that an arbiter decided. In one, a payment link created by the client paid the provider 5 USDC about three minutes after the job was opened.

We ask for USD 35,000 to pay for an external audit, a mainnet launch and a public pilot whose numbers anyone can recompute from the chain.

## 2. The problem

Small paid tasks between distant people have no good way to settle. Examples are buying and shipping an item, filming a place, collecting a document, or running an errand in another city or country.

* **Someone must pay first.** The client fears paying for nothing. The provider fears working for nothing. Today this is settled by personal trust, or the job does not happen.
* **Moving the money is expensive.** Sending USD 200 across borders costs 6.36 percent on average ([World Bank, Remittance Prices Worldwide, Q3 2025](https://remittanceprices.worldbank.org/homepage)), and that pays only for the transfer, not for any protection.
* **Existing escrow does not fit.** A platform's safe-payment feature works only between users of that platform. General escrow services charge percentage fees with minimums larger than a 10 USD job.

## 3. How OPUS works

```
client ── payment link ──> terms reviewed and signed
   │
   └─ USDC locked in escrow ──> provider submits proof (its hash is stored on chain)
                                   │
                ┌──────────────────┼──────────────────────┐
         client approves     review period ends      client objects
                │             with no objection             │
         provider paid        provider paid          both post deposits,
                                                     an arbiter decides
                                                     (no arbiter: the job's default)
  nothing submitted by the deadline ──> client refunded
```

* **The escrow.** One contract per stablecoin holds every job's money. A USDC instance is deployed today; USDT is planned. The 1 to 1,000 USD limits are written into the code.
* **No admin.** The contracts have no owner, pause, upgrade or settings function. Escrowed money can only move by the job's rules. The external audit in M1 is meant to confirm this.
* **Auto-approve review.** If the client does nothing before the review deadline, the provider is paid. If the client objects and the job has an arbiter, a dispute starts: both sides post a deposit and the arbiter decides. The arbiter is an outside arbitration service chosen per job, never the OPUS team. A small job can also be set up with no arbiter; then an objection resolves to the default the job set in advance, which today is payment. A dispute ran on Amoy in step 7 of [AMOY_EVIDENCE.md](AMOY_EVIDENCE.md): the client objected, both sides posted a deposit, and the arbiter ruled.
* **Anyone can finish an overdue job.** Payouts and refunds that are due can be triggered by anyone, so jobs finish even if OPUS goes offline. When a job has a review fee, part of it rewards whoever triggers the payout. When the fee is zero, the client or provider sends that one transaction themselves, or, in the pilot, the OPUS keeper does.
* **No gas token needed.** Users can sign with a wallet that holds only USDC, while a relayer pays the network fee. This ran on Amoy in step 5 of [AMOY_EVIDENCE.md](AMOY_EVIDENCE.md). The relayer refuses signers on a configurable deny-list.
* **Payment links.** A web app turns the agreed terms into a link that the other party opens, reviews and signs. The terms travel in the part of the URL after `#`, which browsers do not send to servers. The app is in English, Korean, Japanese and Chinese.

## 4. Why Polygon

* **Payments are Polygon's focus.** In January 2026 Polygon Labs agreed to buy Coinme and Sequence, about USD 250 million in total, to anchor its "Open Money Stack" for stablecoin payments and cross-border transfers ([CoinDesk](https://www.coindesk.com/business/2026/01/13/polygon-labs-to-acquire-coinme-and-sequence-in-usd250-million-push-into-stablecoin-payments)). OPUS adds buyer and seller protection to exactly those payments.
* **The cost fits small jobs.** The 5 USDC payment-link job used 0.0267 POL of gas in total: 0.0244 POL for the client's five transactions and 0.0023 POL for the provider's one, at 25 gwei on Amoy; mainnet gas prices vary. At any POL price below USD 0.37 that is under one US cent. A 5 USD job only works on a chain this cheap.
* **USDC users can arrive directly.** The pilot starts with people who already hold USDC on an exchange, and many exchanges withdraw USDC on Polygon.
* **What Polygon gets.** USDC volume settled on Polygon, new wallets that never need to hold POL, and an open-source implementation of ERC-8183, mapped clause by clause to the standard, that other Polygon builders and AI-agent projects can reuse.

## 5. What is already built

| Item | Status | Evidence |
| :--- | :--- | :--- |
| Contracts: escrow, factory, review contract, forwarder | Deployed and source-verified on Amoy | [AMOY_EVIDENCE.md](AMOY_EVIDENCE.md) |
| Test jobs on Amoy | 7 runs: approval, refund after expiry, auto-payout after silence, refund after no submission, no-gas-token wallets, payment link, dispute decided by an arbiter | Every transaction hash in [AMOY_EVIDENCE.md](AMOY_EVIDENCE.md) |
| Contract tests | 146 test cases (unit, ERC-8183 conformance, invariants), all passing at commit `36369b5f` | `packages/contracts/test`, run with `yarn contracts test` |
| Audit scope | About 1,100 lines: `OptimisticEvaluator` 676, `OpusAgenticCommerce` 330, `OpusACPFactory` 69, `OpusForwarder` 9, plus interfaces | `packages/contracts/contracts` |
| ERC-8183 conformance map | Each MUST and SHOULD mapped to code and tests | `packages/contracts/docs/ERC8183_CONFORMANCE.md` |
| TypeScript SDK, keeper, relayer, indexer | Written. The SDK, keeper and relayer ran in the Amoy jobs | `packages/sdk`, `packages/keeper`, `packages/relayer`, `packages/indexer` |
| Payment-link app | Written; ran on-chain job 7 | `apps/pay` |
| Whitepaper | English and Korean | `WHITEPAPER.md`, `WHITEPAPER.ko.md` |

Not yet shown on chain: the counterparty opening a link that the other side created (on-chain job 7 was created and opened by the client). It will run on Amoy before M1 ends.

Demo video: TODO (YouTube link) (5 min 47 s). It records on-chain job 7 from start to finish: the client fills in the payment link and signs, funds 5 USDC with a permit, the provider submits the file, and the client approves.

## 6. How OPUS earns money

The protocol charges nothing, so other apps and agents can build on it. Revenue comes from services around it:

* **Review and dispute service.** The operator of the review contract can charge a fee per job. This already works: steps 3 and 4 in AMOY_EVIDENCE.md paid a 0.50 USDC fee to the operator. The fee is chosen per job and shown to the client before signing; there is no switch that changes fees for existing jobs. **The pilot charges no fee**, so people can try OPUS at no cost. An OPUS-run keeper finishes overdue pilot jobs and its gas, a few cents per job, comes from the M2 budget. The fee for regular operation will be set from the pilot data.
* **Gas relaying** for apps and users who do not hold POL.
* **Business tools** for errand, buying-agent and freelance services: payment links, dashboards and notifications.
* **Partner fees** from licensed on-ramps and exchanges. OPUS never holds customer funds and does not hold a payments licence.

After the grant, infrastructure (relayer gas, RPC, one server for the keeper, relayer and indexer) is paid from these fees. On- and off-ramp partner integrations will be funded by a seed equity round that OPUS plans to raise.

## 7. Competition

* **Platform safe payments** (marketplaces and freelance sites) protect only users inside each platform.
* **Escrow services and on-chain escrows** (for example Kleros Escrow) exist. OPUS differs in its 1 to 1,000 USD scope, payout on silence, signing without a gas token and payment links.
* **The first ERC-8183 implementations** target AI agents hiring AI agents. OPUS serves people first on the same standard, so agents can use it unchanged later.

## 8. Milestones and budget

Weeks count from the first tranche. The first tranche (M1) is paid on approval, because the audit must be paid before it starts. The second (M2) is requested only when M1's deliverables are public and checked, and the third (M3) only when M2's are.

| Milestone | Deliverables | Acceptance check | USD |
| :--- | :--- | :--- | :--- |
| **M1. Audit** (weeks 0–8) | Before the audit: rename the review contract's `approve` so wallets stop showing it as a token permission; set every bound still marked as a placeholder, including a lower evaluation-fee cap than today's 100 percent of the budget; MIT headers; threat model and audit pack; freeze the code at a tagged commit. Then: external audit of that commit, about 1,100 lines; fixes, re-checked by the auditor; redeploy on Amoy; rerun all seven scenarios, plus the counterparty link | Public audit report; fix commits; new Amoy hashes | 22,000 |
| **M2. Mainnet and pilot** (weeks 8–14) | Verified Polygon PoS deployment; relayer, keeper and indexer in production; payment links signed without a gas token; pilot in one corridor | At least 12 completed jobs, 10 distinct wallets and 360 USDC settled, all on chain | 8,000 |
| **M3. Public reporting and reuse** (weeks 14–20) | Public metrics dashboard; docs site and demo; SDK examples for Polygon builders; ERC-8183 feedback to its authors; final report | Dashboard and docs URLs; examples in the repository | 5,000 |
| **Total** | | | **35,000** |

| Line | USD |
| :--- | :--- |
| M1: external audit (estimate for about 1,100 lines; the accepted quote will be published) | 20,000 |
| M1: pre-audit changes, fixes, redeploy and reruns | 2,000 |
| M2: relayer and keeper gas, and RPC, for the pilot | 1,500 |
| M2: hosting for 20 weeks (keeper, relayer, indexer) | 1,500 |
| M2: pilot recruiting and user support | 3,500 |
| M2: legal review of the pilot terms | 1,500 |
| M3: docs site and demo | 2,000 |
| M3: dashboard | 1,500 |
| M3: SDK examples and ERC-8183 feedback | 1,500 |

* The M1 audit line is an estimate today. Before the first tranche it is replaced by the accepted quote, which must include the re-check of fixes, and M1 is adjusted to match. If the final invoice is lower, the difference funds a bug bounty after launch.
* If M2's targets are not met by week 18, we do not request M3. We publish what happened and why.
* POL is converted to USDC within 7 days of each tranche, because the audit and hosting are priced in dollars. Each tranche uses the 7-day average POL/USD price before payment, and the conversion transactions are listed in the next report.

## 9. Targets and reporting

The targets are set to be met, not to impress. The pilot proves the mechanism with real users: 12 completed jobs, about two a week for six weeks, are enough to see the common endings (approval, auto-payout, refund) in a real corridor. A dispute has already run on Amoy (step 7 in AMOY_EVIDENCE.md). The USDC figures assume jobs of about 30 USD. After the pilot the weekly pace grows from 5 to 10 completed jobs:

| Period | Completed jobs per week | Completed jobs in the period | Cumulative jobs | Cumulative USDC settled | Cumulative distinct wallets |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Pilot (6 weeks, M2) | 2 | 12 | 12 | 360 | 10 |
| Months 1–6 after the pilot | 5 | 130 | 142 | 4,260 | 80 |
| Months 7–12 after the pilot | 10 | 260 | 402 | 12,060 | 230 |

Growth beyond these numbers will come from partners whose users already pay each other for errands, such as buying agents and diaspora communities.

All numbers come from on-chain events through the open-source indexer, so the Treasury can recompute them:

| Metric | Source |
| :--- | :--- |
| Jobs created, completed, refunded, disputed | Escrow and review-contract events |
| USDC settled on Polygon | Sum of paid-out and refunded budgets |
| Distinct client and provider wallets | Job parties |
| Share of jobs signed without a gas token | Forwarder calls |
| Median time from funding to settlement | Event timestamps |

We will post an update on the Polygon forum every month during the grant, at each milestone, and a final report at week 20. After the grant, we post a quarterly update until month 12 after the pilot, against the targets above.

## 10. What the Treasury gets back

* An audited, MIT-licensed escrow that any Polygon app or AI agent can use for free.
* Real USDC payments settled on Polygon, with public numbers.
* **Equity through a SAFE.** We propose that the Treasury's USD 35,000 be an investment, not a gift. The company does not exist yet, so the steps are:
    1. Before the first tranche, the founder signs a letter that commits OPUS's future company to issue the Treasury a SAFE (simple agreement for future equity) for the full amount received.
    2. When the company is formed at the seed round, it issues that SAFE on standard post-money terms. The SAFE then converts into shares in that round, like the seed investors' money.
    3. The valuation cap and any discount are agreed with the Treasury before the first tranche.
    4. If no company is formed within 18 months of the first tranche, the founder forms one then to issue the SAFE.
    5. The structure is subject to Korean legal review, including the filings needed when a foreign investor holds shares in a Korean company.
* **If the Treasury does not take equity**, we accept the same amount as a standard grant, on the same milestones, deliverables and reporting. The SAFE steps above then do not apply.

## 11. Team

* **Michael Kim**, founder, Seoul ([github.com/MichaelKim20](https://github.com/MichaelKim20)). Builds the product, contracts and apps. A software engineer for more than 30 years, working on Web3 infrastructure, smart contracts and AI systems. As technical director of the company contracted to build and operate the BOSAGORA Foundation's technology, he worked on the Agora chain (execution and consensus clients in Go), the DMS decentralised loyalty-point contracts and SDKs (Solidity, TypeScript, Java), and token and multisig contracts. Recent work includes offline LLM tooling with retrieval and generative-AI pipelines.
* **BOSAGORA bridge incident.** OPUS is independent of BOSAGORA and shares no code, keys, token, company or funds with it. In December 2025 the BOSAGORA Foundation's cross-chain bridge, which the founder built and ran as technical director of that contractor, lost about 990 million BOA. He was migrating the bridge's systems at the time, so its operator key was on his development machine. The key was most likely stolen by malware hidden in a repository sent to him as a fake job assignment, which was run on that machine. The Foundation, which owned the bridge and was responsible for it, immediately reissued BOA as a new token, and every holder received the new token in exchange for the old one. The new token left out about 883 million BOA (89 percent of the stolen amount) that was still in the attacker's wallets or held at an exchange; about 108 million had already been sold. The case was reported to the Korean police, and the investigation closed without identifying the attacker. That incident shaped OPUS: no admin or operator key can move escrowed funds, the deployer and grant-wallet keys are on a hardware wallet (the relayer and keeper hot keys hold only gas money and cannot move escrowed funds), and OPUS is developed on a different computer from the one that was compromised. After the incident he wiped and reinstalled all his computers and replaced every key.
* OPUS commits are made from the project account [@science-oneday](https://github.com/science-oneday), which belongs to the founder.
* There are no other team members or advisors yet. The budget pays outside specialists for the audit, the legal review and pilot support.

OPUS is not yet incorporated, so the founder receives the funds personally. The company will be formed at the seed round, before any integration with a licensed payment partner, and in any case within 18 months of the first tranche. At that point the code, any rights in the OPUS name and any unspent funds move to the company, and the company issues the Treasury its SAFE. Until then the funds are kept in a wallet used only for OPUS, whose address is given at approval, and every payment from it is listed in the reports. The founder will complete any identity checks (KYC) the Treasury requires. The pilot corridor will be fixed before M2 starts: either Korea and one other country, or a Korean region and Seoul.

## 12. Risks

| Risk | Response |
| :--- | :--- |
| Payments and digital-asset regulation | Funds sit only in the contracts, never with OPUS. Cash in and out goes through licensed partners. Legal review before any third-party integration. |
| Contract security | No admin keys to steal; external audit before mainnet; 1,000 USD cap per job; bug bounty after launch. |
| ERC-8183 is still a draft | The code follows the draft as written, and the conformance map shows where. We track changes and send feedback. |
| Adoption | One corridor and one kind of errand first; measured in public; expand only on evidence. |
| Small team | Grant and investment money pay outside specialists for the audit, operations and support. |
| Key compromise | No key can move escrowed funds. Deployer and grant-wallet keys stay on a hardware wallet; relayer and keeper hot keys hold only gas money. See the BOSAGORA item in section 11. |

## 13. Links

* Repository: [github.com/opus-pay/opus-osx](https://github.com/opus-pay/opus-osx)
* Amoy evidence: [AMOY_EVIDENCE.md](AMOY_EVIDENCE.md)
* Operator runbook: [`docs/runbooks/AMOY_LIVE_ACCEPTANCE.md`](../runbooks/AMOY_LIVE_ACCEPTANCE.md)
* Whitepaper: [`WHITEPAPER.md`](../../WHITEPAPER.md)
* ERC-8183: [eips.ethereum.org/EIPS/eip-8183](https://eips.ethereum.org/EIPS/eip-8183)

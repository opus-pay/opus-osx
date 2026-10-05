# OPUS Development Roadmap & Backlog
> **Whitepaper v1.0 / GitHub Projects issue tracker**
>
> OPUS is escrow for **cross-border errands**, built on ERC-8183 (Agentic Commerce) so that AI assistants can use it later without a redesign. Payments are USDC/USDT only, 1–1,000 USD per job. No admin, no protocol fee. Evaluators are paid flat fees whatever the outcome. No token at launch; OPG is planned later as evaluator stake and reward.
>
> Order of work: core → foundations for people (SDK, gasless relayer, payment links) → cross-border errand service in one corridor → audit and mainnet with OPUS Portal → care of parents and more corridors → AI assistants → OPUS Court and OPG.
>
> Issue numbers here are the same as in `GITHUB_ISSUES.md`. Plan assumes **one developer using Cursor**: about **9 weeks** to payment links on testnet and about **13 weeks** to an errand pilot in the first corridor.

---

## Contents
* [Part A. Component Inventory](#part-a-component-inventory)
* [Part B. Open Design Questions](#part-b-open-design-questions)
* [Part C. Milestones and Issues](#part-c-milestones-and-issues)
* [Part D. Schedule, Priority, and Decisions](#part-d-schedule-priority-and-decisions)
* [Part E. Reuse from the Previous Repository](#part-e-reuse-from-the-previous-repository)

---

# Part A. Component Inventory

## A.1 Packages

| Package | Contents | Deployed | Milestone |
| :--- | :--- | :--- | :--- |
| `packages/contracts` | ERC-8183 core, factory, evaluators | Yes, immutable | M1–M3 |
| `packages/sdk` | TypeScript SDK (viem) | npm | M4 |
| `packages/keeper` | Calls permissionless deadline triggers | Hosted | M4 |
| `packages/relayer` | ERC-2771 relay and gas sponsorship | Hosted | M4 |
| `packages/indexer` | Job and instance index for apps and the keeper | Hosted | M4 |
| `wayhand` (separate private repository) | Cross-border errand service (team-run service platform); uses the SDK and contract addresses from this repository by reference only | Hosted | M6 |
| `packages/verifier` | Isolated test runner for `TestRunnerEvaluator` | Hosted | M13 |
| `apps/pay` | Escrow payment link web app | Hosted | M5 |
| `apps/portal` | OPUS Portal: service directory, on-chain stats, my jobs | Hosted (open source) | M12 |
| `apps/docs` | Developer docs and demo | Hosted | M7 |

## A.2 Contracts

| # | Contract | Responsibility | Holds | Depends on |
| :--- | :--- | :--- | :--- | :--- |
| K1 | `OpusAgenticCommerce` | ERC-8183 core. One token, one immutable fee config | **USDC/USDT** | — |
| K2 | `OpusACPFactory` | Permissionless instance creation; stablecoin list fixed at deploy | None | K1 |
| K3 | `OptimisticEvaluator` | Submit/review/extension/dispute deadlines, arbiter slot, defaults, voluntary concession, flat evaluation fee, keeper tips, loser-pays dispute deposits, budget lock; also a hook | **Evaluation fees, dispute deposits** | K1 |
| K4 | `TestRunnerEvaluator` (M13) | Completes or rejects from a signed test result, then hands off to K3 rules | None | K1, K3 |
| K5 | `OpusForwarder` (if D14 = yes) | Immutable ERC-2771 trusted forwarder | None | — |
| K6 | `OpusCourt` (M11) | Staked evaluators drawn at random vote on disputed jobs; stake bounds case size; rewards and slashing; appeals. Plugs into K3's arbiter slot | **Evaluator stakes (USDC, later OPG)** | K3 |

Interfaces: `IAgenticCommerce` and `IACPHook` copied verbatim from the EIP; `IOpusACPExtensions` (withdraw, claimable, getJob); `IOpusEvaluator`.

## A.3 Deploy order

```text
(K5 OpusForwarder) ─▶ K2 OpusACPFactory(stablecoins, forwarder)
                         └─▶ createInstance(USDC, treasury=0, fee=0)   reference instance
K3 OptimisticEvaluator
K4 TestRunnerEvaluator(verifierKeys)          M13
No role grants. No post-deploy configuration calls.
```

---

# Part B. Open Design Questions

## B.1 Core
* **Q1. `fund` signature.** The EIP text shows both `fund(jobId, optParams)` and `fund(jobId, expectedBudget, optParams)`. Use the current text; prefer the version with `expectedBudget`. → **D11**
* **Q2. Fee cap.** `MAX_PLATFORM_FEE_BP` for service instances. → **D2**
* **Q3. Job duration bounds** (`MIN_JOB_DURATION`, `MAX_JOB_DURATION`) and `HOOK_GAS_LIMIT`. → **D2, D3**
* **Q4. Gasless path.** ERC-2771 trusted forwarder (named by the EIP) vs no gasless support at launch. A forwarder must be immutable. → **D14**
* **Q5. USDC permit.** A `fund` path that accepts an EIP-2612 permit would be an extension. Needed at launch, or rely on approve + forwarder? → **D15**
* **Q6. Stablecoins.** Native USDC, USDC.e, USDT on Polygon. The list is fixed at factory deployment. → **D8**

## B.2 Evaluator
* **Q7. Window bounds** for submit, review, extension, dispute, and the safety margin before `expiredAt`. → **D3**
* **Q8. Default arbiter** recommended by the SDK: none, an external arbitration service, or a rule-only default. → **D10**
* **Q9. Budget lock modes:** none / lock after the first quote / no changes after configuration. The standard's hook data does not name the caller, so "after the provider's quote" cannot be enforced; mode 1 locks after the first quote made once a provider is set. Confirm all three are needed.
* **Q9a. Evaluation economics.** Default flat evaluation fee per preset (with a cap relative to budget so a 1 USD job is not charged more than its value), keeper tip size, dispute deposit size (flat or a share of budget), deposit deadline, and how a provider without stablecoin posts a deposit. → **D18**

## B.3 Products
* **Q10. Payment link custody of drafts.** Where unsigned link drafts live (local only vs a small server). → **D30**
* **Q11. Notifications.** Email, Telegram, or webhook first. → **D31**
* **Q12. Test runner isolation (M13).** Container sandbox vs hosted CI; what the signed result contains; how anyone can reproduce it.
* **Q22. First corridor.** Cross-border (for example United States → Korea) or domestic, between a Korean region and a large city (for example a provincial city ↔ Seoul). A domestic corridor removes currency exchange and cross-border rules and can start sooner; it still needs a won ↔ USDC on/off-ramp and a reason for users to prefer stablecoin escrow over won payments. Decides on/off-ramp partners, provider recruiting, and legal review. → **D25**
* **Q23. On- and off-ramp partners.** Card/bank to USDC for clients; USDC to local currency for providers; licensed in the corridor's countries. Funded by equity investment (D29). → **D26**
* **Q24. Wallet onboarding.** Email-login embedded wallets, smart accounts, or plain wallets plus relayer. → **D27**
* **Q25. Request schema.** Fields for each request type (filming, purchasing, later care), completion criteria, required proof; versioning.

## B.4 OPUS Court (M11)
* **Q15. Randomness.** Verifiable randomness source available on Polygon, and fallback if it is late.
* **Q16. Panel and capacity.** Panel sizes per round; capacity multiple (budget ≤ stake × k); minimum stake.
* **Q17. Slashing rules.** Objective faults only at first (no vote, missed deadline, failed reproduction); when to add minority-vote slashing.
* **Q18. Evidence access.** How drawn evaluators get evidence without making it public.
→ **D19**

## B.5 OPUS Portal (M12)
* **Q19. Service metadata.** How a service registers its name, description, and link: a signed message from the instance's fee recipient stored off-chain, or a tiny admin-free on-chain registry that only emits events. → **D23**
* **Q20. Display policy.** Grounds for hiding a service from the Portal, how reports are handled, and how the policy is published.
* **Q21. Hosting.** Conventional hosting plus an IPFS mirror so the Portal stays available.

## B.6 Business
* **Q13. License.** MIT (fits a public-standard implementation with no protocol fee) vs BSL. → **D7**
* **Q14. Standard feedback.** Submit evaluator-fee bias and single-deadline issues to the ERC-8183 discussion. → **D12**

---

# Part C. Milestones and Issues

Priority: `P0` required for the milestone, `P1` should have, `P2` later.

## M0. Setup and standard facts (week 1)

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#1** | `Task` | P0 | Bootstrap repository (monorepo, Hardhat, CI, env, Ledger) |
| **#2** | `Task` | P0 | Verify EVM target for Polygon PoS and Amoy |
| **#3** | `Task` | P0 | ERC-8183 conformance map and verbatim interfaces |
| **#4** | `Task` | P0 | Port and extend test mock tokens and hostile hooks |
| **#5** | `Task` | P1 | Keep the English and Korean whitepapers in sync |

## M1. ERC-8183 core (weeks 1–3)

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#6** | `Feature` | P0 | `OpusAgenticCommerce`: jobs, roles, states |
| **#7** | `Feature` | P0 | Settlement and immutable fee configuration |
| **#8** | `Feature` | P0 | Deferred payouts (`claimable`, `withdraw`) |
| **#9** | `Feature` | P0 | Hooks with gas cap; `claimRefund` unhookable |
| **#10** | `Feature` | P0 | Budget range per job: 1–1,000 USD |
| **#11** | `Feature` | P0 | `OpusACPFactory` and fixed stablecoin list |
| **#12** | `Feature` | P1 | ERC-2771 trusted forwarder support (D14) |
| **#13** | `Feature` | P2 | USDC permit funding path (D15) |

## M2. Evaluator (weeks 4–5)

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#14** | `Feature` | P0 | `OptimisticEvaluator`: configuration and hook |
| **#15** | `Feature` | P0 | `OptimisticEvaluator`: deadlines, approval, objection, arbitration, defaults, voluntary concession |
| **#16** | `Feature` | P0 | Evaluation fee and keeper tips |
| **#17** | `Feature` | P1 | Budget lock modes |
| **#53** | `Feature` | P0 | Dispute deposits: loser pays the arbiter |
| **#54** | `Feature` | P1 | Arbiter interface and external arbitration adapter |

## M3. Verification (weeks 5–6)

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#18** | `Test` | P0 | Unit test completeness and coverage |
| **#19** | `Test` | P0 | Invariant suite (I-1, I-2, I-4, I-7, I-9) |
| **#20** | `Test` | P0 | ERC-8183 conformance suite (I-8) |
| **#21** | `Task` | P0 | Static analysis and no-admin check (I-6) |

## M4. Deploy, SDK, and infrastructure (weeks 6–7)

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#22** | `Task` | P0 | Deploy scripts and Amoy deployment |
| **#23** | `Feature` | P0 | TypeScript SDK |
| **#24** | `Feature` | P0 | Keeper |
| **#25** | `Feature` | P0 | Relayer (gasless; required for errands) |
| **#26** | `Task` | P1 | Indexing via a hosted indexer |

## M5. First product: escrow payment links (weeks 7–9)

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#27** | `Feature` | P0 | Payment link: create, share, fund |
| **#28** | `Feature` | P0 | Payment link: submit, review, object, status |
| **#29** | `Feature` | P1 | Notifications |
| **#30** | `Feature` | P1 | Completion-criteria helper |

## M6. Cross-border errand service, stage 1 (weeks 9–13)

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#67** | `Legal` | P0 | Corridor, service entity, terms, prohibited requests |
| **#68** | `Feature` | P0 | Machine-readable request schema |
| **#69** | `Feature` | P0 | Provider onboarding and verification |
| **#70** | `Feature` | P0 | Request posting, quotes, and selection |
| **#71** | `Feature` | P0 | Proof capture: video, receipts, tracking |
| **#72** | `Feature` | P0 | On- and off-ramp integration |
| **#73** | `Feature` | P0 | Wallet onboarding and gasless use |
| **#74** | `Task` | P0 | Support, dispute operations, default arbiter |
| **#76** | `Feature` | P0 | Errand app trial: screens and public/private API |
| **#77** | `Feature` | P0 | Errand app: connect the real escrow |
| **#78** | `Task` | P0 | Errand data: database and proof storage |
| **#79** | `Task` | P0 | Errand app: hosting, security and operations |
| **#80** | `Task` | P0 | Errand content rules, reports and moderation |
| **#81** | `Feature` | P1 | Errand notifications |
| **#82** | `Task` | P1 | Errand service name, domain and brand |

## M7. Validation (weeks 13–16)

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#34** | `Docs` | P0 | Docs site and demo |
| **#35** | `Task` | P0 | Errand pilot in the first corridor |
| **#36** | `Task` | P0 | Polygon grant application |
| **#37** | `Task` | P1 | ERC-8183 feedback submission |
| **#38** | `Docs` | P1 | Traction metrics |

## M8. Audit and mainnet (after M7)

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#39** | `Security` | P0 | Threat model and audit pack |
| **#40** | `Security` | P0 | External audit |
| **#41** | `Security` | P1 | Bug bounty |
| **#42** | `Release` | P0 | Mainnet deployment |

## M9. Entity and legal (in parallel from M7)

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#43** | `Legal` | P0 | Entity structure |
| **#44** | `Legal` | P0 | Legal review before third-party integration |
| **#45** | `Legal` | P1 | License decision |

## M10. Later backlog

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#46** | `Feature` | P2 | Errands stage 2: care of parents; more corridors |
| **#47** | `Feature` | P2 | `RubricEvaluator` (AI scoring with human fallback) |
| **#48** | `Feature` | P2 | `OracleEvaluator` (external data) |
| **#50** | `Feature` | P2 | Provider bond hook |
| **#51** | `Feature` | P2 | Signature-based agreement execution (one-transaction assign + fund) |
| **#52** | `Task` | P2 | OPG as evaluator stake and reward: go / no-go |

## M12. OPUS Portal (alongside M7–M8)

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#62** | `Feature` | P1 | Service metadata registration (D23) |
| **#63** | `Feature` | P1 | Service directory and on-chain statistics |
| **#64** | `Feature` | P1 | My jobs across services |
| **#65** | `Feature` | P2 | Evaluator and arbiter directory |
| **#66** | `Task` | P1 | Display policy, reporting, open source, IPFS mirror |

## M13. AI assistants and agents (after mainnet)

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#75** | `Feature` | P2 | AI assistant tool (e.g. MCP server) for the errand service |
| **#49** | `Feature` | P2 | ERC-8004 reputation integration |
| **#31** | `Feature` | P2 | Verifier service (isolated test runner) |
| **#32** | `Feature` | P2 | `TestRunnerEvaluator` |
| **#33** | `Feature` | P2 | Agent-to-agent integration example |

## M11. OPUS Court (after mainnet)

| # | Type | P | Title |
| :--- | :--- | :--- | :--- |
| **#55** | `Feature` | P1 | Evaluator registry and USDC stake |
| **#56** | `Feature` | P1 | Capacity rule: stake bounds case size |
| **#57** | `Feature` | P1 | Random, stake-weighted panel drawing |
| **#58** | `Feature` | P1 | Commit-reveal voting and rulings |
| **#59** | `Feature` | P1 | Rewards from deposits; slashing for objective faults |
| **#60** | `Feature` | P2 | Appeals and minority-vote slashing |
| **#61** | `Security` | P1 | Court threat model, audit, and testnet trial |

---

# Part D. Schedule, Priority, and Decisions

## D.1 Critical path

```text
#1 bootstrap ─▶ #2 EVM ─▶ #3 conformance map ─▶ #6 core ─▶ #7 settlement ─▶ #8 payouts
                                                    │
                          #9 hooks ─▶ #10 budget range ─▶ #11 factory
                                                    │
                          #14 evaluator config ─▶ #15 evaluator flow ─▶ #16 fees & tips ─▶ #53 deposits
                                                    │
                          #19 invariants ─▶ #20 conformance ─▶ #22 Amoy deploy
                                                    │
               ┌────────────────────────────────────┼─────────────────────────┐
               ▼                                    ▼                         ▼
          #23 SDK ─▶ #25 relayer         #27–#28 payment link        #67 corridor & terms
                     #24 keeper                     │                     │
                                                    ▼                     ▼
                                   #68–#74 errand service, stage 1 (schema, providers, quotes,
                                           proof, on/off-ramp, onboarding, support)
                                                    │
                                                    ▼
                         #34 demo ─▶ #35 corridor pilot ─▶ #36 grant ─▶ #39 audit pack ─▶ #40 audit ─▶ #42 mainnet
```

## D.2 Week plan (one developer)

| Week | Focus | Issues | Exit check |
| :--- | :--- | :--- | :--- |
| 1 | Setup, standard facts | #1–#5 | Build green; conformance map written; D1, D11 decided |
| 2 | Core | #6, #7, #8 | Standard flow passes unit tests |
| 3 | Core safety, factory | #9, #10, #11, (#12) | Hostile-hook and budget-range tests pass |
| 4–5 | Evaluator | #14, #15, #16, #53, (#17, #54) | Every evaluator branch tested at deadline − 1 and deadline; fee and deposit flows balance |
| 5–6 | Verification | #18–#21 | Invariants, conformance, no-admin check in CI |
| 6–7 | Deploy, SDK, keeper, relayer | #22–#25, (#26) | Amoy deployment; SDK runs full flow; keeper earns a tip; a wallet with no POL completes a job |
| 7–9 | Payment links | #27–#30 | Two people complete a real paid job on Amoy |
| 9–13 | Errand service, stage 1 | #67–#74 | In one corridor, a real filming or purchasing errand is paid through card on-ramp and cashed out locally |
| 13–16 | Validation, Portal | #34–#38, #62–#64 | Corridor pilot; grant submitted; Portal lists the team's services |

Weeks overlap slightly; parentheses mark P1 items that can slip.

## D.3 Rules for a solo schedule
* Do not start M5 before M3 is green. Immutable contracts cannot be fixed later.
* Read the core invariants and the conformance tests yourself; do not rely only on AI-written tests.
* Keep M10 closed until pilot users ask for something in it.
* Do not start errands stage 2 (care of parents) until provider verification and reputation work in stage 1 and a safety and legal review is written.
* Keep M13 (AI) behind the errand service; the groundwork (request schema #68, standard conformance) is already in the plan.
* Start M11 (OPUS Court) only after mainnet, and only if disputes are frequent enough that a single arbiter becomes a bottleneck or a trust problem.

## D.4 Decisions

| # | Decision | Status | Blocks |
| :--- | :--- | :--- | :--- |
| D1 | EVM target and OZ version | **Decided: Solidity 0.8.24, `evmVersion` `cancun`, OpenZeppelin 5.6.1** | — |
| D2 | `MAX_PLATFORM_FEE_BP`, `HOOK_GAS_LIMIT` | **Proposed (2026-10-05): fee cap 1,000 (10%)** as a user-protection ceiling; each service picks its own rate below it (WayHand: 5% on completion only). Confirm with `HOOK_GAS_LIMIT` before #42 | #7, #9, #42 |
| D3 | Job duration bounds; evaluator window bounds; safety margin | Open | #6, #14 |
| D4 | Budget range | **Decided: 1–1,000 USD per job, fixed constant** | — |
| D5 | Foundry for invariant tests | Open | #19 |
| D7 | License (MIT vs BSL) | **Decided: MIT.** Solidity SPDX headers switch at the next deployment | #45 |
| D8 | Stablecoins in the factory list | **Decided: constructor list, no hardcoded addresses** | — |
| D10 | Default arbiter recommended by the SDK | Open | #23 |
| D11 | `fund` signature per current EIP text | **Decided: `fund(jobId, expectedBudget, optParams)`** | — |
| D12 | Submit feedback to ERC-8183 | Open | #37 |
| D13 | Protocol fee | **Decided: none** | — |
| D14 | ERC-2771 forwarder at launch | **Decided: yes** — `OpusForwarder` | #25 |
| D15 | USDC permit funding path | **Decided: yes** — `fundWithPermit` | — |
| D16 | Signature-based agreement execution | **Decided: not at launch** (backlog #51) | — |
| D17 | Token at launch | **Decided: none** (review in #52) | — |
| D18 | Evaluation fee, keeper tip, dispute deposit amounts (fee capped relative to budget) | Open | #16, #53 |
| D19 | OPUS Court parameters (randomness, panel sizes, capacity multiple, slashing) | Open | M11 |
| D20 | Evaluator stake asset | **Decided: USDC first, OPG only after the Court works and legal review** | #55, #52 |
| D21 | Voluntary concession | **Decided: client may approve any time after submission; provider may withdraw any time** | — |
| D22 | Client deposit in confirmation mode | **Decided: posted up front at configuration, returned if no dispute** | #53 |
| D23 | Service metadata registration method | Open | #62 |
| D24 | Portal role | **Decided: directory of services only; no matching, no custody, no special rights.** The team's platform app (non-custodial wallet, push, SDK, on-ramp links, per-service instances) is a separate product outside this repository, not the OPUS Portal (D32) | — |
| D25 | First errand corridor | **Decided (2026-10-05): Korea–Japan.** The errand service opens countries by a setting; local checks and shipping only, buying stays closed until arbiters exist (#74) | #67 |
| D26 | On- and off-ramp partners | Open | #72 |
| D27 | Wallet onboarding approach | **Direction (2026-10-05): non-custodial embedded wallets** from a proven provider, exposed through the standard EIP-1193 / EIP-6963 provider so one web app works in browsers, wallet apps and the platform app. No team-held keys | #73 |
| D28 | Business focus | **Decided: cross-border errands first; AI assistants as the growth path on the same standard** | — |
| D29 | Money in and out | **Decided: OPUS and its services never hold licences for card, bank, or exchange flows. Equity funding pays for integrations with licensed partners (card/bank on-ramps, exchanges for cash-out, later won stablecoin issuers and payment gateways). Until then, pilots use users who already buy USDC on exchanges** | #43, #72, D26 |
| D30 | Payment-link draft custody | **Decided: the unsigned draft is the URL fragment. No server stores it. The chain stores only the description hash** | #27 |
| D31 | Pilot notification channel | **Decided: HTTPS webhook first. Email and Telegram wait** | #29 |
| D32 | Where new ideas attach | **Decided (2026-10-05): the core stays frozen.** Platform fees and fee splitting (instance treasury → a splitter), platform arbitration (evaluator or arbiter address), cross-service reputation (indexer), policy checks (hooks) all attach to the factory, evaluators and hooks. Splitters, platform evaluators and policy hooks are periphery contracts kept outside this repository; this repository's deployments keep a 0% fee. A core v2 is considered only when pilots show a need the existing pieces cannot meet (top-up after funding, deadline extension, partial release) | — |
| D33 | Audit timing | **Decided (2026-10-05): mainnet pilot before the external audit.** Before it: AI deep review (independent reviewers, attack tests, fuzzing, published report); 100 USD per-job cap kept; services cap the total funded value at once, invite users and state that the contracts are not externally audited; indexer alerts; a prepared move to a new deployment. External audit (#40) after revenue or investment, then the cap rises to 1,000 USD | #40, #42 |

---

# Part E. Reuse from the Previous Repository

The previous repository is archived, not deleted. Copy only what is listed here; write the new core from the specification.

| Reuse | From | Into |
| :--- | :--- | :--- |
| yarn workspaces, Hardhat config, CI workflow | root, `packages/contracts` | #1 |
| Network env files, Ledger signing setup | `packages/contracts/env`, Hardhat config | #1 |
| Deploy script pattern that records addresses per network | `deploy/<network>` | #22 |
| Mock tokens: permit, reentrant, fee-on-transfer; add blacklist | `contracts/mocks` | #4 |
| Invariant test handler pattern | `test/invariant` | #19 |

Do **not** copy: escrow, shop, vault, oracle, credit, registry, roles, or their tests.

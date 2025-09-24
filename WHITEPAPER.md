# OPUS Whitepaper
> **Escrow for cross-border errands, built on the ERC-8183 standard so that AI assistants can use it tomorrow**
>
> Version 1.0 · Draft

---

## Table of Contents
1. [Summary](#1-summary)
2. [Problem](#2-problem)
3. [Design Principles](#3-design-principles)
4. [The Standard: ERC-8183](#4-the-standard-erc-8183)
5. [Architecture](#5-architecture)
6. [Job Lifecycle](#6-job-lifecycle)
7. [Evaluation](#7-evaluation)
8. [What OPUS Adds to ERC-8183](#8-what-opus-adds-to-erc-8183)
9. [Fees and Economics](#9-fees-and-economics)
10. [Security Model](#10-security-model)
11. [Products and Use Cases](#11-products-and-use-cases)
12. [OPG Token (Deferred)](#12-opg-token-deferred)
13. [Regulatory Positioning and Risks](#13-regulatory-positioning-and-risks)
14. [Roadmap and Funding](#14-roadmap-and-funding)
15. [Disclaimer](#15-disclaimer)
- [Appendix. Glossary](#appendix-glossary)

---

## 1. Summary

A daughter in New York wants someone to go with her parents to a hospital visit in Seoul. A son in Los Angeles wants a limited-edition item bought in New York and sent to his cousin in Tokyo. Someone wants a video of a street they grew up on. These are **cross-border errands**: a person in one country asks a person in another to do something real, checks the result, and pays.

Today this is hard. The two people do not know each other, the payment crosses borders, and whoever goes first carries all the risk. Existing proxy and errand services hold the money themselves and decide disputes themselves.

**OPUS is an escrow protocol for this.** The client's payment (in USDC or USDT) is locked when the work is agreed, and released to the local provider when the work is done, or returned to the client when it is not. No one, including the OPUS team, can move the money any other way.

OPUS is built on **ERC-8183 (Agentic Commerce)**, the Ethereum standard for escrowed work. The standard does not care whether the client is a person or an AI agent. That is deliberate: **today people post errands; tomorrow their AI assistants will**, and they will find the same contracts, the same rules, and the same providers already in place.

On top of the standard, OPUS adds:

* **A safer implementation.** No owner, pause, upgrade, or admin setters. Settlement still completes when a stablecoin issuer freezes an address. People without gas can take part through relayed transactions.
* **Fair evaluation.** Review windows, objections, arbitration, and defaults written as rules, with evaluators paid the same whichever side wins.
* **Protection for people.** When one side goes silent, the default favours the person who did the work or the person who is waiting, never the side that simply stopped responding.

The first service built on OPUS is a **cross-border errand service**, starting with one corridor (cross-border, or between a region and a large city within one country) and simple, checkable tasks (filming a place, buying and shipping an item). **OPUS Portal** gathers every service built on OPUS in one place. The protocol issues no payment token, takes no protocol fee, and limits each job to 1–1,000 USD.

---

## 2. Problem

* **Trust across borders.** The client cannot see the provider, and the provider cannot be sure of being paid. Paying first or working first both leave one side exposed.
* **Payments across borders.** Sending a small amount to a stranger abroad is slow, expensive, or impossible through banks. Stablecoins move quickly and cheaply, but on their own they offer no protection if the work is not done.
* **Intermediaries hold the money.** Proxy-shopping and errand services keep customer funds and decide disputes at their discretion, and they are limited by banking and borders.
* **People and machines are not symmetric.** When AI assistants start posting errands for their users, they will be always online and fast; the people doing the errands will not. Rules that suit machines can cost the person who did real work.
* **Standards define only the skeleton.** ERC-8183 defines creating, funding, submitting, evaluating, and settling a job, but leaves open how to evaluate and what happens when an evaluator does nothing. The specification states that there is no dispute resolution and that reject or expiry is final.
* **Admin keys move trust, they do not remove it.** An escrow that someone can pause or reconfigure asks users to trust that someone.

---

## 3. Design Principles

1. **Standard-compatible.** Functions, events, states, and roles follow ERC-8183 exactly. Extensions never change standard behaviour.
2. **No admin.** No owner, roles, pause, proxy, or setters in any deployed contract. Safety limits, such as the 1–1,000 USD budget range, are constants in code.
3. **Fixed terms.** After funding, provider, evaluator, budget, expiry, hook, and evaluation rules cannot change.
4. **Every job ends.** Permissionless triggers guarantee that funds are never stuck, even if parties disappear.
5. **Protect the human.** When a person and an AI transact, silence defaults in the person's favour.
6. **Neutral evaluator pay.** Whoever rules is paid the same whatever the outcome.
7. **Hashes, not data.** Job details, evidence, and personal data stay off-chain; only hashes or URIs go on-chain.
8. **Neutral to integrators.** Services run by the OPUS team use the same contracts and SDK as everyone else.
9. **People now, AI next.** Requests, proofs, and reputation are stored in structured, machine-readable form, so AI assistants can post and understand errands without a redesign.

---

## 4. The Standard: ERC-8183

### 4.1 Overview

ERC-8183 "Agentic Commerce" is a draft Ethereum standard created on 2026-02-25. It defines escrow around a single unit, the **job**.

| Role | What it does |
| :--- | :--- |
| **Client** | Creates the job (`createJob`), sets the provider (`setProvider`), funds the budget (`fund`). Can reject the job before funding |
| **Provider** | Proposes a budget (`setBudget`) and submits the result as a `bytes32` hash (`submit`) |
| **Evaluator** | The only party that can `complete` a submitted job or `reject` a funded or submitted job. May be a contract |

States run `Open → Funded → Submitted → Completed / Rejected / Expired`. After `expiredAt`, anyone can call `claimRefund` to return the funds to the client. Each job may attach a hook contract that runs before and after actions; `claimRefund` is not hookable, so the refund path always survives.

### 4.2 What the standard assumes

The standard is deliberately minimal. Its motivation is that many use cases need only three things: the client locks funds, the provider submits work, and one evaluator signals completion. It assumes that parties discover each other and negotiate **off-chain**, then create the job; that each party sends its own transactions; and that extensions come through hooks or separate standards. It names ERC-2771 meta-transactions as an optional extension for gasless use.

### 4.3 Why follow it

* **Ready for AI assistants.** When people's assistants begin to commission errands, they will speak the standard, not a custom escrow. Following it now costs little and keeps that path open.
* **Integration.** Agent frameworks, wallets, and reputation systems integrate with the standard, not with custom escrows.
* **Composition.** It fits ERC-8004 reputation and x402 payments. An evaluator's reason hash can feed reputation records.
* **Trust.** An implementation of a public standard is easier for auditors and integrators to understand.

### 4.4 Place in the agent payment stack

| Standard | Role | Analogy |
| :--- | :--- | :--- |
| ERC-8004 | Agent identity, capabilities, reputation | Résumé |
| x402 | Instant API micropayments | Cash register |
| **ERC-8183 (OPUS)** | Escrow for work that takes time and needs evaluation | Contract and escrow |

---

## 5. Architecture

```text
┌─────────────────────────────────────────────────────────┐
│ OPUS Portal: directory of services, on-chain stats,     │   Discovery (no special rights)
│ my jobs across services, evaluators                     │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
│ AI agent  │ │ Escrow    │ │ Freelance │ │ Third-    │   Agents and service platforms
│ frameworks│ │ payment   │ │ and task  │ │ party     │
│           │ │ links     │ │ boards    │ │ apps      │
└─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
      └─────────────┴──────┬──────┴─────────────┘
                           ▼   ERC-8183 calls + OPUS SDK
┌─────────────────────────────────────────────────────────┐
│ Off-chain: SDK · indexer · relayer · keeper             │
├─────────────────────────────────────────────────────────┤
│ On-chain (immutable, no admin)                          │
│   OpusACPFactory      : anyone creates an instance      │
│   OpusAgenticCommerce : ERC-8183 core (one per token    │
│                         and fee configuration)          │
│   OptimisticEvaluator : review, objection, arbitration, │
│                         default outcome                 │
└─────────────────────────────────────────────────────────┘
```

* **Core instance (`OpusAgenticCommerce`).** Implements ERC-8183. Each instance has one token (USDC or USDT) and one immutable fee configuration.
* **Factory (`OpusACPFactory`).** Anyone can create an instance with its own fee setting. Service platforms get their own instances; the OPUS team does not sit in the middle.
* **Evaluators.** `OptimisticEvaluator` carries OPUS's evaluation rules (§7). Other evaluators work with the same core.
* **OPUS Court (later phase).** A voting contract in which staked evaluators decide disputed jobs (§7.7). It plugs into the arbiter slot of `OptimisticEvaluator`; nothing in the core changes.
* **Relayer.** Submits transactions on behalf of users without gas, using the ERC-2771 pattern the standard names.
* **Keeper.** Calls permissionless deadline triggers before expiry. If it stops, anyone can make the same calls.
* **Service platforms.** Identity checks, matching, evidence collection, notifications, and support belong to the services built on OPUS, including those the team runs.
* **OPUS Portal.** A website that gathers every service built on OPUS in one place, with statistics computed from on-chain data (§11.3). It introduces services; it does not match parties or hold funds.

---

## 6. Job Lifecycle

### 6.1 Standard flow

```text
(off-chain) parties find each other and agree
      │
      ▼
Client: createJob(provider, evaluator, expiredAt, description, hook)
      │
      ▼
Provider: setBudget(amount)          ← the provider's quote
      │
      ▼
Client: fund(jobId, expectedBudget)  ← reverts if the budget changed
      │
      ▼
[Funded] ── Provider: submit(deliverableHash) ──▶ [Submitted]
      │                                              │
      │                              Evaluator: complete ─▶ Completed (provider paid)
      │                              Evaluator: reject   ─▶ Rejected  (client refunded)
      │
      └── after expiredAt, anyone: claimRefund ─▶ Expired (client refunded)
```

* **One provider per job.** Only the client can set the provider, and only once. Only that provider can submit, so two providers can never be paid for the same job.
* **The provider takes part through `setBudget`.** The provider quotes, and the client funds exactly that amount; `fund` reverts if the budget changed in between.
* **Before working, the provider checks the funded amount.** A provider loses nothing before submitting, and after submission the client cannot pull the funds back. The OPUS SDK blocks work from starting unless the funded amount equals the agreed amount.
* **After funding, the client cannot cancel alone.** The standard lets only the evaluator reject a funded job, which protects a provider who has started. If the provider cannot do the work, it withdraws (§7.3) and the client is refunded; if it simply disappears, the submit deadline refunds the client.

### 6.2 Selection and dispatch

| Mode | How the provider is chosen | Fits |
| :--- | :--- | :--- |
| **Selection** | Providers quote off-chain; the client picks one and calls `setProvider` | Freelance, audits, high-value work |
| **Dispatch** | The service matches off-chain (first eligible provider to accept); the client side calls `setProvider` | Errands, standard tasks, automated AI orders |
| **Pre-agreed** | Terms and wallet addresses were agreed elsewhere; the client creates the job directly with the provider set | Escrow payment links, deals from other platforms |

In every mode the on-chain rule is the same: the client assigns exactly one provider. An AI client can assign automatically; a human client confirms with one click.

### 6.3 Flow with the OPUS evaluator

```text
Funded
  ├─ provider submits before the submit deadline ─▶ Submitted (review timer starts)
  └─ submit deadline passed ─▶ anyone: timeoutNoSubmission() ─▶ reject ─▶ client refunded

Submitted
  ├─ client approves (any time)           ─▶ complete
  ├─ provider withdraws (any time)        ─▶ reject (client refunded)
  ├─ client objects within review         ─▶ arbitration
  ├─ client extends review once           ─▶ later review deadline
  └─ review ended with no response
        auto-complete setting    ─▶ anyone: finalize()          ─▶ complete
        confirmation setting     ─▶ anyone: escalateOnSilence() ─▶ arbitration

Arbitration
  ├─ arbiter rules in time ─▶ complete or reject
  └─ deadline passed       ─▶ anyone: resolveByDefault() ─▶ preset default
```

The sum of all evaluator deadlines (submit, review, extension, deposit, dispute) plus a safety margin is forced, at funding time, to end before the core's `expiredAt`, so the evaluator's rules always act before the standard's expiry refund. Deadlines are counted from scheduled times, not from when someone calls a trigger, so a late call never pushes them back. If the evaluator itself failed, `claimRefund` would still return the funds to the client after `expiredAt`.

### 6.4 Partial delivery

ERC-8183 outcomes are binary: complete or reject. Partial delivery is handled by splitting large work into several smaller jobs (milestones), each evaluated on its own.

---

## 7. Evaluation

### 7.1 The goal

Perfectly objective evaluation does not exist, between people or between agents. OPUS aims for evaluation that is **known in advance, contestable, and always finishes**. Most of the work is done before any dispute:

1. **Move evaluation forward.** Most disputes come from vague requirements. The SDK helps turn "a good report" into checkable completion criteria (for example "five competitors, one table per competitor, source links") and records their hash in the job.
2. **Start with verifiable work.** Tests, file hashes, and delivery tracking make evaluation almost mechanical.
3. **Rely on incentives more than rulings.** Deadlines, defaults, dispute deposits, and reputation make settling cheaper than fighting, so few jobs reach a vote.
4. **Assume rulings can be wrong.** Record the reasons, allow appeal, and let evaluators who rule badly lose stake. The 1,000 USD budget cap keeps any single mistake small.

### 7.2 Layers

```text
Submission
   ├─ 1. Automatic checks (tests, hashes, formats) ── fail → reject
   ├─ 2. Review window (client confirms, or silence resolves by setting)
   ├─ 3. Objection → both parties post dispute deposits
   └─ 4. Arbiter rules: a single arbiter at launch, OPUS Court (staked evaluators vote) later
          → default if no ruling in time
```

### 7.3 Voluntary concession

**Any party may, at any time, concede in the other party's favour.** Conceding costs no one else anything, so it needs no evaluation.

* **The client may approve at any time after submission**, including during review, during a dispute, and during a Court vote. The job completes and the provider is paid. This is how a client withdraws an objection.
* **The provider may withdraw at any time after funding**, including after submitting and during a dispute. The job is rejected and the client is refunded.
* If a party concedes during a dispute, the arbiter or Court is paid from the conceding party's deposit, as if it had lost.

ERC-8183 lets only the evaluator call `complete` and `reject`. Every OPUS evaluator therefore exposes `approve` (client) and `withdrawAsProvider` (provider) and forwards them to the core. A submission is still required before completion, because the standard completes only submitted jobs.

### 7.4 `OptimisticEvaluator` configuration

The client sets rules per job before funding. They cannot change afterwards.

| Setting | Meaning |
| :--- | :--- |
| Submit window | Time after funding for the provider to submit |
| Review window | Time after submission for the client to approve or object |
| Maximum extension | How far the client may extend review, once |
| On silence | Auto-complete, or escalate to arbitration (requires an arbiter) |
| Arbiter | A single address or a Court contract. If none, an objection resolves to the default at once; only auto-complete mode may run without an arbiter |
| Dispute window | Time for the arbiter to rule |
| Default | Complete or reject if the arbiter does not rule in time |
| Evaluation fee | Flat fee paid by the client to the evaluation operator, whatever the outcome (§7.6) |
| Dispute deposit | Amount each party posts on escalation; the loser's deposit pays the arbiter (§7.6). In confirmation mode the client posts its deposit up front at configuration |
| Budget lock | Optionally forbid budget changes after the first quote once a provider is chosen, or after configuration |

The arbiter cannot be the client or the provider.

### 7.5 Recommended presets

| Trade | Preset |
| :--- | :--- |
| AI client → AI provider | Auto-complete on silence, short windows |
| AI client → human provider (errands, freelance) | Auto-complete on silence, protecting the person who did the work |
| Human client → any provider | Escalate on silence, longer review, arbiter set |
| Small amounts, no arbiter | Auto-complete on silence; an objection resolves to the default in the service's published policy |

This is the same principle as automatic purchase confirmation on online marketplaces: it is accepted when there is proof of delivery first, notifications, and enough time. OPUS services notify parties on submission, near deadlines, and before auto-completion.

### 7.6 Paying evaluators

Evaluation is work. If it is unpaid, no one does it well, and the burden falls on whoever runs the software. OPUS pays for it explicitly, and always in a way that does not depend on which side wins.

| Who | Paid for | How |
| :--- | :--- | :--- |
| **Evaluation operator** (whoever runs the evaluator service, including test runners) | Evaluating the job | A flat evaluation fee the client deposits at configuration, paid when the job ends, **whatever the outcome**. Test-running evaluators include compute cost in this fee |
| **Keeper** (anyone) | Calling deadline triggers such as `finalize` or `timeoutNoSubmission` on time | A small tip from the evaluation fee to whoever makes the call. Anyone can earn it, so liveness does not depend on one operator |
| **Arbiter or Court** | Ruling on a dispute | On escalation, both parties post a dispute deposit. The ruling pays the arbiter from the **loser's** deposit and returns the winner's. A party that does not post its deposit in time loses: if the client objects and the provider does not post, the client is refunded. The arbiter earns the same amount for either ruling |

Why this shape:

* **Neutral.** No payment depends on completing rather than rejecting, unlike the standard's completion-only evaluator fee.
* **Flat, not a percentage.** The evaluation fee is the price of a service the client chose, not a cut of the payment flow. Anyone can run an evaluator and compete on price and quality. This is consistent with OPUS taking no protocol fee (§9).
* **Fewer frivolous disputes.** Objecting costs a deposit that is lost if the objection fails.
* **Visible up front.** The client sees the evaluation fee and possible dispute deposit before funding, and the provider sees them before quoting.

**Two rules keep this consistent with the rest of the design.**

* **Silence must not become a loss for a silent human client.** In confirmation mode (human clients), escalation happens because the client did not respond, so the client may never post a deposit. To keep silence from turning into an automatic loss, a client who chooses confirmation mode posts its dispute deposit **up front at configuration**; it is returned if there is no dispute.
* **Evaluation must never cost more than the work.** For small jobs, SDK presets keep the evaluation fee a small share of the budget and use no arbiter, so a 1 USD job is not charged a larger fee. Exact amounts are set per preset.

Where a provider must post a dispute deposit but holds no stablecoin, services can let the provider fund it through the relayer or pre-post it when quoting.

### 7.7 Staked evaluators and OPUS Court

A single arbiter can be bribed or simply wrong. In a later phase OPUS replaces the single arbiter with **OPUS Court**, one evaluator contract in which many staked evaluators vote.

```text
Dispute escalated to OPUS Court
   ├─ Evaluators are drawn at random, weighted by stake (e.g. 3, then 5, 7 on appeal)
   │     only evaluators whose stake covers this job's budget are eligible
   ├─ Drawn evaluators see the evidence (off-chain, access limited to them)
   ├─ Commit a hidden vote, then reveal
   ├─ Majority decides: complete or reject
   ├─ Majority voters share the loser's dispute deposit; no-shows lose part of their stake
   │     (slashing for minority votes only after appeals exist)
   └─ Appeal: more evaluators, higher deposit; a final round has a fixed default
```

* **Stake sets capacity.** An evaluator can be drawn only for jobs whose budget is within a multiple of its stake, and part of its stake is locked for each open case. This makes it expensive to flood the Court with fake evaluators and keeps small stakes from judging large jobs. Stake alone does not stop bribery of a majority, since a bribed majority is not slashed; what makes bribery costly is **appeal to a larger panel**, where the bribed evaluators become the minority and lose stake. The 1,000 USD budget cap keeps both the stake needed and the value at risk per case modest.
* **Stake is at risk.** Evaluators who vote against the majority, fail to vote, or sign provably false results lose part of their stake. At first, slashing applies only to **objective faults** (not voting, missing deadlines, signatures that fail reproduction); slashing for minority votes starts only once appeals are in place.
* **Randomness.** Drawing uses verifiable randomness so no one can pick the panel.
* **Neutral pay.** As in §7.6, evaluators are paid from the loser's deposit, the same amount whichever way they vote with the majority.

**Known weaknesses.** Majority-reward voting can drift toward guessing what others will vote rather than judging the facts; it works best when completion criteria are specific, which is another reason to fix them before funding (§7.1). Voting takes days and costs more than a single arbiter, so only disputed jobs reach the Court. Evidence must be shared with drawn evaluators, which limits use for jobs with personal data.

**Phases.** The arbiter slot in `OptimisticEvaluator` takes any address, so the Court arrives without changing the core or existing evaluators.

| Phase | Arbiter | Evaluator stake | Evaluator pay |
| :--- | :--- | :--- | :--- |
| 1. Launch | A single arbiter, or an adapter to an external arbitration protocol | None | Evaluation fee + loser's deposit, in USDC |
| 2. Validation | OPUS Court | **USDC** | Same, in USDC |
| 3. Maturity | OPUS Court | **OPG** (valued conservatively) | USDC fees + OPG rewards (§12) |

Starting the Court with USDC stakes tests whether the mechanism works, with no token and no price oracle, before OPG is introduced.

### 7.8 Planned evaluators

| Evaluator | What it judges |
| :--- | :--- |
| `OptimisticEvaluator` | Review, objection, arbitration, defaults, concession |
| `TestRunnerEvaluator` | Code work, by running tests registered at job creation in an isolated, reproducible environment |
| `RubricEvaluator` | Reports and content, by AI scoring against a published rubric, with objection to a human |
| `OracleEvaluator` | Deliveries and outcomes, from external data such as tracking |
| `OpusCourt` | Disputed jobs, by votes of staked evaluators |

---

## 8. What OPUS Adds to ERC-8183

OPUS does not change the standard interface. Every item below is either an implementation choice the standard permits, or an evaluator, hook, or SDK feature.

| # | Area | ERC-8183 as written | OPUS | Where |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Evaluator pay | Evaluator fee paid **only on completion** | Paid **the same whatever the outcome** | Evaluator |
| 2 | Deadlines | A single `expiredAt` | Separate submit, review, extension, and dispute deadlines | Evaluator |
| 3 | Evaluator silence | Refund to the client at expiry | Choice of auto-complete or escalation after review | Evaluator |
| 4 | Disputes | None | Objection, arbiter ruling, default if no ruling | Evaluator |
| 5 | Human protection | Not addressed | Presets by party type; silence favours the person | Evaluator + SDK |
| 6 | Budget changes | Client or provider may change while Open | Optional budget lock per job; SDK funding check | Hook + SDK |
| 7 | Admin | Who sets fees is unspecified | No admin; fee and recipient immutable per instance | Core |
| 8 | Frozen addresses | Not addressed | Deferred payout, withdrawable to another address | Core |
| 9 | Gas | ERC-2771 named as optional | Relayer using the ERC-2771 pattern (planned, decision pending) | Core + relayer |
| 10 | Hooks | Gas limits recommended | Fixed gas cap; tests with hostile hooks; refund path verified | Core |
| 11 | Description | On-chain string | SDK sends only a hash or URI and warns that it is public | SDK |
| 12 | Evaluator = client | Allowed | Allowed; SDK and indexer warn the provider | SDK + indexer |
| 13 | Job size | Not addressed | Budget fixed between 1 and 1,000 USD per job, written in code | Core |
| 14 | Proof of conformance | — | Public test suite encoding the standard's rules | Tests |
| 15 | Voluntary concession | Client cannot complete directly; provider cannot reject | Client may approve at any time after submission; provider may withdraw at any time | Evaluator |
| 16 | Paying evaluators | Percentage fee, on completion only | Flat evaluation fee whatever the outcome; keeper tips; loser pays the dispute | Evaluator |
| 17 | Decentralized judgment | One evaluator address | OPUS Court: staked evaluators vote; stake bounds the size of case they may judge | Evaluator (later phase) |

**The two that matter most.**

* **Neutral rulings (1).** An evaluator paid only when it completes has a reason to complete rather than reject. OPUS sets the core evaluator fee to zero. The evaluation operator gets a flat fee whatever the outcome, and in a dispute the arbiter is paid from the loser's deposit, the same amount for either ruling (§7.6).
* **Human protection (3, 5).** Under the standard as written, an AI client can receive the result, stay silent, and get its money back at expiry, while the person who did the work loses. With the OPUS evaluator, once the provider has submitted proof and the review window passes, the job can complete automatically. When the client is a person, the job instead waits for confirmation or goes to an arbiter.

**What OPUS does not do.** It does not offer split rulings, since the standard is binary; it does not let providers assign themselves, since only the client may call `setProvider`. Both can be revisited as standard extensions if real use shows the need.

OPUS intends to submit items 1 and 2 as feedback to the ERC-8183 discussion.

---

## 9. Fees and Economics

* **No protocol fee.** No fee goes to the OPUS team or a foundation from the core, the factory, or any evaluator, and there is no fee switch to turn on later. Three reasons: taking no cut of payment flows strengthens the neutrality argument; the standard's fee calculation stays unchanged; and there is no incentive for others to fork a fee-free copy.
* **Service fees.** A service platform creates its own instance through the factory and sets its fee rate and recipient. They are immutable and capped by `MAX_PLATFORM_FEE_BP`. As the standard requires, fees apply only on completion, never on refunds.
* **Evaluation fees are not protocol fees.** The flat evaluation fee, keeper tips, and dispute deposits (§7.6) pay whoever does the evaluation work. The client chooses the evaluator, anyone may operate one, and the amounts do not depend on the outcome or on a percentage of the payment.
* **How the OPUS team earns.** Mainly from the service fee of the cross-border errand service it runs, set through that service's own instance like any other integrator. Also from services around the contracts, which are harder to copy than the contracts themselves: evaluation fees as one evaluation operator among others, SDK and API plans for integrators, relaying and gas sponsorship, indexing and webhooks.
* **Early operation.** Grants, equity investment, and revenue from team-run services (§14).

---

## 10. Security Model

### 10.1 Invariants

| # | Invariant |
| :--- | :--- |
| I-1 | An instance sends tokens only to: the job's client (refunds), the job's provider (on completion, net of fee), the instance's immutable fee recipient (on completion only), or an account withdrawing its own deferred payout. An evaluator sends what it holds only to: the job's evaluation operator (evaluation fee), the caller of a due deadline trigger (tip), the arbiter or Court (loser's deposit), or back to the party that deposited it |
| I-2 | Per instance, the sum of funded and submitted budgets plus deferred payouts equals the token balance. Per evaluator, held evaluation fees plus dispute deposits equal its balance. For OPUS Court, stakes plus unpaid rewards equal its balance |
| I-3 | Each function can be called only by the role ERC-8183 assigns. Only refunds and deadline triggers are permissionless. No other privileged address exists |
| I-4 | Every funded or submitted job terminates, through the evaluator's triggers or, in any case, through non-hookable `claimRefund` |
| I-5 | After funding, provider, evaluator, budget, expiry, hook, and evaluator rules do not change, except the client's single review extension |
| I-6 | Core, factory, and evaluators have no owner, access control, pause, proxy, `delegatecall`, `selfdestruct`, or global setters |
| I-7 | A terminal job never transitions again |
| I-8 | Standard functions and events behave exactly as ERC-8183 specifies |
| I-9 | A client's approval after submission, or a provider's withdrawal, always ends the job in the other party's favour. In OPUS Court, an evaluator is drawn only for jobs its stake covers, and stake is slashed only under rules fixed at deployment |

### 10.2 Budget range

Every job's budget must be **at least 1 USD and at most 1,000 USD** (in USDC or USDT). The range is a constant in the core and applies from deployment; no one can change it. A different range requires a new deployment that users choose to move to.

* **Why a maximum.** With no emergency stop, a bug or a wrong ruling can cost at most 1,000 USD per job. It keeps OPUS focused on the small, frequent work where agents trade most, keeps the stake an evaluator needs small, and keeps the regulatory profile of each payment small.
* **Why a minimum.** Below 1 USD, gas and evaluation costs outweigh the payment, and dust jobs could be used to spam evaluators.
* **Larger work.** Work above 1,000 USD is split into several jobs (milestones). The cap is per job, not per party.

### 10.3 Frozen addresses

USDC and USDT issuers can freeze addresses. If a payout fails, the job still ends and the amount is recorded as a deferred payout that its owner can withdraw to another address.

### 10.4 Hooks

Hooks are supported as the standard defines. Hook calls have a fixed gas cap, and tests verify that a hostile hook cannot block the refund after expiry. Hooks are chosen per job by the client; their risk stays with that job.

### 10.5 Upgrades and standard changes

There are no upgrades. A new version is a new deployment that users move to by choice. Because ERC-8183 is a draft, mainnet deployment waits until its interface is stable.

### 10.6 Assurance

Before mainnet: external audit, invariant fuzzing, the conformance suite, and a public bug bounty.

---

## 11. Products and Use Cases

### 11.1 First service: cross-border errands

A client in one country posts a request; a verified local provider in another country does it and is paid on completion. The service is one ordinary integrator of OPUS: it uses the public SDK, runs its own instance, and has no special rights.

**Start narrow.** A two-sided service needs clients and providers in the same place. The service starts with **one corridor** and **two categories whose results are easy to check**, then widens. The corridor may cross a border (for example, people in the United States with family in Korea) or stay within one country, between distant regions (for example, someone outside Seoul asking for a purchase in Seoul, or a child in Seoul asking someone to check on parents in the provinces). A domestic corridor avoids currency exchange and cross-border rules, so a pilot can start sooner, but it must show users who are used to paying in won why stablecoin escrow is better. The contracts and flow are the same either way.

| Stage | Request | Proof | Notes |
| :--- | :--- | :--- | :--- |
| 1 | Film a specific place and send the video | Video with capture time and location | Low risk; privacy rules for filming people and private property |
| 1 | Buy an item (e.g. a limited edition) and ship it abroad | Receipt, photos, international tracking | Item cost is escrowed with the fee so the provider never fronts money; split above 1,000 USD; store purchase limits, customs, counterfeits |
| 2 | Accompany parents to a hospital visit | Visit confirmation, summary report | Verified providers, the parents' consent, health-data handling, liability and insurance review |
| 2 | Travel with parents, or escort them abroad | Check-ins per day or leg | Daily or per-leg jobs; travel costs paid separately; airline and immigration rules |

Stage 2 begins only once provider verification and reputation are in place, because a single incident involving someone's parents could damage trust in the whole service.

**Flow.**

```text
Client posts a request (structured: type, place, deadline, completion criteria, proof required)
   → local providers quote → client selects
   → job created, provider confirms the amount, client funds (escrow)
   → provider checks funding, does the errand, uploads proof; its hash is submitted
   → client approves (paid at once) / objects (arbitration) / stays silent (rules apply)
```

**What makes it usable by ordinary people.**

* **Card in, local currency out.** Clients buy USDC with a card or bank transfer through a licensed on-ramp partner; providers convert USDC to local currency through an off-ramp partner. Without this, few people will use the service.
* **No gas, no crypto vocabulary.** Transactions are relayed so no one buys POL. Wallets can be created at sign-up (for example with email login), and the interface talks about requests, quotes, and payments, not tokens.
* **Verified providers.** Identity checks by region, reputation from completed jobs, and a clear record of disputes.
* **Notifications and support.** Parties are notified on funding, submission, approaching deadlines, and before auto-completion, and can reach a person when something goes wrong.

### 11.2 Escrow payment links

Two people who have already agreed elsewhere (in a chat, a community, or another site) create a job from a link: the client funds, the provider submits, the evaluator rules. This needs no matching and is the simplest way to use OPUS; the errand service reuses the same screens.

### 11.3 OPUS Portal

**OPUS Portal is a directory of the services that use OPUS escrow**, much like an app store for the ecosystem. Users find a service there and then use it on that service's own site; the Portal itself does not post jobs, match parties, or hold funds.

| Feature | What it shows | Source |
| :--- | :--- | :--- |
| Service directory | Name, description, category, link, fee rate | Metadata each service registers, plus instance-creation events from the factory |
| Service statistics | Jobs, volume, completion rate, dispute rate, average time to settle | On-chain events only, so no service can inflate its numbers |
| My jobs | Every job a wallet has commissioned or taken on, across all services; withdrawal of deferred payouts | On-chain events |
| Evaluators and arbiters | Available evaluators, their fees, and their ruling records | Evaluator events |
| Developers | SDK, documentation, how to list a service | — |

Principles:

* **Anyone can be listed.** A service that creates an instance through the factory appears automatically; it registers its own name and description. No approval by the Portal operator is needed.
* **Ranking by record.** The default order uses on-chain results: volume, completion rate, dispute rate. Team-run services are not pinned to the top.
* **No special rights.** The Portal only displays public on-chain data. Its code is open, and anyone can run another portal.
* **Display policy.** The Portal may hide a fraudulent or illegal service **from its own pages** under a published policy. It cannot stop that service's contracts or payments.

### 11.4 Next: AI assistants and agents

Because OPUS follows ERC-8183, AI assistants can use it without a new protocol. The groundwork is laid from the start:

* **Machine-readable requests.** Each request is stored as structured data (type, place, deadline, completion criteria, proof required), and its hash is recorded in the job. People see a friendly screen; assistants read the same data.
* **Portable reputation.** Completion and dispute records are also published in the ERC-8004 format, so any assistant can judge providers.
* **An assistant tool.** The SDK is offered as a tool that AI assistants can call (for example an MCP server): post a request, compare quotes, fund, check the result.
* **Agent-to-agent work.** Later, agents commissioning code or data work from other agents, judged by `TestRunnerEvaluator` and other automatic evaluators.

A natural first step is an assistant told "find someone to go with my mother to her hospital appointment next month", which posts the request on the errand service, checks the report, and releases payment.

### 11.5 Broader use cases

| Client → Provider | Examples |
| :--- | :--- |
| Person → person | Cross-border errands, freelance work, audits, digital goods, bounties, small B2B orders |
| AI → person | An assistant booking errands for its user, human verification of AI output, data labelling |
| Person → AI | Pay-on-acceptance AI services, outcome-based agent contracts |
| AI → AI | Code, data processing, research, compute, specialist agents |

### 11.6 Services' responsibilities

Services built on OPUS handle what the protocol deliberately does not: identity checks where required, blocking illegal or harmful requests, personal data, notifications and support, on- and off-ramp partners, and local labour and payment rules.

---

## 12. OPG Token (Deferred)

A fixed-supply token, OPG, is planned as **the stake and reward of evaluators**. **No token will be issued or sold at launch**; the protocol, including the first versions of OPUS Court, works without it.

### 12.1 Role

* **Stake for evaluating.** To be drawn in OPUS Court, an evaluator stakes OPG. The size of the stake sets the largest job budget it may judge. Because evaluating larger or more jobs needs more stake, demand for OPG grows with the volume of work that is evaluated, not with speculation.
* **Reward for evaluating.** Evaluators who vote with the majority and meet deadlines receive OPG rewards from the ecosystem allocation, on top of USDC fees and deposits. Rewards are for work done, not for holding.
* **Slashing.** Evaluators who miss votes, sign false results, or (after appeals exist) vote against the final outcome lose part of their stake.

### 12.2 Conditions

* **USDC first.** OPUS Court starts with USDC stakes (§7.7). OPG replaces them only after the Court shows that evaluators will stake and rule well.
* **Conservative valuation.** Because jobs are paid in USDC but stakes would be in OPG, capacity uses a long time-weighted price with a large discount, and capacity rises slowly and falls immediately. This limits price-manipulation attacks.
* **USDC remains the income.** Evaluators' base income stays in USDC fees and deposits. OPG rewards start as bootstrap incentives and decline over time, so evaluators are not forced to sell OPG to cover costs.
* **Never.** Yield for holding, fee sharing, or buybacks.
* **Legal review first.** Issuance and any sale happen only after legal review and with proven demand.

### 12.3 Funding without issuance

Early investment is raised as equity, with token warrants where appropriate. If no token is ever issued, investors keep their equity.

---

## 13. Regulatory Positioning and Risks

This section discloses risks. It is not legal advice.

### 13.1 Positioning

* **No issued claim.** No payment token or redeemable balance is issued.
* **No discretionary control.** No admin exists; where funds go is decided by the client's evaluation rules, the chosen arbiter, and deadlines in code.
* **Implementation of a public standard.** The ERC-8183 text is released under CC0 and anyone may implement it. Following a standard does not by itself change any regulatory analysis.
* **Marketplace duties sit with services.** Whoever decides who may transact and what may be requested carries the obligations that come with it.
* **The Portal introduces, it does not intermediate.** OPUS Portal lists services and shows on-chain statistics. It does not match parties or hold funds, so marketplace obligations remain with each listed service. Its display policy is published.

### 13.2 Remaining contact

* **The team-run errand service is a marketplace.** It decides who may provide and what may be requested, so it carries marketplace duties: provider verification, consumer protection, request filtering, and, for care of parents, safety and liability. It is run by a separate entity from the one that maintains the protocol.
* **On- and off-ramp partners** handle conversion between local currency and stablecoins under their own licences; the service must choose partners licensed where its users are.
* **Team-run services and recommended arbiters.** If the team rules on outcomes, that can be seen as discretion over funds. Default arbiters should be external parties or rule-based evaluators.
* **Relayers, keepers, and front ends** are operated services even though the contracts are not.
* **Stablecoin handling.** In some jurisdictions, including Korea, USDT and USDC are virtual assets, and businesses handling them may have obligations.
* **AI hiring people** may touch platform-work regulation.
* **Sanctions and AML.** Immutable contracts cannot screen addresses. Relayers, front ends, and team-run services should screen against applicable sanctions lists and refuse to serve blocked addresses; this cannot be enforced at the contract level.
* **A future token** could be treated as a securities offering.

Legal review is planned before the first third-party service integrates and before any token-related agreement.

### 13.3 Material risks

* **Standard changes.** ERC-8183 is a draft; interface changes would require redeployment and integration updates.
* **Smart-contract risk.** Bugs cannot be patched in place.
* **Evaluation risk.** Evaluators and arbiters can err or collude.
* **Voting risk.** In OPUS Court, evaluators may follow the expected majority rather than the facts, collude, or not show up. Random drawing, hidden votes, stake, appeals, and specific completion criteria reduce this.
* **Physical proof.** For errands, the chain cannot see what happened.
* **Auto-completion.** A client who did not receive the result but did not respond in time may see the job complete. Proof requirements, notifications, extensions, and bonds reduce but do not remove this.
* **Misuse.** An admin-free protocol cannot block particular uses; filtering requests is the services' job.
* **Cold start.** A two-sided service needs clients and providers in the same corridor at the same time; starting narrow reduces but does not remove this.
* **Money in and out.** If buying USDC or cashing out to local currency is slow or costly, people will not use the service, however good the escrow is.
* **Physical safety.** Errands involve real places and, in stage 2, vulnerable people. Escrow protects payment, not people; verification, insurance, and support must cover the rest.
* **Competition.** Existing proxy-shopping and errand services, and others implementing the same standard. OPUS must win on trust, cost, and ease of use.

---

## 14. Roadmap and Funding

* **Phase 1 — Core (month 1).** ERC-8183 core, factory, deferred payouts, hooks, budget range (1–1,000 USD), `OptimisticEvaluator` with fees and deposits, invariant and conformance tests, testnet deployment.
* **Phase 2 — Foundations for people (month 2).** SDK, relayer (gasless), keeper, escrow payment links.
* **Phase 3 — Cross-border errands, stage 1 (months 3–4).** One corridor, filming and purchasing, provider verification, on- and off-ramp partners, pilot with real users.
* **Phase 4 — Audit and mainnet.** External audit, bug bounty, mainnet once the standard is stable; OPUS Portal with the team's services.
* **Phase 5 — Stage 2 and more corridors.** Care of parents after a safety and legal review; additional corridors.
* **Phase 6 — AI assistants.** Assistant tool, ERC-8004 reputation, agent-to-agent work with automatic evaluators.
* **Phase 7 — OPUS Court and OPG (conditional).** Staked evaluators vote on disputes, first with USDC; OPG only after the Court works and after legal review.

**Funding.** Polygon ecosystem grants, equity investment (with token warrants where appropriate), and revenue from the errand service. The main use of investment is integration with licensed payment partners and exchanges: paying in by card or bank and cashing out in local currency are built on their licences, while OPUS and its services never hold or exchange funds. Until then, pilots run with users who already buy USDC on exchanges.

---

## 15. Disclaimer

This document is a technical paper for information only. It is not an offer or solicitation to invest in any security, token, or other asset. No token has been issued or sold. ERC-8183 is a draft standard, and OPUS is not an official implementation of its authors or of any organization. Figures, timelines, and design may change with development, the standard, and the regulatory environment. Nothing here guarantees any return or outcome. Regulatory discussion is not legal advice; obtain independent legal, tax, and financial advice before relying on this document.

---

## Appendix. Glossary

| Term | Meaning |
| :--- | :--- |
| Agentic commerce | Commerce in which AI agents order, pay, and evaluate on their own |
| Client | The party that creates and funds a job |
| Provider | The party that does the work and is paid |
| Evaluator | The party that completes or rejects a submitted job; may be a contract |
| Arbiter | Inside an OPUS evaluator, the address that rules on objections |
| OPUS Court | An evaluator contract in which staked evaluators vote on disputed jobs |
| Evaluation fee | Flat fee paid by the client for evaluation, whatever the outcome |
| Dispute deposit | Amount each party posts on escalation; the loser's deposit pays the arbiter |
| Instance | A core contract with one token and one fee configuration |
| OPUS Portal | Website that lists services built on OPUS, with statistics from on-chain data |
| Keeper | Off-chain service that calls deadline triggers automatically |
| Relayer | Off-chain service that submits transactions for users without gas |
| Deferred payout | An amount recorded when a transfer fails, withdrawable later by its owner |

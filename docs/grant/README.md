# OPUS grant pack

These files support OPUS's funding request to the Polygon Community Treasury. OPUS is an admin-free ERC-8183 escrow for small cross-border jobs, paid in USDC on Polygon.

| File | What it is | Who it is for |
| :--- | :--- | :--- |
| [APPLICATION.md](APPLICATION.md) | The full application: problem, product, evidence, milestones, budget, metrics, risks | Reviewers |
| [FORUM_POST.md](FORUM_POST.md) | A shorter version, ready to post in the Polygon Community Forum | The forum |
| [AMOY_EVIDENCE.md](AMOY_EVIDENCE.md) | Every Amoy transaction behind the six end-to-end runs | Reviewers who check |
| [AmoyClientQuote.txt](AmoyClientQuote.txt) | The deliverable file submitted in step 6 (on-chain job 7) | Hash check below |
| [APPLICATION.ko.md](APPLICATION.ko.md) | Korean translation of the application | The founder and Korean partners |

## Check our claims in five minutes

1. **The contracts are real and readable.** Open the verified source of the [escrow instance](https://amoy.polygonscan.com/address/0x7632d054BfE635A1f0394fbcd74678B6567213Fd#code) and the [review contract](https://amoy.polygonscan.com/address/0x65819d9199144a66ec17ad39da6bebabc3eef585#code). There is no owner, pause or upgrade function. The licence file is MIT. The Solidity files, deployed and in the repository, still carry a BUSL-1.1 header so they match the verified deployment; the header changes to MIT at the post-audit redeploy.
2. **A payment link settled a real job.** Open the [approve transaction of job 7](https://amoy.polygonscan.com/tx/0x5f7327017ea1e4efe49b812e82d54f9819b0ea39703106e2eca1d15cf78849ef). 5 USDC moves from the escrow instance to the provider.
3. **The proof on chain matches the file.** The [submit transaction](https://amoy.polygonscan.com/tx/0x0f08a15e4a432eb1e2957f89990fc20838c1968f0851a5deb4b09b0d1c7593ef) stores deliverable `0x52baa0e5…dd770`. Hash the file and compare:

   ```bash
   cast keccak "$(cat docs/grant/AmoyClientQuote.txt)"
   # 0x52baa0e5f62955a6f6412081035036f5a0bd99d235d0c3ebd20ff30f6a1dd770
   ```

4. **The tests run.** `yarn contracts test` runs the 146 contract test cases, all passing at commit `36369b5f`.

## Before submitting

- [x] Fill the TODOs in `APPLICATION.md` and `FORUM_POST.md` (contact, team). Only the YouTube link remains.
- [ ] Upload the demo video (`SharedPaymentLink.mp4`, kept out of git) to YouTube and put the link in place of the three `TODO (YouTube link)` markers
- [ ] Make the repository public, and check its whole git history for keys first (for example with gitleaks)
- [ ] Get at least two audit quotes, including the re-check of fixes, and replace the M1 estimate with the one you accept. What must be settled before the code freeze is in [`docs/audit/PRE_AUDIT_FREEZE.md`](../audit/PRE_AUDIT_FREEZE.md)
- [ ] Agree the SAFE terms (valuation cap, discount) and have a Korean lawyer review the structure, including foreign-investment filings (decided: the founder receives the grant personally until the seed round; the pilot charges no fee; targets of 2, 5 and 10 completed jobs a week; the Treasury gets a SAFE when the company is formed)
- [ ] Set up a wallet used only for OPUS grant funds, and keep a record of every conversion and payment for tax
- [ ] Keep `APPLICATION.ko.md` in step with `APPLICATION.md`
- [ ] Check which Polygon funding programme is open and match its format
- [ ] Run on Amoy, and add to `AMOY_EVIDENCE.md`: a link opened by the counterparty (provider creates it, client funds), and a dispute. The application promises both by the end of M1; earlier is better

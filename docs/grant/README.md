# OPUS Amoy evidence

These files let anyone check what OPUS did on the Polygon Amoy test network. OPUS is an admin-free ERC-8183 escrow for small cross-border jobs, paid in USDC on Polygon.

| File | What it is | Who it is for |
| :--- | :--- | :--- |
| [AMOY_EVIDENCE.md](AMOY_EVIDENCE.md) | Every Amoy transaction behind the eight end-to-end runs | Reviewers who check |
| [AmoyClientQuote.txt](AmoyClientQuote.txt) | The deliverable file submitted in step 6 (on-chain job 7) | Hash check below |

## Check our claims in five minutes

1. **The contracts are real and readable.** Open the verified source of the [escrow instance](https://amoy.polygonscan.com/address/0x7632d054BfE635A1f0394fbcd74678B6567213Fd#code) and the [review contract](https://amoy.polygonscan.com/address/0x65819d9199144a66ec17ad39da6bebabc3eef585#code). There is no owner, pause or upgrade function. The licence is MIT. The Amoy test deployment was verified from an earlier source whose Solidity headers read BUSL-1.1; the files in this repository now carry MIT, which is the only difference.
2. **A payment link settled a real job.** Open the [approve transaction of job 7](https://amoy.polygonscan.com/tx/0x5f7327017ea1e4efe49b812e82d54f9819b0ea39703106e2eca1d15cf78849ef). 5 USDC moves from the escrow instance to the provider.
3. **The proof on chain matches the file.** The [submit transaction](https://amoy.polygonscan.com/tx/0x0f08a15e4a432eb1e2957f89990fc20838c1968f0851a5deb4b09b0d1c7593ef) stores deliverable `0x52baa0e5…dd770`. Hash the file and compare:

   ```bash
   cast keccak "$(cat docs/grant/AmoyClientQuote.txt)"
   # 0x52baa0e5f62955a6f6412081035036f5a0bd99d235d0c3ebd20ff30f6a1dd770
   ```

4. **The tests run.** `yarn contracts test` runs the 153 contract test cases, all passing in CI at commit `c1504bf8`.

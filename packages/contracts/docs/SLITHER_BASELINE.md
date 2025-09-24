# Slither baseline

Recorded 2026-09-26 for I-6 / #21.

CI runs `slither . --config-file slither.config.json` from `packages/contracts`. `mocks/` is filtered. The following findings are accepted until an audit says otherwise.

| Detector | Where | Why accepted |
| :--- | :--- | :--- |
| `reentrancy-eth` / `reentrancy-benign` | `OpusAgenticCommerce._pay`, `OptimisticEvaluator._pay` | State is updated before the low-level `transfer`. A failed transfer credits `claimable` for the same party (I-1). |
| `low-level-calls` | `_pay`, hook `call` | Required for blacklist tokens and the fixed hook gas cap. |
| `unused-return` | hook `call` | Success is checked; return data is ignored by design. |
| `empty-catch` | `fundWithPermit` | D15: a front-run permit must not fail funding. |
| `naming-convention` | immutables `token`, `factory`, … | Public instance fields stay camelCase to match ERC-8183 views. |

New high/medium findings that are not in this table fail the human review of the CI slither log. The mechanical I-6 gate is `yarn workspace @opus/contracts check:no-admin`.

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Per-job evaluator configuration and views. The evaluator is also the job hook.
interface IOpusEvaluator {
    enum BudgetLock {
        None,
        AfterProviderSetBudget,
        FromCreation
    }

    struct Config {
        uint32 submitWindow;
        uint32 reviewWindow;
        uint32 maxExtension;
        uint32 depositWindow;
        uint32 disputeWindow;
        bool autoCompleteOnSilence;
        bool defaultComplete;
        uint8 budgetLock;
        address arbiter;
        address operator;
        uint128 evaluationFee;
        uint128 keeperTip;
        uint128 disputeDeposit;
    }

    event Configured(address indexed instance, uint256 indexed jobId, address indexed client);

    function configure(address instance, uint256 jobId, Config calldata cfg) external;

    function getConfig(address instance, uint256 jobId) external view returns (Config memory cfg);

    function fundedAt(address instance, uint256 jobId) external view returns (uint64 timestamp);

    function submittedAt(address instance, uint256 jobId) external view returns (uint64 timestamp);
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Per-job evaluator configuration, flow, and views. The evaluator is also the job hook.
interface IOpusEvaluator {
    enum BudgetLock {
        None,
        AfterProviderSetBudget, // first setBudget after the provider is set
        FromCreation
    }

    enum Phase {
        None,
        Funded,
        Submitted,
        Escalated,
        ArbiterPending,
        Resolved
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
    event ReviewExtended(address indexed instance, uint256 indexed jobId, uint32 secondsExtended);
    event Objected(address indexed instance, uint256 indexed jobId, bytes32 evidenceHash);
    event Escalated(address indexed instance, uint256 indexed jobId);
    event CaseOpened(
        address indexed instance,
        uint256 indexed jobId,
        address indexed arbiter,
        uint64 disputeDeadline,
        bytes32[] evidenceHashes
    );
    event Ruled(
        address indexed instance,
        uint256 indexed jobId,
        address indexed arbiter,
        bool completed,
        bytes32 reasonHash
    );
    event ResolvedByDefault(address indexed instance, uint256 indexed jobId, bool completed);
    event Conceded(address indexed instance, uint256 indexed jobId, address indexed by);
    event DepositPosted(address indexed instance, uint256 indexed jobId, address indexed party, uint256 amount);
    event TipPaid(address indexed instance, uint256 indexed jobId, address indexed to, uint256 amount);
    event FeePaid(address indexed instance, uint256 indexed jobId, address indexed operator, uint256 amount);
    event Swept(address indexed instance, uint256 indexed jobId, address indexed to, uint256 amount);
    event PayoutDeferred(address indexed token, address indexed account, uint256 amount);
    event Withdrawn(address indexed token, address indexed account, address indexed to, uint256 amount);

    function configure(address instance, uint256 jobId, Config calldata cfg) external;

    function configureWithPermit(
        address instance,
        uint256 jobId,
        Config calldata cfg,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function timeoutNoSubmission(address instance, uint256 jobId) external;

    function approve(address instance, uint256 jobId) external;

    function withdrawAsProvider(address instance, uint256 jobId) external;

    function object(address instance, uint256 jobId, bytes32 evidenceHash) external;

    function extendReview(address instance, uint256 jobId, uint32 secondsExtended) external;

    function finalize(address instance, uint256 jobId) external;

    function escalateOnSilence(address instance, uint256 jobId) external;

    function rule(address instance, uint256 jobId, bool completed, bytes32 reasonHash) external;

    function resolveByDefault(address instance, uint256 jobId) external;

    function postDeposit(address instance, uint256 jobId) external;

    function postDepositWithPermit(
        address instance,
        uint256 jobId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function resolveMissingDeposit(address instance, uint256 jobId) external;

    function sweep(address instance, uint256 jobId) external;

    function withdraw(address token, address to) external;

    function getConfig(address instance, uint256 jobId) external view returns (Config memory cfg);

    function fundedAt(address instance, uint256 jobId) external view returns (uint64 timestamp);

    function submittedAt(address instance, uint256 jobId) external view returns (uint64 timestamp);

    function phase(address instance, uint256 jobId) external view returns (Phase current);

    function reviewEnd(address instance, uint256 jobId) external view returns (uint256 endedAt);

    function disputeDeadlineOf(address instance, uint256 jobId) external view returns (uint64 deadline);

    function feeHeld(address instance, uint256 jobId) external view returns (uint256 amount);

    function depositDeadlineOf(address instance, uint256 jobId) external view returns (uint64 deadline);

    function clientDepositOf(address instance, uint256 jobId) external view returns (uint256 amount);

    function providerDepositOf(address instance, uint256 jobId) external view returns (uint256 amount);

    function claimable(address token, address account) external view returns (uint256 amount);
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice ERC-8183 core surface, copied from the specification function and event lists.
/// @dev Source: https://eips.ethereum.org/EIPS/eip-8183 fetched 2026-09-26.
///      ERC commit a078cab5cc8e9581c15f76c091ed96eed28f02f7 (2026-03-13). Created 2026-02-25.
///      D11: `fund` includes `expectedBudget`. The same EIP's reference `AgenticCommerce.sol`
///      omits it; the specification text and current hook-contracts selectors include it.
///      `JobCreated` includes `hook` to match the current specification interface / reference
///      event (the SHOULD list still omits it).
interface IAgenticCommerce {
    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint256 expiredAt,
        address hook
    );
    event ProviderSet(uint256 indexed jobId, address indexed provider);
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason);
    event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason);
    event JobExpired(uint256 indexed jobId);
    event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);

    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        address hook
    ) external returns (uint256 jobId);

    function setProvider(uint256 jobId, address provider, bytes calldata optParams) external;

    function setBudget(uint256 jobId, uint256 amount, bytes calldata optParams) external;

    function fund(uint256 jobId, uint256 expectedBudget, bytes calldata optParams) external;

    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external;

    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external;

    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external;

    function claimRefund(uint256 jobId) external;
}

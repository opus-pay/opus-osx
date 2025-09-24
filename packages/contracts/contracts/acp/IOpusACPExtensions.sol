// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice OPUS view/helpers that do not change ERC-8183 behaviour.
interface IOpusACPExtensions {
    enum JobStatus {
        Open,
        Funded,
        Submitted,
        Completed,
        Rejected,
        Expired
    }

    struct Job {
        address client;
        address provider;
        address evaluator;
        string description;
        uint256 budget;
        uint256 expiredAt;
        JobStatus status;
        address hook;
    }

    /// @notice Job fields without `description`, for hook-gas-limited reads.
    struct JobView {
        address client;
        address provider;
        address evaluator;
        uint256 budget;
        uint256 expiredAt;
        JobStatus status;
        address hook;
    }

    event PayoutDeferred(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, address indexed to, uint256 amount);

    /// @notice Instance settlement token.
    function token() external view returns (IERC20);

    /// @notice OPUS extension. Returns the spec job fields for `jobId`.
    function getJob(uint256 jobId) external view returns (Job memory job);

    /// @notice OPUS extension. Same as `getJob` without copying `description`.
    function getJobView(uint256 jobId) external view returns (JobView memory job);

    /// @notice OPUS extension. Pull `claimable[msg.sender]` to `to`.
    function withdraw(address to) external;

    /// @notice OPUS extension. Deferred amount owed to `account`.
    function claimable(address account) external view returns (uint256 amount);

    /// @notice OPUS extension. `try permit` then the standard `fund` path.
    function fundWithPermit(
        uint256 jobId,
        uint256 expectedBudget,
        bytes calldata optParams,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

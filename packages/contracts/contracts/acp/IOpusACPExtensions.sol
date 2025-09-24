// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

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

    /// @notice OPUS extension. Returns the spec job fields for `jobId`.
    function getJob(uint256 jobId) external view returns (Job memory job);
}

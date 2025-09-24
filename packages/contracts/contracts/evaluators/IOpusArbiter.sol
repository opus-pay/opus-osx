// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Documentation interface for adapters. The evaluator never calls the arbiter;
///         it emits `CaseOpened` and the arbiter (EOA, this adapter, or later OPUS Court) calls `rule`.
interface IOpusArbiter {
    /// @notice Optional hook a keeper may call after `CaseOpened` so an adapter can open an external case.
    function notifyCase(
        address evaluator,
        address instance,
        uint256 jobId,
        bytes32[] calldata evidenceHashes,
        uint64 disputeDeadline
    ) external;
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IOpusArbiter } from "../evaluators/IOpusArbiter.sol";
import { IOpusEvaluator } from "../evaluators/IOpusEvaluator.sol";

/// @notice Test arbiter that forwards a decision to `OptimisticEvaluator.rule`.
contract MockOpusArbiter is IOpusArbiter {
    function notifyCase(address, address, uint256, bytes32[] calldata, uint64) external pure {}

    function decide(address evaluator, address instance, uint256 jobId, bool completed, bytes32 reasonHash) external {
        IOpusEvaluator(evaluator).rule(instance, jobId, completed, reasonHash);
    }
}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

import { IOpusArbiter } from "./IOpusArbiter.sol";
import { IOpusEvaluator } from "./IOpusEvaluator.sol";

/// @notice Maps a Kleros-style `IArbitrable.rule(disputeId, ruling)` onto `OptimisticEvaluator.rule`.
/// @dev Kleros is live on Polygon PoS and charges the loser in the protocol's own token, which matches
///      OPUS "loser pays the arbiter". The arbitrator address is constructor-injected (D10 still open).
///      Ruling 1 → complete, ruling 2 → reject, ruling 0 → defaultComplete from the job config.
contract KlerosArbiterAdapter is IOpusArbiter {
    address public immutable arbitrator;

    struct BoundCase {
        address evaluator;
        address instance;
        uint256 jobId;
        bool bound;
        bool ruled;
    }

    mapping(bytes32 => uint256) public disputeOf;
    mapping(uint256 => BoundCase) public cases;

    error ZeroAddress();
    error Unauthorized();
    error AlreadyBound();
    error UnknownDispute();
    error AlreadyRuled();

    event CaseBound(address indexed evaluator, address indexed instance, uint256 indexed jobId, uint256 disputeId);

    constructor(address arbitrator_) {
        if (arbitrator_ == address(0)) revert ZeroAddress();
        arbitrator = arbitrator_;
    }

    /// @inheritdoc IOpusArbiter
    function notifyCase(address, address, uint256, bytes32[] calldata, uint64) external pure {
        // The evaluator never calls this. A keeper binds a Kleros dispute via `bind`.
    }

    /// @notice Bind an already-created Kleros dispute to an OPUS job. Anyone may call after `CaseOpened`.
    function bind(address evaluator, address instance, uint256 jobId, uint256 disputeId) external {
        if (evaluator == address(0) || instance == address(0)) revert ZeroAddress();
        bytes32 key = keccak256(abi.encode(evaluator, instance, jobId));
        if (disputeOf[key] != 0 || cases[disputeId].bound) revert AlreadyBound();
        disputeOf[key] = disputeId;
        cases[disputeId] = BoundCase({
            evaluator: evaluator,
            instance: instance,
            jobId: jobId,
            bound: true,
            ruled: false
        });
        emit CaseBound(evaluator, instance, jobId, disputeId);
    }

    /// @notice Kleros `IArbitrable.rule`. Only the injected arbitrator may call.
    function rule(uint256 disputeId, uint256 ruling) external {
        if (msg.sender != arbitrator) revert Unauthorized();
        BoundCase storage bound = cases[disputeId];
        if (!bound.bound) revert UnknownDispute();
        if (bound.ruled) revert AlreadyRuled();
        bound.ruled = true;
        bool completed;
        if (ruling == 0) {
            completed = IOpusEvaluator(bound.evaluator).getConfig(bound.instance, bound.jobId).defaultComplete;
        } else {
            completed = ruling == 1;
        }
        IOpusEvaluator(bound.evaluator).rule(bound.instance, bound.jobId, completed, bytes32(ruling));
    }
}

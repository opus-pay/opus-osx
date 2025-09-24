// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import { IACPHook } from "../acp/IACPHook.sol";
import { IAgenticCommerce } from "../acp/IAgenticCommerce.sol";
import { IOpusACPExtensions } from "../acp/IOpusACPExtensions.sol";
import { IOpusEvaluator } from "./IOpusEvaluator.sol";

/// @notice Shared optimistic evaluator and hook. Per-job state is keyed by (instance, jobId).
contract OptimisticEvaluator is IOpusEvaluator, IACPHook {
    /// @dev D3 — replace after the window-bound decision. Suggested 1 hour / 180 days / 1 hour.
    uint32 public constant PLACEHOLDER_MIN_WINDOW = 1 hours;
    uint32 public constant PLACEHOLDER_MAX_WINDOW = 180 days;
    uint32 public constant PLACEHOLDER_SAFETY_MARGIN = 1 hours;

    /// @dev D18 — replace after the fee-cap decision. Suggested 10_000 (fee cannot exceed budget).
    uint256 public constant PLACEHOLDER_MAX_EVALUATION_FEE_BP = 10_000;
    uint256 public constant MAX_TIPS = 2;

    struct Case {
        Config config;
        uint64 fundedAt;
        uint64 submittedAt;
        bool configured;
    }

    mapping(address => mapping(uint256 => Case)) private _cases;

    error ZeroAddress();
    error WrongStatus();
    error Unauthorized();
    error NotEvaluator();
    error NotConfigured();
    error ConfigFrozen();
    error ArbiterIsParty();
    error WindowOutOfBounds(uint32 value);
    error InvalidBudgetLock();
    error InvalidFeeConfig();
    error DeadlineDoesNotFit();
    error EvaluationFeeTooHigh(uint256 fee, uint256 cap);
    error SubmitWindowClosed();

    /// @inheritdoc IOpusEvaluator
    function configure(address instance, uint256 jobId, Config calldata cfg) external {
        if (instance == address(0)) revert ZeroAddress();
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        if (job.status != IOpusACPExtensions.JobStatus.Open) revert WrongStatus();
        if (msg.sender != job.client) revert Unauthorized();
        if (job.evaluator != address(this) || job.hook != address(this)) revert NotEvaluator();
        Case storage c = _cases[instance][jobId];
        if (c.fundedAt != 0) revert ConfigFrozen();
        _validateConfig(cfg, job);
        c.config = cfg;
        c.configured = true;
        emit Configured(instance, jobId, msg.sender);
    }

    /// @inheritdoc IACPHook
    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external {
        if (selector == IAgenticCommerce.complete.selector || selector == IAgenticCommerce.reject.selector) {
            return;
        }

        Case storage c = _cases[msg.sender][jobId];
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(msg.sender).getJob(jobId);

        if (selector == IAgenticCommerce.setProvider.selector) {
            if (!c.configured) return;
            (address provider, ) = abi.decode(data, (address, bytes));
            _requireArbiterNotParty(c.config.arbiter, job.client, provider);
            return;
        }

        if (selector == IAgenticCommerce.fund.selector) {
            if (!c.configured) revert NotConfigured();
            _requireArbiterNotParty(c.config.arbiter, job.client, job.provider);
            uint256 needed = uint256(c.config.submitWindow) +
                uint256(c.config.reviewWindow) +
                uint256(c.config.maxExtension) +
                uint256(c.config.depositWindow) +
                uint256(c.config.disputeWindow) +
                uint256(PLACEHOLDER_SAFETY_MARGIN);
            if (block.timestamp + needed > job.expiredAt) revert DeadlineDoesNotFit();
            uint256 cap = _feeCap(job.budget);
            if (c.config.evaluationFee > cap) revert EvaluationFeeTooHigh(c.config.evaluationFee, cap);
            c.fundedAt = uint64(block.timestamp);
            return;
        }

        if (selector == IAgenticCommerce.submit.selector) {
            if (!c.configured || c.fundedAt == 0) revert NotConfigured();
            if (block.timestamp > uint256(c.fundedAt) + uint256(c.config.submitWindow)) revert SubmitWindowClosed();
        }
    }

    /// @inheritdoc IACPHook
    function afterAction(uint256 jobId, bytes4 selector, bytes calldata) external {
        if (selector == IAgenticCommerce.complete.selector || selector == IAgenticCommerce.reject.selector) {
            return;
        }
        if (selector == IAgenticCommerce.submit.selector) {
            _cases[msg.sender][jobId].submittedAt = uint64(block.timestamp);
        }
    }

    /// @inheritdoc IOpusEvaluator
    function getConfig(address instance, uint256 jobId) external view returns (Config memory) {
        return _cases[instance][jobId].config;
    }

    /// @inheritdoc IOpusEvaluator
    function fundedAt(address instance, uint256 jobId) external view returns (uint64) {
        return _cases[instance][jobId].fundedAt;
    }

    /// @inheritdoc IOpusEvaluator
    function submittedAt(address instance, uint256 jobId) external view returns (uint64) {
        return _cases[instance][jobId].submittedAt;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(IACPHook).interfaceId ||
            interfaceId == type(IOpusEvaluator).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    function _validateConfig(Config calldata cfg, IOpusACPExtensions.Job memory job) private pure {
        _requireWindow(cfg.submitWindow, false);
        _requireWindow(cfg.reviewWindow, false);
        _requireWindow(cfg.maxExtension, true);
        _requireWindow(cfg.depositWindow, true);
        _requireWindow(cfg.disputeWindow, true);
        if (cfg.budgetLock > uint8(BudgetLock.FromCreation)) revert InvalidBudgetLock();
        if (cfg.evaluationFee > 0 && cfg.operator == address(0)) revert InvalidFeeConfig();
        if (uint256(cfg.keeperTip) * MAX_TIPS > cfg.evaluationFee) revert InvalidFeeConfig();
        _requireArbiterNotParty(cfg.arbiter, job.client, job.provider);
        if (job.budget > 0) {
            uint256 cap = _feeCap(job.budget);
            if (cfg.evaluationFee > cap) revert EvaluationFeeTooHigh(cfg.evaluationFee, cap);
        }
    }

    function _requireWindow(uint32 value, bool allowZero) private pure {
        if (allowZero && value == 0) return;
        if (value < PLACEHOLDER_MIN_WINDOW || value > PLACEHOLDER_MAX_WINDOW) revert WindowOutOfBounds(value);
    }

    function _requireArbiterNotParty(address arbiter, address client, address provider) private pure {
        if (arbiter == address(0)) return;
        if (arbiter == client || arbiter == provider) revert ArbiterIsParty();
    }

    function _feeCap(uint256 budget) private pure returns (uint256) {
        return (budget * PLACEHOLDER_MAX_EVALUATION_FEE_BP) / 10_000;
    }
}

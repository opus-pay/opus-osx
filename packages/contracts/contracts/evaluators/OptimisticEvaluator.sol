// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IACPHook } from "../acp/IACPHook.sol";
import { IAgenticCommerce } from "../acp/IAgenticCommerce.sol";
import { IOpusACPExtensions } from "../acp/IOpusACPExtensions.sol";
import { IOpusEvaluator } from "./IOpusEvaluator.sol";

/// @notice Shared optimistic evaluator and hook. Per-job state is keyed by (instance, jobId).
contract OptimisticEvaluator is IOpusEvaluator, IACPHook, ReentrancyGuard {
    using SafeERC20 for IERC20;
    /// @dev D3 — replace after the window-bound decision. Suggested 1 hour / 180 days / 1 hour.
    uint32 public constant PLACEHOLDER_MIN_WINDOW = 1 hours;
    uint32 public constant PLACEHOLDER_MAX_WINDOW = 180 days;
    uint32 public constant PLACEHOLDER_SAFETY_MARGIN = 1 hours;

    /// @dev D18 — replace after the fee-cap decision. Suggested 10_000 (fee cannot exceed budget).
    uint256 public constant PLACEHOLDER_MAX_EVALUATION_FEE_BP = 10_000;
    uint256 public constant MAX_TIPS = 2;

    bytes32 public constant REASON_TIMEOUT = keccak256("TIMEOUT_NO_SUBMISSION");
    bytes32 public constant REASON_APPROVE = keccak256("CLIENT_APPROVE");
    bytes32 public constant REASON_WITHDRAW = keccak256("PROVIDER_WITHDRAW");
    bytes32 public constant REASON_FINALIZE = keccak256("FINALIZE");
    bytes32 public constant REASON_DEFAULT = keccak256("DEFAULT");

    struct Case {
        Config config;
        uint64 fundedAt;
        uint64 submittedAt;
        uint64 disputeDeadline;
        uint32 extension;
        Phase phase;
        bool configured;
        bool extended;
        bytes32 evidenceHash;
        address token;
        uint128 feeHeld;
        uint8 tipsPaid;
    }

    mapping(address => mapping(uint256 => Case)) private _cases;
    mapping(address => mapping(address => uint256)) private _claimable;

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
    error TooEarly();
    error ReviewStillOpen();
    error ReviewEnded();
    error AlreadyExtended();
    error ExtensionTooLarge(uint32 secondsExtended);
    error WrongMode();
    error UnexpectedFeeAmount(uint256 received, uint256 expected);
    error NothingToWithdraw();
    error NothingToSweep();

    /// @inheritdoc IOpusEvaluator
    function configure(address instance, uint256 jobId, Config calldata cfg) external nonReentrant {
        if (instance == address(0)) revert ZeroAddress();
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        if (job.status != IOpusACPExtensions.JobStatus.Open) revert WrongStatus();
        if (msg.sender != job.client) revert Unauthorized();
        if (job.evaluator != address(this) || job.hook != address(this)) revert NotEvaluator();
        Case storage c = _cases[instance][jobId];
        if (c.fundedAt != 0) revert ConfigFrozen();
        _validateConfig(cfg, job);
        address token = address(IOpusACPExtensions(instance).token());
        _rebalanceFee(c, token, msg.sender, cfg.evaluationFee);
        c.config = cfg;
        c.token = token;
        c.configured = true;
        emit Configured(instance, jobId, msg.sender);
    }

    /// @inheritdoc IOpusEvaluator
    function timeoutNoSubmission(address instance, uint256 jobId) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        if (c.phase != Phase.Funded) revert WrongStatus();
        if (block.timestamp < uint256(c.fundedAt) + uint256(c.config.submitWindow)) revert TooEarly();
        _payTip(instance, jobId, c);
        _reject(instance, jobId, c, REASON_TIMEOUT);
    }

    /// @inheritdoc IOpusEvaluator
    function approve(address instance, uint256 jobId) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        if (msg.sender != job.client) revert Unauthorized();
        if (c.submittedAt == 0) revert WrongStatus();
        if (c.phase == Phase.Escalated || c.phase == Phase.ArbiterPending) {
            emit Conceded(instance, jobId, msg.sender);
        }
        _complete(instance, jobId, c, REASON_APPROVE);
    }

    /// @inheritdoc IOpusEvaluator
    function withdrawAsProvider(address instance, uint256 jobId) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        if (msg.sender != job.provider) revert Unauthorized();
        if (c.fundedAt == 0) revert WrongStatus();
        if (c.phase == Phase.Escalated || c.phase == Phase.ArbiterPending) {
            emit Conceded(instance, jobId, msg.sender);
        }
        _reject(instance, jobId, c, REASON_WITHDRAW);
    }

    /// @inheritdoc IOpusEvaluator
    function object(address instance, uint256 jobId, bytes32 evidenceHash) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        if (msg.sender != job.client) revert Unauthorized();
        if (c.phase != Phase.Submitted) revert WrongStatus();
        if (block.timestamp >= _reviewEnd(c)) revert ReviewEnded();
        c.evidenceHash = evidenceHash;
        emit Objected(instance, jobId, evidenceHash);
        _escalate(instance, jobId, c, evidenceHash);
    }

    /// @inheritdoc IOpusEvaluator
    function extendReview(address instance, uint256 jobId, uint32 secondsExtended) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        if (msg.sender != job.client) revert Unauthorized();
        if (c.phase != Phase.Submitted) revert WrongStatus();
        if (c.extended) revert AlreadyExtended();
        if (secondsExtended == 0 || secondsExtended > c.config.maxExtension) revert ExtensionTooLarge(secondsExtended);
        if (block.timestamp >= _reviewEnd(c)) revert ReviewEnded();
        c.extended = true;
        c.extension = secondsExtended;
        emit ReviewExtended(instance, jobId, secondsExtended);
    }

    /// @inheritdoc IOpusEvaluator
    function finalize(address instance, uint256 jobId) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        if (c.phase != Phase.Submitted) revert WrongStatus();
        if (!c.config.autoCompleteOnSilence) revert WrongMode();
        if (block.timestamp < _reviewEnd(c)) revert ReviewStillOpen();
        _payTip(instance, jobId, c);
        _complete(instance, jobId, c, REASON_FINALIZE);
    }

    /// @inheritdoc IOpusEvaluator
    function escalateOnSilence(address instance, uint256 jobId) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        if (c.phase != Phase.Submitted) revert WrongStatus();
        if (c.config.autoCompleteOnSilence) revert WrongMode();
        if (block.timestamp < _reviewEnd(c)) revert ReviewStillOpen();
        _payTip(instance, jobId, c);
        _escalate(instance, jobId, c, bytes32(0));
    }

    /// @inheritdoc IOpusEvaluator
    function rule(address instance, uint256 jobId, bool completed, bytes32 reasonHash) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        if (c.phase != Phase.ArbiterPending) revert WrongStatus();
        if (msg.sender != c.config.arbiter) revert Unauthorized();
        if (block.timestamp > c.disputeDeadline) revert ReviewEnded();
        emit Ruled(instance, jobId, msg.sender, completed, reasonHash);
        if (completed) {
            _complete(instance, jobId, c, reasonHash);
        } else {
            _reject(instance, jobId, c, reasonHash);
        }
    }

    /// @inheritdoc IOpusEvaluator
    function resolveByDefault(address instance, uint256 jobId) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        if (c.config.arbiter == address(0)) {
            if (c.phase != Phase.Escalated) revert WrongStatus();
        } else {
            if (c.phase != Phase.ArbiterPending) revert WrongStatus();
            if (block.timestamp < c.disputeDeadline) revert TooEarly();
        }
        bool completed = c.config.defaultComplete;
        emit ResolvedByDefault(instance, jobId, completed);
        _payTip(instance, jobId, c);
        if (completed) {
            _complete(instance, jobId, c, REASON_DEFAULT);
        } else {
            _reject(instance, jobId, c, REASON_DEFAULT);
        }
    }

    /// @inheritdoc IOpusEvaluator
    function sweep(address instance, uint256 jobId) external nonReentrant {
        Case storage c = _cases[instance][jobId];
        if (!c.configured || c.phase == Phase.Resolved) revert WrongStatus();
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        if (
            job.status != IOpusACPExtensions.JobStatus.Rejected &&
            job.status != IOpusACPExtensions.JobStatus.Completed &&
            job.status != IOpusACPExtensions.JobStatus.Expired
        ) {
            revert WrongStatus();
        }
        uint256 remaining = c.feeHeld;
        if (remaining == 0) revert NothingToSweep();
        c.feeHeld = 0;
        c.phase = Phase.Resolved;
        _pay(c.token, job.client, remaining);
        emit Swept(instance, jobId, job.client, remaining);
    }

    /// @inheritdoc IOpusEvaluator
    function withdraw(address token, address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = _claimable[token][msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        _claimable[token][msg.sender] = 0;
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, msg.sender, to, amount);
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
            c.phase = Phase.Funded;
            return;
        }

        if (selector == IAgenticCommerce.submit.selector) {
            if (!c.configured || c.fundedAt == 0) revert NotConfigured();
            if (block.timestamp >= uint256(c.fundedAt) + uint256(c.config.submitWindow)) revert SubmitWindowClosed();
        }
    }

    /// @inheritdoc IACPHook
    function afterAction(uint256 jobId, bytes4 selector, bytes calldata) external {
        if (selector == IAgenticCommerce.complete.selector || selector == IAgenticCommerce.reject.selector) {
            return;
        }
        if (selector == IAgenticCommerce.submit.selector) {
            Case storage c = _cases[msg.sender][jobId];
            c.submittedAt = uint64(block.timestamp);
            c.phase = Phase.Submitted;
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

    /// @inheritdoc IOpusEvaluator
    function phase(address instance, uint256 jobId) external view returns (Phase) {
        return _cases[instance][jobId].phase;
    }

    /// @inheritdoc IOpusEvaluator
    function reviewEnd(address instance, uint256 jobId) external view returns (uint256) {
        return _reviewEnd(_cases[instance][jobId]);
    }

    /// @inheritdoc IOpusEvaluator
    function disputeDeadlineOf(address instance, uint256 jobId) external view returns (uint64) {
        return _cases[instance][jobId].disputeDeadline;
    }

    /// @inheritdoc IOpusEvaluator
    function feeHeld(address instance, uint256 jobId) external view returns (uint256) {
        return _cases[instance][jobId].feeHeld;
    }

    /// @inheritdoc IOpusEvaluator
    function claimable(address token, address account) external view returns (uint256) {
        return _claimable[token][account];
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(IACPHook).interfaceId ||
            interfaceId == type(IOpusEvaluator).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    function _requireOpenCase(address instance, uint256 jobId) private view returns (Case storage c) {
        c = _cases[instance][jobId];
        if (!c.configured) revert NotConfigured();
        if (c.phase == Phase.Resolved) revert WrongStatus();
    }

    function _escalate(address instance, uint256 jobId, Case storage c, bytes32 evidenceHash) private {
        if (c.config.arbiter == address(0)) {
            c.phase = Phase.Escalated;
            emit Escalated(instance, jobId);
            return;
        }
        c.phase = Phase.ArbiterPending;
        c.disputeDeadline = uint64(block.timestamp + uint256(c.config.disputeWindow));
        emit Escalated(instance, jobId);
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = evidenceHash;
        emit CaseOpened(instance, jobId, c.config.arbiter, c.disputeDeadline, hashes);
    }

    function _complete(address instance, uint256 jobId, Case storage c, bytes32 reason) private {
        _settleFee(instance, jobId, c);
        c.phase = Phase.Resolved;
        IAgenticCommerce(instance).complete(jobId, reason, "");
    }

    function _reject(address instance, uint256 jobId, Case storage c, bytes32 reason) private {
        _settleFee(instance, jobId, c);
        c.phase = Phase.Resolved;
        IAgenticCommerce(instance).reject(jobId, reason, "");
    }

    function _rebalanceFee(Case storage c, address token, address client, uint128 newFee) private {
        uint256 oldFee = c.feeHeld;
        if (oldFee > 0) {
            c.feeHeld = 0;
            IERC20(c.token == address(0) ? token : c.token).safeTransfer(client, oldFee);
        }
        if (newFee == 0) return;
        IERC20 erc20 = IERC20(token);
        uint256 beforeBal = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(client, address(this), newFee);
        uint256 received = erc20.balanceOf(address(this)) - beforeBal;
        if (received != newFee) revert UnexpectedFeeAmount(received, newFee);
        c.feeHeld = newFee;
    }

    function _payTip(address instance, uint256 jobId, Case storage c) private {
        uint256 tip = c.config.keeperTip;
        if (tip == 0 || c.tipsPaid >= MAX_TIPS || c.feeHeld < tip) return;
        c.feeHeld -= uint128(tip);
        c.tipsPaid += 1;
        _pay(c.token, msg.sender, tip);
        emit TipPaid(instance, jobId, msg.sender, tip);
    }

    function _settleFee(address instance, uint256 jobId, Case storage c) private {
        uint256 remaining = c.feeHeld;
        if (remaining == 0) return;
        c.feeHeld = 0;
        _pay(c.token, c.config.operator, remaining);
        emit FeePaid(instance, jobId, c.config.operator, remaining);
    }

    function _pay(address token, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (ok && (ret.length == 0 || abi.decode(ret, (bool)))) {
            return;
        }
        _claimable[token][to] += amount;
        emit PayoutDeferred(token, to, amount);
    }

    function _reviewEnd(Case storage c) private view returns (uint256) {
        if (c.submittedAt == 0) return 0;
        return uint256(c.submittedAt) + uint256(c.config.reviewWindow) + uint256(c.extension);
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

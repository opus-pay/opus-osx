// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IACPHook } from "../acp/IACPHook.sol";
import { IAgenticCommerce } from "../acp/IAgenticCommerce.sol";
import { IOpusACPExtensions } from "../acp/IOpusACPExtensions.sol";
import { IOpusEvaluator } from "./IOpusEvaluator.sol";

/// @notice Shared optimistic evaluator and hook. Per-job state is keyed by (instance, jobId).
contract OptimisticEvaluator is IOpusEvaluator, IACPHook, ERC2771Context, ReentrancyGuard {
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
        bool budgetLocked;
        bool lockBudgetAfter;
        bool clientPosted;
        bool providerPosted;
        uint64 depositDeadline;
        uint128 clientDeposit;
        uint128 providerDeposit;
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
    error BudgetLocked();
    error InvalidDepositConfig();
    error ConfirmationNeedsArbiter();

    constructor(address trustedForwarder_) ERC2771Context(trustedForwarder_) {}

    /// @inheritdoc IOpusEvaluator
    function configure(address instance, uint256 jobId, Config calldata cfg) external nonReentrant {
        _configure(instance, jobId, cfg);
    }

    /// @inheritdoc IOpusEvaluator
    function configureWithPermit(
        address instance,
        uint256 jobId,
        Config calldata cfg,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        address token = address(IOpusACPExtensions(instance).token());
        uint256 pull = uint256(cfg.evaluationFee) + (cfg.autoCompleteOnSilence ? 0 : uint256(cfg.disputeDeposit));
        _tryPermit(token, _msgSender(), pull, deadline, v, r, s);
        _configure(instance, jobId, cfg);
    }

    /// @inheritdoc IOpusEvaluator
    function timeoutNoSubmission(address instance, uint256 jobId) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        if (c.phase != Phase.Funded) revert WrongStatus();
        if (block.timestamp < uint256(c.fundedAt) + uint256(c.config.submitWindow)) revert TooEarly();
        _payTip(instance, jobId, c);
        _reject(instance, jobId, c, REASON_TIMEOUT, 0);
    }

    /// @inheritdoc IOpusEvaluator
    function approve(address instance, uint256 jobId) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        if (_msgSender() != job.client) revert Unauthorized();
        if (c.submittedAt == 0) revert WrongStatus();
        uint8 loser = c.phase == Phase.ArbiterPending ? 1 : 0;
        if (c.phase == Phase.Escalated || c.phase == Phase.ArbiterPending) {
            emit Conceded(instance, jobId, msg.sender);
        }
        _complete(instance, jobId, c, REASON_APPROVE, loser);
    }

    /// @inheritdoc IOpusEvaluator
    function withdrawAsProvider(address instance, uint256 jobId) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        if (_msgSender() != job.provider) revert Unauthorized();
        if (c.fundedAt == 0) revert WrongStatus();
        uint8 loser = c.phase == Phase.ArbiterPending ? 2 : 0;
        if (c.phase == Phase.Escalated || c.phase == Phase.ArbiterPending) {
            emit Conceded(instance, jobId, msg.sender);
        }
        _reject(instance, jobId, c, REASON_WITHDRAW, loser);
    }

    /// @inheritdoc IOpusEvaluator
    function object(address instance, uint256 jobId, bytes32 evidenceHash) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        if (_msgSender() != job.client) revert Unauthorized();
        if (c.phase != Phase.Submitted) revert WrongStatus();
        if (block.timestamp >= _reviewEnd(c)) revert ReviewEnded();
        c.evidenceHash = evidenceHash;
        emit Objected(instance, jobId, evidenceHash);
        _ensureClientDeposit(instance, jobId, job, c);
        _escalate(instance, jobId, c, evidenceHash);
    }

    /// @inheritdoc IOpusEvaluator
    function extendReview(address instance, uint256 jobId, uint32 secondsExtended) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        if (_msgSender() != job.client) revert Unauthorized();
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
        _complete(instance, jobId, c, REASON_FINALIZE, 0);
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
        if (_msgSender() != c.config.arbiter) revert Unauthorized();
        if (block.timestamp >= c.disputeDeadline) revert ReviewEnded();
        emit Ruled(instance, jobId, msg.sender, completed, reasonHash);
        if (completed) {
            _complete(instance, jobId, c, reasonHash, 1);
        } else {
            _reject(instance, jobId, c, reasonHash, 2);
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
            _complete(instance, jobId, c, REASON_DEFAULT, 0);
        } else {
            _reject(instance, jobId, c, REASON_DEFAULT, 0);
        }
    }

    /// @inheritdoc IOpusEvaluator
    function postDeposit(address instance, uint256 jobId) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        _postDeposit(instance, jobId, job, c);
    }

    /// @inheritdoc IOpusEvaluator
    function postDepositWithPermit(
        address instance,
        uint256 jobId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        _tryPermit(c.token, _msgSender(), c.config.disputeDeposit, deadline, v, r, s);
        _postDeposit(instance, jobId, job, c);
    }

    /// @inheritdoc IOpusEvaluator
    function resolveMissingDeposit(address instance, uint256 jobId) external nonReentrant {
        Case storage c = _requireOpenCase(instance, jobId);
        if (c.phase != Phase.Escalated || c.config.disputeDeposit == 0) revert WrongStatus();
        if (block.timestamp < c.depositDeadline) revert TooEarly();
        if (c.clientPosted && c.providerPosted) revert WrongStatus();
        _payTip(instance, jobId, c);
        // Missing side loses: client posted / provider silent → reject; provider posted / client silent → complete.
        if (c.clientPosted && !c.providerPosted) {
            _reject(instance, jobId, c, REASON_DEFAULT, 0);
        } else if (!c.clientPosted && c.providerPosted) {
            _complete(instance, jobId, c, REASON_DEFAULT, 0);
        } else if (c.config.defaultComplete) {
            _complete(instance, jobId, c, REASON_DEFAULT, 0);
        } else {
            _reject(instance, jobId, c, REASON_DEFAULT, 0);
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
        uint256 toClient = uint256(c.feeHeld) + uint256(c.clientDeposit);
        uint256 toProvider = c.providerDeposit;
        if (toClient + toProvider == 0) revert NothingToSweep();
        c.feeHeld = 0;
        c.clientDeposit = 0;
        c.providerDeposit = 0;
        c.phase = Phase.Resolved;
        if (toClient > 0) _pay(c.token, job.client, toClient);
        if (toProvider > 0) _pay(c.token, job.provider, toProvider);
        emit Swept(instance, jobId, job.client, toClient);
    }

    /// @inheritdoc IOpusEvaluator
    function withdraw(address token, address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        address owner = _msgSender();
        uint256 amount = _claimable[token][owner];
        if (amount == 0) revert NothingToWithdraw();
        _claimable[token][owner] = 0;
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, owner, to, amount);
    }

    /// @inheritdoc IACPHook
    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external {
        if (selector == IAgenticCommerce.complete.selector || selector == IAgenticCommerce.reject.selector) {
            return;
        }

        Case storage c = _cases[msg.sender][jobId];
        IOpusACPExtensions.JobView memory job = IOpusACPExtensions(msg.sender).getJobView(jobId);

        if (selector == IAgenticCommerce.setBudget.selector) {
            _beforeSetBudget(c, job);
            return;
        }

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
        Case storage c = _cases[msg.sender][jobId];
        if (selector == IAgenticCommerce.submit.selector) {
            c.submittedAt = uint64(block.timestamp);
            c.phase = Phase.Submitted;
        }
        if (selector == IAgenticCommerce.setBudget.selector && c.lockBudgetAfter) {
            c.budgetLocked = true;
            c.lockBudgetAfter = false;
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

    /// @inheritdoc IOpusEvaluator
    function depositDeadlineOf(address instance, uint256 jobId) external view returns (uint64) {
        return _cases[instance][jobId].depositDeadline;
    }

    /// @inheritdoc IOpusEvaluator
    function clientDepositOf(address instance, uint256 jobId) external view returns (uint256) {
        return _cases[instance][jobId].clientDeposit;
    }

    /// @inheritdoc IOpusEvaluator
    function providerDepositOf(address instance, uint256 jobId) external view returns (uint256) {
        return _cases[instance][jobId].providerDeposit;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(IACPHook).interfaceId ||
            interfaceId == type(IOpusEvaluator).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    function _beforeSetBudget(Case storage c, IOpusACPExtensions.JobView memory job) private {
        if (!c.configured) return;
        uint8 lock = c.config.budgetLock;
        if (lock == uint8(BudgetLock.FromCreation)) revert BudgetLocked();
        if (lock == uint8(BudgetLock.AfterProviderSetBudget)) {
            if (c.budgetLocked) revert BudgetLocked();
            // First setBudget after the provider is set locks when that call completes.
            if (job.provider != address(0)) {
                c.lockBudgetAfter = true;
            }
        }
    }

    function _requireOpenCase(address instance, uint256 jobId) private view returns (Case storage c) {
        c = _cases[instance][jobId];
        if (!c.configured) revert NotConfigured();
        if (c.phase == Phase.Resolved) revert WrongStatus();
    }

    function _escalate(address instance, uint256 jobId, Case storage c, bytes32 evidenceHash) private {
        _scheduleDeadlines(c);
        if (c.config.arbiter == address(0)) {
            c.phase = Phase.Escalated;
            emit Escalated(instance, jobId);
            return;
        }
        if (c.config.disputeDeposit == 0 || (c.clientPosted && c.providerPosted)) {
            _openCase(instance, jobId, c, evidenceHash);
            return;
        }
        c.phase = Phase.Escalated;
        emit Escalated(instance, jobId);
    }

    function _openCase(address instance, uint256 jobId, Case storage c, bytes32 evidenceHash) private {
        bool firstEscalation = c.phase != Phase.Escalated;
        c.phase = Phase.ArbiterPending;
        _scheduleDeadlines(c);
        if (firstEscalation) emit Escalated(instance, jobId);
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = evidenceHash;
        emit CaseOpened(instance, jobId, c.config.arbiter, c.disputeDeadline, hashes);
    }

    function _scheduleDeadlines(Case storage c) private {
        uint256 review = _reviewEnd(c);
        c.depositDeadline = uint64(review + uint256(c.config.depositWindow));
        c.disputeDeadline = uint64(review + uint256(c.config.depositWindow) + uint256(c.config.disputeWindow));
    }

    function _configure(address instance, uint256 jobId, Config calldata cfg) private {
        if (instance == address(0)) revert ZeroAddress();
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        if (job.status != IOpusACPExtensions.JobStatus.Open) revert WrongStatus();
        if (_msgSender() != job.client) revert Unauthorized();
        if (job.evaluator != address(this) || job.hook != address(this)) revert NotEvaluator();
        Case storage c = _cases[instance][jobId];
        if (c.fundedAt != 0) revert ConfigFrozen();
        _validateConfig(cfg, job);
        address token = address(IOpusACPExtensions(instance).token());
        uint128 prepaid = cfg.autoCompleteOnSilence ? uint128(0) : cfg.disputeDeposit;
        _rebalanceHolds(c, token, _msgSender(), cfg.evaluationFee, prepaid);
        c.config = cfg;
        c.token = token;
        c.configured = true;
        emit Configured(instance, jobId, _msgSender());
    }

    function _postDeposit(address instance, uint256 jobId, IOpusACPExtensions.Job memory job, Case storage c) private {
        if (c.phase != Phase.Escalated) revert WrongStatus();
        if (c.config.disputeDeposit == 0) revert WrongStatus();
        if (block.timestamp > c.depositDeadline) revert ReviewEnded();
        address caller = _msgSender();
        if (caller == job.client) {
            if (c.clientPosted) revert WrongStatus();
            _pullDeposit(c, job.client, true);
        } else if (caller == job.provider) {
            if (c.providerPosted) revert WrongStatus();
            _pullDeposit(c, job.provider, false);
        } else {
            revert Unauthorized();
        }
        emit DepositPosted(instance, jobId, caller, c.config.disputeDeposit);
        if (c.clientPosted && c.providerPosted) {
            _openCase(instance, jobId, c, c.evidenceHash);
        }
    }

    function _tryPermit(
        address token,
        address owner,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private {
        if (value == 0) return;
        try IERC20Permit(token).permit(owner, address(this), value, deadline, v, r, s) {} catch {}
    }

    function _complete(address instance, uint256 jobId, Case storage c, bytes32 reason, uint8 loser) private {
        _settleDeposits(instance, jobId, c, loser);
        _settleFee(instance, jobId, c);
        c.phase = Phase.Resolved;
        IAgenticCommerce(instance).complete(jobId, reason, "");
    }

    function _reject(address instance, uint256 jobId, Case storage c, bytes32 reason, uint8 loser) private {
        _settleDeposits(instance, jobId, c, loser);
        _settleFee(instance, jobId, c);
        c.phase = Phase.Resolved;
        IAgenticCommerce(instance).reject(jobId, reason, "");
    }

    function _rebalanceHolds(
        Case storage c,
        address token,
        address client,
        uint128 newFee,
        uint128 prepaidDeposit
    ) private {
        uint256 refund = uint256(c.feeHeld) + uint256(c.clientDeposit);
        if (refund > 0) {
            address held = c.token == address(0) ? token : c.token;
            c.feeHeld = 0;
            c.clientDeposit = 0;
            c.clientPosted = false;
            IERC20(held).safeTransfer(client, refund);
        }
        uint256 pull = uint256(newFee) + uint256(prepaidDeposit);
        if (pull == 0) return;
        IERC20 erc20 = IERC20(token);
        uint256 beforeBal = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(client, address(this), pull);
        uint256 received = erc20.balanceOf(address(this)) - beforeBal;
        if (received != pull) revert UnexpectedFeeAmount(received, pull);
        c.feeHeld = newFee;
        if (prepaidDeposit > 0) {
            c.clientDeposit = prepaidDeposit;
            c.clientPosted = true;
        }
    }

    function _ensureClientDeposit(
        address instance,
        uint256 jobId,
        IOpusACPExtensions.Job memory job,
        Case storage c
    ) private {
        if (c.config.disputeDeposit == 0 || c.clientPosted) return;
        _pullDeposit(c, job.client, true);
        emit DepositPosted(instance, jobId, job.client, c.config.disputeDeposit);
    }

    function _pullDeposit(Case storage c, address from, bool clientSide) private {
        uint256 amount = c.config.disputeDeposit;
        IERC20 erc20 = IERC20(c.token);
        uint256 beforeBal = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(from, address(this), amount);
        uint256 received = erc20.balanceOf(address(this)) - beforeBal;
        if (received != amount) revert UnexpectedFeeAmount(received, amount);
        if (clientSide) {
            c.clientPosted = true;
            c.clientDeposit = uint128(amount);
        } else {
            c.providerPosted = true;
            c.providerDeposit = uint128(amount);
        }
    }

    function _settleDeposits(address instance, uint256 jobId, Case storage c, uint8 loser) private {
        IOpusACPExtensions.Job memory job = IOpusACPExtensions(instance).getJob(jobId);
        uint256 clientAmt = c.clientDeposit;
        uint256 providerAmt = c.providerDeposit;
        c.clientDeposit = 0;
        c.providerDeposit = 0;
        c.clientPosted = false;
        c.providerPosted = false;
        if (loser == 1) {
            if (clientAmt > 0) _pay(c.token, c.config.arbiter, clientAmt);
            if (providerAmt > 0) _pay(c.token, job.provider, providerAmt);
        } else if (loser == 2) {
            if (providerAmt > 0) _pay(c.token, c.config.arbiter, providerAmt);
            if (clientAmt > 0) _pay(c.token, job.client, clientAmt);
        } else {
            if (clientAmt > 0) _pay(c.token, job.client, clientAmt);
            if (providerAmt > 0) _pay(c.token, job.provider, providerAmt);
        }
    }

    function _payTip(address instance, uint256 jobId, Case storage c) private {
        uint256 tip = c.config.keeperTip;
        if (tip == 0 || c.tipsPaid >= MAX_TIPS || c.feeHeld < tip) return;
        c.feeHeld -= uint128(tip);
        c.tipsPaid += 1;
        address keeper = _msgSender();
        _pay(c.token, keeper, tip);
        emit TipPaid(instance, jobId, keeper, tip);
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
        if (!cfg.autoCompleteOnSilence && cfg.arbiter == address(0)) revert ConfirmationNeedsArbiter();
        if (cfg.disputeDeposit > 0 && cfg.arbiter == address(0)) revert InvalidDepositConfig();
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

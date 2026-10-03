// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IACPHook } from "./IACPHook.sol";
import { IAgenticCommerce } from "./IAgenticCommerce.sol";
import { IOpusACPExtensions } from "./IOpusACPExtensions.sol";

/// @notice ERC-8183 job escrow. No admin, no protocol fee, deferred payouts, and optional ERC-2771.
contract OpusAgenticCommerce is IAgenticCommerce, IOpusACPExtensions, ERC2771Context, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev D3 — replace after the duration decision. Suggested 1 hour / 180 days.
    uint256 public constant PLACEHOLDER_MIN_JOB_DURATION = 1 hours;
    uint256 public constant PLACEHOLDER_MAX_JOB_DURATION = 180 days;

    uint256 public constant EVALUATOR_FEE_BP = 0;
    uint256 public constant MIN_BUDGET_USD = 1;
    /// @dev 100 USD per job until the external audit; raised to 1,000 at the post-audit deployment.
    uint256 public constant MAX_BUDGET_USD = 100;

    /// @dev D2 — replace after the fee-cap decision. Suggested 1,000 (10%) and 300,000 gas.
    uint256 public constant PLACEHOLDER_MAX_PLATFORM_FEE_BP = 1_000;
    uint256 public constant PLACEHOLDER_HOOK_GAS_LIMIT = 300_000;

    IERC20 public immutable token;
    uint8 public immutable tokenDecimals;
    address public immutable platformTreasury;
    uint256 public immutable platformFeeBP;
    address public immutable factory;

    uint256 public jobCount;
    mapping(uint256 => Job) private _jobs;
    mapping(address => uint256) public claimable;

    error InvalidJob();
    error WrongStatus();
    error Unauthorized();
    error ZeroAddress();
    error InvalidTokenDecimals(uint8 decimals);
    error ExpiryTooSoon(uint256 expiredAt, uint256 minExpiredAt);
    error ExpiryTooFar(uint256 expiredAt, uint256 maxExpiredAt);
    error ZeroBudget();
    error ProviderNotSet();
    error BudgetMismatch(uint256 actual, uint256 expected);
    error UnexpectedFundedAmount(uint256 received, uint256 expected);
    error InvalidFeeConfig();
    error FeesTooHigh(uint256 feeBP);
    error NothingToWithdraw();
    error HookFailed(bytes4 selector, bool before);
    error BudgetBelowMinimum(uint256 amount);
    error BudgetAboveMaximum(uint256 amount);
    error InsufficientAllowance(uint256 available, uint256 needed);

    constructor(
        address token_,
        uint8 tokenDecimals_,
        address platformTreasury_,
        uint256 platformFeeBP_,
        address trustedForwarder_,
        address factory_
    ) ERC2771Context(trustedForwarder_) {
        if (token_ == address(0)) revert ZeroAddress();
        if (tokenDecimals_ != 6 && tokenDecimals_ != 18) revert InvalidTokenDecimals(tokenDecimals_);
        if ((platformTreasury_ == address(0)) != (platformFeeBP_ == 0)) revert InvalidFeeConfig();
        if (platformFeeBP_ > PLACEHOLDER_MAX_PLATFORM_FEE_BP) revert FeesTooHigh(platformFeeBP_);
        token = IERC20(token_);
        tokenDecimals = tokenDecimals_;
        platformTreasury = platformTreasury_;
        platformFeeBP = platformFeeBP_;
        factory = factory_;
    }

    /// @inheritdoc IAgenticCommerce
    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        address hook
    ) external nonReentrant returns (uint256 jobId) {
        if (evaluator == address(0)) revert ZeroAddress();
        uint256 minExpiredAt = block.timestamp + PLACEHOLDER_MIN_JOB_DURATION;
        uint256 maxExpiredAt = block.timestamp + PLACEHOLDER_MAX_JOB_DURATION;
        if (expiredAt < minExpiredAt) revert ExpiryTooSoon(expiredAt, minExpiredAt);
        if (expiredAt > maxExpiredAt) revert ExpiryTooFar(expiredAt, maxExpiredAt);

        jobId = ++jobCount;
        _jobs[jobId] = Job({
            client: _msgSender(),
            provider: provider,
            evaluator: evaluator,
            description: description,
            budget: 0,
            expiredAt: expiredAt,
            status: JobStatus.Open,
            hook: hook
        });
        emit JobCreated(jobId, _msgSender(), provider, evaluator, expiredAt, hook);
    }

    /// @inheritdoc IAgenticCommerce
    function setProvider(uint256 jobId, address provider, bytes calldata optParams) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Open) revert WrongStatus();
        if (_msgSender() != job.client) revert Unauthorized();
        if (job.provider != address(0)) revert WrongStatus();
        if (provider == address(0)) revert ZeroAddress();
        bytes memory data = abi.encode(provider, optParams);
        _callHook(job.hook, true, jobId, data);
        job.provider = provider;
        emit ProviderSet(jobId, provider);
        _callHook(job.hook, false, jobId, data);
    }

    /// @inheritdoc IAgenticCommerce
    function setBudget(uint256 jobId, uint256 amount, bytes calldata optParams) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Open) revert WrongStatus();
        address caller = _msgSender();
        if (caller != job.client && caller != job.provider) revert Unauthorized();
        _requireBudgetRange(amount);
        bytes memory data = abi.encode(amount, optParams);
        _callHook(job.hook, true, jobId, data);
        job.budget = amount;
        emit BudgetSet(jobId, amount);
        _callHook(job.hook, false, jobId, data);
    }

    /// @inheritdoc IAgenticCommerce
    function fund(uint256 jobId, uint256 expectedBudget, bytes calldata optParams) external nonReentrant {
        _fund(jobId, expectedBudget, optParams);
    }

    /// @notice OPUS extension. Tries `permit`, then the standard `fund` path (same hooks and events).
    function fundWithPermit(
        uint256 jobId,
        uint256 expectedBudget,
        bytes calldata optParams,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        address owner = _msgSender();
        try IERC20Permit(address(token)).permit(owner, address(this), expectedBudget, deadline, v, r, s) {} catch {}
        uint256 allowed = token.allowance(owner, address(this));
        if (allowed < expectedBudget) revert InsufficientAllowance(allowed, expectedBudget);
        _fund(jobId, expectedBudget, optParams);
    }

    /// @inheritdoc IAgenticCommerce
    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Funded) revert WrongStatus();
        if (_msgSender() != job.provider) revert Unauthorized();
        bytes memory data = abi.encode(deliverable, optParams);
        _callHook(job.hook, true, jobId, data);
        job.status = JobStatus.Submitted;
        emit JobSubmitted(jobId, job.provider, deliverable);
        _callHook(job.hook, false, jobId, data);
    }

    /// @inheritdoc IAgenticCommerce
    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Submitted) revert WrongStatus();
        if (_msgSender() != job.evaluator) revert Unauthorized();
        bytes memory data = abi.encode(reason, optParams);
        _callHook(job.hook, true, jobId, data);
        job.status = JobStatus.Completed;
        uint256 amount = job.budget;
        uint256 fee = (amount * platformFeeBP) / 10_000;
        uint256 toProvider = amount - fee;
        if (fee > 0) {
            _pay(platformTreasury, fee);
        }
        if (toProvider > 0) {
            _pay(job.provider, toProvider);
        }
        emit JobCompleted(jobId, job.evaluator, reason);
        emit PaymentReleased(jobId, job.provider, toProvider);
        _callHook(job.hook, false, jobId, data);
    }

    /// @inheritdoc IAgenticCommerce
    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage job = _job(jobId);
        address caller = _msgSender();
        if (job.status == JobStatus.Open) {
            if (caller != job.client) revert Unauthorized();
        } else if (job.status == JobStatus.Funded || job.status == JobStatus.Submitted) {
            if (caller != job.evaluator) revert Unauthorized();
        } else {
            revert WrongStatus();
        }

        bytes memory data = abi.encode(reason, optParams);
        _callHook(job.hook, true, jobId, data);
        JobStatus previous = job.status;
        job.status = JobStatus.Rejected;
        if (previous == JobStatus.Funded || previous == JobStatus.Submitted) {
            uint256 amount = job.budget;
            if (amount > 0) {
                _pay(job.client, amount);
            }
            emit Refunded(jobId, job.client, amount);
        }
        emit JobRejected(jobId, caller, reason);
        _callHook(job.hook, false, jobId, data);
    }

    /// @inheritdoc IAgenticCommerce
    function claimRefund(uint256 jobId) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Funded && job.status != JobStatus.Submitted) revert WrongStatus();
        if (block.timestamp < job.expiredAt) revert WrongStatus();
        job.status = JobStatus.Expired;
        uint256 amount = job.budget;
        if (amount > 0) {
            _pay(job.client, amount);
        }
        emit Refunded(jobId, job.client, amount);
        emit JobExpired(jobId);
    }

    /// @inheritdoc IOpusACPExtensions
    function withdraw(address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = claimable[_msgSender()];
        if (amount == 0) revert NothingToWithdraw();
        claimable[_msgSender()] = 0;
        token.safeTransfer(to, amount);
        emit Withdrawn(_msgSender(), to, amount);
    }

    /// @inheritdoc IOpusACPExtensions
    function getJob(uint256 jobId) external view returns (Job memory) {
        return _job(jobId);
    }

    /// @inheritdoc IOpusACPExtensions
    function getJobView(uint256 jobId) external view returns (JobView memory job) {
        Job storage stored = _job(jobId);
        job = JobView({
            client: stored.client,
            provider: stored.provider,
            evaluator: stored.evaluator,
            budget: stored.budget,
            expiredAt: stored.expiredAt,
            status: stored.status,
            hook: stored.hook
        });
    }

    function _job(uint256 jobId) private view returns (Job storage job) {
        job = _jobs[jobId];
        if (job.client == address(0)) revert InvalidJob();
    }

    function _fund(uint256 jobId, uint256 expectedBudget, bytes memory optParams) private {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Open) revert WrongStatus();
        if (_msgSender() != job.client) revert Unauthorized();
        if (job.provider == address(0)) revert ProviderNotSet();
        if (job.budget == 0) revert ZeroBudget();
        _requireBudgetRange(job.budget);
        if (job.budget != expectedBudget) revert BudgetMismatch(job.budget, expectedBudget);
        if (block.timestamp >= job.expiredAt) revert WrongStatus();

        _callHookWithSelector(job.hook, true, jobId, IAgenticCommerce.fund.selector, optParams);
        job.status = JobStatus.Funded;

        uint256 beforeBal = token.balanceOf(address(this));
        token.safeTransferFrom(job.client, address(this), job.budget);
        uint256 received = token.balanceOf(address(this)) - beforeBal;
        if (received != job.budget) revert UnexpectedFundedAmount(received, job.budget);

        emit JobFunded(jobId, job.client, job.budget);
        _callHookWithSelector(job.hook, false, jobId, IAgenticCommerce.fund.selector, optParams);
    }

    function _normalized(uint256 amount) private view returns (uint256) {
        if (tokenDecimals == 18) return amount;
        return amount * (10 ** (18 - tokenDecimals));
    }

    function _requireBudgetRange(uint256 amount) private view {
        uint256 normalized = _normalized(amount);
        uint256 minAmount = MIN_BUDGET_USD * 1e18;
        uint256 maxAmount = MAX_BUDGET_USD * 1e18;
        if (normalized < minAmount) revert BudgetBelowMinimum(amount);
        if (normalized > maxAmount) revert BudgetAboveMaximum(amount);
    }

    function _callHook(address hook, bool before, uint256 jobId, bytes memory data) private {
        _callHookWithSelector(hook, before, jobId, msg.sig, data);
    }

    function _callHookWithSelector(
        address hook,
        bool before,
        uint256 jobId,
        bytes4 selector,
        bytes memory data
    ) private {
        if (hook == address(0)) return;
        bytes memory payload = abi.encodeWithSelector(
            before ? IACPHook.beforeAction.selector : IACPHook.afterAction.selector,
            jobId,
            selector,
            data
        );
        (bool ok, ) = hook.call{ gas: PLACEHOLDER_HOOK_GAS_LIMIT }(payload);
        if (!ok) revert HookFailed(selector, before);
    }

    function _pay(address to, uint256 amount) private {
        (bool ok, bytes memory ret) = address(token).call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (ok && (ret.length == 0 || abi.decode(ret, (bool)))) {
            return;
        }
        claimable[to] += amount;
        emit PayoutDeferred(to, amount);
    }
}

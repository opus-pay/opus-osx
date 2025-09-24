// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IAgenticCommerce } from "./IAgenticCommerce.sol";
import { IOpusACPExtensions } from "./IOpusACPExtensions.sol";

/// @notice ERC-8183 job escrow. No admin. Fees, hooks, and deferred payouts land in later issues.
contract OpusAgenticCommerce is IAgenticCommerce, IOpusACPExtensions, ERC2771Context, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev D3 — replace after the duration decision. Suggested 1 hour / 180 days.
    uint256 public constant PLACEHOLDER_MIN_JOB_DURATION = 1 hours;
    uint256 public constant PLACEHOLDER_MAX_JOB_DURATION = 180 days;

    uint256 public constant EVALUATOR_FEE_BP = 0;

    IERC20 public immutable token;
    uint8 public immutable tokenDecimals;
    address public immutable platformTreasury;
    uint256 public immutable platformFeeBP;
    address public immutable factory;

    uint256 public jobCount;
    mapping(uint256 => Job) private _jobs;

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
        emit JobCreated(jobId, _msgSender(), provider, evaluator, expiredAt);
    }

    /// @inheritdoc IAgenticCommerce
    function setProvider(uint256 jobId, address provider, bytes calldata) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Open) revert WrongStatus();
        if (_msgSender() != job.client) revert Unauthorized();
        if (job.provider != address(0)) revert WrongStatus();
        if (provider == address(0)) revert ZeroAddress();
        job.provider = provider;
        emit ProviderSet(jobId, provider);
    }

    /// @inheritdoc IAgenticCommerce
    function setBudget(uint256 jobId, uint256 amount, bytes calldata) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Open) revert WrongStatus();
        address caller = _msgSender();
        if (caller != job.client && caller != job.provider) revert Unauthorized();
        job.budget = amount;
        emit BudgetSet(jobId, amount);
    }

    /// @inheritdoc IAgenticCommerce
    function fund(uint256 jobId, uint256 expectedBudget, bytes calldata) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Open) revert WrongStatus();
        if (_msgSender() != job.client) revert Unauthorized();
        if (job.provider == address(0)) revert ProviderNotSet();
        if (job.budget == 0) revert ZeroBudget();
        if (job.budget != expectedBudget) revert BudgetMismatch(job.budget, expectedBudget);
        if (block.timestamp >= job.expiredAt) revert WrongStatus();

        job.status = JobStatus.Funded;

        uint256 beforeBal = token.balanceOf(address(this));
        token.safeTransferFrom(job.client, address(this), job.budget);
        uint256 received = token.balanceOf(address(this)) - beforeBal;
        if (received != job.budget) revert UnexpectedFundedAmount(received, job.budget);

        emit JobFunded(jobId, job.client, job.budget);
    }

    /// @inheritdoc IAgenticCommerce
    function submit(uint256 jobId, bytes32 deliverable, bytes calldata) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Funded) revert WrongStatus();
        if (_msgSender() != job.provider) revert Unauthorized();
        job.status = JobStatus.Submitted;
        emit JobSubmitted(jobId, job.provider, deliverable);
    }

    /// @inheritdoc IAgenticCommerce
    function complete(uint256 jobId, bytes32 reason, bytes calldata) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Submitted) revert WrongStatus();
        if (_msgSender() != job.evaluator) revert Unauthorized();
        job.status = JobStatus.Completed;
        uint256 amount = job.budget;
        if (amount > 0) {
            token.safeTransfer(job.provider, amount);
        }
        emit JobCompleted(jobId, job.evaluator, reason);
        emit PaymentReleased(jobId, job.provider, amount);
    }

    /// @inheritdoc IAgenticCommerce
    function reject(uint256 jobId, bytes32 reason, bytes calldata) external nonReentrant {
        Job storage job = _job(jobId);
        address caller = _msgSender();
        if (job.status == JobStatus.Open) {
            if (caller != job.client) revert Unauthorized();
        } else if (job.status == JobStatus.Funded || job.status == JobStatus.Submitted) {
            if (caller != job.evaluator) revert Unauthorized();
        } else {
            revert WrongStatus();
        }

        JobStatus previous = job.status;
        job.status = JobStatus.Rejected;
        if (previous == JobStatus.Funded || previous == JobStatus.Submitted) {
            uint256 amount = job.budget;
            if (amount > 0) {
                token.safeTransfer(job.client, amount);
            }
            emit Refunded(jobId, job.client, amount);
        }
        emit JobRejected(jobId, caller, reason);
    }

    /// @inheritdoc IAgenticCommerce
    function claimRefund(uint256 jobId) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Funded && job.status != JobStatus.Submitted) revert WrongStatus();
        if (block.timestamp < job.expiredAt) revert WrongStatus();
        job.status = JobStatus.Expired;
        uint256 amount = job.budget;
        if (amount > 0) {
            token.safeTransfer(job.client, amount);
        }
        emit Refunded(jobId, job.client, amount);
        emit JobExpired(jobId);
    }

    /// @inheritdoc IOpusACPExtensions
    function getJob(uint256 jobId) external view returns (Job memory) {
        return _job(jobId);
    }

    function _job(uint256 jobId) private view returns (Job storage job) {
        job = _jobs[jobId];
        if (job.client == address(0)) revert InvalidJob();
    }
}

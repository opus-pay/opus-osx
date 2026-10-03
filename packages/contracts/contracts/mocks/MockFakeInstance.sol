// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IACPHook } from "../acp/IACPHook.sol";
import { IAgenticCommerce } from "../acp/IAgenticCommerce.sol";
import { IOpusACPExtensions } from "../acp/IOpusACPExtensions.sol";

/// @notice Test-only attacker: a contract that poses as an instance to the shared evaluator.
///         It reports whatever job and token it is told to, and calls the evaluator's hooks directly.
contract MockFakeInstance {
    IERC20 public token;
    IOpusACPExtensions.Job private _job;

    function setToken(IERC20 token_) external {
        token = token_;
    }

    function setJob(
        address client,
        address provider,
        address evaluator,
        uint256 budget,
        uint256 expiredAt,
        IOpusACPExtensions.JobStatus status
    ) external {
        _job = IOpusACPExtensions.Job(client, provider, evaluator, "", budget, expiredAt, status, evaluator);
    }

    function setStatus(IOpusACPExtensions.JobStatus status) external {
        _job.status = status;
    }

    function getJob(uint256) external view returns (IOpusACPExtensions.Job memory) {
        return _job;
    }

    function getJobView(uint256) external view returns (IOpusACPExtensions.JobView memory job) {
        job = IOpusACPExtensions.JobView(
            _job.client,
            _job.provider,
            _job.evaluator,
            _job.budget,
            _job.expiredAt,
            _job.status,
            _job.hook
        );
    }

    function callBeforeFund(address evaluator, uint256 jobId) external {
        IACPHook(evaluator).beforeAction(jobId, IAgenticCommerce.fund.selector, "");
    }

    function callAfterSubmit(address evaluator, uint256 jobId) external {
        IACPHook(evaluator).afterAction(jobId, IAgenticCommerce.submit.selector, "");
    }

    function complete(uint256, bytes32, bytes calldata) external {}

    function reject(uint256, bytes32, bytes calldata) external {}
}

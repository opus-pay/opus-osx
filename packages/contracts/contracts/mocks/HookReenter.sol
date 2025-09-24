// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IACPHook } from "../acp/IACPHook.sol";

interface IHookReenterTarget {
    function reenterFromHook(uint256 jobId, bytes4 selector) external;
}

/// @notice Hook that calls back into a target during `beforeAction`.
contract HookReenter is IACPHook {
    IHookReenterTarget public target;

    function setTarget(address target_) external {
        target = IHookReenterTarget(target_);
    }

    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata) external {
        if (address(target) != address(0)) {
            target.reenterFromHook(jobId, selector);
        }
    }

    function afterAction(uint256, bytes4, bytes calldata) external {}

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IACPHook).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}

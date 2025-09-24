// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IACPHook } from "../acp/IACPHook.sol";
import { IAgenticCommerce } from "../acp/IAgenticCommerce.sol";

/// @notice Allows fund, then reverts every later hookable action.
contract HookArmAfterFund is IACPHook {
    error Armed();

    bool public armed;

    function beforeAction(uint256, bytes4, bytes calldata) external view {
        if (armed) revert Armed();
    }

    function afterAction(uint256, bytes4 selector, bytes calldata) external {
        if (selector == IAgenticCommerce.fund.selector) {
            armed = true;
        }
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IACPHook).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}

/// @notice Calls back into the core during a hook so `nonReentrant` can fire.
contract ReenterSetBudget {
    address public immutable core;

    constructor(address core_) {
        core = core_;
    }

    function reenterFromHook(uint256 jobId, bytes4) external {
        IAgenticCommerce(core).setBudget(jobId, 1, "");
    }
}

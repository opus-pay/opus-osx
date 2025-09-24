// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IACPHook } from "../acp/IACPHook.sol";

/// @notice Hook that reverts on every callback.
contract HookAlwaysRevert is IACPHook {
    error HookReverted();

    function beforeAction(uint256, bytes4, bytes calldata) external pure {
        revert HookReverted();
    }

    function afterAction(uint256, bytes4, bytes calldata) external pure {
        revert HookReverted();
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IACPHook).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}

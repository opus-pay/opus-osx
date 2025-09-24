// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IACPHook } from "../acp/IACPHook.sol";

/// @notice Records hook selector and data so conformance tests can check S21 encoding.
contract HookRecorder is IACPHook {
    bytes4 public lastSelector;
    bytes public lastData;
    bool public lastBefore;
    uint256 public calls;

    function beforeAction(uint256, bytes4 selector, bytes calldata data) external {
        lastSelector = selector;
        lastData = data;
        lastBefore = true;
        calls += 1;
    }

    function afterAction(uint256, bytes4 selector, bytes calldata data) external {
        lastSelector = selector;
        lastData = data;
        lastBefore = false;
        calls += 1;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IACPHook).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}

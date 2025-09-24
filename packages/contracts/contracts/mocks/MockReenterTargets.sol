// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ITokenReenter } from "./MockReentrantToken.sol";

/// @notice Counts token-transfer callbacks for the reentrant-token mock.
contract MockTokenReenterTarget is ITokenReenter {
    uint256 public calls;

    function onTokenTransfer(address, address, uint256) external {
        calls += 1;
    }
}

/// @notice Counts hook re-entry attempts.
contract MockHookReenterTarget {
    uint256 public calls;
    bytes4 public lastSelector;

    function reenterFromHook(uint256, bytes4 selector) external {
        calls += 1;
        lastSelector = selector;
    }
}

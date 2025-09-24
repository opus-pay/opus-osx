// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Temporary compile probe for issue #1. Remove once the ERC-8183 core lands.
/// @dev Confirms OpenZeppelin 5.x modules resolve. EVM target stays `shanghai` until #2.
contract BootstrapProbe is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error TimestampNotReached(uint256 current, uint256 required);

    function erc20Selector() external pure returns (bytes4) {
        return IERC20.totalSupply.selector;
    }

    function openzeppelinModulesResolve() external pure returns (bool) {
        return bytes(type(ReentrancyGuard).name).length != 0 && bytes(type(SafeERC20).name).length != 0;
    }

    function requireTimestamp(uint256 required) external view returns (uint256) {
        if (block.timestamp < required) revert TimestampNotReached(block.timestamp, required);
        return block.timestamp;
    }
}

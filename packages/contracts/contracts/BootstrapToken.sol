// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal ERC-20 so SafeERC20 can be exercised without the #4 mock set.
contract BootstrapToken is ERC20 {
    constructor() ERC20("Bootstrap", "BOOT") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

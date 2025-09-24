// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ITokenReenter {
    function onTokenTransfer(address from, address to, uint256 amount) external;
}

/// @notice Calls `attacker` after every non-mint transfer so the core can be re-entered.
contract MockReentrantToken is ERC20 {
    uint8 private immutable _decimals;
    address public attacker;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setAttacker(address attacker_) external {
        attacker = attacker_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (attacker != address(0) && from != address(0) && to != address(0)) {
            ITokenReenter(attacker).onTokenTransfer(from, to, value);
        }
    }
}

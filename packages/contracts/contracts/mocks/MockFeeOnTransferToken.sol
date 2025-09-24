// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Transfers send `amount - fee`, so a naive pull receives less than `amount`.
contract MockFeeOnTransferToken is ERC20 {
    uint8 private immutable _decimals;
    uint256 public feeBps = 100;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && feeBps > 0) {
            uint256 fee = (value * feeBps) / 10_000;
            super._update(from, to, value - fee);
            if (fee > 0) {
                super._update(from, address(0), fee);
            }
            return;
        }
        super._update(from, to, value);
    }
}

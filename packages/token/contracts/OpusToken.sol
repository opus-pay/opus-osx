// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title OPG governance token
/// @notice Fixed-supply ERC-20. The constructor mints the entire one billion supply to the five
///         tokenomics allocation addresses. Supply never changes afterwards.
/// @dev Do not add `mint`, burn, pause, or blacklist. `ERC20Votes` is deferred (ROADMAP #24) so
///      ordinary transfers do not write checkpoints before Phase 3 governance.
contract OpusToken is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 1e18;
    uint256 public constant TREASURY_ALLOCATION = 400_000_000 * 1e18;
    uint256 public constant SALE_ALLOCATION = 200_000_000 * 1e18;
    uint256 public constant TEAM_ALLOCATION = 200_000_000 * 1e18;
    uint256 public constant MARKETING_ALLOCATION = 160_000_000 * 1e18;
    uint256 public constant LIQUIDITY_ALLOCATION = 40_000_000 * 1e18;

    error ZeroRecipient();

    /// @param treasury Ecosystem treasury allocation recipient.
    /// @param sale ICO / private sale allocation recipient.
    /// @param team Team and engineering allocation recipient.
    /// @param marketing Marketing and store onboarding allocation recipient.
    /// @param liquidity Initial DEX liquidity allocation recipient.
    constructor(
        address treasury,
        address sale,
        address team,
        address marketing,
        address liquidity
    ) ERC20("OPUS Governance", "OPG") {
        if (
            treasury == address(0) ||
            sale == address(0) ||
            team == address(0) ||
            marketing == address(0) ||
            liquidity == address(0)
        ) revert ZeroRecipient();

        assert(
            TREASURY_ALLOCATION + SALE_ALLOCATION + TEAM_ALLOCATION + MARKETING_ALLOCATION + LIQUIDITY_ALLOCATION ==
                INITIAL_SUPPLY
        );

        _mint(treasury, TREASURY_ALLOCATION);
        _mint(sale, SALE_ALLOCATION);
        _mint(team, TEAM_ALLOCATION);
        _mint(marketing, MARKETING_ALLOCATION);
        _mint(liquidity, LIQUIDITY_ALLOCATION);
    }

    /// @notice Number of decimals. Always 18.
    /// @return Token decimal count.
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}

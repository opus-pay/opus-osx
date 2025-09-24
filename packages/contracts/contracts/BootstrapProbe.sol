// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { Nonces } from "@openzeppelin/contracts/utils/Nonces.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Temporary compile-and-runtime probe for issues #1–#2. Remove once the ERC-8183 core lands.
/// @dev Confirms OpenZeppelin 5.6.1 modules and the Cancun target (`MCOPY`, transient storage).
contract BootstrapProbe is ReentrancyGuard, EIP712, Nonces {
    using SafeERC20 for IERC20;

    error TimestampNotReached(uint256 current, uint256 required);

    constructor() EIP712("BootstrapProbe", "1") {}

    /// @notice ERC-20 selector used as an import smoke.
    function erc20Selector() external pure returns (bytes4) {
        return IERC20.totalSupply.selector;
    }

    /// @notice True when the OpenZeppelin 5.x modules this repo depends on resolve.
    function openzeppelinModulesResolve() external pure returns (bool) {
        return
            bytes(type(ReentrancyGuard).name).length != 0 &&
            bytes(type(SafeERC20).name).length != 0 &&
            bytes(type(EIP712).name).length != 0 &&
            bytes(type(Nonces).name).length != 0;
    }

    /// @notice EIP-712 v4 digest for a prehashed struct (domain is this contract).
    function hashTyped(bytes32 structHash) external view returns (bytes32) {
        return _hashTypedDataV4(structHash);
    }

    /// @notice Consumes `owner`'s next nonce. Exposed so Nonces can be exercised on-chain.
    function consumeNonce(address owner) external returns (uint256) {
        return _useNonce(owner);
    }

    /// @notice Reverts unless `nonce` is `owner`'s current nonce.
    function useCheckedNonce(address owner, uint256 nonce) external {
        _useCheckedNonce(owner, nonce);
    }

    /// @notice Pulls `amount` with SafeERC20. Reverts on a failing or lying token.
    function pull(IERC20 token, address from, uint256 amount) external nonReentrant {
        token.safeTransferFrom(from, address(this), amount);
    }

    /// @notice Cancun MCOPY smoke. Fails to compile if `evmVersion` is below cancun.
    function memoryCopy(bytes memory data) external pure returns (bytes memory out) {
        out = new bytes(data.length);
        assembly ("memory-safe") {
            mcopy(add(out, 0x20), add(data, 0x20), mload(data))
        }
    }

    /// @notice Cancun transient-storage smoke (EIP-1153). Value does not persist after the call.
    function transientRoundtrip(uint256 value) external returns (uint256 read) {
        assembly {
            tstore(0, value)
            read := tload(0)
        }
    }

    /// @notice Custom-error and time-travel smoke used by the toolchain tests.
    function requireTimestamp(uint256 required) external view returns (uint256) {
        if (block.timestamp < required) revert TimestampNotReached(block.timestamp, required);
        return block.timestamp;
    }
}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import { OpusAgenticCommerce } from "./OpusAgenticCommerce.sol";

/// @notice Permissionless factory. One instance per (token, treasury, feeBP). No admin.
contract OpusACPFactory {
    address public immutable trustedForwarder;

    address[] private _stablecoins;
    mapping(address => bool) public isListed;
    mapping(bytes32 => address) private _instances;

    event InstanceCreated(address indexed instance, address indexed token, address treasury, uint256 feeBP);

    error EmptyStablecoinList();
    error ZeroAddress();
    error DuplicateStablecoin(address token);
    error InvalidTokenDecimals(address token, uint8 decimals);
    error TokenNotListed(address token);
    error InstanceExists(address instance);

    constructor(address[] memory listed, address trustedForwarder_) {
        if (listed.length == 0) revert EmptyStablecoinList();
        trustedForwarder = trustedForwarder_;
        for (uint256 i = 0; i < listed.length; ++i) {
            address token = listed[i];
            if (token == address(0)) revert ZeroAddress();
            if (isListed[token]) revert DuplicateStablecoin(token);
            uint8 decimals_ = IERC20Metadata(token).decimals();
            if (decimals_ != 6 && decimals_ != 18) revert InvalidTokenDecimals(token, decimals_);
            isListed[token] = true;
            _stablecoins.push(token);
        }
    }

    function stablecoins() external view returns (address[] memory) {
        return _stablecoins;
    }

    function instanceOf(address token, address treasury, uint256 feeBP) public view returns (address) {
        return _instances[_salt(token, treasury, feeBP)];
    }

    function createInstance(address token, address treasury, uint256 feeBP) external returns (address instance) {
        if (!isListed[token]) revert TokenNotListed(token);
        bytes32 salt = _salt(token, treasury, feeBP);
        if (_instances[salt] != address(0)) revert InstanceExists(_instances[salt]);

        uint8 decimals_ = IERC20Metadata(token).decimals();
        OpusAgenticCommerce deployed = new OpusAgenticCommerce{ salt: salt }(
            token,
            decimals_,
            treasury,
            feeBP,
            trustedForwarder,
            address(this)
        );
        instance = address(deployed);
        _instances[salt] = instance;
        emit InstanceCreated(instance, token, treasury, feeBP);
    }

    function _salt(address token, address treasury, uint256 feeBP) private pure returns (bytes32) {
        return keccak256(abi.encode(token, treasury, feeBP));
    }
}

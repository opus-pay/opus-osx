// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IACPHook } from "./IACPHook.sol";
import { IAgenticCommerce } from "./IAgenticCommerce.sol";

/// @notice Compile-only harness so the verbatim ERC-8183 interfaces typecheck (#3).
abstract contract InterfaceCompileHarness is IAgenticCommerce, IACPHook {}

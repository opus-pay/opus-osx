// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @notice ERC-8183 hook interface, copied from the EIP text (IACPHook.sol).
/// @dev Source: https://eips.ethereum.org/EIPS/eip-8183 fetched 2026-09-26.
///      ERC commit a078cab5cc8e9581c15f76c091ed96eed28f02f7 (2026-03-13). Created 2026-02-25.
interface IACPHook is IERC165 {
    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external;

    function afterAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IACPHook } from "../acp/IACPHook.sol";

/// @notice Hook that spends remaining gas so a capped call runs out.
contract HookGasBurn is IACPHook {
    function beforeAction(uint256, bytes4, bytes calldata) external {
        _burn();
    }

    function afterAction(uint256, bytes4, bytes calldata) external {
        _burn();
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IACPHook).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function _burn() private {
        uint256 n;
        while (true) {
            n++;
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal Kleros-style arbitrator used to drive `KlerosArbiterAdapter.rule`.
contract MockKlerosArbitrator {
    function deliver(address adapter, uint256 disputeId, uint256 ruling) external {
        (bool ok, ) = adapter.call(abi.encodeWithSignature("rule(uint256,uint256)", disputeId, ruling));
        require(ok, "rule failed");
    }
}

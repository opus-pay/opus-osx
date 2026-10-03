// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC2771Forwarder } from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

/// @notice Immutable ERC-2771 forwarder. Instances trust this address at construction.
contract OpusForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("OpusForwarder") {}
}

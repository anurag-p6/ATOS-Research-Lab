// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DeployATOSToken} from "./DeployATOSToken.s.sol";
import {console2} from "forge-std/Script.sol";

/// @notice Deploy `ATOSToken` on Filecoin **Butterfly** FEVM testnet only (chain id `3141592` / `0x2fefd8`).
/// @dev Use `--rpc-url filecoin-butterfly` with `FILECOIN_BUTTERFLY_RPC_URL` set in `contracts/.env`.
///      Faucet: https://faucet.butterfly.fildev.network
contract DeployATOSTokenButterfly is DeployATOSToken {
    /// @dev Filecoin Butterfly testnet (see chainlist / Filecoin network docs).
    uint256 internal constant BUTTERFLY_CHAIN_ID = 3141592;

    error DeployATOSTokenButterfly__WrongChain(uint256 chainId);

    function run() external override {
        if (block.chainid != BUTTERFLY_CHAIN_ID) {
            revert DeployATOSTokenButterfly__WrongChain(block.chainid);
        }
        console2.log("Deploying on Butterfly, chainId:", block.chainid);
        _deployATOSToken();
    }
}

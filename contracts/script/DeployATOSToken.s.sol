// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ATOSToken} from "../src/ATOSToken.sol";

/// @notice Deploy `ATOSToken`. No RPC URL or keys in this file: pass `--rpc-url` and a signer on the CLI.
/// @dev Signer: use a Cast keystore account (`cast wallet import …`) with `--account <name>`, or `--ledger`, etc.
///      Optional env: `ATOS_CAP`, `ATOS_INITIAL_SUPPLY` (wei, 18 decimals).
contract DeployATOSToken is Script {
    error DeployATOSToken__MultipleSignersPassSender();

    function run() external {
        uint256 cap = vm.envOr("ATOS_CAP", uint256(1_000_000_000 ether));
        uint256 initial = vm.envOr("ATOS_INITIAL_SUPPLY", uint256(100_000_000 ether));

        address[] memory wallets = vm.getWallets();
        if (wallets.length > 1) revert DeployATOSToken__MultipleSignersPassSender();

        address deployer = wallets.length == 1 ? wallets[0] : DEFAULT_SENDER;

        vm.startBroadcast();

        ATOSToken t = new ATOSToken(deployer, deployer, cap, initial);

        vm.stopBroadcast();

        console2.log("ATOSToken:", address(t));
        console2.log("Owner / initial holder:", deployer);
        console2.log("Cap (wei):", cap);
        console2.log("Initial supply (wei):", initial);
    }
}

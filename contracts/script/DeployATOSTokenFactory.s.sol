// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ATOSTokenFactory} from "../src/ATOSTokenFactory.sol";

/// @notice Deploy `ATOSTokenFactory` once per chain. Users call `createToken` from the dashboard wallet.
contract DeployATOSTokenFactory is Script {
    function run() external {
        address[] memory wallets = vm.getWallets();
        address deployer = wallets.length == 1 ? wallets[0] : DEFAULT_SENDER;

        vm.startBroadcast();
        ATOSTokenFactory factory = new ATOSTokenFactory();
        vm.stopBroadcast();

        console2.log("ATOSTokenFactory:", address(factory));
        console2.log("Deployer:", deployer);
        console2.log("Chain id:", block.chainid);
    }
}

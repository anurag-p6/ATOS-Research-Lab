// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ATOSToken} from "../src/ATOSToken.sol";
import {ATOSTokenFactory} from "../src/ATOSTokenFactory.sol";

contract ATOSTokenFactoryTest is Test {
    ATOSTokenFactory internal factory;
    address internal alice = address(uint160(uint256(keccak256("alice"))));

    uint256 internal constant CAP = 1_000_000e18;
    uint256 internal constant INITIAL = 100_000e18;

    function setUp() public {
        factory = new ATOSTokenFactory();
    }

    function test_createToken() public {
        vm.prank(alice);
        address tokenAddr = factory.createToken("Acme Token", "ACME", CAP, INITIAL);

        assertEq(factory.tokenCount(), 1);
        assertEq(factory.tokenAt(0), tokenAddr);

        ATOSToken t = ATOSToken(tokenAddr);
        assertEq(t.name(), "Acme Token");
        assertEq(t.symbol(), "ACME");
        assertEq(t.owner(), alice);
        assertEq(t.balanceOf(alice), INITIAL);
        assertEq(t.cap(), CAP);
    }

    function test_createToken_reverts_empty_name() public {
        vm.prank(alice);
        vm.expectRevert(ATOSTokenFactory.ATOSTokenFactory_EmptyName.selector);
        factory.createToken("", "X", CAP, 0);
    }

    function test_createToken_reverts_zero_cap() public {
        vm.prank(alice);
        vm.expectRevert(ATOSTokenFactory.ATOSTokenFactory_ZeroCap.selector);
        factory.createToken("Name", "SYM", 0, 0);
    }
}

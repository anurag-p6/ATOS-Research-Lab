// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ATOSToken} from "../src/ATOSToken.sol";

contract ATOSTokenTest is Test {
    ATOSToken internal token;

    address internal owner = address(uint160(uint256(keccak256("owner"))));
    address internal alice = address(uint160(uint256(keccak256("alice"))));
    address internal bob = address(uint160(uint256(keccak256("bob"))));

    uint256 internal constant CAP = 1_000_000_000e18;
    uint256 internal constant INITIAL = 100_000_000e18;

    function setUp() public {
        vm.prank(owner);
        token = new ATOSToken(owner, alice, CAP, INITIAL);
    }

    function test_metadata() public view {
        assertEq(token.name(), "ATOS Token");
        assertEq(token.symbol(), "ATOS");
        assertEq(token.decimals(), 18);
    }

    function test_initial_mint_and_cap() public view {
        assertEq(token.balanceOf(alice), INITIAL);
        assertEq(token.totalSupply(), INITIAL);
        assertEq(token.cap(), CAP);
    }

    function test_mint_by_owner_respects_cap() public {
        uint256 room = CAP - INITIAL;
        vm.prank(owner);
        token.mint(bob, room);
        assertEq(token.totalSupply(), CAP);
    }

    function test_mint_reverts_when_exceeds_cap() public {
        uint256 room = CAP - INITIAL;
        vm.prank(owner);
        vm.expectRevert();
        token.mint(bob, room + 1);
    }

    function test_mint_reverts_not_owner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.mint(bob, 1e18);
    }

    function test_burn() public {
        vm.prank(alice);
        token.burn(1e18);
        assertEq(token.balanceOf(alice), INITIAL - 1e18);
    }

    function test_transfer() public {
        vm.prank(alice);
        assertTrue(token.transfer(bob, 10e18));
        assertEq(token.balanceOf(bob), 10e18);
    }

    function test_constructor_reverts_zero_recipient() public {
        vm.expectRevert(ATOSToken.ATOSToken_ZeroAddress.selector);
        new ATOSToken(owner, address(0), CAP, 0);
    }

    function test_constructor_reverts_initial_exceeds_cap() public {
        vm.expectRevert(abi.encodeWithSelector(ATOSToken.ATOSToken_InitialSupplyExceedsCap.selector, CAP + 1, CAP));
        new ATOSToken(owner, alice, CAP, CAP + 1);
    }

    function test_ownership_two_step() public {
        assertEq(token.owner(), owner);
        vm.prank(owner);
        token.transferOwnership(bob);
        assertEq(token.pendingOwner(), bob);
        vm.prank(bob);
        token.acceptOwnership();
        assertEq(token.owner(), bob);
    }
}

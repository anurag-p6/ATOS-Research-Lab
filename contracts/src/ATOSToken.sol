// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title ATOS Token
/// @notice ERC-20 with fixed maximum supply (cap), owner-gated minting, burning, and EIP-2612 permits.
/// @dev Built for Autonomous Token Orchestration System (ATOS) research PoC. Audited OpenZeppelin components; not a substitute for a full security review.
contract ATOSToken is ERC20Capped, ERC20Burnable, ERC20Permit, Ownable2Step {
    /// @notice Thrown when an address parameter is zero but must be non-zero.
    error ATOSToken_ZeroAddress();

    /// @notice Thrown when `initialSupply` exceeds `cap_`.
    error ATOSToken_InitialSupplyExceedsCap(uint256 initialSupply, uint256 cap);

    /// @param initialOwner Admin (`onlyOwner`) for minting; subject to two-step ownership transfer.
    /// @param recipient Account receiving the initial mint (often same as `initialOwner`).
    /// @param cap_ Immutable maximum total supply across all mints (including initial).
    /// @param initialSupply Amount minted to `recipient` at deploy; must be `<= cap_`.
    constructor(address initialOwner, address recipient, uint256 cap_, uint256 initialSupply)
        ERC20("ATOS Token", "ATOS")
        ERC20Capped(cap_)
        ERC20Permit("ATOS Token")
        Ownable(initialOwner)
    {
        if (recipient == address(0)) revert ATOSToken_ZeroAddress();
        if (initialSupply > cap_) {
            revert ATOSToken_InitialSupplyExceedsCap(initialSupply, cap_);
        }
        if (initialSupply > 0) {
            _mint(recipient, initialSupply);
        }
    }

    /// @notice Mint new tokens to `to`, respecting the immutable cap. Callable only by the owner.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override(ERC20Capped, ERC20) {
        super._update(from, to, value);
    }
}

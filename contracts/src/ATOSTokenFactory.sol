// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ATOSToken} from "./ATOSToken.sol";

/// @title ATOSTokenFactory
/// @notice Deploy capped ERC-20 tokens by name/symbol — no Foundry/Hardhat required for end users.
/// @dev Each call to `createToken` deploys a new `ATOSToken` owned by `msg.sender`.
contract ATOSTokenFactory {
    /// @notice Emitted when a new token is deployed via the factory.
    event TokenCreated(
        address indexed token,
        address indexed owner,
        string name,
        string symbol,
        uint256 cap,
        uint256 initialSupply
    );

    error ATOSTokenFactory_EmptyName();
    error ATOSTokenFactory_EmptySymbol();
    error ATOSTokenFactory_NameTooLong();
    error ATOSTokenFactory_SymbolTooLong();
    error ATOSTokenFactory_ZeroCap();

    uint256 public constant MAX_NAME_BYTES = 64;
    uint256 public constant MAX_SYMBOL_BYTES = 16;

    /// @notice All tokens created through this factory (append-only).
    address[] public tokens;

    /// @notice Deploy a new token. Caller becomes owner and receives `initialSupply`.
    /// @param name ERC-20 name (e.g. "Acme Research Token").
    /// @param symbol ERC-20 symbol (e.g. "ACME").
    /// @param cap Maximum total supply (wei, 18 decimals).
    /// @param initialSupply Minted to `msg.sender` at deploy; must be `<= cap`.
    /// @return token Address of the newly deployed `ATOSToken`.
    function createToken(string calldata name, string calldata symbol, uint256 cap, uint256 initialSupply)
        external
        returns (address token)
    {
        if (bytes(name).length == 0) revert ATOSTokenFactory_EmptyName();
        if (bytes(symbol).length == 0) revert ATOSTokenFactory_EmptySymbol();
        if (bytes(name).length > MAX_NAME_BYTES) revert ATOSTokenFactory_NameTooLong();
        if (bytes(symbol).length > MAX_SYMBOL_BYTES) revert ATOSTokenFactory_SymbolTooLong();
        if (cap == 0) revert ATOSTokenFactory_ZeroCap();

        address owner = msg.sender;
        token = address(new ATOSToken(name, symbol, owner, owner, cap, initialSupply));
        tokens.push(token);

        emit TokenCreated(token, owner, name, symbol, cap, initialSupply);
    }

    /// @notice Number of tokens deployed through this factory.
    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    /// @notice Token address at index `i` (0-based).
    function tokenAt(uint256 index) external view returns (address) {
        return tokens[index];
    }
}

## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

- **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
- **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
- **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
- **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy (Sepolia)

The script does not read an RPC URL or private key. You choose the chain and signer on the CLI.

1. Optional: put `SEPOLIA_RPC_URL` in `.env` so `--rpc-url sepolia` works (see `foundry.toml` `[rpc_endpoints]`). Or pass a full URL: `--rpc-url https://...`.
2. Use a Cast keystore account (import the MetaMask key once with `cast wallet import <name> --interactive`, then unlock for the script), for example:

```shell
$ forge script script/DeployATOSToken.s.sol:DeployATOSToken \
    --rpc-url sepolia \
    --account <your_cast_wallet_label> \
    --broadcast
```

With a single imported account, Forge uses it as the broadcaster; the token owner / initial recipient is that same address.

### Deploy (Filecoin Calibration — FEVM testnet)

Filecoin does not run a network named “Sepolia.” The Ethereum-compatible Filecoin testnet is **Calibration** (chain id **314159**).

1. Set `FILECOIN_CALIBRATION_RPC_URL` in `.env` (see `.env.example`), or pass `--rpc-url https://...` directly.
2. Deploy (same script; fund the same address with **tFIL** on Calibration):

```shell
$ forge script script/DeployATOSToken.s.sol:DeployATOSToken \
    --rpc-url filecoin-calibration \
    --account <your_cast_wallet_label> \
    --broadcast
```

3. Verify on Blockscout (Etherscan-compatible API; use Blockscout as the verifier):

```shell
$ forge verify-contract <DEPLOYED_ADDRESS> \
    src/ATOSToken.sol:ATOSToken \
    --chain 314159 \
    --verifier blockscout \
    --verifier-url https://filecoin-testnet.blockscout.com/api \
    --constructor-args $(cast abi-encode "constructor(address,address,uint256,uint256)" <owner> <recipient> <cap> <initialSupply>)
```

If `forge script ... --verify` on Calibration does not pick up Blockscout automatically, use the explicit `forge verify-contract` command above. Set `FILECOIN_BLOCKSCOUT_API_KEY` in `.env` if your Blockscout instance requires it (often a placeholder like `verify` is enough).

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```

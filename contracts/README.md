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

The Ethereum-compatible Filecoin testnet is **Calibration** (chain id **314159**). Fund the deployer with **tFIL** (e.g. [ChainSafe Calibration faucet](https://faucet.calibnet.chainsafe-fil.io/funds.html)).

1. Set `FILECOIN_CALIBRATION_RPC_URL` in `.env` (see `.env.example`). The `filecoin-calibration` alias in `foundry.toml` resolves to that URL.
2. **Prefer `forge create` on FEVM** (matches the [official FEVM Foundry Kit](https://github.com/filecoin-project/fevm-foundry-kit)): it avoids `forge script` pre-broadcast simulation issues on Filecoin RPCs.

   Helper script (Calibration; filename is historical):

   ```shell
   $ ./script/deploy-butterfly.sh
   ```

   Or manually (adjust owner / cap / initial supply):

   ```shell
   $ forge create src/ATOSToken.sol:ATOSToken \
       --rpc-url filecoin-calibration \
       --account <your_cast_wallet_label> \
       --broadcast \
       --retries 20 \
       --timeout 300 \
       --constructor-args <owner> <recipient> <cap_wei> <initial_supply_wei>
   ```

   Sepolia-style `forge script` for Calibration is documented below only for parity; on FEVM it has been unreliable in practice.

3. **Find the contract address:** check the `forge create` output (`Deployed to:`), or open your deployer on [Filfox Calibration](https://calibration.filfox.info/) / [Blockscout testnet](https://filecoin-testnet.blockscout.com/) and look for the latest **Contract Creation** transaction.

4. Verify on Blockscout:

```shell
$ forge verify-contract <DEPLOYED_ADDRESS> \
    src/ATOSToken.sol:ATOSToken \
    --chain 314159 \
    --verifier blockscout \
    --verifier-url https://filecoin-testnet.blockscout.com/api \
    --constructor-args $(cast abi-encode "constructor(address,address,uint256,uint256)" <owner> <recipient> <cap> <initialSupply>)
```

Set `FILECOIN_BLOCKSCOUT_API_KEY` in `.env` if required (often `verify` is enough).

For a standalone write-up of problems encountered on Calibration and how they were fixed (mentor / onboarding notes), see **[FILECOIN_CALIBRATION_DEPLOY_CHALLENGES.md](./FILECOIN_CALIBRATION_DEPLOY_CHALLENGES.md)**.

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

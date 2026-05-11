# Uniswap V3 — ATOS / WETH pool on Sepolia

Scripts in this folder create and seed a **Uniswap V3** liquidity pool for **ATOS / WETH** on **Ethereum Sepolia** (chain id `11155111`).

> "Listed on Uniswap" on a testnet means: **a V3 pool exists for the pair and has liquidity**. The Uniswap UI then discovers the pool automatically.

## Files

| File | Purpose |
| --- | --- |
| `SeedUniswapV3PoolSepolia.s.sol` | Foundry script. Wraps ETH → WETH (if needed), approves the position manager, `createAndInitializePoolIfNecessary`, then `mint`s a full-range LP position. |
| `seed-pool-sepolia.sh` | Thin bash wrapper: chain-id sanity check + `forge script ... --broadcast`. |
| `README.md` | This file. |

## Sepolia Uniswap V3 addresses

Hard-coded in `SeedUniswapV3PoolSepolia.s.sol`. Source: [Uniswap `v3-periphery` deploys](https://github.com/Uniswap/v3-periphery/blob/main/deploys.md).

| Contract | Address |
| --- | --- |
| `UniswapV3Factory` | `0x0227628f3F023bb0B980b67D528571c95c6DaC1c` |
| `NonfungiblePositionManager` (NPM) | `0x1238536071E1c677A632429e3655c799b22cDA52` |
| `WETH9` | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` |

## Prerequisites

1. **ATOS deployed on Sepolia.** Use `forge script script/DeployATOSToken.s.sol:DeployATOSToken --rpc-url sepolia --account metamask --broadcast`.
2. **Record the deployed address** in `contracts/.env`:

   ```env
   ATOS_SEPOLIA=0xYourDeployedATOSAddress
   ```

3. **Sepolia ETH** in the deployer for: gas + wrapping `UNI_WETH_AMOUNT` (default `0.005 ETH`) + the LP `mint`.
4. **Cast keystore account** `metamask` (created earlier with `cast wallet import metamask --interactive`). To use a different label, edit `seed-pool-sepolia.sh` (`--account <label>`).

## Run

```bash
cd contracts
./script/uniswap/seed-pool-sepolia.sh
```

Successful output prints (excerpt):

```
ATOS:               0x...
Pool:               0x...
Position tokenId:   <int>
Liquidity:          <int>
Used token0 (wei):  <int>
Used token1 (wei):  <int>
```

Save the `Pool:` address — that's what the Uniswap UI and Etherscan need.

## Tune amounts / fee tier

```bash
# Larger seed: 5,000 ATOS and 0.01 WETH at the 1% fee tier
UNI_ATOS_AMOUNT=5000000000000000000000 \
UNI_WETH_AMOUNT=10000000000000000 \
UNI_FEE=10000 \
./script/uniswap/seed-pool-sepolia.sh
```

`UNI_FEE` valid values:

| Fee | Tier | Tick spacing |
| --- | --- | --- |
| `500` | 0.05% | 10 |
| `3000` | 0.30% (default) | 60 |
| `10000` | 1.00% | 200 |

> Full-range ticks in the script (`±887220`) are chosen for tick spacing **60**. If you switch to `500` or `10000` and want full-range, also adjust `TICK_LOWER` / `TICK_UPPER` to a multiple of the new spacing (`±887270` for 10, `±887200` for 200).

## After it runs

Browse the pool:

- **Uniswap UI:** `https://app.uniswap.org/explore/pools/ethereum_sepolia/<POOL_ADDRESS>`
- **Etherscan:** `https://sepolia.etherscan.io/address/<POOL_ADDRESS>`

Spot-check on-chain state:

```bash
POOL=0x...               # printed by the script
ATOS=$ATOS_SEPOLIA

# Pool's current sqrtPriceX96 / tick / unlocked
cast call "$POOL" "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)" \
  --rpc-url sepolia

# Pool's reserves
cast call "$POOL" "liquidity()(uint128)" --rpc-url sepolia
```

## Re-running

`createAndInitializePoolIfNecessary` is **idempotent** — re-running the script will find the existing pool and just add another LP position. The position manager always mints a fresh `tokenId`; previous positions stay where they were.

## Why a Foundry script (not a bash chain of `cast send`s)

The V3 `mint` call takes an 11-field struct. `cast send` with tuples is fragile across versions, and a partial bash run can leave you with approvals + a pool but no liquidity. The Foundry script batches everything under one `vm.broadcast`, so either every step is broadcast in order or none is.

## Caveats

- **Tick range** is hard-coded for fee 3000. Change both `UNI_FEE` and the `TICK_LOWER` / `TICK_UPPER` constants together when switching tiers.
- **Starting price** is 1:1 (`SQRT_PRICE_1_1`). Meaningless on testnet; first swaps will rebalance towards real demand. On mainnet you'd want a researched starting price.
- **No slippage protection** (`amount{0,1}Min = 0`). Fine on a freshly-created pool with no other traders. Add real minimums for mainnet.
- **Uniswap V3 is not deployed on Filecoin FEVM.** Do not aim this script at `filecoin-calibration` — it would revert. A Filecoin DEX integration belongs in its own folder when we add one.

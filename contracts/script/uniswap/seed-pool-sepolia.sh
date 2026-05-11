#!/usr/bin/env bash
# Create + seed the Uniswap V3 ATOS/WETH pool on Sepolia (chain id 11155111).
# Wraps a tiny amount of ETH to WETH, approves the NonfungiblePositionManager,
# creates the pool if missing, and mints a full-range LP position to the signer.
#
# Required:
#   ATOS_SEPOLIA      deployed ATOSToken address on Sepolia (set in contracts/.env)
#   SEPOLIA_RPC_URL   RPC URL (resolved by the `sepolia` alias in foundry.toml)
#
# Optional (override defaults; values in wei / 18 decimals):
#   UNI_ATOS_AMOUNT   default 1_000 * 1e18  (1,000 ATOS)
#   UNI_WETH_AMOUNT   default 0.005 * 1e18  (0.005 WETH)
#   UNI_FEE           default 3000          (0.30% tier; tick spacing 60)
#
# Funding: deployer needs a small amount of Sepolia ETH for gas + the WETH wrap.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

CHAIN_HEX="$(cast chain-id --rpc-url sepolia)"
CHAIN_DEC="$(cast to-dec "$CHAIN_HEX")"
if [[ "$CHAIN_DEC" != "11155111" ]]; then
  echo "RPC sepolia returned chain id $CHAIN_DEC (expected 11155111)." >&2
  echo "Check SEPOLIA_RPC_URL in contracts/.env." >&2
  exit 1
fi

if [[ -z "${ATOS_SEPOLIA:-}" ]]; then
  echo "Set ATOS_SEPOLIA=<deployed ATOSToken address> in contracts/.env" >&2
  exit 1
fi

exec forge script script/uniswap/SeedUniswapV3PoolSepolia.s.sol:SeedUniswapV3PoolSepolia \
  --rpc-url sepolia \
  --account metamask \
  --broadcast \
  -vvv

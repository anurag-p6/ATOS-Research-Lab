#!/usr/bin/env bash
# Create and seed a Uniswap V3 ATOS/WETH pool on Ethereum Sepolia.
#
# What this script does:
#   1. Loads contracts/.env
#   2. Confirms the RPC is Sepolia (chain 11155111)
#   3. Resolves your wallet address from the Foundry keystore
#   4. Prints your ETH, WETH, and ATOS balances BEFORE doing anything
#   5. Validates you have enough ATOS and ETH
#   6. Runs the Foundry script (wraps ETH->WETH, approves, creates pool, mints LP)
#   7. Prints the pool address and next steps
#
# Required env (contracts/.env):
#   ATOS_SEPOLIA       address of your deployed ATOSToken on Sepolia
#   SEPOLIA_RPC_URL    Sepolia RPC (resolved via the 'sepolia' alias in foundry.toml)
#
# Optional env (all in wei, 18 decimals):
#   ATOS_ACCOUNT       Foundry keystore account name   (default: metamask)
#   UNI_ATOS_AMOUNT    ATOS to seed into pool          (default: 1000000000000000000000  = 1,000 ATOS)
#   UNI_WETH_AMOUNT    WETH to seed into pool          (default: 5000000000000000        = 0.005 WETH)
#   UNI_FEE            fee tier: 500 | 3000 | 10000   (default: 3000 = 0.30%)
#   UNI_SQRT_PRICE_X96 initial pool price in Q64.96    (default: 79228162514264337593543950336 = 1:1)
#
# Override example — 5,000 ATOS + 0.01 WETH at 1% fee tier:
#   UNI_ATOS_AMOUNT=5000000000000000000000 \
#   UNI_WETH_AMOUNT=10000000000000000 \
#   UNI_FEE=10000 \
#   ./script/uniswap/seed-pool-sepolia.sh
set -euo pipefail

# ── Resolve directories ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT"

# ── Load environment ──────────────────────────────────────────────────────────
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# ── Config with defaults ──────────────────────────────────────────────────────
ACCOUNT="${ATOS_ACCOUNT:-metamask}"
UNI_ATOS_AMOUNT="${UNI_ATOS_AMOUNT:-1000000000000000000000}"     # 1,000 ATOS
UNI_WETH_AMOUNT="${UNI_WETH_AMOUNT:-5000000000000000}"           # 0.005 WETH
UNI_FEE="${UNI_FEE:-3000}"

WETH_SEPOLIA="0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"

# ── Validation ────────────────────────────────────────────────────────────────
if [[ -z "${ATOS_SEPOLIA:-}" ]]; then
  echo ""
  echo "ERROR: ATOS_SEPOLIA is not set." >&2
  echo "  Deploy an ATOSToken (or use the factory), then add to contracts/.env:" >&2
  echo "    ATOS_SEPOLIA=0xYourTokenAddress" >&2
  echo ""
  exit 1
fi

# ── Chain check ───────────────────────────────────────────────────────────────
echo ""
echo "Checking RPC chain id…"
CHAIN_HEX="$(cast chain-id --rpc-url sepolia)"
CHAIN_DEC="$(cast to-dec "$CHAIN_HEX")"
if [[ "$CHAIN_DEC" != "11155111" ]]; then
  echo "ERROR: RPC 'sepolia' returned chain $CHAIN_DEC (expected 11155111)." >&2
  echo "Check SEPOLIA_RPC_URL in contracts/.env." >&2
  exit 1
fi
echo "Chain: $CHAIN_DEC ✓"

# ── Get wallet address from keystore ─────────────────────────────────────────
echo ""
echo "Resolving wallet address for account '$ACCOUNT'…"
WALLET="$(cast wallet address --account "$ACCOUNT")"
echo "Wallet: $WALLET"

# ── Pre-flight balance check ──────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────────────"
echo " Pre-flight balance check"
echo "──────────────────────────────────────────────"

ETH_BAL_WEI="$(cast balance "$WALLET" --rpc-url sepolia)"
ETH_BAL_ETH="$(cast from-wei "$ETH_BAL_WEI")"
echo "ETH  balance : $ETH_BAL_ETH ETH  ($ETH_BAL_WEI wei)"

WETH_BAL_WEI="$(cast call "$WETH_SEPOLIA" "balanceOf(address)(uint256)" "$WALLET" --rpc-url sepolia)"
WETH_BAL_ETH="$(cast from-wei "$WETH_BAL_WEI")"
echo "WETH balance : $WETH_BAL_ETH WETH ($WETH_BAL_WEI wei)"

ATOS_BAL_WEI="$(cast call "$ATOS_SEPOLIA" "balanceOf(address)(uint256)" "$WALLET" --rpc-url sepolia)"
ATOS_BAL_ETH="$(cast from-wei "$ATOS_BAL_WEI")"
echo "ATOS balance : $ATOS_BAL_ETH ATOS ($ATOS_BAL_WEI wei)"

echo ""
echo "──────────────────────────────────────────────"
echo " Liquidity to seed"
echo "──────────────────────────────────────────────"

UNI_ATOS_ETH="$(cast from-wei "$UNI_ATOS_AMOUNT")"
UNI_WETH_ETH="$(cast from-wei "$UNI_WETH_AMOUNT")"
echo "ATOS : $UNI_ATOS_ETH  ($UNI_ATOS_AMOUNT wei)"
echo "WETH : $UNI_WETH_ETH  ($UNI_WETH_AMOUNT wei)"
echo "Fee  : $UNI_FEE  (500=0.05%  3000=0.30%  10000=1.00%)"

# ── Check ATOS balance ────────────────────────────────────────────────────────
# bash integer comparison (safe because cast returns decimal wei values)
if (( ATOS_BAL_WEI < UNI_ATOS_AMOUNT )); then
  echo ""
  echo "ERROR: Insufficient ATOS balance." >&2
  echo "  Have : $ATOS_BAL_ETH ATOS" >&2
  echo "  Need : $UNI_ATOS_ETH ATOS" >&2
  echo ""
  echo "Mint or transfer more ATOS to $WALLET first." >&2
  echo "If you used the factory, the initial supply was sent to your wallet." >&2
  exit 1
fi

# ── Check ETH balance (need wrap amount + 0.01 ETH gas buffer) ───────────────
# How much ETH needs wrapping (only the shortfall beyond existing WETH)
if (( WETH_BAL_WEI >= UNI_WETH_AMOUNT )); then
  TO_WRAP=0
else
  TO_WRAP=$(( UNI_WETH_AMOUNT - WETH_BAL_WEI ))
fi

GAS_BUFFER=10000000000000000   # 0.01 ETH
REQUIRED_ETH=$(( TO_WRAP + GAS_BUFFER ))

if (( ETH_BAL_WEI < REQUIRED_ETH )); then
  TO_WRAP_ETH="$(cast from-wei "$TO_WRAP")"
  REQ_ETH="$(cast from-wei "$REQUIRED_ETH")"
  echo ""
  echo "ERROR: Insufficient ETH." >&2
  echo "  Have    : $ETH_BAL_ETH ETH" >&2
  echo "  To wrap : $TO_WRAP_ETH ETH  (shortfall vs. required WETH)" >&2
  echo "  Gas buf : 0.01 ETH" >&2
  echo "  Need    : $REQ_ETH ETH total" >&2
  echo ""
  echo "Top up with Sepolia ETH: https://sepoliafaucet.com" >&2
  exit 1
fi

echo ""
echo "Pre-flight checks passed ✓"
if (( TO_WRAP > 0 )); then
  TO_WRAP_ETH="$(cast from-wei "$TO_WRAP")"
  echo "Will wrap $TO_WRAP_ETH ETH → WETH during execution."
else
  echo "WETH balance is sufficient — no wrap needed."
fi

# ── Confirmation prompt ───────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────────────"
echo " About to broadcast to Sepolia"
echo "──────────────────────────────────────────────"
echo "  ATOS token : $ATOS_SEPOLIA"
echo "  Pool pair  : ATOS / WETH"
echo "  Fee tier   : $UNI_FEE"
echo "  LP amounts : $UNI_ATOS_ETH ATOS  +  $UNI_WETH_ETH WETH"
echo "  Account    : $ACCOUNT  ($WALLET)"
echo ""
read -rp "Press ENTER to continue or Ctrl+C to abort…"
echo ""

# ── Run Foundry script ────────────────────────────────────────────────────────
echo "Broadcasting…"
echo ""

export UNI_ATOS_AMOUNT UNI_WETH_AMOUNT UNI_FEE ATOS_SEPOLIA

forge script script/uniswap/SeedUniswapV3PoolSepolia.s.sol:SeedUniswapV3PoolSepolia --rpc-url sepolia --account "$ACCOUNT" --broadcast -vvv

echo ""
echo "========================================================"
echo " Done! Copy the Pool address from the output above."
echo "========================================================"
echo ""
echo "Next steps:"
echo "  1. Set NEXT_PUBLIC_DEX_POOL_ADDRESS=<pool>  in apps/web/.env"
echo "  2. Set ATOS_POOL_SEPOLIA=<pool>             in contracts/.env"
echo "  3. Restart Next.js dev server (pnpm dev) to pick up the pool address."
echo ""
echo "Useful links:"
echo "  Uniswap UI : https://app.uniswap.org/explore/pools/ethereum_sepolia/<pool>"
echo "  Etherscan  : https://sepolia.etherscan.io/address/<pool>"
echo ""

#!/usr/bin/env bash
# Deploy ATOSTokenFactory on Filecoin Calibration (chain id 314159) and verify on Blockscout.
#
# Uses `forge create` directly — the FEVM block-estimator simulator is incompatible
# with `forge script`, which can ghost mid-broadcast on Calibration.
# Ref: https://github.com/filecoin-project/fevm-foundry-kit
#
# Prerequisites:
#   1. tFIL in the deployer wallet.
#      Faucet: https://faucet.calibnet.chainsafe-fil.io/funds.html
#   2. FILECOIN_CALIBRATION_RPC_URL set in contracts/.env
#   3. FILECOIN_BLOCKSCOUT_API_KEY set in contracts/.env (any non-empty string works, e.g. "verify")
#   4. A Foundry keystore account (default: "metamask"):
#      cast wallet import metamask --interactive
#      Override with ATOS_ACCOUNT=yourname ./deploy-factory-calibration.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load .env so FILECOIN_CALIBRATION_RPC_URL / FILECOIN_BLOCKSCOUT_API_KEY are available.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

ACCOUNT="${ATOS_ACCOUNT:-metamask}"

echo "Verifying RPC is Filecoin Calibration (chain 314159)…"
CHAIN_HEX="$(cast chain-id --rpc-url filecoin-calibration)"
CHAIN_DEC="$(cast to-dec "$CHAIN_HEX")"
if [[ "$CHAIN_DEC" != "314159" ]]; then
  echo "ERROR: RPC 'filecoin-calibration' returned chain id $CHAIN_DEC (expected 314159)." >&2
  echo "Check FILECOIN_CALIBRATION_RPC_URL in contracts/.env." >&2
  exit 1
fi

echo ""
echo "Deploying ATOSTokenFactory on Filecoin Calibration (chain $CHAIN_DEC)…"
echo "Account : $ACCOUNT"
echo ""

# ATOSTokenFactory has no constructor args.
# --retries / --timeout absorb Calibration's frequent null rounds (empty epochs).
# --verify posts source to Blockscout using the Etherscan-compatible API.
forge create src/ATOSTokenFactory.sol:ATOSTokenFactory \
--rpc-url filecoin-calibration \
--account "$ACCOUNT" \
--broadcast \
--retries 20 \
--timeout 300 \
--verify \
--verifier blockscout \
--verifier-url https://filecoin-testnet.blockscout.com/api -vv

echo ""
echo "========================================================"
echo " Deployment + verification complete!"
echo "========================================================"
echo ""
echo "Copy the 'Deployed to' address from the output above, then:"
echo "  Set in apps/web/.env:"
echo "    NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_CALIBRATION=0x<address>"
echo "  Set in contracts/.env:"
echo "    ATOS_FACTORY_CALIBRATION=0x<address>"
echo ""
echo "View on Blockscout:"
echo "  https://filecoin-testnet.blockscout.com/address/0x<address>"

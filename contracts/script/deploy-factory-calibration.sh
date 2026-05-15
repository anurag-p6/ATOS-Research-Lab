#!/usr/bin/env bash
# Deploy ATOSTokenFactory on Filecoin Calibration (chain id 314159).
#
# Uses `forge create` directly — the FEVM block-estimator simulator is
# incompatible with `forge script`, which can ghost mid-broadcast.
# Ref: https://github.com/filecoin-project/fevm-foundry-kit
#
# Prerequisites:
#   1. tFIL balance on the deployer wallet.
#      Faucet: https://faucet.calibnet.chainsafe-fil.io/funds.html
#   2. FILECOIN_CALIBRATION_RPC_URL set in contracts/.env
#   3. A funded Foundry keystore account named `metamask`
#      (or override ATOS_ACCOUNT below).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ACCOUNT="${ATOS_ACCOUNT:-metamask}"

# Sanity-check: confirm the RPC alias resolves to Calibration.
CHAIN_HEX="$(cast chain-id --rpc-url filecoin-calibration)"
CHAIN_DEC="$(cast to-dec "$CHAIN_HEX")"
if [[ "$CHAIN_DEC" != "314159" ]]; then
  echo "ERROR: RPC filecoin-calibration returned chain id $CHAIN_DEC (expected 314159)." >&2
  echo "Check FILECOIN_CALIBRATION_RPC_URL in contracts/.env." >&2
  exit 1
fi

echo "Deploying ATOSTokenFactory on Filecoin Calibration (chain $CHAIN_DEC)..."
echo "Account: $ACCOUNT"
echo ""

# ATOSTokenFactory has no constructor args.
# --retries / --timeout absorb Calibration's frequent null rounds.
# Change "metamask" to whichever account name you used when importing into the Foundry keystore I've imported my metamask wallet's private key.
forge create src/ATOSTokenFactory.sol:ATOSTokenFactory --rpc-url filecoin-calibration --account "$ACCOUNT" --broadcast --retries 20 --timeout 300 -vv

echo ""
echo "========================================================"
echo " Deployment complete!"
echo "========================================================"
echo ""
echo "Copy the 'Deployed to' address above and set it in apps/web/.env:"
echo "  NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_CALIBRATION=0x..."
echo ""
echo "To verify on Blockscout, run:"
echo "  ./script/verify-factory-calibration.sh <deployed-address>"

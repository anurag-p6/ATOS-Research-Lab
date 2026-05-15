#!/usr/bin/env bash
# Verify ATOSTokenFactory source on Filecoin Calibration via Blockscout.
#
# Usage:
#   ./script/verify-factory-calibration.sh <factory-contract-address>
#
# Blockscout Calibration explorer:
#   https://filecoin-testnet.blockscout.com
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FACTORY_ADDRESS="${1:-${ATOS_FACTORY_ADDRESS:-}}"
if [[ -z "$FACTORY_ADDRESS" ]]; then
  echo "Usage: $0 <factory-contract-address>" >&2
  exit 1
fi

# ATOSTokenFactory has no constructor args — no --constructor-args flag needed.
forge verify-contract "$FACTORY_ADDRESS" src/ATOSTokenFactory.sol:ATOSTokenFactory \
  --chain 314159 \
  --verifier blockscout \
  --verifier-url https://filecoin-testnet.blockscout.com/api

echo ""
echo "View on Blockscout:"
echo "  https://filecoin-testnet.blockscout.com/address/$FACTORY_ADDRESS"

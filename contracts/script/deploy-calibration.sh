#!/usr/bin/env bash
# Deploy ATOSToken on Filecoin Calibration (chain id 314159) following the
# official FEVM Foundry Kit pattern: `forge create` directly (no `forge script`,
# which has been unreliable on FEVM due to simulator/estimator issues).
# Ref: https://github.com/filecoin-project/fevm-foundry-kit
#
# Funding: https://faucet.calibnet.chainsafe-fil.io/funds.html
# RPC alias `filecoin-calibration` resolves via contracts/foundry.toml +
# FILECOIN_CALIBRATION_RPC_URL in contracts/.env.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CHAIN_HEX="$(cast chain-id --rpc-url filecoin-calibration)"
CHAIN_DEC="$(cast to-dec "$CHAIN_HEX")"
if [[ "$CHAIN_DEC" != "314159" ]]; then
  echo "RPC filecoin-calibration returned chain id $CHAIN_DEC (expected 314159)." >&2
  echo "Check FILECOIN_CALIBRATION_RPC_URL in contracts/.env." >&2
  exit 1
fi

# Constructor args. Override via env if you need different values.
OWNER="${ATOS_OWNER:-0x225Fd0b9D011C8BBffd0f0c6f854Cd23b99B6aF7}"
CAP="${ATOS_CAP:-1000000000000000000000000000}"           # 1B * 1e18
INIT="${ATOS_INITIAL_SUPPLY:-100000000000000000000000000}" # 100M * 1e18

# Calibration produces frequent "null rounds" (empty epochs). The default
# alloy block-watcher aborts on them; --retries / --timeout make Foundry
# keep polling until the receipt is available.
exec forge create src/ATOSToken.sol:ATOSToken \
  --rpc-url filecoin-calibration \
  --account metamask \
  --broadcast \
  --retries 20 \
  --timeout 300 \
  --constructor-args "$OWNER" "$OWNER" "$CAP" "$INIT"

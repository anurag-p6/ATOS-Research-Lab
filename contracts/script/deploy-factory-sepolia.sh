#!/usr/bin/env bash
# Deploy ATOSTokenFactory on Sepolia (chain id 11155111).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

CHAIN_ID=$(cast chain-id --rpc-url sepolia 2>/dev/null || echo "")
if [[ -n "$CHAIN_ID" && "$CHAIN_ID" != "11155111" ]]; then
  echo "error: sepolia RPC resolved to chain $CHAIN_ID, expected 11155111" >&2
  exit 1
fi

ACCOUNT="${ATOS_DEPLOY_ACCOUNT:-metamask}"

forge script script/DeployATOSTokenFactory.s.sol:DeployATOSTokenFactory \
  --rpc-url sepolia \
  --account metamask \  #change with your account in the foundry keystore I've imported my metamask wallet's private key
  --broadcast \
  --verify \
  -vv

echo ""
echo "Set in apps/web/.env:"
echo "  NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS=<ATOSTokenFactory address from log>"

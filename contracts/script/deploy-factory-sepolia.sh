#!/usr/bin/env bash
# Deploy ATOSTokenFactory on Ethereum Sepolia (chain id 11155111) and verify on Etherscan.
#
# Prerequisites:
#   1. Sepolia ETH in the deployer wallet for gas.
#      Faucet: https://sepoliafaucet.com / https://www.alchemy.com/faucets/ethereum-sepolia
#   2. SEPOLIA_RPC_URL and ETHERSCAN_API_KEY set in contracts/.env
#   3. A Foundry keystore account (default: "metamask"):
#      cast wallet import metamask --interactive
#      Override the account name with ATOS_ACCOUNT=yourname ./deploy-factory-sepolia.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load .env so SEPOLIA_RPC_URL / ETHERSCAN_API_KEY are available.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

ACCOUNT="${ATOS_ACCOUNT:-metamask}"

echo "Verifying RPC is Sepolia (chain 11155111)…"
CHAIN_HEX="$(cast chain-id --rpc-url sepolia)"
CHAIN_DEC="$(cast to-dec "$CHAIN_HEX")"
if [[ "$CHAIN_DEC" != "11155111" ]]; then
  echo "ERROR: RPC 'sepolia' returned chain id $CHAIN_DEC (expected 11155111)." >&2
  echo "Check SEPOLIA_RPC_URL in contracts/.env." >&2
  exit 1
fi

echo ""
echo "Deploying ATOSTokenFactory on Sepolia…"
echo "Account : $ACCOUNT"
echo ""

# forge script handles compilation, broadcast, and Etherscan verification in one shot.
# --verify requires ETHERSCAN_API_KEY in the environment (or foundry.toml [etherscan] section).
forge script script/DeployATOSTokenFactory.s.sol:DeployATOSTokenFactory \
--rpc-url sepolia \
--account "$ACCOUNT" \
--broadcast \
--verify \
-vv

echo ""
echo "========================================================"
echo " Deployment + verification complete!"
echo "========================================================"
echo ""
echo "Copy the deployed factory address from the output above, then:"
echo "  Set in apps/web/.env:"
echo "    NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_SEPOLIA=0x<address>"
echo "  Set in contracts/.env:"
echo "    ATOS_FACTORY_SEPOLIA=0x<address>"
echo ""
echo "View on Etherscan:"
echo "  https://sepolia.etherscan.io/address/0x<address>#code"

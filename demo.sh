#!/usr/bin/env bash
# ATOS demo script — starts the full stack and opens the browser.
# Usage: ./demo.sh [--local | --docker]
#   --local   (default) runs agents with cargo + Next.js with pnpm (fastest for dev)
#   --docker  builds and runs everything in Docker containers

set -euo pipefail

MODE="${1:---local}"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── helpers ──────────────────────────────────────────────────────────────────
log() { echo -e "\033[1;36m[atos]\033[0m $*"; }
err() { echo -e "\033[1;31m[atos]\033[0m $*" >&2; }

wait_port() {
  local port=$1 name=$2 retries=30
  log "Waiting for $name on :$port…"
  until curl -sf "http://localhost:$port/status" >/dev/null 2>&1; do
    retries=$((retries - 1))
    if [ $retries -le 0 ]; then
      err "$name on :$port did not become ready in time"
      exit 1
    fi
    sleep 2
  done
  log "$name ready on :$port"
}

# ── docker mode ───────────────────────────────────────────────────────────────
if [ "$MODE" = "--docker" ]; then
  log "Building and starting full stack with Docker Compose…"
  cd "$REPO_ROOT"
  docker compose up --build -d
  log "Tailing logs (Ctrl-C to detach, containers keep running)…"
  docker compose logs -f &
  sleep 5
  wait_port 3001 "deployer"
  wait_port 3002 "monitor"
  wait_port 3003 "governance"
  log "All agents online."
  log "Opening http://localhost:3000 …"
  xdg-open http://localhost:3000 2>/dev/null || open http://localhost:3000 2>/dev/null || true
  echo ""
  log "Stack running. Stop with: docker compose down"
  exit 0
fi

# ── local mode (default) ──────────────────────────────────────────────────────
log "Starting ATOS in LOCAL mode (agents via cargo, frontend via pnpm)…"
log "Press Ctrl-C to stop all processes."

AGENTS_DIR="$REPO_ROOT/agents-rust"
WEB_DIR="$REPO_ROOT/apps/web"

# Check tools
command -v cargo >/dev/null 2>&1 || { err "cargo not found. Install Rust: https://rustup.rs"; exit 1; }
command -v pnpm  >/dev/null 2>&1 || { err "pnpm not found. Install: npm i -g pnpm"; exit 1; }

# Build agents once
log "Building Rust agents (release)…"
cd "$AGENTS_DIR"
cargo build --release -p atos-agent 2>&1

BINARY="$AGENTS_DIR/target/release/atos-agent"

# Start deployer first (no bootstrap needed — mDNS discovers the others on LAN)
log "Starting deployer agent on :3001 (libp2p TCP :4001)…"
RUST_LOG=info "$BINARY" --role deployer --port 4001 --api-port 3001 &
PID_DEPLOYER=$!

sleep 3

# Start monitor + governance — they will discover deployer via mDNS on the same host
log "Starting monitor agent on :3002 (libp2p TCP :4002)…"
RUST_LOG=info "$BINARY" --role monitor --port 4002 --api-port 3002 \
  --bootstrap "/ip4/127.0.0.1/tcp/4001" &
PID_MONITOR=$!

log "Starting governance agent on :3003 (libp2p TCP :4003)…"
RUST_LOG=info "$BINARY" --role governance --port 4003 --api-port 3003 \
  --bootstrap "/ip4/127.0.0.1/tcp/4001" &
PID_GOVERNANCE=$!

# Wait for agents
wait_port 3001 "deployer"
wait_port 3002 "monitor"
wait_port 3003 "governance"

log "All 3 agents online and forming gossipsub mesh."

# Start frontend
cd "$WEB_DIR"

if [ ! -f ".next/BUILD_ID" ]; then
  log "No production build found — installing deps and building…"
  pnpm install --frozen-lockfile 2>&1 | tail -3
  pnpm build 2>&1 | tail -5
else
  log "Production build found (.next/BUILD_ID) — skipping build."
fi

log "Starting Next.js frontend (production) on :3000…"
pnpm start &
PID_WEB=$!

sleep 4
log "Opening http://localhost:3000 …"
xdg-open http://localhost:3000 2>/dev/null || open http://localhost:3000 2>/dev/null || true

echo ""
log "═══════════════════════════════════════════════════════════════"
log " ATOS demo running. Login with Privy, paste contract address, "
log " select agent + action, click Submit Task."
log ""
log " Deployer  → http://localhost:3001/status"
log " Monitor   → http://localhost:3002/status"
log " Governance→ http://localhost:3003/status"
log " Frontend  → http://localhost:3000"
log "═══════════════════════════════════════════════════════════════"
log ""
log " Fault tolerance demo:"
log "   kill $PID_MONITOR      # monitor goes offline (red badge)"
log "   $BINARY --role monitor --port 4002 --api-port 3002 --bootstrap /ip4/127.0.0.1/tcp/4001 &"
log "                          # rejoin — green badge returns"
log "═══════════════════════════════════════════════════════════════"

# Trap cleanup
cleanup() {
  log "Shutting down…"
  kill "$PID_DEPLOYER" "$PID_MONITOR" "$PID_GOVERNANCE" "$PID_WEB" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait "$PID_WEB"

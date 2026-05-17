# ATOS — How to build from here

This repo matches the proposal stack: **Foundry contracts**, **TypeScript + libp2p agents** (not Rust yet), and **no `apps/web` scaffold** until you add it.

## What already works

| Area | Location | Status |
|------|----------|--------|
| ERC-20 + tests | `contracts/` | Foundry, OpenZeppelin, deploy script |
| Agents + HTTP API | `agents/` | Three roles, gossipsub, mDNS, `/status`, `/task`, `/tasks`, `/events` |

## Prerequisites

- Node 22+ (or 20 LTS)
- `pnpm` (recommended) or `npm`
- Foundry (`forge`, `cast`)

## 1) Contracts

```bash
cd contracts
forge build
forge test
```

Deploy (example Sepolia; set env in `contracts/.env` or shell):

```bash
forge script script/DeployATOSToken.s.sol:DeployATOSToken --rpc-url sepolia --broadcast
```

## 2) Agents (local)

Three terminals:

```bash
cd agents && pnpm install
pnpm run start:deployer
```

```bash
cd agents && pnpm run start:monitor
```

```bash
cd agents && pnpm run start:governance
```

Optional: `BOOTSTRAP_PEERS=/ip4/127.0.0.1/tcp/4001` on monitor/governance if mDNS is flaky.

Submit a task (deployer example):

```bash
curl -s -X POST http://127.0.0.1:3001/task \
  -H 'Content-Type: application/json' \
  -d '{"action":"deploy_token","chain":"sepolia"}' | jq .
```

Health:

```bash
curl -s http://127.0.0.1:3001/status | jq .
```

## 3) Next build priorities (in order)

1. **`apps/web`** — Next.js 14 + Privy + Wagmi; dashboard calling agent URLs via env `DEPLOYER_AGENT_URL`, etc.
2. **Deployer → Foundry** — On `deploy_token`, spawn `forge script` (or `forge create`) with env RPC + signer; parse stdout for address; update task status + CID stub.
3. **Monitor** — Poll `eth_getLogs` or viem for `Transfer` on `CONTRACT_ADDRESS`; publish counts on `atos/status`.
4. **Governance** — `generate_cex_metadata` JSON + hash/CID placeholder.
5. **Docker** — `docker-compose` for three agents + optional web.
6. **OpenClaw + VPS** — HTTP client to inference; routing + fallback per `CLAUDE.md`.

## Repo vs CLAUDE.md

`CLAUDE.md` still describes a **Rust** workspace for agents; the implemented path is **TypeScript**. Either migrate agents to Rust later or update `CLAUDE.md` to match—pick one source of truth before external contributors join.

# ATOS — Autonomous Token Orchestration System

Research PoC: orchestrate an ERC-20 token lifecycle (deploy → monitor → DEX/CEX prep) with **Rust libp2p agents**, a **Next.js operator dashboard** (Privy), and **Foundry** contracts on **Sepolia** and **Filecoin Calibration**.

| Layer | Path | Stack |
| --- | --- | --- |
| Contracts | `contracts/` | Solidity, Foundry, OpenZeppelin |
| Agents | `agents-rust/` | Rust, libp2p (gossipsub, mDNS), Axum HTTP API |
| Dashboard | `apps/web/` | Next.js 14, Privy, Wagmi, viem |

---

## Prerequisites

- **Rust** 1.75+ (`rustup`) — agents
- **Node** 20+ and **pnpm** 8+ — dashboard
- **Foundry** (`forge`, `cast`) — contracts
- **Docker** (optional) — full stack via `docker-compose.yml`

Copy env templates before running:

- `apps/web/.env.example` → `apps/web/.env.local`
- `contracts/.env.example` → `contracts/.env` (for deploy scripts)

---

## Quick start (Docker)

Runs all three agents + the web UI. Set `NEXT_PUBLIC_PRIVY_APP_ID` (and optional contract vars) in your shell or a repo-root `.env` file before compose.

```bash
docker compose up --build
```

Open http://localhost:3000

Fault-tolerance demo: `docker compose stop atos-monitor` → dashboard shows offline → `docker compose start atos-monitor`.

---

## Build and run (local)

### 1) Contracts

```bash
cd contracts
forge build
forge test
```

Deploy example (Sepolia; configure RPC + account in `contracts/.env`):

```bash
forge script script/DeployATOSToken.s.sol:DeployATOSToken --rpc-url sepolia --broadcast
```

Filecoin Calibration deploy notes (FEVM gas, `forge create`, opcode pins): [FILECOIN_CALIBRATION_DEPLOY_CHALLENGES.md](./FILECOIN_CALIBRATION_DEPLOY_CHALLENGES.md)

Uniswap V3 pool on Sepolia: [contracts/script/uniswap/README.md](./contracts/script/uniswap/README.md)

### 2) Rust agents (three terminals)

From `agents-rust/`:

```bash
cd agents-rust
cargo build -p atos-agent --release
```

| Role | API | libp2p TCP |
| --- | --- | --- |
| deployer | `3001` | `4001` |
| monitor | `3002` | `4002` |
| governance | `3003` | `4003` |

```bash
# terminal 1
cargo run -p atos-agent -- --role deployer   --port 4001 --api-port 3001

# terminal 2
cargo run -p atos-agent -- --role monitor    --port 4002 --api-port 3002

# terminal 3
cargo run -p atos-agent -- --role governance --port 4003 --api-port 3003
```

If mDNS discovery is flaky, pass bootstrap on monitor/governance, e.g. `--bootstrap /ip4/127.0.0.1/tcp/4001`.

Health check:

```bash
curl -s http://127.0.0.1:3001/status | jq .
```

Submit a task:

```bash
curl -s -X POST http://127.0.0.1:3001/task \
  -H 'Content-Type: application/json' \
  -d '{"action":"deploy_token","chain":"sepolia"}' | jq .
```

Gossipsub topics: `atos/tasks`, `atos/status`, `atos/heartbeat`.

### 3) Web dashboard

```bash
cd apps/web
pnpm install
cp .env.example .env.local   # Privy app id, RPC URLs, agent URLs
pnpm dev
```

Open http://localhost:3000 — sign in with Privy, confirm agent cards go online, submit tasks from the form.

Server-only agent URLs (not exposed to the browser):

```env
DEPLOYER_AGENT_URL=http://localhost:3001
MONITOR_AGENT_URL=http://localhost:3002
GOVERNANCE_AGENT_URL=http://localhost:3003
```

Production build: `pnpm build && pnpm start`. Vercel settings: see [apps/web/README.md](./apps/web/README.md).

---

## Documentation

| Doc | Description |
| --- | --- |
| [apps/web/README.md](./apps/web/README.md) | Dashboard architecture, diagrams, token factory, DEX, API routes |
| [CEX_LISTING_WORKFLOW.md](./CEX_LISTING_WORKFLOW.md) | End-to-end CEX listing pipeline (7 phases, IPLD listing package) |
| [FILECOIN_CALIBRATION_DEPLOY_CHALLENGES.md](./FILECOIN_CALIBRATION_DEPLOY_CHALLENGES.md) | Filecoin FEVM deploy issues and fixes |
| [DEPLOYMENT_STRATEGY.md](./DEPLOYMENT_STRATEGY.md) | Vercel + AWS ECS production layout and cost model |
| [project_information.md](./project_information.md) | Original project goals and acceptance criteria |

---

## Target production architecture

The PoC runs locally or via Docker. The diagram below is the **scale target** (Vercel UI + AWS ECS agents).

```mermaid
flowchart LR
    U[Users]

    subgraph FE[Client Layer]
        V[Vercel Next.js Dashboard]
    end

    subgraph EDGE[AWS Edge and Ingress]
        R53[Route53]
        CF[CloudFront]
        WAF[AWS WAF]
        ALB[Application Load Balancer]
    end

    subgraph APP[AWS ECS Fargate - Dockerized Services]
        API1[API Service Replica 1]
        API2[API Service Replica 2]
        D[Deployer Agent]
        M[Monitor Agent]
        G[Governance Agent]
    end

    subgraph P2P[libp2p Coordination Plane]
        DISC[Peer Discovery]
        TOPIC[PubSub Topics\natos/tasks atos/status atos/heartbeat]
    end

    subgraph DATA[State and Observability]
        REDIS[(ElastiCache Redis)]
        IPLD[IPLD Task and State]
        CID[CID Generator]
        CW[(CloudWatch Logs and Metrics)]
        S3[(S3 Artifacts)]
    end

    subgraph EXT[External Chains and Protocols]
        ETH[Sepolia RPC]
        FIL[Filecoin Calibration RPC]
        DEX[Uniswap V3]
        EXP[Explorer APIs]
    end

    U --> V
    V --> R53 --> CF --> WAF --> ALB
    ALB --> API1
    ALB --> API2

    API1 --> D
    API1 --> M
    API1 --> G
    API2 --> D
    API2 --> M
    API2 --> G

    D <--> DISC
    M <--> DISC
    G <--> DISC
    D <--> TOPIC
    M <--> TOPIC
    G <--> TOPIC

    API1 --> REDIS
    API2 --> REDIS
    D --> IPLD
    M --> IPLD
    G --> IPLD
    IPLD --> CID
    G --> S3

    D --> ETH
    M --> ETH
    D --> FIL
    M --> FIL
    M --> DEX
    G --> EXP

    API1 --> CW
    API2 --> CW
    D --> CW
    M --> CW
    G --> CW

    style FE fill:#dbeafe,stroke:#3b82f6,color:#1e3a5f
    style EDGE fill:#fef9c3,stroke:#eab308,color:#3f3000
    style APP fill:#dcfce7,stroke:#22c55e,color:#14532d
    style P2P fill:#ede9fe,stroke:#8b5cf6,color:#2e1065
    style DATA fill:#fee2e2,stroke:#ef4444,color:#450a0a
    style EXT fill:#ffedd5,stroke:#f97316,color:#431407
```

### Request flow (task lifecycle)

```mermaid
sequenceDiagram
    participant User
    participant UI as Vercel UI
    participant API as ECS API Service
    participant Agent as Target Agent
    participant P2P as libp2p PubSub
    participant Store as IPLD/CID Store
    participant Chain as RPC/DEX

    User->>UI: Submit task
    UI->>API: POST /api/task
    API->>Agent: Forward task
    Agent->>P2P: Publish status updates
    Agent->>Chain: Execute on-chain/off-chain action
    Agent->>Store: Persist task state
    Store-->>Agent: Return CID
    Agent-->>API: Task result + CID
    API-->>UI: Aggregated status
    UI-->>User: Live update in dashboard
```

---

## Scope

**In scope:** testnets, multi-agent mesh, dashboard control plane, CEX metadata stub + documented listing pipeline, in-memory CID store.

**Out of scope:** mainnet, real CEX listing, production compliance, full PQC-secured libp2p transport.

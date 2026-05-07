# ATOS — Autonomous Token Orchestration System
## Research PoC — 5-Day Cursor Execution Plan

> **Scope**: Strict research PoC. Working end-to-end demo, not production-ready code.
> **Stack**: Next.js 14 (App Router) + Rust (libp2p agent daemon) + Solidity + Privy Auth

---

## Project Architecture

```
atos/
├── apps/
│   └── web/                  # Next.js 14 frontend (Privy + Wagmi)
├── contracts/                # Solidity ERC-20 (Hardhat)
├── agents/                   # Rust workspace (libp2p daemon)
│   ├── core/                 # Shared types, IPLD schemas, CID utils
│   ├── deployer/             # Deployer agent
│   ├── monitor/              # Monitor agent
│   └── governance/           # Governance agent
├── docker/                   # Docker configs per agent
└── CLAUDE.md                 # This file
```

---

## Day-by-Day Execution Plan

### DAY 1 — Foundation: Auth + ERC-20 Contract + Repo Setup
**Goal**: Privy login working, ERC-20 deployed on Sepolia testnet, monorepo scaffolded.

#### Tasks
1. **Monorepo init** (`pnpm` workspaces)
   ```bash
   pnpm init
   mkdir -p apps/web contracts agents/core agents/deployer agents/monitor agents/governance docker
   ```

2. **Next.js 14 app** with Privy + Wagmi
   ```bash
   cd apps/web
   pnpm create next-app@latest . --typescript --tailwind --app
   pnpm add @privy-io/react-auth @privy-io/wagmi wagmi viem @tanstack/react-query
   ```

3. **Privy Setup** — MPC wallet login (no seed phrase)
   - Provider: `PrivyProvider` wrapping the app
   - Login methods: Email + Wallet (MetaMask / embedded MPC wallet)
   - Embedded wallet for users who don't have a wallet

4. **ERC-20 Contract**
   ```bash
   cd contracts
   pnpm add -D hardhat @nomicfoundation/hardhat-toolbox
   pnpm add @openzeppelin/contracts
   npx hardhat init
   ```
   - Contract: `ATOSToken.sol` (standard ERC-20, mintable, burnable, OpenZeppelin)
   - Deploy script for Sepolia testnet
   - Verify on Etherscan

5. **Env setup**
   ```
   NEXT_PUBLIC_PRIVY_APP_ID=
   NEXT_PUBLIC_CONTRACT_ADDRESS=
   NEXT_PUBLIC_CHAIN_ID=11155111   # Sepolia
   ALCHEMY_API_KEY=
   PRIVATE_KEY=                    # deployer wallet
   ```

#### Deliverable
- `http://localhost:3000` shows Privy login
- After login, dashboard shows connected wallet + ETH balance
- ERC-20 deployed, address known

---

### DAY 2 — Rust Agent Daemon + libp2p Networking
**Goal**: Three Rust agents (Deployer, Monitor, Governance) running and communicating over libp2p pubsub with peer discovery.

#### Tasks

1. **Rust workspace init**
   ```toml
   # agents/Cargo.toml
   [workspace]
   members = ["core", "deployer", "monitor", "governance"]
   ```

2. **Core crate** (`agents/core/`)
   - IPLD-inspired task schema (use `libipld` crate for CID generation)
   - Agent identity: Ed25519 keypair → PeerId (via `libp2p-identity`)
   - Message types: `TaskMsg`, `StatusMsg`, `HeartbeatMsg` serialized with `serde_json`
   - CID generation for task IDs using `cid` + `multihash` crates

   ```toml
   # agents/core/Cargo.toml
   [dependencies]
   libp2p = { version = "0.54", features = ["tokio", "gossipsub", "mdns", "noise", "yamux", "tcp", "identify"] }
   libipld = "0.16"
   cid = "0.11"
   multihash = "0.19"
   serde = { version = "1", features = ["derive"] }
   serde_json = "1"
   tokio = { version = "1", features = ["full"] }
   tracing = "0.1"
   tracing-subscriber = "0.3"
   ```

3. **libp2p network per agent**
   - Transport: TCP + Noise encryption + Yamux multiplexing
   - Discovery: mDNS (local PoC) + optional bootstrap peers via env var
   - Messaging: Gossipsub pubsub on topics:
     - `atos/tasks` — task broadcast
     - `atos/status` — status updates
     - `atos/heartbeat` — liveness

4. **Agent roles** (each is a separate binary):
   - `deployer` — Listens on `atos/tasks`, executes "deploy" tasks (calls Ethereum RPC via `ethers-rs`)
   - `monitor` — Polls contract events, publishes status to `atos/status`
   - `governance` — Listens for governance proposals, logs them

5. **HTTP API per agent** (for frontend to call)
   - Use `axum` for a minimal REST API on each agent
   - `GET /status` — agent health + peer count
   - `POST /task` — submit a task (agent picks it up)
   - `GET /tasks` — list completed tasks with CIDs

   ```toml
   axum = "0.7"
   tower = "0.4"
   ```

6. **Docker** each agent
   ```dockerfile
   # docker/deployer.Dockerfile
   FROM rust:1.78-slim
   WORKDIR /app
   COPY agents/ .
   RUN cargo build --release -p deployer
   CMD ["./target/release/deployer"]
   ```

#### Deliverable
- `docker-compose up` spins up 3 agent containers
- Agents discover each other via mDNS
- Posting a task to deployer agent triggers a pubsub message visible in monitor logs
- Each task gets a CID (content-addressed ID)

---

### DAY 3 — Frontend Dashboard (Agent Control Panel)
**Goal**: Web UI where the user (after Privy login) can enter contract details, select an agent, and submit tasks. Live status feed.

#### UI Pages/Components

1. **`/` — Login Page**
   - Privy `useLogin()` hook
   - Shows "Connect Wallet" button (Privy MPC embedded wallet OR external)
   - On success → redirect to `/dashboard`

2. **`/dashboard` — Main Dashboard**
   Layout:
   ```
   ┌──────────────────────────────────────────────┐
   │  ATOS    [wallet address]  [network badge]   │
   ├──────────────┬───────────────────────────────┤
   │  AGENTS      │  TASK FEED                    │
   │  ○ Deployer  │  [CID] deploy  ✓ 2m ago       │
   │  ○ Monitor   │  [CID] monitor ● running      │
   │  ○ Governance│  [CID] govern  ✗ failed       │
   ├──────────────┴───────────────────────────────┤
   │  CONTRACT DETAILS INPUT                      │
   │  Address: [________________]                 │
   │  Chain:   [Sepolia ▼]                        │
   │  Agent:   [Deployer ▼]                       │
   │  Action:  [Deploy Token ▼]                   │
   │                        [Submit Task →]       │
   └──────────────────────────────────────────────┘
   ```

3. **Components to build**:
   - `<WalletButton />` — Privy login/logout
   - `<AgentCard />` — shows agent status (online/offline, peer count, last heartbeat)
   - `<TaskForm />` — contract address input + agent selector + action selector + submit
   - `<TaskFeed />` — live list of tasks with CID, status badge, timestamp
   - `<NetworkGraph />` — simple SVG showing 3 agent nodes + connections (static for PoC)

4. **API routes** (Next.js `/api/`):
   - `POST /api/task` → proxies to the relevant Rust agent's HTTP API
   - `GET /api/agents` → polls all 3 agent `/status` endpoints, returns unified JSON
   - `GET /api/tasks` → aggregates task lists from all agents

5. **Polling**: Use `setInterval` + React Query to poll `/api/agents` every 5s for live status

#### Aesthetic Direction
- Dark theme, monospace fonts for CIDs/addresses (`JetBrains Mono`)
- Display font: `Space Mono` or `IBM Plex Mono` for headers — terminal/industrial feel
- Color palette: near-black background `#0a0a0f`, electric cyan `#00d4ff` accents, amber `#f59e0b` for warnings
- Subtle grid overlay on background (CSS `background-image: linear-gradient`)
- Agent cards with glowing border when online

#### Deliverable
- Full dashboard renders after Privy login
- User can paste a contract address, select agent + action, click Submit
- Task appears in feed with a CID
- Agent status cards show live online/offline state

---

### DAY 4 — IPLD Schemas + DEX Integration + CEX Prep Stub
**Goal**: Formalize IPLD task/state schemas in Rust, integrate Uniswap V3 (Sepolia) read, CEX metadata stub.

#### Tasks

1. **IPLD Schemas** (in `agents/core`)
   Define DAG-JSON schemas for:
   ```rust
   // Task Node
   struct TaskNode {
       task_id: Cid,           // CID of this task
       agent_role: String,     // "deployer" | "monitor" | "governance"
       action: String,         // "deploy_token" | "monitor_events" | "submit_proposal"
       payload: serde_json::Value,
       parent_cid: Option<Cid>, // link to previous task (DAG)
       timestamp: u64,
       status: TaskStatus,     // Pending | Running | Done | Failed
   }

   // Agent State Node
   struct AgentStateNode {
       peer_id: String,
       role: String,
       current_task: Option<Cid>,
       completed_tasks: Vec<Cid>,
       uptime_secs: u64,
   }
   ```
   - Serialize to DAG-JSON, compute CID using SHA2-256 multihash
   - Store in-memory HashMap for PoC (no IPFS node needed)

2. **DEX Integration** (read-only, Sepolia)
   - Uniswap V3 Sepolia: query pool price for ATOS/WETH if pool exists, or mock data
   - Use `ethers-rs` in the monitor agent to call `slot0()` on a Uniswap V3 pool
   - Display price on dashboard as "DEX Price" widget
   - If no real pool: create a mock Uniswap V3 pool on Sepolia using `UniswapV3Factory`

3. **Liquidity Provisioning Script** (Hardhat task)
   ```bash
   # contracts/tasks/addLiquidity.ts
   npx hardhat addLiquidity --network sepolia
   ```
   - Wraps ETH → WETH
   - Approves ATOS token
   - Calls `NonfungiblePositionManager.mint()` to create initial pool position

4. **CEX Metadata Stub** (governance agent output)
   - Governance agent generates a JSON artifact on task completion:
   ```json
   {
     "token_name": "ATOS Token",
     "symbol": "ATOS",
     "decimals": 18,
     "contract_address": "0x...",
     "chain": "Ethereum Sepolia",
     "total_supply": "1000000000",
     "audit_status": "research_poc",
     "logo_cid": "bafyrei...",
     "whitepaper_cid": "bafyrei..."
   }
   ```
   - CID of this JSON is the "CEX listing artifact CID"
   - Display in dashboard under "CEX Prep" tab

5. **PQC Stub** (prototype only)
   - Add `pqcrypto-kyber` or `ml-kem` crate to core
   - On agent startup: generate Kyber keypair alongside Ed25519
   - Log: "PQC key exchange initialized (Kyber-768)" — no actual integration, just lifecycle
   - Document as "hybrid classical+PQC planned, Kyber keypair generation prototyped"

#### Deliverable
- IPLD CIDs logged in agent output for every task
- DEX price widget shows data (real or mocked) on dashboard
- Governance agent can produce CEX metadata JSON with CID
- PQC keypair generation logged on agent startup

---

### DAY 5 — Integration, Docker Compose, Docs, Demo Polish
**Goal**: Everything runs with one command. Demo script. Documentation.

#### Tasks

1. **`docker-compose.yml`** — full stack
   ```yaml
   version: "3.9"
   services:
     deployer-agent:
       build: { context: ., dockerfile: docker/deployer.Dockerfile }
       ports: ["3001:3001"]
       environment:
         - ETH_RPC_URL=${ETH_RPC_URL}
         - PRIVATE_KEY=${PRIVATE_KEY}
         - AGENT_PORT=3001

     monitor-agent:
       build: { context: ., dockerfile: docker/monitor.Dockerfile }
       ports: ["3002:3002"]
       environment:
         - ETH_RPC_URL=${ETH_RPC_URL}
         - CONTRACT_ADDRESS=${CONTRACT_ADDRESS}
         - AGENT_PORT=3002
         - BOOTSTRAP_PEER=/ip4/deployer-agent/tcp/4001

     governance-agent:
       build: { context: ., dockerfile: docker/governance.Dockerfile }
       ports: ["3003:3003"]
       environment:
         - AGENT_PORT=3003
         - BOOTSTRAP_PEER=/ip4/deployer-agent/tcp/4001

     web:
       build: apps/web
       ports: ["3000:3000"]
       environment:
         - NEXT_PUBLIC_PRIVY_APP_ID=${NEXT_PUBLIC_PRIVY_APP_ID}
         - DEPLOYER_AGENT_URL=http://deployer-agent:3001
         - MONITOR_AGENT_URL=http://monitor-agent:3002
         - GOVERNANCE_AGENT_URL=http://governance-agent:3003
   ```

2. **End-to-end demo script** (`demo.sh`)
   ```bash
   #!/bin/bash
   # 1. Deploy ERC-20 to Sepolia
   cd contracts && npx hardhat run scripts/deploy.ts --network sepolia
   # 2. Start all agents + frontend
   docker-compose up -d
   # 3. Open browser
   open http://localhost:3000
   echo "Demo ready. Login with Privy, paste contract address, submit tasks."
   ```

3. **3 working workflows** (acceptance criteria):
   - **Workflow 1: Deploy** — User submits "deploy_token" task → Deployer agent picks up → logs deploy tx hash → task marked Done with CID
   - **Workflow 2: Monitor** — Monitor agent polls contract every 30s → publishes Transfer event count to pubsub → Dashboard shows live event count
   - **Workflow 3: Governance Report** — User submits "generate_cex_metadata" → Governance agent produces JSON → CID shown in dashboard

4. **Fault tolerance demo**
   - Kill monitor agent container: `docker stop monitor-agent`
   - Dashboard shows Monitor as offline (red badge)
   - Restart: `docker start monitor-agent` → comes back online, re-discovers peers via bootstrap
   - Document this in README as "fault tolerance demo"

5. **Documentation** (`README.md`)
   ```markdown
   ## ATOS Research PoC

   ### Quick Start
   cp .env.example .env  # fill in keys
   ./demo.sh

   ### Architecture
   [diagram]

   ### Agent Workflows
   1. Deploy workflow
   2. Monitor workflow
   3. Governance workflow

   ### PQC Status
   Kyber-768 keypair generation prototyped. Full integration roadmap in docs/pqc-roadmap.md.

   ### IPLD Schema
   See agents/core/src/schema.rs
   ```

---

## File Structure to Generate in Cursor

```
atos/
├── CLAUDE.md                          ← this file
├── .env.example
├── docker-compose.yml
├── demo.sh
├── README.md
│
├── apps/web/
│   ├── app/
│   │   ├── layout.tsx                 ← PrivyProvider + WagmiProvider wrapper
│   │   ├── page.tsx                   ← Login page
│   │   └── dashboard/
│   │       └── page.tsx               ← Main dashboard
│   ├── components/
│   │   ├── WalletButton.tsx
│   │   ├── AgentCard.tsx
│   │   ├── TaskForm.tsx
│   │   ├── TaskFeed.tsx
│   │   └── NetworkGraph.tsx
│   ├── lib/
│   │   └── wagmi.ts                   ← Wagmi config (Privy connector)
│   └── app/api/
│       ├── task/route.ts
│       ├── agents/route.ts
│       └── tasks/route.ts
│
├── contracts/
│   ├── contracts/ATOSToken.sol
│   ├── scripts/deploy.ts
│   ├── tasks/addLiquidity.ts
│   └── hardhat.config.ts
│
└── agents/
    ├── Cargo.toml                     ← workspace
    ├── core/
    │   └── src/
    │       ├── lib.rs
    │       ├── schema.rs              ← TaskNode, AgentStateNode
    │       ├── cid.rs                 ← CID generation helpers
    │       └── messages.rs            ← TaskMsg, StatusMsg, HeartbeatMsg
    ├── deployer/
    │   └── src/main.rs                ← libp2p + axum + ethers-rs
    ├── monitor/
    │   └── src/main.rs
    └── governance/
        └── src/main.rs
```

---

## Key Libraries & Versions

### Rust (agents)
```toml
libp2p = "0.54"                        # gossipsub, mdns, noise, yamux, tcp
axum = "0.7"                           # HTTP API per agent
ethers = "2.0"                         # Ethereum RPC
cid = "0.11"                           # CID generation
multihash = "0.19"
libipld = "0.16"                       # IPLD DAG-JSON
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
pqcrypto-kyber = "0.7"               # PQC stub
```

### TypeScript (web)
```json
{
  "@privy-io/react-auth": "^1.87",
  "@privy-io/wagmi": "^0.2",
  "wagmi": "^2",
  "viem": "^2",
  "@tanstack/react-query": "^5",
  "next": "14"
}
```

### Solidity (contracts)
```json
{
  "@openzeppelin/contracts": "^5.0",
  "hardhat": "^2.22",
  "@nomicfoundation/hardhat-toolbox": "^5"
}
```

---

## Critical Implementation Notes for Cursor

### Privy MPC Login (Day 1 priority)
```tsx
// apps/web/app/layout.tsx
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';

export default function RootLayout({ children }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['email', 'wallet'],
        embeddedWallets: {
          createOnLogin: 'users-without-wallets', // MPC wallet auto-created
        },
        defaultChain: sepolia,
        supportedChains: [sepolia],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
```

### libp2p Agent Template (Rust)
```rust
// agents/deployer/src/main.rs — pattern to follow for all agents
#[tokio::main]
async fn main() {
    // 1. Generate Ed25519 identity
    let keypair = libp2p::identity::Keypair::generate_ed25519();
    let peer_id = PeerId::from(keypair.public());

    // 2. Build swarm with gossipsub + mdns + noise + yamux
    let mut swarm = libp2p::SwarmBuilder::with_existing_identity(keypair)
        .with_tokio()
        .with_tcp(tcp::Config::default(), noise::Config::new, yamux::Config::default)?
        .with_behaviour(|key| {
            let gossipsub = gossipsub::Behaviour::new(...)?;
            let mdns = mdns::tokio::Behaviour::new(mdns::Config::default(), key.public().to_peer_id())?;
            Ok(AgentBehaviour { gossipsub, mdns })
        })?
        .build();

    // 3. Subscribe to topics
    swarm.behaviour_mut().gossipsub.subscribe(&topic("atos/tasks"))?;

    // 4. Start axum HTTP server on separate tokio task
    tokio::spawn(start_http_server(3001));

    // 5. Event loop
    loop {
        select! {
            event = swarm.select_next_some() => handle_event(event, &mut swarm),
        }
    }
}
```

### Task CID Generation
```rust
// agents/core/src/cid.rs
use cid::Cid;
use multihash::{Code, MultihashDigest};

pub fn task_cid(task_json: &[u8]) -> Cid {
    let hash = Code::Sha2_256.digest(task_json);
    Cid::new_v1(0x0129, hash) // 0x0129 = dag-json codec
}
```

### Contract Address Input + Agent Selector (TaskForm)
```tsx
// components/TaskForm.tsx
const AGENTS = ['Deployer', 'Monitor', 'Governance'] as const;
const ACTIONS = {
  Deployer: ['deploy_token', 'upgrade_contract'],
  Monitor:  ['monitor_events', 'check_balance'],
  Governance: ['generate_cex_metadata', 'submit_proposal'],
};

// On submit: POST /api/task with { contractAddress, agent, action }
// API route proxies to the correct Rust agent HTTP endpoint
```

---

## Acceptance Criteria Checklist

- [ ] Privy MPC login works (email + embedded wallet)
- [ ] ERC-20 deployed and verified on Sepolia
- [ ] 3 Rust agents start and discover each other via libp2p mDNS
- [ ] Agents communicate via Gossipsub pubsub
- [ ] Dashboard shows agent online/offline status
- [ ] User can submit tasks from dashboard (contract address + agent + action)
- [ ] Tasks get CIDs logged in agent output
- [ ] Monitor agent tracks contract events
- [ ] Governance agent generates CEX metadata JSON with CID
- [ ] Kill one agent → dashboard shows offline → restart → comes back
- [ ] DEX price widget shows data (Uniswap V3 Sepolia or mocked)
- [ ] PQC keypair generation logged on agent startup
- [ ] `docker-compose up` starts entire stack
- [ ] README covers setup and all 3 workflows

---

## What is Explicitly OUT OF SCOPE for this PoC

- Real PQC-secured libp2p channels (only keypair generation)
- Mainnet deployment (Sepolia testnet only)
- Persistent IPFS storage (in-memory CID store only)
- Real CEX listing (metadata JSON only)
- Production security hardening
- Agent autoscaling / Kubernetes
- Full IPLD schema validation (struct-level only)

---

## Environment Variables (.env.example)

```env
# Privy
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id

# Ethereum
ALCHEMY_API_KEY=your-alchemy-key
ETH_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}
PRIVATE_KEY=0x...deployer-wallet-private-key
ETHERSCAN_API_KEY=your-etherscan-key

# Contract (filled after Day 1 deploy)
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=11155111

# Agent URLs (used by Next.js API routes)
DEPLOYER_AGENT_URL=http://localhost:3001
MONITOR_AGENT_URL=http://localhost:3002
GOVERNANCE_AGENT_URL=http://localhost:3003
```
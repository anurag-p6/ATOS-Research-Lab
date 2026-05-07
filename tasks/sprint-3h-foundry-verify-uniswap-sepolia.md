# Sprint — Foundry token, verify, Uniswap V3 (Sepolia) (~3 hours)

**Goal:** Ship an ERC-20 with Foundry, verify on Etherscan, then **create a V3 pool and seed minimal liquidity** so the pair is discoverable on Uniswap’s Sepolia UI (testnet “listing” = pool + liquidity, not an order book).

**Does this sound good?** Yes as a **focused learning + demo** slice. For **3 hours wall-clock**, treat verification + one small liquidity mint as the **must-ship**; polish (scripts, CI, second fee tier) is stretch.

---

## Prerequisites (before the clock starts)

| Item | Why |
|------|-----|
| Sepolia ETH | Deploy + verify + `mint` + WETH wrap burn gas |
| RPC URL | `ETH_RPC_URL` or `SEPOLIA_RPC_URL` (Alchemy/Infura) |
| Deployer private key | `PRIVATE_KEY` in `.env` (never commit) |
| Etherscan API key | `ETHERSCAN_API_KEY` for `forge verify` |
| Foundry installed | `curl -L https://foundry.paradigm.xyz \| bash` then `foundryup` |

**Improve the plan:** Block 15 minutes *before* the sprint to fund the wallet and confirm RPC works (`cast block-number --rpc-url $RPC`). Nothing else in the 3h matters if this fails.

---

## Definition of done (pick one tier)

**Tier A — Done (realistic for 3h):**

- [ ] Foundry project with token (OZ-style mintable/burnable or minimal ERC-20 + fixed supply)
- [ ] Tests pass: `forge test`
- [ ] Deployed to Sepolia: `forge script ... --broadcast`
- [ ] Verified on Sepolia Etherscan: `forge verify-contract`
- [ ] V3 pool exists for **TOKEN / WETH** at a chosen fee tier and **at least dust liquidity** so swaps are possible in the UI

**Tier B — Stretch (if time remains):**

- [ ] One `forge`/`cast` script file that wraps ETH → WETH, approves NPM, `mint`s a position
- [ ] Short note in repo: deploy command, verified address, pool address (from `PoolCreated` or `createPool` tx)

---

## Hour 0:00–1:00 — Foundry project + token + tests

| Step | Action | Exit check |
|------|--------|------------|
| 1 | `forge init --no-commit contracts` (or `foundry init` at chosen root) | `forge build` clean |
| 2 | Add OpenZeppelin: `forge install OpenZeppelin/openzeppelin-contracts` + `remappings.txt` | Imports resolve |
| 3 | Implement token (align with org naming, e.g. `ATOSToken.sol`) | Matches your supply/mint policy |
| 4 | Unit tests: deploy, transfer, mint/burn if applicable | `forge test` green |

**Improve the plan:** Keep the token **boring and standard** in this sprint. Custom tax hooks or upgradeability blow the 3h budget.

---

## Hour 1:00–2:00 — Deploy Sepolia + verify

| Step | Action | Exit check |
|------|--------|------------|
| 1 | `foundry.toml`: `[profile.default]`, `eth_sepolia` rpc + `etherscan` key (or pass CLI flags) | `cast chain-id --rpc-url $RPC` → `11155111` |
| 2 | Write deploy script (`script/Deploy.s.sol`) using `vm.envUint("PRIVATE_KEY")` | Dry-run: `forge script ...` without `--broadcast` succeeds |
| 3 | Broadcast: `forge script script/Deploy.s.sol:Deploy --rpc-url $RPC --broadcast` | Tx succeeds; **save deployed token address** |
| 4 | Verify: `forge verify-contract <ADDR> src/YourToken.sol:YourToken --chain sepolia` | Green checkmark on Etherscan |

**Gotchas:**

- Constructor args need `--constructor-args $(cast abi-encode ...)` if any.
- If verification fails, note the compiler version and optimizer settings in `foundry.toml`; they must match the deployed bytecode.

**Improve the plan:** Log **compiler version, optimizer runs, and deployed address** in a scratch file as you go—saves 20 minutes on verify retries.

---

## Hour 2:00–3:00 — Uniswap V3 Sepolia: pool + liquidity (“listing”)

On testnets, “listing” means: **factory `createPool` (if missing) → (both sides funded) → `NonfungiblePositionManager.mint`**. Uniswap’s UI discovers pools that exist and have liquidity.

**Reference addresses (Sepolia — double-check against [Uniswap deploys](https://github.com/Uniswap/v3-periphery/blob/main/deploys.md) before mainnet reuse):**

| Contract | Typical Sepolia address (verify on Etherscan) |
|----------|-----------------------------------------------|
| `UniswapV3Factory` | `0x0227628f3F023bb0B980b67D528571c95c6DaC1c` |
| `NonfungiblePositionManager` | `0x1238536071E1c677A632429e3655c799b22cDA52` |

| Step | Action | Exit check |
|------|--------|------------|
| 1 | Read WETH from NPM (`WETH9()` on the position manager) or from Uniswap docs | You have `WETH` address for approvals |
| 2 | Sort `token0` / `token1` vs WETH (V3 requires **token0 < token1** by address) | You know which is `token0` |
| 3 | Pick **one** fee tier (e.g. 3000 = 0.3%) | Single path; avoid exploring all tiers in this window |
| 4 | `createPool` if pool does not exist (via `cast send` to factory or small Solidity script) | `getPool(token0, token1, fee)` returns non-zero |
| 5 | Wrap some Sepolia ETH to WETH; approve NPM for **token** and **WETH** | Allowances set |
| 6 | Call `mint` with a **wide tick range** (fewer edge failures than tight range for a rush job) | NFT minted; UI shows pool |

**Improve the plan:**

- **Narrow scope:** One fee tier, one position, wide range, small amounts—enough to prove the pipeline.
- If Hour 3 is slipping: **ship `createPool` + approvals** and document “run `mint` next”; partial credit is still valuable for the org story.
- **Security:** Testnet deployer key in `.env` is fine; never reuse that key on mainnet.

---

## After the sprint (not in the 3h, but strengthens the contribution)

1. Add `README` section: addresses, fee tier, how to reproduce deploy/verify.
2. Commit `broadcast/` or document tx hashes (team policy: some repos gitignore broadcasts).
3. Optional: align `CLAUDE.md` Day 1 from Hardhat → Foundry so the monorepo plan matches reality.

---

## Quick sanity check on the original ask

| Ask | Verdict in 3h |
|-----|----------------|
| Smart contract in Foundry | Fits Hour 1 |
| Verify on Etherscan | Fits Hour 2 if RPC/keys ready |
| “List” on Uniswap V3 Sepolia | Fits Hour 3 **if** scoped to pool + minimal `mint`; **not** full liquidity math + multiple pools |

**Bottom line:** The sequence is right. **Improve it** by front-loading env checks, keeping the token minimal, and defining “listed” as **verified token + V3 pool with liquidity**, with a written fallback if `mint` slips past the clock.

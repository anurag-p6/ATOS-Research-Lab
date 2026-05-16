# Filecoin Calibration (FEVM) — deploy challenges and fixes

This document records what went wrong while deploying **ATOS** (`ATOSToken.sol`) to **Filecoin Calibration** (chain id `314159`) with **Foundry**, and how each issue was resolved. Use it for mentor updates, onboarding, or incident notes.

**References**

- [FEVM Foundry Kit](https://github.com/filecoin-project/fevm-foundry-kit) (official Calibration deploy pattern: `forge create`)
- [FIP-0054 — Filecoin EVM](https://github.com/filecoin-project/FIPs/blob/master/FIPS/fip-0054.md) (opcode set: Paris + PUSH0; not full Cancun)
- [Calibration faucet](https://faucet.calibnet.chainsafe-fil.io/funds.html)

---

## Context

- **Goal:** deploy an OpenZeppelin-based ERC-20 to Calibration.
- **Tooling:** Foundry (`forge`, `cast`), OpenZeppelin Contracts submodule, Cast keystore / MetaMask-derived account.
- **Repo:** `contracts/` — deploy helper: `script/deploy-butterfly.sh` (name is historical; script targets Calibration).

---

## Challenge 1 — `GasLimit` cannot be less than the cost of storing a message on chain

### Symptom

Lotus rejects the transaction before it is accepted, for example:

```text
verify msg failed: message will not be included in a block:
'GasLimit' field cannot be less than the cost of storing a message on chain
1585634 < 9638563
```

### Cause

Filecoin charges gas for **persisting the message on chain** in addition to **EVM execution**. Foundry’s estimate often reflects mostly EVM work, so the proposed `GasLimit` can be below the minimum the node enforces.

### Fix

- Increase the gas budget: `--gas-estimate-multiplier` on `forge script`, or a generous explicit `--gas-limit` where applicable.
- If preflight still fails, raise the multiplier further or switch to a deployment path that sets a high ceiling (see Challenge 3).

---

## Challenge 2 — On-chain failure: `status: 0` and `gasUsed` equals the full gas limit

### Symptom

The transaction is included in a block but **fails**. The receipt shows **`gasUsed` equal to the gas limit** (often ~100% of the budget). That pattern is typical of an **invalid opcode** during **contract creation**, not a normal revert with remaining gas.

### Root causes (two layers)

**A. OpenZeppelin submodule drift**

- `lib/openzeppelin-contracts` was **pinned** to **v5.0.2** (pre-Cancun `mcopy` in the tree we need).
- The **working tree** had been overwritten with **v5.6.x** sources, which introduced **`mcopy`** in `utils/Bytes.sol` (Cancun, EIP-5656).
- FEVM does **not** implement Cancun opcodes such as **`mcopy`**, **`tload`**, **`tstore`**; per FIP-0054 the supported set is effectively **Paris + PUSH0**.

**B. Compiler EVM target**

- With Solidity’s default **`cancun`** EVM version, the compiler can still emit **`TSTORE`** (EIP-1153) even when your own `.sol` files never mention transient storage.

### Fix

1. **Reset OpenZeppelin** to the pinned tag so vendored code matches the submodule (no stray v5.6 files on disk), e.g.:

   ```bash
   cd lib/openzeppelin-contracts
   git stash -u    # only if you need to save local junk first
   git checkout v5.0.2 -- .
   git clean -fd
   ```

2. **Pin EVM version in `foundry.toml`:**

   ```toml
   solc_version = "0.8.24"
   evm_version = "shanghai"
   ```

   Shanghai keeps **PUSH0** (EIP-3855) while avoiding Cancun-only opcodes in normal compilation paths for this project.

3. **Rebuild** and, if you want proof, disassemble or scan bytecode for opcodes `0x5e` (MCOPY), `0x5c` (TLOAD), `0x5d` (TSTORE) in creation and runtime segments — counts should be **zero**.

---

## Challenge 3 — `forge script` unreliable on Calibration

### Symptom

Odd gas estimates, failed simulation, or failed broadcast even after bytecode is valid.

### Cause

`forge script` runs a **pre-broadcast simulation** against the live RPC. On FEVM that path is **more fragile** than on Ethereum; gas math and the simulator do not always match what Lotus accepts.

### Fix

Use **`forge create`** for Calibration deploys, matching the [FEVM Foundry Kit](https://github.com/filecoin-project/fevm-foundry-kit). Keep **`forge script`** for Sepolia / Anvil where it is stable.

Example:

```bash
forge create src/ATOSToken.sol:ATOSToken \
  --rpc-url filecoin-calibration \
  --account <label> \
  --broadcast \
  --retries 20 \
  --timeout 300 \
  --constructor-args <owner> <recipient> <cap_wei> <initial_supply_wei>
```

---

## Challenge 4 — `error code 12: requested epoch was a null round`

### Symptom

After broadcast, Foundry / Alloy logs something like:

```text
failed to fetch block number=3715425
err=... error code 12: requested epoch was a null round (3715425)
```

The process may appear stuck; Ctrl+C does not mean the chain rejected the tx.

### Cause

Filecoin uses **Expected Consensus**. Some **epochs have no block** (a **null round**). When JSON-RPC is asked for that “block height,” Lotus returns error **12**. Foundry’s block follower can treat that as fatal unless it **retries**.

### Fix

- Pass **`--retries`** and **`--timeout`** on `forge create` (e.g. `--retries 20 --timeout 300`) so receipt polling survives null rounds.
- If the CLI is interrupted, check the **deployer address** on [Filfox Calibration](https://calibration.filfox.info/) or [Blockscout testnet](https://filecoin-testnet.blockscout.com/) — the contract creation may already have succeeded.

---

## Summary table

| Issue | Layer | Fix |
| --- | --- | --- |
| Gas limit too low (preflight reject) | Filecoin gas model | Higher multiplier / explicit gas limit |
| Full gas, failed create | Bytecode (dependencies + compiler) | Pin OZ to FEVM-safe tag; `evm_version = "shanghai"` |
| Script / simulation weirdness | Foundry | Use `forge create` on FEVM |
| Null round RPC error | Filecoin consensus | `--retries` + `--timeout`; confirm on explorer |

---

## One-line takeaway

**FEVM is EVM-compatible, not EVM-identical:** opcode support is narrower than full Cancun, gas includes **message storage**, and **null rounds** exist — align OpenZeppelin and `evm_version`, deploy with **`forge create`**, and **retry** receipt polling on Filecoin RPCs.

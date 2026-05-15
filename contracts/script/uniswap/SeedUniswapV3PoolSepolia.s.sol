// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

// ---------------------------------------------------------------------------
// Minimal inline interfaces — no v3-core / v3-periphery submodule needed.
// ---------------------------------------------------------------------------

interface IWETH9 {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

interface IERC20Min {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24  fee;
        int24   tickLower;
        int24   tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24  fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool);

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
}

// ---------------------------------------------------------------------------
// SeedUniswapV3PoolSepolia
// ---------------------------------------------------------------------------
// Creates and seeds a Uniswap V3 ATOS/WETH pool on Ethereum Sepolia.
//
// What this script does in one broadcast:
//   1. Reads your wallet's current WETH balance.
//   2. Wraps (ETH → WETH) only the shortfall so you always end up with
//      at least UNI_WETH_AMOUNT worth of WETH.
//   3. Approves the NonfungiblePositionManager (NPM) for both ATOS and WETH.
//   4. Calls createAndInitializePoolIfNecessary (safe to re-run — idempotent).
//   5. Mints a full-range LP position; the LP NFT is sent to your wallet.
//
// Required env (set in contracts/.env):
//   ATOS_SEPOLIA        address of your deployed ATOSToken on Sepolia
//
// Optional env (all in wei unless noted):
//   UNI_ATOS_AMOUNT     ATOS to provide as liquidity      default: 1_000 * 1e18
//   UNI_WETH_AMOUNT     WETH to provide as liquidity      default: 0.005 * 1e18
//   UNI_FEE             fee tier: 500 | 3000 | 10000      default: 3000
//   UNI_SQRT_PRICE_X96  initial pool price (Q64.96)        default: 1:1 (see note)
//
// Starting price note:
//   The default SQRT_PRICE_1_1 sets token1/token0 = 1 (equal value).
//   For a more realistic testnet price, precomputed values (assuming ATOS < WETH):
//     1 WETH = 1,000  ATOS  →  2505414483750479251915866636
//     1 WETH = 10,000 ATOS  →  792281625142643375935439503
//   If WETH < ATOS (token0 = WETH), flip the ratio before computing.
//   Price only affects the UI display; testnet swaps rebalance it quickly.
//
// Run via:
//   ./script/uniswap/seed-pool-sepolia.sh
//   (or directly with forge script ... --broadcast)
// ---------------------------------------------------------------------------

contract SeedUniswapV3PoolSepolia is Script {

    // ── Sepolia Uniswap V3 addresses ─────────────────────────────────────
    // Source: https://github.com/Uniswap/v3-periphery/blob/main/deploys.md
    address internal constant NPM  = 0x1238536071E1c677A632429e3655c799b22cDA52;
    address internal constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    // sqrt(1) in Q64.96 → encodes an initial price of token1/token0 = 1.
    uint160 internal constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    error SeedPool__WrongChain(uint256 got, uint256 expected);
    error SeedPool__ZeroAtosAddress();
    error SeedPool__InsufficientAtos(uint256 have, uint256 need);
    error SeedPool__InsufficientEth(uint256 have, uint256 need);
    error SeedPool__BadFeeTier(uint24 fee);

    function run() external {
        // ── 1. Chain guard ────────────────────────────────────────────────
        if (block.chainid != 11155111) {
            revert SeedPool__WrongChain(block.chainid, 11155111);
        }

        // ── 2. Read configuration ─────────────────────────────────────────
        address atos = vm.envAddress("ATOS_SEPOLIA");
        if (atos == address(0)) revert SeedPool__ZeroAtosAddress();

        uint256 atosAmount = vm.envOr("UNI_ATOS_AMOUNT", uint256(1_000 ether));
        uint256 wethAmount = vm.envOr("UNI_WETH_AMOUNT", uint256(0.005 ether));
        uint24  fee        = uint24(vm.envOr("UNI_FEE", uint256(3000)));
        uint160 sqrtPriceX96 = uint160(vm.envOr("UNI_SQRT_PRICE_X96", uint256(SQRT_PRICE_1_1)));

        // ── 3. Validate fee tier and compute full-range ticks ─────────────
        int24 tickSpacing;
        if      (fee == 500)   tickSpacing = 10;
        else if (fee == 3000)  tickSpacing = 60;
        else if (fee == 10000) tickSpacing = 200;
        else revert SeedPool__BadFeeTier(fee);

        // Full-range ticks: largest multiple of tickSpacing inside ±887272.
        int24 MAX_TICK   = 887272;
        int24 TICK_UPPER = (MAX_TICK / tickSpacing) * tickSpacing;
        int24 TICK_LOWER = -TICK_UPPER;

        // ── 4. Sort tokens (V3 requires token0 < token1 by address) ───────
        (
            address token0,
            address token1,
            uint256 amount0Desired,
            uint256 amount1Desired
        ) = atos < WETH
            ? (atos,  WETH, atosAmount, wethAmount)
            : (WETH,  atos, wethAmount, atosAmount);

        // ── 5. Pre-flight balance checks (read-only, before broadcast) ────
        address broadcaster = msg.sender;  // set by vm.startBroadcast()

        uint256 atosBal = IERC20Min(atos).balanceOf(broadcaster);
        uint256 ethBal  = broadcaster.balance;
        uint256 wethBal = IWETH9(WETH).balanceOf(broadcaster);

        // How much ETH will we need to wrap?
        uint256 toWrap = wethBal >= wethAmount ? 0 : wethAmount - wethBal;

        // Print preflight summary
        console2.log("=== ATOS / WETH  Uniswap V3 Seed  (Sepolia) ===");
        console2.log("Broadcaster   :", broadcaster);
        console2.log("ATOS address  :", atos);
        console2.log("WETH address  :", WETH);
        console2.log("token0        :", token0, "(lower address)");
        console2.log("token1        :", token1);
        console2.log("Fee tier      :", uint256(fee), "= ", fee == 500 ? "0.05%" : fee == 3000 ? "0.30%" : "1.00%");
        console2.log("Tick lower    :", uint256(uint24(TICK_LOWER < 0 ? -TICK_LOWER : TICK_LOWER)), TICK_LOWER < 0 ? "(negative)" : "");
        console2.log("Tick upper    :", uint256(uint24(TICK_UPPER)));
        console2.log("");
        console2.log("--- Wallet balances ---");
        console2.log("ETH  (wei)    :", ethBal);
        console2.log("WETH (wei)    :", wethBal);
        console2.log("ATOS (wei)    :", atosBal);
        console2.log("");
        console2.log("--- LP amounts ---");
        console2.log("ATOS to seed  :", atosAmount, "wei");
        console2.log("WETH to seed  :", wethAmount, "wei");
        console2.log("ETH to wrap   :", toWrap, "wei");

        // Abort if not enough ATOS
        if (atosBal < atosAmount) {
            revert SeedPool__InsufficientAtos(atosBal, atosAmount);
        }

        // Abort if not enough ETH to cover both the wrap and gas headroom (0.01 ETH buffer)
        uint256 gasBuffer = 0.01 ether;
        if (ethBal < toWrap + gasBuffer) {
            revert SeedPool__InsufficientEth(ethBal, toWrap + gasBuffer);
        }

        console2.log("");
        console2.log("Pre-flight checks passed. Broadcasting...");
        console2.log("");

        // ── 6. Broadcast ──────────────────────────────────────────────────
        vm.startBroadcast();

        // Step A: wrap ETH → WETH (only the shortfall)
        if (toWrap > 0) {
            IWETH9(WETH).deposit{value: toWrap}();
            console2.log("[1/4] Wrapped ETH -> WETH (wei):", toWrap);
        } else {
            console2.log("[1/4] WETH balance sufficient, no wrap needed.");
        }

        // Step B: approve NPM for both tokens
        IERC20Min(atos).approve(NPM, atosAmount);
        IWETH9(WETH).approve(NPM, wethAmount);
        console2.log("[2/4] Approvals set on NPM for ATOS and WETH.");

        // Step C: create + initialize pool (idempotent — returns existing pool if present)
        address pool = INonfungiblePositionManager(NPM).createAndInitializePoolIfNecessary(
            token0, token1, fee, sqrtPriceX96
        );
        console2.log("[3/4] Pool address:", pool);

        // Step D: mint full-range LP position
        (uint256 tokenId, uint128 liquidity, uint256 used0, uint256 used1) =
            INonfungiblePositionManager(NPM).mint(
                INonfungiblePositionManager.MintParams({
                    token0:          token0,
                    token1:          token1,
                    fee:             fee,
                    tickLower:       TICK_LOWER,
                    tickUpper:       TICK_UPPER,
                    amount0Desired:  amount0Desired,
                    amount1Desired:  amount1Desired,
                    amount0Min:      0,   // fine on testnet; add slippage for mainnet
                    amount1Min:      0,
                    recipient:       broadcaster,
                    deadline:        block.timestamp + 1200  // 20 min window
                })
            );

        vm.stopBroadcast();

        // ── 7. Result summary ─────────────────────────────────────────────
        console2.log("[4/4] LP position minted.");
        console2.log("");
        console2.log("=== SUCCESS ===");
        console2.log("Pool address  :", pool);
        console2.log("LP token ID   :", tokenId);
        console2.log("Liquidity     :", uint256(liquidity));
        console2.log("token0 is ATOS:", token0 == atos);
        console2.log("Used token0 (wei):", used0);
        console2.log("Used token1 (wei):", used1);
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. contracts/.env  -> ATOS_POOL_SEPOLIA=", pool);
        console2.log("  2. apps/web/.env   -> NEXT_PUBLIC_DEX_POOL_ADDRESS=", pool);
        console2.log("  3. Uniswap UI -> https://app.uniswap.org/explore/pools/ethereum_sepolia/");
        console2.log("  4. Etherscan  -> https://sepolia.etherscan.io/address/");
    }
}

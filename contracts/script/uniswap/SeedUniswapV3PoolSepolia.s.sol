// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

/// @dev Minimal interfaces inline so we don't add `v3-periphery` / `v3-core` as
///      submodules just for four calls.
interface IWETH9 {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IERC20Min {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96)
        external
        payable
        returns (address pool);

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
}

/// @notice Create + seed a Uniswap V3 ATOS / WETH pool on Sepolia (chain id 11155111).
/// @dev    One transaction batch under `vm.broadcast`: optionally wrap ETH -> WETH,
///         approve the NPM, `createAndInitializePoolIfNecessary` (idempotent),
///         then `mint` a full-range LP position to the broadcaster.
///
///         Required env:
///             ATOS_SEPOLIA = 0x... (already-deployed ATOSToken on Sepolia)
///         Optional env (wei, 18 decimals):
///             UNI_ATOS_AMOUNT   default  1_000 * 1e18
///             UNI_WETH_AMOUNT   default  0.005 * 1e18
///             UNI_FEE           default  3000 (0.30%)
///
///         Run via `script/uniswap/seed-pool-sepolia.sh` or:
///             forge script script/uniswap/SeedUniswapV3PoolSepolia.s.sol:SeedUniswapV3PoolSepolia \
///                 --rpc-url sepolia --account <wallet> --broadcast
contract SeedUniswapV3PoolSepolia is Script {
    // --- Sepolia Uniswap V3 addresses --------------------------------------
    // Source: https://github.com/Uniswap/v3-periphery/blob/main/deploys.md
    address internal constant FACTORY = 0x0227628f3F023bb0B980b67D528571c95c6DaC1c;
    address internal constant NPM = 0x1238536071E1c677A632429e3655c799b22cDA52;
    address internal constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    // --- Pool parameters ---------------------------------------------------
    // Full-range ticks for fee tier 3000 (tick spacing 60).
    // -887272 / 887272 are V3's absolute min/max; clamp to multiples of 60.
    int24 internal constant TICK_LOWER = -887220;
    int24 internal constant TICK_UPPER = 887220;

    // sqrt(1) in Q64.96 fixed-point. Encodes price token1/token0 = 1.
    // Meaningless on testnet -- swaps will rebalance towards this anyway.
    uint160 internal constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    error SeedUniswapV3PoolSepolia__WrongChain(uint256 chainId);

    function run() external {
        if (block.chainid != 11155111) {
            revert SeedUniswapV3PoolSepolia__WrongChain(block.chainid);
        }

        address atos = vm.envAddress("ATOS_SEPOLIA");
        uint256 atosAmount = vm.envOr("UNI_ATOS_AMOUNT", uint256(1_000 ether));
        uint256 wethAmount = vm.envOr("UNI_WETH_AMOUNT", uint256(0.005 ether));
        uint24 fee = uint24(vm.envOr("UNI_FEE", uint256(3000)));

        address[] memory wallets = vm.getWallets();
        address recipient = wallets.length == 1 ? wallets[0] : DEFAULT_SENDER;

        // V3 requires token0 < token1 by address. Sort accordingly and swap the
        // (amount0, amount1) pair so the caller's intent maps to the correct slot.
        (address token0, address token1, uint256 amount0Desired, uint256 amount1Desired) =
            atos < WETH ? (atos, WETH, atosAmount, wethAmount) : (WETH, atos, wethAmount, atosAmount);

        console2.log("Chain id:", block.chainid);
        console2.log("Recipient:", recipient);
        console2.log("ATOS:", atos);
        console2.log("WETH:", WETH);
        console2.log("token0:", token0);
        console2.log("token1:", token1);
        console2.log("fee:", uint256(fee));
        console2.log("ATOS amount (wei):", atosAmount);
        console2.log("WETH amount (wei):", wethAmount);

        vm.startBroadcast();

        // 1. Top up WETH from broadcaster's native ETH if needed.
        uint256 wethBal = IWETH9(WETH).balanceOf(recipient);
        if (wethBal < wethAmount) {
            uint256 toWrap = wethAmount - wethBal;
            IWETH9(WETH).deposit{value: toWrap}();
            console2.log("Wrapped ETH -> WETH (wei):", toWrap);
        }

        // 2. Approve NPM as spender for both sides.
        IERC20Min(atos).approve(NPM, atosAmount);
        IWETH9(WETH).approve(NPM, wethAmount);

        // 3. Create + initialize pool (idempotent -- returns existing pool if any).
        address pool =
            INonfungiblePositionManager(NPM).createAndInitializePoolIfNecessary(token0, token1, fee, SQRT_PRICE_1_1);
        console2.log("Pool:", pool);

        // 4. Mint a full-range LP position. amountXMin = 0 is fine on testnet.
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: TICK_LOWER,
            tickUpper: TICK_UPPER,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: 0,
            amount1Min: 0,
            recipient: recipient,
            deadline: block.timestamp + 1200
        });

        (uint256 tokenId, uint128 liquidity, uint256 used0, uint256 used1) =
            INonfungiblePositionManager(NPM).mint(params);

        vm.stopBroadcast();

        console2.log("Position tokenId:", tokenId);
        console2.log("Liquidity:", uint256(liquidity));
        console2.log("Used token0 (wei):", used0);
        console2.log("Used token1 (wei):", used1);
    }
}

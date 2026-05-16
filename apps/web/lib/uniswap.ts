import { type Address, getAddress, parseAbi } from 'viem';
import { sepolia } from './chains';

/** Uniswap V3 deployments on Ethereum Sepolia (chain id 11155111). */
export const UNISWAP_V3_SEPOLIA = {
  chainId: sepolia.id,
  factory: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c' as Address,
  npm: '0x1238536071E1c677A632429e3655c799b22cDA52' as Address,
  weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14' as Address,
  /** Full-range ticks for fee tier 3000 (tick spacing 60). */
  tickLower: -887220,
  tickUpper: 887220,
  /** sqrt(1) in Q64.96 — testnet starting price. */
  sqrtPriceX96: 79228162514264337593543950336n,
} as const;

export const FEE_TIERS = [
  { fee: 500, label: '0.05%', tickSpacing: 10 },
  { fee: 3000, label: '0.30%', tickSpacing: 60 },
  { fee: 10000, label: '1.00%', tickSpacing: 200 },
] as const;

export type FeeTier = (typeof FEE_TIERS)[number]['fee'];

export const FACTORY_ABI = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
]);

export const POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function liquidity() view returns (uint128)',
]);

export const ERC20_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

export const WETH_ABI = parseAbi([
  'function deposit() payable',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]);

export const NPM_ABI = parseAbi([
  'function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) payable returns (address pool)',
  'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
]);

export function sortTokenPair(
  atos: Address,
  weth: Address,
): { token0: Address; token1: Address; atosIsToken0: boolean } {
  const a = getAddress(atos);
  const w = getAddress(weth);
  if (a < w) return { token0: a, token1: w, atosIsToken0: true };
  return { token0: w, token1: a, atosIsToken0: false };
}

export function mapAmountsToToken0Token1(
  atosIsToken0: boolean,
  atosAmount: bigint,
  wethAmount: bigint,
): { amount0Desired: bigint; amount1Desired: bigint } {
  return atosIsToken0
    ? { amount0Desired: atosAmount, amount1Desired: wethAmount }
    : { amount0Desired: wethAmount, amount1Desired: atosAmount };
}

export function uniswapPoolUrl(pool: Address, chainId: number): string {
  if (chainId === sepolia.id) {
    return `https://app.uniswap.org/explore/pools/ethereum_sepolia/${pool}`;
  }
  return `https://app.uniswap.org/explore/pools/${pool}`;
}

export function etherscanAddressUrl(address: Address, chainId: number): string {
  if (chainId === sepolia.id) {
    return `https://sepolia.etherscan.io/address/${address}`;
  }
  return `https://etherscan.io/address/${address}`;
}

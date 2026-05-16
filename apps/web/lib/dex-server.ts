import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  type Address,
  zeroAddress,
} from 'viem';
import { sepolia } from './chains';
import { priceFromSqrtX96 } from './format';
import {
  ERC20_ABI,
  FACTORY_ABI,
  FEE_TIERS,
  POOL_ABI,
  sortTokenPair,
  uniswapPoolUrl,
  UNISWAP_V3_SEPOLIA,
  type FeeTier,
} from './uniswap';

export interface DexTokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface DexPoolSnapshot {
  mocked: false;
  chainId: number;
  listed: boolean;
  pool: Address | null;
  atos: Address;
  weth: Address;
  fee: FeeTier;
  token0: DexTokenInfo;
  token1: DexTokenInfo;
  atosIsToken0: boolean;
  liquidity: string;
  sqrtPriceX96: string;
  tick: number;
  /** WETH (or token1) per 1 ATOS. */
  priceWethPerAtos: number;
  /** ATOS per 1 WETH. */
  priceAtosPerWeth: number;
  uniswapUrl: string | null;
  factory: Address;
  npm: Address;
  fetchedAt: number;
}

export interface DexPoolMocked {
  mocked: true;
  reason: string;
  symbol: string;
  fetchedAt: number;
}

export type DexPoolResponse = DexPoolSnapshot | DexPoolMocked;

function parseFeeTier(raw: string | undefined): FeeTier {
  const n = Number(raw ?? 3000);
  const match = FEE_TIERS.find((t) => t.fee === n);
  return (match?.fee ?? 3000) as FeeTier;
}

export async function fetchDexPoolSnapshot(): Promise<DexPoolResponse> {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || sepolia.id;
  const atosRaw = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim();
  const rpcUrl = process.env.NEXT_PUBLIC_ETH_RPC_URL?.trim();
  const fee = parseFeeTier(process.env.NEXT_PUBLIC_UNISWAP_FEE);
  const poolOverride = process.env.NEXT_PUBLIC_DEX_POOL_ADDRESS?.trim();

  if (chainId !== sepolia.id) {
    return mocked('Uniswap V3 liquidity flow is implemented for Sepolia only (11155111)');
  }

  if (!atosRaw || !isAddress(atosRaw)) {
    return mocked('NEXT_PUBLIC_CONTRACT_ADDRESS is not set or invalid');
  }

  const atos = atosRaw as Address;
  const { weth, factory, npm } = UNISWAP_V3_SEPOLIA;
  const { token0, token1, atosIsToken0 } = sortTokenPair(atos, weth);

  try {
    const client = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    });

    let pool: Address | null = null;

    if (poolOverride && isAddress(poolOverride)) {
      pool = poolOverride as Address;
    } else {
      const fromFactory = await client.readContract({
        address: factory,
        abi: FACTORY_ABI,
        functionName: 'getPool',
        args: [token0, token1, fee],
      });
      if (fromFactory && fromFactory !== zeroAddress) {
        pool = fromFactory as Address;
      }
    }

    if (!pool) {
      const [s0, s1, d0, d1] = await Promise.all([
        client.readContract({ address: token0, abi: ERC20_ABI, functionName: 'symbol' }),
        client.readContract({ address: token1, abi: ERC20_ABI, functionName: 'symbol' }),
        client.readContract({ address: token0, abi: ERC20_ABI, functionName: 'decimals' }),
        client.readContract({ address: token1, abi: ERC20_ABI, functionName: 'decimals' }),
      ]);

      const snapshot: DexPoolSnapshot = {
        mocked: false,
        chainId,
        listed: false,
        pool: null,
        atos,
        weth,
        fee,
        token0: { address: token0, symbol: s0, decimals: d0 },
        token1: { address: token1, symbol: s1, decimals: d1 },
        atosIsToken0,
        liquidity: '0',
        sqrtPriceX96: '0',
        tick: 0,
        priceWethPerAtos: 0,
        priceAtosPerWeth: 0,
        uniswapUrl: null,
        factory,
        npm,
        fetchedAt: Date.now(),
      };
      return snapshot;
    }

    const [slot0, liq, poolFee, t0Addr, t1Addr] = await Promise.all([
      client.readContract({ address: pool, abi: POOL_ABI, functionName: 'slot0' }),
      client.readContract({ address: pool, abi: POOL_ABI, functionName: 'liquidity' }),
      client.readContract({ address: pool, abi: POOL_ABI, functionName: 'fee' }),
      client.readContract({ address: pool, abi: POOL_ABI, functionName: 'token0' }),
      client.readContract({ address: pool, abi: POOL_ABI, functionName: 'token1' }),
    ]);

    const [d0, s0, d1, s1] = await Promise.all([
      client.readContract({ address: t0Addr, abi: ERC20_ABI, functionName: 'decimals' }),
      client.readContract({ address: t0Addr, abi: ERC20_ABI, functionName: 'symbol' }),
      client.readContract({ address: t1Addr, abi: ERC20_ABI, functionName: 'decimals' }),
      client.readContract({ address: t1Addr, abi: ERC20_ABI, functionName: 'symbol' }),
    ]);

    const sqrtPriceX96 = slot0[0];
    const tick = slot0[1];
    const priceToken1PerToken0 = priceFromSqrtX96(sqrtPriceX96, d0, d1);

    const atosOnToken0 = getAddress(atos) === getAddress(t0Addr);
    const priceWethPerAtos = atosOnToken0
      ? priceToken1PerToken0
      : priceToken1PerToken0 === 0
        ? 0
        : 1 / priceToken1PerToken0;
    const priceAtosPerWeth = priceWethPerAtos === 0 ? 0 : 1 / priceWethPerAtos;

    const snapshot: DexPoolSnapshot = {
      mocked: false,
      chainId,
      listed: liq > 0n,
      pool,
      atos,
      weth,
      fee: Number(poolFee) as FeeTier,
      token0: { address: t0Addr, symbol: s0, decimals: d0 },
      token1: { address: t1Addr, symbol: s1, decimals: d1 },
      atosIsToken0: atosOnToken0,
      liquidity: liq.toString(),
      sqrtPriceX96: sqrtPriceX96.toString(),
      tick,
      priceAtosPerWeth,
      priceWethPerAtos,
      uniswapUrl: uniswapPoolUrl(pool, chainId),
      factory,
      npm,
      fetchedAt: Date.now(),
    };
    return snapshot;
  } catch (e: unknown) {
    return mocked(e instanceof Error ? e.message : 'pool read failed');
  }
}

function mocked(reason: string): DexPoolMocked {
  return {
    mocked: true,
    reason,
    symbol: 'ATOS/WETH',
    fetchedAt: Date.now(),
  };
}

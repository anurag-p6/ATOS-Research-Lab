import { NextResponse } from 'next/server';
import { createPublicClient, http, isAddress, parseAbi } from 'viem';
import { sepolia } from '@/lib/chains';
import { priceFromSqrtX96 } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
]);

const ERC20_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

interface RealResult {
  mocked: false;
  pool: `0x${string}`;
  token0: { address: `0x${string}`; symbol: string; decimals: number };
  token1: { address: `0x${string}`; symbol: string; decimals: number };
  fee: number;
  tick: number;
  sqrtPriceX96: string;
  priceToken1PerToken0: number;
  priceToken0PerToken1: number;
  fetchedAt: number;
}

interface MockedResult {
  mocked: true;
  reason: string;
  symbol: string;
  priceToken1PerToken0: number;
  fetchedAt: number;
}

export async function GET() {
  const pool = process.env.NEXT_PUBLIC_DEX_POOL_ADDRESS?.trim();
  const rpcUrl = process.env.NEXT_PUBLIC_ETH_RPC_URL?.trim();

  if (!pool || !isAddress(pool)) {
    return mockedResponse('NEXT_PUBLIC_DEX_POOL_ADDRESS not configured');
  }

  try {
    const client = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    });

    const [slot0, token0Addr, token1Addr, fee] = await Promise.all([
      client.readContract({ address: pool, abi: POOL_ABI, functionName: 'slot0' }),
      client.readContract({ address: pool, abi: POOL_ABI, functionName: 'token0' }),
      client.readContract({ address: pool, abi: POOL_ABI, functionName: 'token1' }),
      client.readContract({ address: pool, abi: POOL_ABI, functionName: 'fee' }),
    ]);

    const [d0, s0, d1, s1] = await Promise.all([
      client.readContract({ address: token0Addr, abi: ERC20_ABI, functionName: 'decimals' }),
      client.readContract({ address: token0Addr, abi: ERC20_ABI, functionName: 'symbol' }),
      client.readContract({ address: token1Addr, abi: ERC20_ABI, functionName: 'decimals' }),
      client.readContract({ address: token1Addr, abi: ERC20_ABI, functionName: 'symbol' }),
    ]);

    const sqrtPriceX96 = slot0[0];
    const tick = slot0[1];
    const priceToken1PerToken0 = priceFromSqrtX96(sqrtPriceX96, d0, d1);
    const priceToken0PerToken1 =
      priceToken1PerToken0 === 0 ? 0 : 1 / priceToken1PerToken0;

    const result: RealResult = {
      mocked: false,
      pool,
      token0: { address: token0Addr, symbol: s0, decimals: d0 },
      token1: { address: token1Addr, symbol: s1, decimals: d1 },
      fee: Number(fee),
      tick,
      sqrtPriceX96: sqrtPriceX96.toString(),
      priceToken1PerToken0,
      priceToken0PerToken1,
      fetchedAt: Date.now(),
    };

    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : 'pool read failed';
    return mockedResponse(reason);
  }
}

function mockedResponse(reason: string) {
  // Mocked but clearly flagged. Seeded so callers see a non-static value that
  // moves gently within a band but is obviously not a real market quote.
  const base = 0.04321;
  const wobble = Math.sin(Date.now() / 60_000) * 0.0007;
  const result: MockedResult = {
    mocked: true,
    reason,
    symbol: 'ATOS/WETH',
    priceToken1PerToken0: base + wobble,
    fetchedAt: Date.now(),
  };
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}

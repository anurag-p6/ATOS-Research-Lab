import { NextResponse } from 'next/server';
import { fetchDexPoolSnapshot } from '@/lib/dex-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const snapshot = await fetchDexPoolSnapshot();

  if (snapshot.mocked) {
    const base = 0.04321;
    const wobble = Math.sin(Date.now() / 60_000) * 0.0007;
    return NextResponse.json(
      {
        mocked: true,
        reason: snapshot.reason,
        symbol: snapshot.symbol,
        priceToken1PerToken0: base + wobble,
        priceWethPerAtos: base + wobble,
        fetchedAt: snapshot.fetchedAt,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  if (!snapshot.pool) {
    return NextResponse.json(
      {
        mocked: true,
        reason: 'Pool not created yet — run liquidity flow to list on Uniswap V3',
        symbol: `${snapshot.token0.symbol}/${snapshot.token1.symbol}`,
        priceToken1PerToken0: 0,
        priceWethPerAtos: 0,
        fetchedAt: snapshot.fetchedAt,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  return NextResponse.json(
    {
      mocked: false,
      pool: snapshot.pool,
      listed: snapshot.listed,
      token0: snapshot.token0,
      token1: snapshot.token1,
      fee: snapshot.fee,
      tick: snapshot.tick,
      liquidity: snapshot.liquidity,
      sqrtPriceX96: snapshot.sqrtPriceX96,
      priceToken1PerToken0: snapshot.priceWethPerAtos,
      priceWethPerAtos: snapshot.priceWethPerAtos,
      priceAtosPerWeth: snapshot.priceAtosPerWeth,
      uniswapUrl: snapshot.uniswapUrl,
      fetchedAt: snapshot.fetchedAt,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

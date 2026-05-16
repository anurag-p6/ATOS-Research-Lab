'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import { Mono } from './ui/Mono';

interface RealPrice {
  mocked: false;
  pool: string;
  listed?: boolean;
  token0: { address: string; symbol: string; decimals: number };
  token1: { address: string; symbol: string; decimals: number };
  fee: number;
  tick: number;
  liquidity?: string;
  sqrtPriceX96: string;
  priceToken1PerToken0: number;
  priceWethPerAtos?: number;
  priceAtosPerWeth?: number;
  uniswapUrl?: string | null;
  fetchedAt: number;
}

interface MockedPrice {
  mocked: true;
  reason: string;
  symbol: string;
  priceToken1PerToken0: number;
  fetchedAt: number;
}

type PriceResponse = RealPrice | MockedPrice;

async function fetchPrice(signal: AbortSignal): Promise<PriceResponse> {
  const res = await fetch('/api/dex/price', { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`price ${res.status}`);
  return (await res.json()) as PriceResponse;
}

const HISTORY_SIZE = 20;

export function DexPriceWidget() {
  const query = useQuery({
    queryKey: ['dex-price'],
    queryFn: ({ signal }) => fetchPrice(signal),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  // Rolling history of the last N polls so we can render a sparkline.
  const [history, setHistory] = useState<number[]>([]);
  useEffect(() => {
    if (!query.data) return;
    const next = query.data.priceToken1PerToken0;
    setHistory((prev) => [...prev, next].slice(-HISTORY_SIZE));
  }, [query.data]);

  const { sparkPath, dir } = useMemo(() => spark(history), [history]);

  const symbol = query.data
    ? query.data.mocked
      ? query.data.symbol
      : `${query.data.token0.symbol}/${query.data.token1.symbol}`
    : 'ATOS/WETH';

  const price = query.data?.priceToken1PerToken0;

  return (
    <Card state="idle">
      <CardHeader
        title="DEX price"
        subtitle="Uniswap V3 slot0 readout"
        right={
          query.data?.mocked ? (
            <Badge tone="amber" title={query.data.reason}>
              <AlertTriangle size={11} aria-hidden="true" />
              MOCKED
            </Badge>
          ) : query.data && !query.data.mocked && query.data.listed === false ? (
            <Badge tone="amber">unlisted</Badge>
          ) : query.data ? (
            <Badge tone="cyan">live</Badge>
          ) : (
            <Badge tone="neutral">…</Badge>
          )
        }
      />
      <CardBody>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="atos-mono text-[11px] uppercase tracking-[0.18em] text-operator-muted">
              {symbol}
            </div>
            <div className="atos-numeric mt-1 text-2xl text-operator-text">
              {price != null ? price.toFixed(6) : '—'}
            </div>
            <div className="mt-1 text-[11px] text-operator-muted">
              {dir === 'up' ? (
                <span className="text-operator-success">
                  <TrendingUp size={11} className="mr-1 inline" aria-hidden="true" />
                  trending up
                </span>
              ) : dir === 'down' ? (
                <span className="text-operator-danger">
                  <TrendingDown size={11} className="mr-1 inline" aria-hidden="true" />
                  trending down
                </span>
              ) : (
                <span>flat</span>
              )}
            </div>
          </div>
          <svg
            viewBox="0 0 100 32"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="atos-respect-reduced-motion h-12 w-32"
          >
            <path
              d={sparkPath ?? 'M0 16 L100 16'}
              fill="none"
              stroke={
                dir === 'down' ? '#ef4444' : dir === 'up' ? '#10b981' : '#00d4ff'
              }
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        {query.data && !query.data.mocked ? (
          <div className="mt-3 space-y-1 border-t border-line pt-2 text-[11px] text-operator-muted">
            <div className="flex justify-between gap-2">
              <span>pool</span>
              <Mono value={query.data.pool} head={8} tail={6} copy />
            </div>
            <div className="flex justify-between gap-2">
              <span>fee</span>
              <span className="atos-numeric text-operator-text/85">
                {(query.data.fee / 10_000).toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>tick</span>
              <span className="atos-numeric text-operator-text/85">{query.data.tick}</span>
            </div>
            {query.data.uniswapUrl ? (
              <a
                href={query.data.uniswapUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-operator-cyan hover:underline"
              >
                Trade on Uniswap →
              </a>
            ) : null}
          </div>
        ) : query.data?.mocked ? (
          <p className="mt-3 border-t border-line pt-2 text-[11px] text-operator-muted">
            reason: <span className="atos-mono">{query.data.reason}</span>
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function spark(values: number[]): { sparkPath: string | null; dir: 'up' | 'down' | 'flat' } {
  if (values.length < 2) return { sparkPath: null, dir: 'flat' };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 100 / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = 32 - ((v - min) / span) * 32;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const sparkPath = `M${points.join(' L')}`;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const delta = last - first;
  const dir: 'up' | 'down' | 'flat' =
    Math.abs(delta) / Math.max(Math.abs(first), 1e-12) < 1e-4
      ? 'flat'
      : delta > 0
        ? 'up'
        : 'down';
  return { sparkPath, dir };
}

'use client';

import { useQuery } from '@tanstack/react-query';
import type { DexPoolResponse } from '@/lib/dex-server';

async function fetchPool(signal: AbortSignal): Promise<DexPoolResponse> {
  const res = await fetch('/api/dex/pool', { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`pool ${res.status}`);
  return (await res.json()) as DexPoolResponse;
}

export function useDexPool() {
  return useQuery({
    queryKey: ['dex-pool'],
    queryFn: ({ signal }) => fetchPool(signal),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

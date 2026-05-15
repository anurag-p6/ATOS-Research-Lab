/** Truncate a long hash/CID/peerId in the middle, preserving prefix + suffix. */
export function truncateMiddle(
  value: string | null | undefined,
  head = 6,
  tail = 4,
): string {
  if (!value) return '—';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Validate a checksummed-or-raw 0x... 20-byte hex address. */
export function isHexAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

/** Relative-time formatter ("3s ago", "12m ago", "1h 4m ago"). */
export function relativeTime(timestampMs: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  const rm = m - h * 60;
  if (h < 24) return rm === 0 ? `${h}h ago` : `${h}h ${rm}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Human-friendly uptime ("12s", "4m 02s", "1h 12m"). */
export function formatUptime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '—';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs - m * 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const rm = m - h * 60;
  return `${h}h ${rm.toString().padStart(2, '0')}m`;
}

/** Best-effort JSON parse for free-form payload textarea. */
export function tryParseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'invalid JSON' };
  }
}

/** Safely stringify any JSON-ish value with stable indentation. */
export function stableStringify(value: unknown, space = 2): string {
  try {
    return JSON.stringify(value, null, space);
  } catch {
    return String(value);
  }
}

/** Copy text to clipboard. Resolves false on failure (e.g. no permission). */
export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

/** Format a wei value coming back from a Uniswap V3 slot0 sqrtPriceX96 to a token1/token0 price. */
export function priceFromSqrtX96(
  sqrtPriceX96: bigint,
  token0Decimals = 18,
  token1Decimals = 18,
): number {
  if (sqrtPriceX96 === 0n) return 0;
  const ratio = Number(sqrtPriceX96) ** 2 / 2 ** 192;
  const decimalScale = 10 ** (token0Decimals - token1Decimals);
  return ratio * decimalScale;
}

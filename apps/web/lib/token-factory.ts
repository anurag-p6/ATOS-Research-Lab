import { type Abi, type Address } from 'viem';
import FACTORY_ABI_JSON from '@/abi/ATOSTokenFactory.json';

/** Full ABI sourced from the compiled artifact — authoritative over inline parseAbi strings. */
export const TOKEN_FACTORY_ABI = FACTORY_ABI_JSON as Abi;

/**
 * Factory contract addresses keyed by chain id.
 * Set NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_SEPOLIA and
 * NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_CALIBRATION in apps/web/.env
 */
const FACTORY_BY_CHAIN: Record<number, string | undefined> = {
  11155111: process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_SEPOLIA?.trim(),
  314159:   process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_CALIBRATION?.trim(),
};

export function factoryAddress(chainId: number): Address | undefined {
  const raw = FACTORY_BY_CHAIN[chainId];
  if (!raw || !/^0x[a-fA-F0-9]{40}$/.test(raw)) return undefined;
  return raw as Address;
}

/** Suggest a short ticker symbol from a human-readable token name. */
export function suggestSymbol(name: string): string {
  const parts = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'TKN';
  if (parts.length === 1) {
    const w = parts[0]!;
    return w.length <= 6 ? w : w.slice(0, 6);
  }
  return parts.map((w) => w[0]).join('').slice(0, 6);
}

export const DEFAULT_CAP_HUMAN = '1000000000';
export const DEFAULT_INITIAL_HUMAN = '100000000';

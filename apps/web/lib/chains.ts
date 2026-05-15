import { defineChain } from 'viem';
import { sepolia as viemSepolia } from 'viem/chains';

export const sepolia = viemSepolia;

export const filecoinCalibration = defineChain({
  id: 314159,
  name: 'Filecoin Calibration',
  nativeCurrency: { name: 'testnet FIL', symbol: 'tFIL', decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_FIL_RPC_URL ??
          'https://api.calibration.node.glif.io/rpc/v1',
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'Filfox Calibration',
      url: 'https://calibration.filfox.info/en',
    },
  },
  testnet: true,
});

export const supportedChains = [sepolia, filecoinCalibration] as const;

export type SupportedChainId = (typeof supportedChains)[number]['id'];

export function chainLabel(chainId: number): string {
  switch (chainId) {
    case sepolia.id:
      return 'Sepolia';
    case filecoinCalibration.id:
      return 'Filecoin Calibration';
    default:
      return `Chain ${chainId}`;
  }
}

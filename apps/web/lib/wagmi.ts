import { http } from 'wagmi';
import { createConfig } from '@privy-io/wagmi';
import { sepolia, filecoinCalibration } from './chains';

export const wagmiConfig = createConfig({
  chains: [sepolia, filecoinCalibration],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_ETH_RPC_URL),
    [filecoinCalibration.id]: http(process.env.NEXT_PUBLIC_FIL_RPC_URL),
  },
});

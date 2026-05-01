import { defineChain } from 'viem';

export const hemiMainnet = defineChain({
  id: 43111,
  name: 'Hemi',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.hemi.network/rpc', 'https://hemi.drpc.org'],
    },
    public: {
      http: ['https://rpc.hemi.network/rpc', 'https://hemi.drpc.org'],
    },
  },
  blockExplorers: {
    default: { name: 'Hemi Explorer', url: 'https://explorer.hemi.xyz' },
  },
});


import { http, createConfig } from 'wagmi';
import { hemiMainnet } from './networks';
import { injected, metaMask, coinbaseWallet } from 'wagmi/connectors';

export const config = createConfig({
  chains: [hemiMainnet],
  connectors: [
    injected(),
    metaMask(),
    coinbaseWallet({ appName: 'BitDEX' }),
  ],
  transports: {
    [hemiMainnet.id]: http('https://hemi.drpc.org'),
  },
});


import { http, createConfig } from 'wagmi';
import { hemiMainnet } from './networks';
import { injected, coinbaseWallet } from 'wagmi/connectors';

export const config = createConfig({
  chains: [hemiMainnet],
  ssr: true,
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'BitDEX' }),
  ],
  transports: {
    [hemiMainnet.id]: http('https://hemi.drpc.org'),
  },
});


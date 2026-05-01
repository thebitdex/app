import { http, createConfig } from 'wagmi';
import { hemiMainnet } from './networks';
import { injected } from 'wagmi/connectors';

export const config = createConfig({
  chains: [hemiMainnet],
  connectors: [
    injected(),
  ],
  transports: {
    [hemiMainnet.id]: http('https://rpc.hemi.network/rpc'),
  },
});

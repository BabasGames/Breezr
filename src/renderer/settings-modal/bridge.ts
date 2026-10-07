import type { BreezrBridge } from '../../shared/settings-types';

declare global {
  interface Window { breezr: BreezrBridge }
}

export const bridge = (): BreezrBridge => window.breezr;

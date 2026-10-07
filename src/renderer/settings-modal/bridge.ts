import type { BreezrBridge } from '../../shared/settings-types';

declare global {
  interface Window {
    breezr: BreezrBridge;
    // Exposed by the preload since upstream (activity updates, back/forward navigation).
    ipcRenderer?: { send(channel: string, payload: never[]): void };
  }
}

export const bridge = (): BreezrBridge => window.breezr;

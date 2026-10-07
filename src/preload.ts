// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipcRenderer', {
  send: (channel: string, payload: never[]) => ipcRenderer.send(channel, payload)
});

// Settings are only offered to Deezer pages (login popups share this preload); the main process checks again.
if (globalThis.location.protocol === 'https:' && /(^|\.)deezer\.com$/.test(globalThis.location.hostname)) contextBridge.exposeInMainWorld('breezr', {
  settings: {
    get: () => ipcRenderer.invoke('breezr:settings:get'),
    preview: (theme: unknown) => ipcRenderer.send('breezr:settings:preview', theme),
    save: (config: unknown) => ipcRenderer.invoke('breezr:settings:save', config),
    cancel: () => ipcRenderer.send('breezr:settings:cancel'),
    onOpen: (callback: () => void) => {
      // A page reload re-runs the modal bundle: keep a single listener.
      ipcRenderer.removeAllListeners('breezr:settings:open');
      ipcRenderer.on('breezr:settings:open', () => callback());
    },
    onSource: (callback: (update: unknown) => void) => {
      ipcRenderer.removeAllListeners('breezr:settings:source');
      ipcRenderer.on('breezr:settings:source', (_event: unknown, update: unknown) => callback(update));
    },
  },
});

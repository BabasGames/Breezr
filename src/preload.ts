// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipcRenderer', {
  send: (channel: string, payload: never[]) => ipcRenderer.send(channel, payload)
});

contextBridge.exposeInMainWorld('breezr', {
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
  },
});

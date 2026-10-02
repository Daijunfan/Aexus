const { contextBridge, ipcRenderer } = require('electron');
// An isolated, read-only workspace snapshot uses the actual desktop renderer.
contextBridge.exposeInMainWorld('native', {
  load: () => ipcRenderer.invoke('print:load'),
  api: async (_, __, id) => {
    const { workspace } = await ipcRenderer.invoke('print:load');
    return { jsonrpc: '2.0', id, result: {}, workspace, revision: workspace.revision || 0 };
  },
  save: async () => Date.now(),
  onState: () => () => {},
  onUI: () => () => {},
  onAgent: () => () => {},
  onCommand: () => () => {},
  onFlush: () => () => {},
  setTheme: () => {},
  openExternal: async () => {},
  uploadToSpace: async () => ({ url: '', name: '', folderId: null }),
  revealSpace: async () => false,
  chooseEngine: async () => null,
});

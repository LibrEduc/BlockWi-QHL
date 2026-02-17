const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('libraryDialogApi', {
  closeWindow: () => ipcRenderer.send('close-library-dialog'),
  installLibrary: (libraryName) => ipcRenderer.send('install-library', libraryName),
  onInstallLibraryDone: (callback) => {
    const handler = (_event, result) => callback(result);
    ipcRenderer.on('install-library-done', handler);
    return () => ipcRenderer.removeListener('install-library-done', handler);
  },
  getLocaleData: async () => ipcRenderer.invoke('get-current-locale-data'),
  onLocaleChange: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('locale-changed', handler);
    return () => ipcRenderer.removeListener('locale-changed', handler);
  },
});

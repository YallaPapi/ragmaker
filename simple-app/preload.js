const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  
  // File operations (for future RAG functionality)
  selectFiles: (options) => ipcRenderer.invoke('file:select', options),
  saveFile: (options) => ipcRenderer.invoke('file:save', options),
  
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  
  // Menu handlers
  onMenuAction: (callback) => {
    ipcRenderer.on('menu:new-project', callback);
    ipcRenderer.on('menu:open-project', callback);
    ipcRenderer.on('menu:index-documents', callback);
    ipcRenderer.on('menu:search', callback);
    return () => {
      ipcRenderer.removeAllListeners('menu:new-project');
      ipcRenderer.removeAllListeners('menu:open-project');
      ipcRenderer.removeAllListeners('menu:index-documents');
      ipcRenderer.removeAllListeners('menu:search');
    };
  }
});

console.log('🔒 RAGMaker Desktop Preload Script Loaded - Security Context Ready');
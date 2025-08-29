const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // System information
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  
  // Window management
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  
  // File operations
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:show-open', options),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:show-save', options),
  showMessageBox: (options) => ipcRenderer.invoke('dialog:show-message', options),
  
  // Application data
  getAppDataPath: () => ipcRenderer.invoke('app:get-app-data-path'),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  
  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  
  // RAG operations
  indexDocument: (filePath) => ipcRenderer.invoke('rag:index-document', filePath),
  searchDocuments: (query) => ipcRenderer.invoke('rag:search', query),
  getIndexedDocuments: () => ipcRenderer.invoke('rag:get-documents'),
  deleteDocument: (documentId) => ipcRenderer.invoke('rag:delete-document', documentId),
  
  // YouTube operations
  indexYouTubeChannel: (channelUrl) => ipcRenderer.invoke('youtube:index-channel', channelUrl),
  getChannels: () => ipcRenderer.invoke('youtube:get-channels'),
  
  // Event listeners
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-progress', (_event, progress) => callback(progress));
    return () => ipcRenderer.removeAllListeners('update-progress');
  },
  
  onIndexingProgress: (callback) => {
    ipcRenderer.on('indexing-progress', (_event, progress) => callback(progress));
    return () => ipcRenderer.removeAllListeners('indexing-progress');
  },
  
  onError: (callback) => {
    ipcRenderer.on('app-error', (_event, error) => callback(error));
    return () => ipcRenderer.removeAllListeners('app-error');
  },
  
  onNotification: (callback) => {
    ipcRenderer.on('notification', (_event, notification) => callback(notification));
    return () => ipcRenderer.removeAllListeners('notification');
  },
  
  // Development tools
  openDevTools: () => ipcRenderer.invoke('dev:open-dev-tools'),
  reload: () => ipcRenderer.invoke('dev:reload'),
  
  // Deep linking
  onDeepLink: (callback) => {
    ipcRenderer.on('deep-link', (_event, url) => callback(url));
    return () => ipcRenderer.removeAllListeners('deep-link');
  }
});

// Security: Remove any exposed Node.js APIs
delete window.require;
delete window.exports;
delete window.module;

// Log that preload script has been loaded
console.log('RagMaker preload script loaded');
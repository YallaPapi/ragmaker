const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  selectFiles: (options) => ipcRenderer.invoke('file:select', options),
  saveFile: (options) => ipcRenderer.invoke('file:save', options),
  
  // App operations
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  quit: () => ipcRenderer.invoke('app:quit'),
  
  // Window operations
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  
  // Menu events
  onMenuAction: (callback) => {
    const channels = [
      'menu:new-project',
      'menu:open-project',
      'menu:index-documents',
      'menu:search',
      'menu:add-youtube-channel',
      'menu:bulk-import-youtube'
    ];
    
    channels.forEach(channel => {
      ipcRenderer.on(channel, (event, data) => callback(channel, data));
    });
  },
  
  // Remove menu listeners
  removeMenuListeners: () => {
    const channels = [
      'menu:new-project',
      'menu:open-project', 
      'menu:index-documents',
      'menu:search',
      'menu:add-youtube-channel',
      'menu:bulk-import-youtube'
    ];
    
    channels.forEach(channel => {
      ipcRenderer.removeAllListeners(channel);
    });
  }
});

// Expose RAG-specific APIs
contextBridge.exposeInMainWorld('ragAPI', {
  // API base URL for frontend to connect to backend
  baseURL: '/api',
  
  // WebSocket connection for real-time updates
  createWebSocket: () => {
    return new WebSocket('ws://localhost:4001');
  },
  
  // Helper for making API requests
  request: async (endpoint, options = {}) => {
    const url = `/api${endpoint}`;
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const response = await fetch(url, { ...defaultOptions, ...options });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    
    return response.json();
  }
});

// Expose utilities for desktop integration
contextBridge.exposeInMainWorld('desktopUtils', {
  // Platform detection
  platform: process.platform,
  
  // Environment
  isDev: process.env.NODE_ENV === 'development',
  
  // Logging (for development)
  log: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Renderer]', ...args);
    }
  },
  
  error: (...args) => {
    console.error('[Renderer Error]', ...args);
  }
});

// Log that preload script loaded
console.log('✅ RAGMaker Desktop preload script loaded');
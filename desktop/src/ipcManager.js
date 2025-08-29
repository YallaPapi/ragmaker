const { ipcMain, dialog, app, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;

class IPCManager {
  constructor() {
    this.handlers = new Map();
  }

  setupHandlers({ app: appInstance, mainWindow, windowManager }) {
    this.appInstance = appInstance;
    this.mainWindow = mainWindow;
    this.windowManager = windowManager;
    
    this.registerSystemHandlers();
    this.registerWindowHandlers();
    this.registerDialogHandlers();
    this.registerRAGHandlers();
    this.registerYouTubeHandlers();
    this.registerSettingsHandlers();
    this.registerUpdaterHandlers();
    this.registerDeveloperHandlers();
  }

  registerSystemHandlers() {
    // App version and info
    ipcMain.handle('app:get-version', () => {
      return app.getVersion();
    });

    ipcMain.handle('app:get-platform', () => {
      return {
        platform: process.platform,
        arch: process.arch,
        version: process.version
      };
    });

    ipcMain.handle('app:get-app-data-path', () => {
      return app.getPath('userData');
    });

    // System paths
    ipcMain.handle('app:get-documents-path', () => {
      return app.getPath('documents');
    });

    ipcMain.handle('app:get-downloads-path', () => {
      return app.getPath('downloads');
    });
  }

  registerWindowHandlers() {
    // Window controls
    ipcMain.handle('window:minimize', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.minimize();
      }
    });

    ipcMain.handle('window:maximize', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (this.mainWindow.isMaximized()) {
          this.mainWindow.unmaximize();
        } else {
          this.mainWindow.maximize();
        }
      }
    });

    ipcMain.handle('window:close', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.close();
      }
    });

    ipcMain.handle('window:is-maximized', () => {
      return this.mainWindow && !this.mainWindow.isDestroyed() 
        ? this.mainWindow.isMaximized() 
        : false;
    });

    // Window state management
    ipcMain.handle('window:get-bounds', () => {
      return this.mainWindow && !this.mainWindow.isDestroyed() 
        ? this.mainWindow.getBounds() 
        : null;
    });

    ipcMain.handle('window:set-bounds', (event, bounds) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.setBounds(bounds);
      }
    });
  }

  registerDialogHandlers() {
    // File dialogs
    ipcMain.handle('dialog:show-open', async (event, options = {}) => {
      try {
        const defaultOptions = {
          properties: ['openFile'],
          filters: [
            { name: 'All Files', extensions: ['*'] }
          ]
        };
        
        const result = await dialog.showOpenDialog(
          this.mainWindow, 
          { ...defaultOptions, ...options }
        );
        
        return result;
      } catch (error) {
        console.error('Error in show-open dialog:', error);
        throw error;
      }
    });

    ipcMain.handle('dialog:show-save', async (event, options = {}) => {
      try {
        const result = await dialog.showSaveDialog(
          this.mainWindow, 
          options
        );
        
        return result;
      } catch (error) {
        console.error('Error in show-save dialog:', error);
        throw error;
      }
    });

    ipcMain.handle('dialog:show-message', async (event, options = {}) => {
      try {
        const result = await dialog.showMessageBox(
          this.mainWindow, 
          options
        );
        
        return result;
      } catch (error) {
        console.error('Error in show-message dialog:', error);
        throw error;
      }
    });

    // Error dialog
    ipcMain.handle('dialog:show-error', (event, title, content) => {
      dialog.showErrorBox(title, content);
    });
  }

  registerRAGHandlers() {
    // Document indexing
    ipcMain.handle('rag:index-document', async (event, filePath) => {
      try {
        // Send progress updates to renderer
        this.mainWindow.webContents.send('indexing-progress', { 
          status: 'starting', 
          file: path.basename(filePath) 
        });

        // Here you would integrate with your RAG service
        // For now, we'll simulate the process
        const result = await this.simulateDocumentIndexing(filePath);
        
        this.mainWindow.webContents.send('indexing-progress', { 
          status: 'completed', 
          file: path.basename(filePath),
          result 
        });

        return result;
      } catch (error) {
        console.error('Error indexing document:', error);
        this.mainWindow.webContents.send('indexing-progress', { 
          status: 'error', 
          file: path.basename(filePath),
          error: error.message 
        });
        throw error;
      }
    });

    // Search documents
    ipcMain.handle('rag:search', async (event, query, options = {}) => {
      try {
        // Here you would integrate with your RAG search service
        const results = await this.simulateRAGSearch(query, options);
        return results;
      } catch (error) {
        console.error('Error searching documents:', error);
        throw error;
      }
    });

    // Get indexed documents
    ipcMain.handle('rag:get-documents', async () => {
      try {
        // Here you would get documents from your RAG service
        const documents = await this.getIndexedDocuments();
        return documents;
      } catch (error) {
        console.error('Error getting documents:', error);
        throw error;
      }
    });

    // Delete document
    ipcMain.handle('rag:delete-document', async (event, documentId) => {
      try {
        // Here you would delete from your RAG service
        const result = await this.deleteDocument(documentId);
        return result;
      } catch (error) {
        console.error('Error deleting document:', error);
        throw error;
      }
    });

    // Bulk operations
    ipcMain.handle('rag:batch-index', async (event, filePaths) => {
      try {
        const results = [];
        for (const filePath of filePaths) {
          this.mainWindow.webContents.send('indexing-progress', { 
            status: 'processing', 
            file: path.basename(filePath),
            current: results.length + 1,
            total: filePaths.length
          });

          const result = await this.simulateDocumentIndexing(filePath);
          results.push({ filePath, result });
        }
        
        this.mainWindow.webContents.send('indexing-progress', { 
          status: 'batch-completed', 
          results 
        });

        return results;
      } catch (error) {
        console.error('Error in batch indexing:', error);
        throw error;
      }
    });
  }

  registerYouTubeHandlers() {
    // YouTube channel indexing
    ipcMain.handle('youtube:index-channel', async (event, channelUrl) => {
      try {
        this.mainWindow.webContents.send('indexing-progress', { 
          status: 'starting', 
          type: 'youtube',
          channel: channelUrl 
        });

        // Here you would integrate with your YouTube service
        const result = await this.simulateYouTubeIndexing(channelUrl);
        
        this.mainWindow.webContents.send('indexing-progress', { 
          status: 'completed', 
          type: 'youtube',
          channel: channelUrl,
          result 
        });

        return result;
      } catch (error) {
        console.error('Error indexing YouTube channel:', error);
        this.mainWindow.webContents.send('indexing-progress', { 
          status: 'error', 
          type: 'youtube',
          channel: channelUrl,
          error: error.message 
        });
        throw error;
      }
    });

    // Get YouTube channels
    ipcMain.handle('youtube:get-channels', async () => {
      try {
        // Here you would get channels from your YouTube service
        const channels = await this.getYouTubeChannels();
        return channels;
      } catch (error) {
        console.error('Error getting YouTube channels:', error);
        throw error;
      }
    });

    // Refresh channel
    ipcMain.handle('youtube:refresh-channel', async (event, channelId) => {
      try {
        const result = await this.refreshYouTubeChannel(channelId);
        return result;
      } catch (error) {
        console.error('Error refreshing YouTube channel:', error);
        throw error;
      }
    });
  }

  registerSettingsHandlers() {
    // Settings management
    ipcMain.handle('settings:get', async (event, key) => {
      try {
        const settings = await this.loadSettings();
        return key ? settings[key] : settings;
      } catch (error) {
        console.error('Error getting settings:', error);
        return key ? null : {};
      }
    });

    ipcMain.handle('settings:set', async (event, key, value) => {
      try {
        await this.saveSetting(key, value);
        return true;
      } catch (error) {
        console.error('Error saving setting:', error);
        throw error;
      }
    });

    ipcMain.handle('settings:reset', async () => {
      try {
        await this.resetSettings();
        return true;
      } catch (error) {
        console.error('Error resetting settings:', error);
        throw error;
      }
    });
  }

  registerUpdaterHandlers() {
    // Auto-updater
    ipcMain.handle('updater:check', () => {
      if (this.appInstance && this.appInstance.autoUpdater) {
        this.appInstance.autoUpdater.checkForUpdatesAndNotify();
      }
    });

    ipcMain.handle('updater:download', () => {
      if (this.appInstance && this.appInstance.autoUpdater) {
        this.appInstance.autoUpdater.downloadUpdate();
      }
    });

    ipcMain.handle('updater:install', () => {
      if (this.appInstance && this.appInstance.autoUpdater) {
        this.appInstance.autoUpdater.quitAndInstall();
      }
    });
  }

  registerDeveloperHandlers() {
    // Developer tools
    ipcMain.handle('dev:open-dev-tools', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.openDevTools();
      }
    });

    ipcMain.handle('dev:reload', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.reload();
      }
    });

    ipcMain.handle('dev:get-performance-metrics', async () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const metrics = await this.mainWindow.webContents.executeJavaScript(`
          JSON.stringify(performance.getEntriesByType('navigation'))
        `);
        return JSON.parse(metrics);
      }
      return null;
    });
  }

  // Simulation methods (replace with actual service integrations)
  async simulateDocumentIndexing(filePath) {
    // Simulate indexing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const stats = await fs.stat(filePath);
    return {
      id: Date.now().toString(),
      filePath,
      name: path.basename(filePath),
      size: stats.size,
      indexed: new Date(),
      chunks: Math.floor(Math.random() * 10) + 1
    };
  }

  async simulateRAGSearch(query, options) {
    // Simulate search delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      query,
      results: [
        {
          id: '1',
          score: 0.95,
          content: `Sample result for "${query}"`,
          source: 'document1.pdf',
          page: 1
        },
        {
          id: '2',
          score: 0.88,
          content: `Another relevant result for "${query}"`,
          source: 'document2.pdf',
          page: 3
        }
      ],
      totalResults: 2,
      processingTime: 0.5
    };
  }

  async simulateYouTubeIndexing(channelUrl) {
    // Simulate YouTube indexing delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      id: Date.now().toString(),
      channelUrl,
      name: 'Sample Channel',
      videosIndexed: Math.floor(Math.random() * 100) + 10,
      indexed: new Date()
    };
  }

  async getIndexedDocuments() {
    // Return sample documents
    return [
      {
        id: '1',
        name: 'Sample Document 1.pdf',
        size: 1024000,
        indexed: new Date(),
        chunks: 5
      },
      {
        id: '2',
        name: 'Sample Document 2.pdf',
        size: 2048000,
        indexed: new Date(),
        chunks: 8
      }
    ];
  }

  async getYouTubeChannels() {
    // Return sample channels
    return [
      {
        id: '1',
        name: 'Sample Channel 1',
        url: 'https://youtube.com/@sample1',
        videosCount: 25,
        lastUpdate: new Date()
      },
      {
        id: '2',
        name: 'Sample Channel 2',
        url: 'https://youtube.com/@sample2',
        videosCount: 42,
        lastUpdate: new Date()
      }
    ];
  }

  async deleteDocument(documentId) {
    // Simulate deletion
    return { success: true, deletedId: documentId };
  }

  async refreshYouTubeChannel(channelId) {
    // Simulate refresh
    return { 
      success: true, 
      channelId, 
      newVideos: Math.floor(Math.random() * 5),
      lastUpdate: new Date() 
    };
  }

  async loadSettings() {
    try {
      const settingsPath = path.join(app.getPath('userData'), 'settings.json');
      const settingsData = await fs.readFile(settingsPath, 'utf8');
      return JSON.parse(settingsData);
    } catch (error) {
      // Return default settings if file doesn't exist
      return {
        theme: 'light',
        autoIndex: false,
        maxResults: 50,
        chunkSize: 1000
      };
    }
  }

  async saveSetting(key, value) {
    try {
      const settings = await this.loadSettings();
      settings[key] = value;
      
      const settingsPath = path.join(app.getPath('userData'), 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    } catch (error) {
      console.error('Error saving setting:', error);
      throw error;
    }
  }

  async resetSettings() {
    try {
      const settingsPath = path.join(app.getPath('userData'), 'settings.json');
      await fs.unlink(settingsPath);
    } catch (error) {
      // File might not exist, which is fine
      console.log('Settings file not found, using defaults');
    }
  }

  // Cleanup method
  removeAllHandlers() {
    ipcMain.removeAllListeners();
  }
}

module.exports = { IPCManager };
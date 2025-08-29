const { ipcMain } = require('electron');
const { YouTubeServices } = require('./index');

/**
 * IPC Handlers for YouTube Services
 * Provides secure communication between renderer and main process for YouTube operations
 */
class YouTubeIPCHandlers {
  constructor(options = {}) {
    this.youtubeServices = null;
    this.config = options;
    
    // Track active operations for cleanup
    this.activeOperations = new Set();
  }

  /**
   * Register all IPC handlers
   */
  registerHandlers() {
    console.log('Registering YouTube IPC handlers...');

    // Service management
    ipcMain.handle('youtube:initialize', this.handleInitialize.bind(this));
    ipcMain.handle('youtube:getStatus', this.handleGetStatus.bind(this));
    ipcMain.handle('youtube:cleanup', this.handleCleanup.bind(this));

    // Channel operations
    ipcMain.handle('youtube:addChannel', this.handleAddChannel.bind(this));
    ipcMain.handle('youtube:getChannel', this.handleGetChannel.bind(this));
    ipcMain.handle('youtube:getAllChannels', this.handleGetAllChannels.bind(this));
    ipcMain.handle('youtube:removeChannel', this.handleRemoveChannel.bind(this));
    ipcMain.handle('youtube:getChannelStats', this.handleGetChannelStats.bind(this));

    // Video operations
    ipcMain.handle('youtube:getChannelVideos', this.handleGetChannelVideos.bind(this));
    ipcMain.handle('youtube:getVideoTranscript', this.handleGetVideoTranscript.bind(this));
    ipcMain.handle('youtube:getVideoMetadata', this.handleGetVideoMetadata.bind(this));

    // Bulk operations
    ipcMain.handle('youtube:bulkImportChannels', this.handleBulkImportChannels.bind(this));
    ipcMain.handle('youtube:getOperationStatus', this.handleGetOperationStatus.bind(this));
    ipcMain.handle('youtube:cancelOperation', this.handleCancelOperation.bind(this));
    ipcMain.handle('youtube:retryFailedChannels', this.handleRetryFailedChannels.bind(this));

    // Cache operations
    ipcMain.handle('youtube:clearCache', this.handleClearCache.bind(this));
    ipcMain.handle('youtube:getCacheStats', this.handleGetCacheStats.bind(this));

    // Statistics
    ipcMain.handle('youtube:getQuotaStatus', this.handleGetQuotaStatus.bind(this));
    ipcMain.handle('youtube:getOverallStats', this.handleGetOverallStats.bind(this));

    // Export/Import
    ipcMain.handle('youtube:exportChannels', this.handleExportChannels.bind(this));
    ipcMain.handle('youtube:importChannels', this.handleImportChannels.bind(this));

    console.log('YouTube IPC handlers registered successfully');
  }

  /**
   * Initialize YouTube services
   */
  async handleInitialize(event, config = {}) {
    try {
      if (this.youtubeServices && this.youtubeServices.initialized) {
        return {
          success: true,
          message: 'YouTube services already initialized'
        };
      }

      this.youtubeServices = new YouTubeServices({ ...this.config, ...config });
      await this.youtubeServices.initialize();

      // Setup event forwarding to renderer
      this.setupEventForwarding(event.sender);

      return {
        success: true,
        message: 'YouTube services initialized successfully'
      };

    } catch (error) {
      console.error('Error initializing YouTube services:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get service status
   */
  async handleGetStatus(event) {
    try {
      if (!this.youtubeServices) {
        return {
          success: false,
          error: 'YouTube services not initialized'
        };
      }

      const status = await this.youtubeServices.getStatus();
      return {
        success: true,
        data: status
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add a channel
   */
  async handleAddChannel(event, { channelIdentifier, projectId = null }) {
    try {
      this.ensureInitialized();
      
      const result = await this.youtubeServices.addChannel(channelIdentifier, projectId);
      
      return {
        success: true,
        data: result
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get channel information
   */
  async handleGetChannel(event, { channelId }) {
    try {
      this.ensureInitialized();
      
      const channel = await this.youtubeServices.getChannel(channelId);
      
      return {
        success: true,
        data: channel
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get all channels
   */
  async handleGetAllChannels(event, { projectId = null } = {}) {
    try {
      this.ensureInitialized();
      
      const channels = await this.youtubeServices.getAllChannels(projectId);
      
      return {
        success: true,
        data: channels
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove a channel
   */
  async handleRemoveChannel(event, { channelId }) {
    try {
      this.ensureInitialized();
      
      const result = await this.youtubeServices.removeChannel(channelId);
      
      return {
        success: true,
        data: { removed: result }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get channel videos
   */
  async handleGetChannelVideos(event, { channelId, options = {} }) {
    try {
      this.ensureInitialized();
      
      const result = await this.youtubeServices.getChannelVideos(channelId, options);
      
      return {
        success: true,
        data: result
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get video transcript
   */
  async handleGetVideoTranscript(event, { videoId }) {
    try {
      this.ensureInitialized();
      
      const result = await this.youtubeServices.getVideoTranscript(videoId);
      
      return {
        success: true,
        data: result
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get video metadata
   */
  async handleGetVideoMetadata(event, { videoIds }) {
    try {
      this.ensureInitialized();
      
      const result = await this.youtubeServices.getVideoMetadata(videoIds);
      
      return {
        success: true,
        data: result
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Bulk import channels
   */
  async handleBulkImportChannels(event, { channelIdentifiers, options = {} }) {
    try {
      this.ensureInitialized();
      
      // Setup progress forwarding
      const progressOptions = {
        ...options,
        onChannelProgress: (progress) => {
          event.sender.send('youtube:channelProgress', progress);
        },
        onOverallProgress: (progress) => {
          event.sender.send('youtube:overallProgress', progress);
        }
      };
      
      const result = await this.youtubeServices.bulkImportChannels(
        channelIdentifiers, 
        progressOptions
      );
      
      // Track operation
      if (result.operationId) {
        this.activeOperations.add(result.operationId);
      }
      
      return {
        success: true,
        data: result
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get operation status
   */
  async handleGetOperationStatus(event, { operationId }) {
    try {
      this.ensureInitialized();
      
      const status = this.youtubeServices.getOperationStatus(operationId);
      
      return {
        success: true,
        data: status
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Cancel operation
   */
  async handleCancelOperation(event, { operationId }) {
    try {
      this.ensureInitialized();
      
      const result = await this.youtubeServices.cancelOperation(operationId);
      
      if (result) {
        this.activeOperations.delete(operationId);
      }
      
      return {
        success: true,
        data: { cancelled: result }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Retry failed channels
   */
  async handleRetryFailedChannels(event, { operationId, options = {} }) {
    try {
      this.ensureInitialized();
      
      const result = await this.youtubeServices.retryFailedChannels(operationId, options);
      
      return {
        success: true,
        data: result
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clear cache
   */
  async handleClearCache(event) {
    try {
      this.ensureInitialized();
      
      await this.youtubeServices.clearCache();
      
      return {
        success: true,
        message: 'Cache cleared successfully'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get cache stats
   */
  async handleGetCacheStats(event) {
    try {
      this.ensureInitialized();
      
      const stats = await this.youtubeServices.getCacheStats();
      
      return {
        success: true,
        data: stats
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get quota status
   */
  async handleGetQuotaStatus(event) {
    try {
      this.ensureInitialized();
      
      const status = await this.youtubeServices.getQuotaStatus();
      
      return {
        success: true,
        data: status
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get channel statistics
   */
  async handleGetChannelStats(event, { channelId }) {
    try {
      this.ensureInitialized();
      
      const stats = await this.youtubeServices.getChannelStats(channelId);
      
      return {
        success: true,
        data: stats
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get overall statistics
   */
  async handleGetOverallStats(event) {
    try {
      this.ensureInitialized();
      
      const stats = await this.youtubeServices.getOverallStats();
      
      return {
        success: true,
        data: stats
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export channels
   */
  async handleExportChannels(event, { filePath, projectId = null }) {
    try {
      this.ensureInitialized();
      
      const result = await this.youtubeServices.exportChannels(filePath, projectId);
      
      return {
        success: true,
        data: result
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Import channels
   */
  async handleImportChannels(event, { filePath, projectId = null }) {
    try {
      this.ensureInitialized();
      
      const result = await this.youtubeServices.importChannels(filePath, projectId);
      
      return {
        success: true,
        data: result
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Cleanup services
   */
  async handleCleanup(event) {
    try {
      if (this.youtubeServices) {
        await this.youtubeServices.cleanup();
        this.youtubeServices = null;
      }
      
      this.activeOperations.clear();
      
      return {
        success: true,
        message: 'YouTube services cleaned up'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Setup event forwarding from services to renderer
   */
  setupEventForwarding(webContents) {
    if (!this.youtubeServices) return;

    // Quota events
    this.youtubeServices.onQuotaWarning((data) => {
      webContents.send('youtube:quotaWarning', data);
    });

    this.youtubeServices.onQuotaCritical((data) => {
      webContents.send('youtube:quotaCritical', data);
    });

    this.youtubeServices.onQuotaExhausted((data) => {
      webContents.send('youtube:quotaExhausted', data);
    });

    // Bulk operation events
    this.youtubeServices.onBulkImportCompleted((data) => {
      webContents.send('youtube:bulkImportCompleted', data);
    });
  }

  /**
   * Ensure services are initialized
   */
  ensureInitialized() {
    if (!this.youtubeServices || !this.youtubeServices.initialized) {
      throw new Error('YouTube services not initialized. Call youtube:initialize first.');
    }
  }

  /**
   * Cleanup all handlers
   */
  cleanup() {
    console.log('Cleaning up YouTube IPC handlers...');
    
    // Remove all IPC handlers
    const handlers = [
      'youtube:initialize',
      'youtube:getStatus',
      'youtube:cleanup',
      'youtube:addChannel',
      'youtube:getChannel',
      'youtube:getAllChannels',
      'youtube:removeChannel',
      'youtube:getChannelStats',
      'youtube:getChannelVideos',
      'youtube:getVideoTranscript',
      'youtube:getVideoMetadata',
      'youtube:bulkImportChannels',
      'youtube:getOperationStatus',
      'youtube:cancelOperation',
      'youtube:retryFailedChannels',
      'youtube:clearCache',
      'youtube:getCacheStats',
      'youtube:getQuotaStatus',
      'youtube:getOverallStats',
      'youtube:exportChannels',
      'youtube:importChannels'
    ];

    handlers.forEach(handler => {
      ipcMain.removeHandler(handler);
    });

    // Cleanup services
    if (this.youtubeServices) {
      this.youtubeServices.cleanup();
      this.youtubeServices = null;
    }

    this.activeOperations.clear();
    
    console.log('YouTube IPC handlers cleaned up');
  }
}

module.exports = YouTubeIPCHandlers;
/**
 * YouTube Services for Desktop Application
 * Local implementation of YouTube integration with caching and storage
 */

const YouTubeService = require('./youtubeService');
const YouTubeRateLimiter = require('./youtubeRateLimiter');
const YouTubeCache = require('./youtubeCache');
const ChannelManager = require('./channelManager');
const BulkOperations = require('./bulkOperations');

/**
 * YouTube Services Manager
 * Coordinates all YouTube-related services for the desktop application
 */
class YouTubeServices {
  constructor(config = {}) {
    this.config = {
      youtube: {
        apiKey: config.apiKey,
        rateLimiting: config.rateLimiting || {},
        cache: config.cache || {}
      },
      channels: config.channels || {},
      bulk: config.bulk || {},
      ...config
    };

    // Initialize services
    this.youtubeService = new YouTubeService(this.config.youtube);
    this.rateLimiter = this.youtubeService.rateLimiter;
    this.cache = this.youtubeService.cache;
    this.channelManager = new ChannelManager(this.config.channels);
    this.bulkOperations = new BulkOperations({
      ...this.config.bulk,
      youtubeService: this.youtubeService,
      channelManager: this.channelManager
    });

    this.initialized = false;
  }

  /**
   * Initialize all YouTube services
   */
  async initialize() {
    if (this.initialized) return;

    try {
      console.log('Initializing YouTube services...');

      await Promise.all([
        this.youtubeService.initialize(),
        this.channelManager.initialize(),
        this.bulkOperations.initialize()
      ]);

      this.initialized = true;
      console.log('YouTube services initialized successfully');

      return {
        success: true,
        services: {
          youtube: true,
          rateLimiter: true,
          cache: true,
          channelManager: true,
          bulkOperations: true
        }
      };

    } catch (error) {
      console.error('Failed to initialize YouTube services:', error);
      throw error;
    }
  }

  /**
   * Get service status for monitoring
   */
  async getStatus() {
    const status = {
      initialized: this.initialized,
      timestamp: new Date().toISOString()
    };

    if (this.initialized) {
      try {
        const [quotaStatus, cacheStats, channelStats] = await Promise.all([
          this.rateLimiter.getStatus(),
          this.cache.getStats(),
          this.channelManager.getOverallStats()
        ]);

        status.quota = quotaStatus;
        status.cache = cacheStats;
        status.channels = channelStats;
        status.activeOperations = this.bulkOperations.getActiveOperations();

      } catch (error) {
        status.error = error.message;
      }
    }

    return status;
  }

  /**
   * Channel operations
   */
  async addChannel(channelIdentifier, projectId = null) {
    const channelId = await this.youtubeService.resolveChannelId(channelIdentifier);
    const channelInfo = await this.youtubeService.getChannelInfo(channelId);
    return await this.channelManager.addChannel(channelId, channelInfo, projectId);
  }

  async getChannel(channelId) {
    return this.channelManager.getChannel(channelId);
  }

  async getAllChannels(projectId = null) {
    return this.channelManager.getAllChannels(projectId);
  }

  async removeChannel(channelId) {
    return await this.channelManager.removeChannel(channelId);
  }

  /**
   * Video operations
   */
  async getChannelVideos(channelId, options = {}) {
    return await this.youtubeService.getAllChannelVideos(channelId, options);
  }

  async getVideoTranscript(videoId) {
    return await this.youtubeService.getVideoTranscript(videoId);
  }

  async getVideoMetadata(videoIds) {
    return await this.youtubeService.getVideoMetadata(videoIds);
  }

  /**
   * Bulk operations
   */
  async bulkImportChannels(channelIdentifiers, options = {}) {
    return await this.bulkOperations.bulkImportChannels(channelIdentifiers, options);
  }

  async getOperationStatus(operationId) {
    return this.bulkOperations.getOperationStatus(operationId);
  }

  async cancelOperation(operationId) {
    return await this.bulkOperations.cancelOperation(operationId);
  }

  async retryFailedChannels(operationId, options = {}) {
    return await this.bulkOperations.retryFailedChannels(operationId, options);
  }

  /**
   * Cache operations
   */
  async clearCache() {
    await this.cache.clear();
  }

  async getCacheStats() {
    return await this.cache.getStats();
  }

  /**
   * Export/Import operations
   */
  async exportChannels(filePath, projectId = null) {
    return await this.channelManager.exportChannels(filePath, projectId);
  }

  async importChannels(filePath, projectId = null) {
    return await this.channelManager.importChannels(filePath, projectId);
  }

  /**
   * Statistics and monitoring
   */
  async getQuotaStatus() {
    return this.rateLimiter.getStatus();
  }

  async getChannelStats(channelId) {
    return this.channelManager.getChannelStats(channelId);
  }

  async getOverallStats() {
    return this.channelManager.getOverallStats();
  }

  /**
   * Event forwarding for UI integration
   */
  onQuotaWarning(callback) {
    this.youtubeService.on('quotaWarning', callback);
  }

  onQuotaCritical(callback) {
    this.youtubeService.on('quotaCritical', callback);
  }

  onQuotaExhausted(callback) {
    this.youtubeService.on('quotaExhausted', callback);
  }

  onChannelProgress(callback) {
    this.bulkOperations.on('channelProgress', callback);
  }

  onOverallProgress(callback) {
    this.bulkOperations.on('overallProgress', callback);
  }

  onBulkImportCompleted(callback) {
    this.bulkOperations.on('bulkImportCompleted', callback);
  }

  /**
   * Cleanup all services
   */
  async cleanup() {
    try {
      await Promise.all([
        this.youtubeService.cleanup(),
        this.channelManager.cleanup(),
        this.bulkOperations.cleanup()
      ]);

      console.log('YouTube services cleaned up');
    } catch (error) {
      console.error('Error during YouTube services cleanup:', error);
    }
  }
}

// Export individual services for direct use if needed
module.exports = {
  YouTubeServices,
  YouTubeService,
  YouTubeRateLimiter,
  YouTubeCache,
  ChannelManager,
  BulkOperations
};
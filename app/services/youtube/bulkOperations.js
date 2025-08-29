const { EventEmitter } = require('events');
const YouTubeService = require('./youtubeService');
const ChannelManager = require('./channelManager');

/**
 * Bulk YouTube Operations Service
 * Handles bulk channel imports and video processing with progress tracking
 */
class BulkOperations extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.youtubeService = options.youtubeService || new YouTubeService(options.youtube);
    this.channelManager = options.channelManager || new ChannelManager(options.channels);
    
    this.config = {
      batchSize: options.batchSize || 10,
      concurrency: options.concurrency || 3,
      retryAttempts: options.retryAttempts || 2,
      retryDelay: options.retryDelay || 5000,
      progressInterval: options.progressInterval || 1000,
      ...options
    };
    
    // Active operations tracking
    this.activeOperations = new Map();
    this.operationCounter = 0;
  }

  /**
   * Initialize bulk operations service
   */
  async initialize() {
    await Promise.all([
      this.youtubeService.initialize(),
      this.channelManager.initialize()
    ]);
    
    this.emit('initialized');
    console.log('Bulk operations service initialized');
  }

  /**
   * Bulk import channels by identifiers
   */
  async bulkImportChannels(channelIdentifiers, options = {}) {
    const operationId = `bulk-import-${++this.operationCounter}`;
    const {
      projectId = null,
      excludeShorts = false,
      videoLimit = null,
      onChannelProgress = null,
      onOverallProgress = null
    } = options;

    const operation = {
      id: operationId,
      type: 'bulk-import',
      startedAt: new Date(),
      totalChannels: channelIdentifiers.length,
      processedChannels: 0,
      successfulChannels: 0,
      failedChannels: 0,
      totalVideos: 0,
      processedVideos: 0,
      successfulVideos: 0,
      failedVideos: 0,
      status: 'running',
      results: {
        channels: [],
        errors: [],
        summary: {}
      }
    };

    this.activeOperations.set(operationId, operation);

    try {
      this.emit('bulkImportStarted', { operationId, operation });

      // Process channels in batches
      const batches = this.createBatches(channelIdentifiers, this.config.batchSize);
      
      for (const batch of batches) {
        await this.processBatch(batch, {
          operationId,
          projectId,
          excludeShorts,
          videoLimit,
          onChannelProgress,
          onOverallProgress
        });
      }

      operation.status = 'completed';
      operation.completedAt = new Date();
      operation.duration = operation.completedAt - operation.startedAt;

      // Generate final summary
      operation.results.summary = {
        totalChannels: operation.totalChannels,
        successfulChannels: operation.successfulChannels,
        failedChannels: operation.failedChannels,
        totalVideos: operation.totalVideos,
        successfulVideos: operation.successfulVideos,
        failedVideos: operation.failedVideos,
        successRate: ((operation.successfulChannels / operation.totalChannels) * 100).toFixed(1),
        duration: this.formatDuration(operation.duration)
      };

      this.emit('bulkImportCompleted', { operationId, operation });

      return {
        operationId,
        ...operation.results
      };

    } catch (error) {
      operation.status = 'error';
      operation.error = error.message;
      operation.completedAt = new Date();

      this.emit('bulkImportError', { operationId, error });
      throw error;

    } finally {
      // Keep operation in memory for a while for status queries
      setTimeout(() => {
        this.activeOperations.delete(operationId);
      }, 5 * 60 * 1000); // 5 minutes
    }
  }

  /**
   * Process a batch of channels
   */
  async processBatch(channelIdentifiers, options) {
    const {
      operationId,
      projectId,
      excludeShorts,
      videoLimit,
      onChannelProgress,
      onOverallProgress
    } = options;

    const operation = this.activeOperations.get(operationId);
    const promises = [];

    // Process channels with limited concurrency
    const semaphore = new Semaphore(this.config.concurrency);

    for (const channelIdentifier of channelIdentifiers) {
      const promise = semaphore.acquire().then(async (release) => {
        try {
          await this.processChannel(channelIdentifier, {
            operationId,
            projectId,
            excludeShorts,
            videoLimit,
            onChannelProgress,
            onOverallProgress
          });
        } finally {
          release();
        }
      });

      promises.push(promise);
    }

    await Promise.allSettled(promises);
  }

  /**
   * Process a single channel
   */
  async processChannel(channelIdentifier, options) {
    const {
      operationId,
      projectId,
      excludeShorts,
      videoLimit,
      onChannelProgress,
      onOverallProgress
    } = options;

    const operation = this.activeOperations.get(operationId);
    let channelResult = null;

    try {
      this.emit('channelProcessingStarted', { operationId, channelIdentifier });

      // Get channel information
      const channelId = await this.youtubeService.resolveChannelId(channelIdentifier);
      const channelInfo = await this.youtubeService.getChannelInfo(channelId);

      channelResult = {
        identifier: channelIdentifier,
        channelId,
        channelInfo,
        startedAt: new Date(),
        status: 'processing',
        videos: {
          total: 0,
          processed: 0,
          successful: 0,
          failed: 0,
          transcripts: []
        }
      };

      // Add channel to manager
      await this.channelManager.addChannel(channelId, channelInfo, projectId);
      await this.channelManager.updateIndexingProgress(channelId, {
        status: 'indexing',
        totalVideos: channelInfo.videoCount || 0,
        processedVideos: 0,
        successfulVideos: 0,
        failedVideos: 0
      });

      // Get existing indexed videos to avoid duplicates
      const existingVideos = this.channelManager.getIndexedVideos(channelId);
      
      // Get channel transcripts
      const transcriptOptions = {
        excludeShorts,
        limit: videoLimit,
        skipExisting: existingVideos,
        onProgress: (progress) => {
          channelResult.videos = {
            ...channelResult.videos,
            ...progress
          };

          // Update channel progress in manager
          this.channelManager.updateIndexingProgress(channelId, {
            processedVideos: progress.processed || 0,
            successfulVideos: progress.successful || 0,
            failedVideos: progress.failed || 0
          });

          if (onChannelProgress) {
            onChannelProgress({
              operationId,
              channelIdentifier,
              channelId,
              progress: channelResult.videos
            });
          }

          this.emit('channelProgress', {
            operationId,
            channelIdentifier,
            channelId,
            progress: channelResult.videos
          });
        }
      };

      const transcriptResult = await this.youtubeService.getChannelTranscripts(
        channelId,
        transcriptOptions
      );

      // Update results
      channelResult.videos = {
        total: transcriptResult.totalVideos,
        processed: transcriptResult.processedVideos,
        successful: transcriptResult.transcripts.length,
        failed: transcriptResult.failed.length,
        transcripts: transcriptResult.transcripts,
        failures: transcriptResult.failed
      };

      // Add indexed videos to channel manager
      const videoIds = transcriptResult.transcripts.map(t => t.videoId);
      await this.channelManager.addIndexedVideos(channelId, videoIds, {
        channelName: channelInfo.name
      });

      // Update final channel progress
      await this.channelManager.updateIndexingProgress(channelId, {
        status: 'completed',
        processedVideos: channelResult.videos.processed,
        successfulVideos: channelResult.videos.successful,
        failedVideos: channelResult.videos.failed
      });

      channelResult.status = 'completed';
      channelResult.completedAt = new Date();
      channelResult.duration = channelResult.completedAt - channelResult.startedAt;

      // Update operation stats
      operation.successfulChannels++;
      operation.totalVideos += channelResult.videos.total;
      operation.processedVideos += channelResult.videos.processed;
      operation.successfulVideos += channelResult.videos.successful;
      operation.failedVideos += channelResult.videos.failed;

      operation.results.channels.push(channelResult);

      this.emit('channelProcessingCompleted', {
        operationId,
        channelIdentifier,
        channelId,
        result: channelResult
      });

    } catch (error) {
      console.error(`Error processing channel ${channelIdentifier}:`, error);

      if (channelResult) {
        channelResult.status = 'error';
        channelResult.error = error.message;
        channelResult.completedAt = new Date();

        // Update channel manager with error status
        if (channelResult.channelId) {
          await this.channelManager.updateIndexingProgress(channelResult.channelId, {
            status: 'error',
            lastError: error.message
          });
        }
      }

      operation.failedChannels++;
      operation.results.errors.push({
        identifier: channelIdentifier,
        channelId: channelResult?.channelId,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      this.emit('channelProcessingError', {
        operationId,
        channelIdentifier,
        error
      });
    } finally {
      operation.processedChannels++;

      if (onOverallProgress) {
        onOverallProgress({
          operationId,
          processed: operation.processedChannels,
          total: operation.totalChannels,
          successful: operation.successfulChannels,
          failed: operation.failedChannels,
          progress: (operation.processedChannels / operation.totalChannels) * 100
        });
      }

      this.emit('overallProgress', {
        operationId,
        processed: operation.processedChannels,
        total: operation.totalChannels,
        successful: operation.successfulChannels,
        failed: operation.failedChannels
      });
    }
  }

  /**
   * Re-index failed channels from a previous operation
   */
  async retryFailedChannels(operationId, options = {}) {
    const previousOperation = this.activeOperations.get(operationId);
    if (!previousOperation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const failedChannels = previousOperation.results.errors.map(error => error.identifier);
    if (failedChannels.length === 0) {
      return { message: 'No failed channels to retry' };
    }

    console.log(`Retrying ${failedChannels.length} failed channels from operation ${operationId}`);

    return await this.bulkImportChannels(failedChannels, {
      ...options,
      retryOf: operationId
    });
  }

  /**
   * Get operation status
   */
  getOperationStatus(operationId) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      return null;
    }

    return {
      id: operation.id,
      type: operation.type,
      status: operation.status,
      startedAt: operation.startedAt,
      completedAt: operation.completedAt,
      duration: operation.completedAt 
        ? operation.completedAt - operation.startedAt
        : Date.now() - operation.startedAt,
      progress: {
        channels: {
          total: operation.totalChannels,
          processed: operation.processedChannels,
          successful: operation.successfulChannels,
          failed: operation.failedChannels,
          percentage: operation.totalChannels > 0 
            ? ((operation.processedChannels / operation.totalChannels) * 100).toFixed(1)
            : 0
        },
        videos: {
          total: operation.totalVideos,
          processed: operation.processedVideos,
          successful: operation.successfulVideos,
          failed: operation.failedVideos,
          percentage: operation.totalVideos > 0
            ? ((operation.processedVideos / operation.totalVideos) * 100).toFixed(1)
            : 0
        }
      },
      error: operation.error
    };
  }

  /**
   * Cancel an active operation
   */
  async cancelOperation(operationId) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      return false;
    }

    operation.status = 'cancelled';
    operation.completedAt = new Date();

    this.emit('operationCancelled', { operationId });

    return true;
  }

  /**
   * Get all active operations
   */
  getActiveOperations() {
    return Array.from(this.activeOperations.values()).map(op => ({
      id: op.id,
      type: op.type,
      status: op.status,
      startedAt: op.startedAt,
      totalChannels: op.totalChannels,
      processedChannels: op.processedChannels,
      progress: op.totalChannels > 0 
        ? ((op.processedChannels / op.totalChannels) * 100).toFixed(1)
        : 0
    }));
  }

  /**
   * Create batches from array
   */
  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Format duration in human readable format
   */
  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      // Cancel all active operations
      for (const [operationId] of this.activeOperations) {
        await this.cancelOperation(operationId);
      }

      this.activeOperations.clear();
      this.removeAllListeners();

      console.log('Bulk operations service cleaned up');
    } catch (error) {
      console.error('Error during bulk operations cleanup:', error);
    }
  }
}

/**
 * Simple semaphore for concurrency control
 */
class Semaphore {
  constructor(count) {
    this.count = count;
    this.waiting = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.count > 0) {
        this.count--;
        resolve(() => this.release());
      } else {
        this.waiting.push(resolve);
      }
    });
  }

  release() {
    this.count++;
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift();
      this.count--;
      resolve(() => this.release());
    }
  }
}

module.exports = BulkOperations;
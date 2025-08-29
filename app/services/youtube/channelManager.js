const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

/**
 * Local Channel Manager for Desktop Application
 * Manages YouTube channel subscriptions and metadata storage
 */
class ChannelManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      dataFile: options.dataFile || path.join(process.cwd(), 'app', 'data', 'channels.json'),
      backupFile: options.backupFile || path.join(process.cwd(), 'app', 'data', 'channels.backup.json'),
      autoBackup: options.autoBackup !== false,
      backupInterval: options.backupInterval || 6 * 60 * 60 * 1000, // 6 hours
      maxBackups: options.maxBackups || 10,
      ...options
    };
    
    this.channels = {};
    this.initialized = false;
    this.backupTimer = null;
    
    // Statistics
    this.stats = {
      totalChannels: 0,
      totalVideos: 0,
      totalIndexed: 0,
      lastUpdate: null,
      lastBackup: null
    };
  }

  /**
   * Initialize the channel manager
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      await this.loadChannels();
      
      if (this.config.autoBackup) {
        this.setupAutoBackup();
      }
      
      this.initialized = true;
      this.emit('initialized');
      
      console.log(`Channel manager initialized with ${this.stats.totalChannels} channels`);
    } catch (error) {
      console.error('Failed to initialize channel manager:', error);
      throw error;
    }
  }

  /**
   * Load channels from file
   */
  async loadChannels() {
    try {
      // Ensure data directory exists
      const dir = path.dirname(this.config.dataFile);
      await fs.mkdir(dir, { recursive: true });
      
      const data = await fs.readFile(this.config.dataFile, 'utf8');
      const parsed = JSON.parse(data);
      
      this.channels = parsed.channels || {};
      this.stats = {
        ...this.stats,
        ...parsed.stats,
        lastUpdate: parsed.stats?.lastUpdate ? new Date(parsed.stats.lastUpdate) : null,
        lastBackup: parsed.stats?.lastBackup ? new Date(parsed.stats.lastBackup) : null
      };
      
      this.updateStats();
      
      console.log(`Loaded ${Object.keys(this.channels).length} channels from storage`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, create it
        console.log('No existing channels file found, creating new one');
        this.channels = {};
        await this.saveChannels();
      } else {
        console.error('Error loading channels:', error);
        // Try to load from backup
        await this.loadFromBackup();
      }
    }
  }

  /**
   * Save channels to file
   */
  async saveChannels() {
    try {
      const dir = path.dirname(this.config.dataFile);
      await fs.mkdir(dir, { recursive: true });
      
      this.updateStats();
      
      const data = {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        channels: this.channels,
        stats: {
          ...this.stats,
          lastUpdate: this.stats.lastUpdate?.toISOString(),
          lastBackup: this.stats.lastBackup?.toISOString()
        }
      };
      
      await fs.writeFile(this.config.dataFile, JSON.stringify(data, null, 2));
      this.emit('saved', { channelCount: Object.keys(this.channels).length });
      
    } catch (error) {
      console.error('Error saving channels:', error);
      throw error;
    }
  }

  /**
   * Update internal statistics
   */
  updateStats() {
    const channels = Object.values(this.channels);
    
    this.stats.totalChannels = channels.length;
    this.stats.totalVideos = channels.reduce((sum, channel) => sum + (channel.videoCount || 0), 0);
    this.stats.totalIndexed = channels.reduce((sum, channel) => {
      return sum + (channel.indexedVideos ? channel.indexedVideos.length : 0);
    }, 0);
    this.stats.lastUpdate = new Date();
  }

  /**
   * Add or update a channel
   */
  async addChannel(channelId, channelInfo, projectId = null) {
    const existingChannel = this.channels[channelId];
    
    const channelData = {
      id: channelId,
      name: channelInfo.name,
      description: channelInfo.description,
      thumbnail: channelInfo.thumbnail,
      subscriberCount: channelInfo.subscriberCount || 0,
      videoCount: channelInfo.videoCount || 0,
      uploadsPlaylistId: channelInfo.uploadsPlaylistId,
      publishedAt: channelInfo.publishedAt,
      projectId: projectId,
      
      // Preserve existing data
      indexedVideos: existingChannel?.indexedVideos || [],
      indexedAt: existingChannel?.indexedAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      
      // Indexing progress tracking
      indexingProgress: existingChannel?.indexingProgress || {
        status: 'pending', // pending, indexing, completed, error
        totalVideos: 0,
        processedVideos: 0,
        successfulVideos: 0,
        failedVideos: 0,
        startedAt: null,
        completedAt: null,
        lastError: null
      },
      
      // Statistics
      stats: {
        totalTranscripts: existingChannel?.stats?.totalTranscripts || 0,
        totalDuration: existingChannel?.stats?.totalDuration || 0,
        averageDuration: existingChannel?.stats?.averageDuration || 0,
        lastIndexed: existingChannel?.stats?.lastIndexed || null,
        ...existingChannel?.stats
      }
    };
    
    this.channels[channelId] = channelData;
    await this.saveChannels();
    
    this.emit('channelAdded', { channelId, channelData, isUpdate: !!existingChannel });
    
    return channelData;
  }

  /**
   * Update channel information
   */
  async updateChannel(channelId, updates) {
    if (!this.channels[channelId]) {
      throw new Error(`Channel ${channelId} not found`);
    }
    
    const existingChannel = this.channels[channelId];
    this.channels[channelId] = {
      ...existingChannel,
      ...updates,
      lastUpdated: new Date().toISOString()
    };
    
    await this.saveChannels();
    this.emit('channelUpdated', { channelId, updates });
    
    return this.channels[channelId];
  }

  /**
   * Update indexing progress for a channel
   */
  async updateIndexingProgress(channelId, progress) {
    if (!this.channels[channelId]) {
      throw new Error(`Channel ${channelId} not found`);
    }
    
    const existingProgress = this.channels[channelId].indexingProgress || {};
    this.channels[channelId].indexingProgress = {
      ...existingProgress,
      ...progress,
      lastUpdated: new Date().toISOString()
    };
    
    // Update status timestamps
    if (progress.status === 'indexing' && !existingProgress.startedAt) {
      this.channels[channelId].indexingProgress.startedAt = new Date().toISOString();
    }
    
    if (['completed', 'error'].includes(progress.status) && !existingProgress.completedAt) {
      this.channels[channelId].indexingProgress.completedAt = new Date().toISOString();
    }
    
    await this.saveChannels();
    
    this.emit('indexingProgress', {
      channelId,
      progress: this.channels[channelId].indexingProgress
    });
    
    return this.channels[channelId].indexingProgress;
  }

  /**
   * Get channel by ID
   */
  getChannel(channelId) {
    return this.channels[channelId] || null;
  }

  /**
   * Get all channels, optionally filtered by project
   */
  getAllChannels(projectId = null) {
    if (!projectId) {
      return { ...this.channels };
    }
    
    const filtered = {};
    for (const [id, channel] of Object.entries(this.channels)) {
      if (channel.projectId === projectId) {
        filtered[id] = channel;
      }
    }
    
    return filtered;
  }

  /**
   * Get channels by status
   */
  getChannelsByStatus(status) {
    const filtered = {};
    for (const [id, channel] of Object.entries(this.channels)) {
      if (channel.indexingProgress?.status === status) {
        filtered[id] = channel;
      }
    }
    
    return filtered;
  }

  /**
   * Remove channel
   */
  async removeChannel(channelId) {
    if (!this.channels[channelId]) {
      return false;
    }
    
    const channelData = this.channels[channelId];
    delete this.channels[channelId];
    
    await this.saveChannels();
    this.emit('channelRemoved', { channelId, channelData });
    
    return true;
  }

  /**
   * Check if channel is indexed
   */
  isChannelIndexed(channelId) {
    return !!this.channels[channelId];
  }

  /**
   * Add indexed videos to a channel
   */
  async addIndexedVideos(channelId, videoIds, videoData = {}) {
    if (!this.channels[channelId]) {
      // Create channel entry if it doesn't exist
      this.channels[channelId] = {
        id: channelId,
        name: videoData.channelName || 'Unknown Channel',
        indexedVideos: [],
        indexedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        stats: { totalTranscripts: 0 }
      };
    }
    
    const channel = this.channels[channelId];
    
    if (!channel.indexedVideos) {
      channel.indexedVideos = [];
    }
    
    // Add new video IDs, avoiding duplicates
    const existingIds = new Set(channel.indexedVideos);
    const newIds = videoIds.filter(id => !existingIds.has(id));
    
    if (newIds.length > 0) {
      channel.indexedVideos.push(...newIds);
      channel.lastUpdated = new Date().toISOString();
      
      // Update stats
      if (channel.stats) {
        channel.stats.totalTranscripts = channel.indexedVideos.length;
        channel.stats.lastIndexed = new Date().toISOString();
      }
      
      await this.saveChannels();
      
      this.emit('videosIndexed', {
        channelId,
        newVideos: newIds.length,
        totalVideos: channel.indexedVideos.length
      });
    }
    
    return {
      newVideos: newIds.length,
      totalVideos: channel.indexedVideos.length
    };
  }

  /**
   * Get indexed videos for a channel
   */
  getIndexedVideos(channelId) {
    const channel = this.channels[channelId];
    return channel?.indexedVideos || [];
  }

  /**
   * Get total video count across all channels
   */
  getTotalVideos(projectId = null) {
    const channels = projectId ? this.getAllChannels(projectId) : this.channels;
    return Object.values(channels).reduce((sum, channel) => sum + (channel.videoCount || 0), 0);
  }

  /**
   * Get total indexed video count
   */
  getTotalIndexedVideos(projectId = null) {
    const channels = projectId ? this.getAllChannels(projectId) : this.channels;
    return Object.values(channels).reduce((sum, channel) => {
      return sum + (channel.indexedVideos ? channel.indexedVideos.length : 0);
    }, 0);
  }

  /**
   * Get channel statistics
   */
  getChannelStats(channelId) {
    const channel = this.channels[channelId];
    if (!channel) return null;
    
    const indexedCount = channel.indexedVideos ? channel.indexedVideos.length : 0;
    const totalCount = channel.videoCount || 0;
    
    return {
      ...channel.stats,
      id: channelId,
      name: channel.name,
      totalVideos: totalCount,
      indexedVideos: indexedCount,
      indexingProgress: ((indexedCount / totalCount) * 100).toFixed(1),
      lastUpdated: channel.lastUpdated,
      indexingStatus: channel.indexingProgress?.status || 'unknown'
    };
  }

  /**
   * Get overall statistics
   */
  getOverallStats() {
    return {
      ...this.stats,
      indexingRate: this.stats.totalVideos > 0 
        ? ((this.stats.totalIndexed / this.stats.totalVideos) * 100).toFixed(1)
        : 0
    };
  }

  /**
   * Bulk import channels
   */
  async bulkImportChannels(channelsList, projectId = null, onProgress = null) {
    const results = {
      successful: 0,
      failed: 0,
      errors: [],
      imported: []
    };
    
    for (let i = 0; i < channelsList.length; i++) {
      const channelData = channelsList[i];
      
      try {
        const imported = await this.addChannel(
          channelData.id,
          channelData,
          projectId
        );
        
        results.successful++;
        results.imported.push(imported);
        
      } catch (error) {
        results.failed++;
        results.errors.push({
          channelId: channelData.id,
          channelName: channelData.name,
          error: error.message
        });
      }
      
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: channelsList.length,
          successful: results.successful,
          failed: results.failed
        });
      }
    }
    
    this.emit('bulkImportCompleted', results);
    return results;
  }

  /**
   * Setup automatic backup
   */
  setupAutoBackup() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
    }
    
    this.backupTimer = setInterval(async () => {
      try {
        await this.createBackup();
      } catch (error) {
        console.error('Error during auto backup:', error);
      }
    }, this.config.backupInterval);
  }

  /**
   * Create backup of channels data
   */
  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `channels-backup-${timestamp}.json`;
      const backupPath = path.join(
        path.dirname(this.config.dataFile),
        'backups',
        backupFileName
      );
      
      // Ensure backup directory exists
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      
      // Copy current data file to backup
      await fs.copyFile(this.config.dataFile, backupPath);
      
      this.stats.lastBackup = new Date();
      await this.saveChannels();
      
      // Clean old backups
      await this.cleanOldBackups();
      
      this.emit('backupCreated', { backupPath });
      
      console.log(`Channel data backed up to: ${backupPath}`);
    } catch (error) {
      console.error('Error creating backup:', error);
      throw error;
    }
  }

  /**
   * Load from backup file
   */
  async loadFromBackup() {
    try {
      console.log('Attempting to load from backup...');
      
      const data = await fs.readFile(this.config.backupFile, 'utf8');
      const parsed = JSON.parse(data);
      
      this.channels = parsed.channels || {};
      this.stats = { ...this.stats, ...parsed.stats };
      
      console.log(`Loaded ${Object.keys(this.channels).length} channels from backup`);
      
      // Save as main file
      await this.saveChannels();
      
    } catch (error) {
      console.warn('Could not load from backup, starting with empty channels');
      this.channels = {};
      await this.saveChannels();
    }
  }

  /**
   * Clean old backup files
   */
  async cleanOldBackups() {
    try {
      const backupsDir = path.join(path.dirname(this.config.dataFile), 'backups');
      const entries = await fs.readdir(backupsDir, { withFileTypes: true });
      
      const backupFiles = entries
        .filter(entry => entry.isFile() && entry.name.startsWith('channels-backup-'))
        .map(entry => ({
          name: entry.name,
          path: path.join(backupsDir, entry.name),
          created: new Date(entry.name.match(/channels-backup-(.+)\.json/)?.[1]?.replace(/-/g, ':') || 0)
        }))
        .sort((a, b) => b.created - a.created); // Newest first
      
      // Keep only maxBackups files
      const filesToDelete = backupFiles.slice(this.config.maxBackups);
      
      for (const file of filesToDelete) {
        await fs.unlink(file.path);
      }
      
      if (filesToDelete.length > 0) {
        console.log(`Cleaned up ${filesToDelete.length} old backup files`);
      }
      
    } catch (error) {
      console.warn('Error cleaning old backups:', error);
    }
  }

  /**
   * Export channels data
   */
  async exportChannels(filePath, projectId = null) {
    const channels = this.getAllChannels(projectId);
    const exportData = {
      exportedAt: new Date().toISOString(),
      projectId,
      channels,
      stats: projectId ? this.getProjectStats(projectId) : this.getOverallStats()
    };
    
    await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
    
    this.emit('exported', { filePath, channelCount: Object.keys(channels).length });
    
    return exportData;
  }

  /**
   * Import channels data from file
   */
  async importChannels(filePath, projectId = null) {
    const data = await fs.readFile(filePath, 'utf8');
    const importData = JSON.parse(data);
    
    const imported = await this.bulkImportChannels(
      Object.values(importData.channels || {}),
      projectId
    );
    
    this.emit('imported', { filePath, ...imported });
    
    return imported;
  }

  /**
   * Get project-specific statistics
   */
  getProjectStats(projectId) {
    const channels = this.getAllChannels(projectId);
    const channelValues = Object.values(channels);
    
    return {
      totalChannels: channelValues.length,
      totalVideos: channelValues.reduce((sum, channel) => sum + (channel.videoCount || 0), 0),
      totalIndexed: channelValues.reduce((sum, channel) => {
        return sum + (channel.indexedVideos ? channel.indexedVideos.length : 0);
      }, 0)
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      if (this.backupTimer) {
        clearInterval(this.backupTimer);
        this.backupTimer = null;
      }
      
      await this.saveChannels();
      this.removeAllListeners();
      
      console.log('Channel manager cleaned up');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

module.exports = ChannelManager;
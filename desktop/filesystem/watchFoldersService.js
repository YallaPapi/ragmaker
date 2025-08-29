/**
 * Watch Folders Service for Desktop App
 * Monitors folders for file changes and automatically processes new documents
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const chokidar = require('chokidar');

class WatchFoldersService extends EventEmitter {
  constructor(fileDialogService) {
    super();
    this.fileDialogService = fileDialogService;
    this.watchers = new Map(); // folderId -> watcher instance
    this.watchedFolders = new Map(); // folderId -> folder config
    this.processingQueue = [];
    this.isProcessing = false;
    this.maxQueueSize = 1000;
    this.processDelay = 2000; // 2 second delay before processing new files
    this.supportedExtensions = [
      '.pdf', '.docx', '.doc', '.txt', '.md', '.rtf', '.odt',
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg',
      '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg',
      '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm',
      '.js', '.ts', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html', '.json', '.xml',
      '.xlsx', '.xls', '.csv', '.ods',
      '.pptx', '.ppt', '.odp'
    ];
  }

  /**
   * Add a folder to watch
   * @param {string} folderPath - Path to watch
   * @param {Object} options - Watch options
   * @returns {string} Watch ID
   */
  addWatchFolder(folderPath, options = {}) {
    const folderId = this.generateFolderId();
    
    const folderConfig = {
      id: folderId,
      path: folderPath,
      name: options.name || path.basename(folderPath),
      recursive: options.recursive !== false, // Default true
      autoProcess: options.autoProcess !== false, // Default true
      fileTypes: options.fileTypes || this.supportedExtensions,
      excludePatterns: options.excludePatterns || ['**/node_modules/**', '**/.git/**', '**/.*'],
      processExisting: options.processExisting || false,
      maxFileSize: options.maxFileSize || 100 * 1024 * 1024, // 100MB default
      created: new Date(),
      lastProcessed: null,
      stats: {
        filesProcessed: 0,
        filesSkipped: 0,
        errors: 0
      }
    };

    try {
      // Verify folder exists and is accessible
      if (!fs.existsSync(folderPath)) {
        throw new Error(`Folder does not exist: ${folderPath}`);
      }

      const stats = fs.statSync(folderPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${folderPath}`);
      }

      // Create watcher
      const watcher = this.createWatcher(folderConfig);
      
      this.watchers.set(folderId, watcher);
      this.watchedFolders.set(folderId, folderConfig);

      // Process existing files if requested
      if (folderConfig.processExisting) {
        this.processExistingFiles(folderConfig);
      }

      this.emit('watchFolderAdded', folderConfig);
      return folderId;

    } catch (error) {
      this.emit('watchFolderError', { folderId, error: error.message });
      throw error;
    }
  }

  /**
   * Remove a watched folder
   * @param {string} folderId - Watch ID to remove
   * @returns {boolean} Success status
   */
  removeWatchFolder(folderId) {
    try {
      const watcher = this.watchers.get(folderId);
      const folderConfig = this.watchedFolders.get(folderId);

      if (watcher) {
        watcher.close();
        this.watchers.delete(folderId);
      }

      if (folderConfig) {
        this.watchedFolders.delete(folderId);
        this.emit('watchFolderRemoved', folderConfig);
        return true;
      }

      return false;
    } catch (error) {
      this.emit('watchFolderError', { folderId, error: error.message });
      return false;
    }
  }

  /**
   * Get all watched folders
   * @returns {Array} Array of folder configurations
   */
  getWatchedFolders() {
    return Array.from(this.watchedFolders.values());
  }

  /**
   * Get watch folder by ID
   * @param {string} folderId - Watch ID
   * @returns {Object|null} Folder configuration
   */
  getWatchFolder(folderId) {
    return this.watchedFolders.get(folderId) || null;
  }

  /**
   * Update watch folder configuration
   * @param {string} folderId - Watch ID
   * @param {Object} updates - Configuration updates
   * @returns {boolean} Success status
   */
  updateWatchFolder(folderId, updates) {
    try {
      const folderConfig = this.watchedFolders.get(folderId);
      if (!folderConfig) {
        return false;
      }

      // Update configuration
      const updatedConfig = { ...folderConfig, ...updates };
      this.watchedFolders.set(folderId, updatedConfig);

      // Restart watcher if path or watch options changed
      const needsRestart = updates.path || updates.recursive || updates.excludePatterns;
      if (needsRestart) {
        this.removeWatchFolder(folderId);
        this.addWatchFolder(updatedConfig.path, updatedConfig);
      }

      this.emit('watchFolderUpdated', updatedConfig);
      return true;
    } catch (error) {
      this.emit('watchFolderError', { folderId, error: error.message });
      return false;
    }
  }

  /**
   * Pause/resume watching for a folder
   * @param {string} folderId - Watch ID
   * @param {boolean} paused - Pause state
   */
  setPaused(folderId, paused) {
    const folderConfig = this.watchedFolders.get(folderId);
    if (folderConfig) {
      folderConfig.paused = paused;
      this.emit('watchFolderPausedChanged', { folderId, paused });
    }
  }

  /**
   * Create file watcher for a folder
   * @private
   */
  createWatcher(folderConfig) {
    const watchPath = folderConfig.recursive ? 
      path.join(folderConfig.path, '**/*') : 
      path.join(folderConfig.path, '*');

    const watcher = chokidar.watch(watchPath, {
      ignored: folderConfig.excludePatterns,
      ignoreInitial: !folderConfig.processExisting,
      persistent: true,
      followSymlinks: false,
      depth: folderConfig.recursive ? undefined : 1,
      awaitWriteFinish: {
        stabilityThreshold: 1000, // Wait 1 second for file to stabilize
        pollInterval: 100
      }
    });

    // File added event
    watcher.on('add', (filePath) => {
      this.handleFileAdded(folderConfig, filePath);
    });

    // File changed event
    watcher.on('change', (filePath) => {
      this.handleFileChanged(folderConfig, filePath);
    });

    // File removed event
    watcher.on('unlink', (filePath) => {
      this.handleFileRemoved(folderConfig, filePath);
    });

    // Directory added event
    watcher.on('addDir', (dirPath) => {
      this.handleDirectoryAdded(folderConfig, dirPath);
    });

    // Error event
    watcher.on('error', (error) => {
      this.emit('watchError', { folderId: folderConfig.id, error: error.message });
    });

    // Ready event
    watcher.on('ready', () => {
      this.emit('watchReady', { folderId: folderConfig.id });
    });

    return watcher;
  }

  /**
   * Handle file added event
   * @private
   */
  handleFileAdded(folderConfig, filePath) {
    if (folderConfig.paused || !this.isFileSupported(filePath, folderConfig)) {
      return;
    }

    this.queueFileForProcessing(folderConfig, filePath, 'added');
  }

  /**
   * Handle file changed event
   * @private
   */
  handleFileChanged(folderConfig, filePath) {
    if (folderConfig.paused || !this.isFileSupported(filePath, folderConfig)) {
      return;
    }

    this.queueFileForProcessing(folderConfig, filePath, 'changed');
  }

  /**
   * Handle file removed event
   * @private
   */
  handleFileRemoved(folderConfig, filePath) {
    this.emit('fileRemoved', {
      folderId: folderConfig.id,
      filePath,
      fileName: path.basename(filePath)
    });
  }

  /**
   * Handle directory added event
   * @private
   */
  handleDirectoryAdded(folderConfig, dirPath) {
    this.emit('directoryAdded', {
      folderId: folderConfig.id,
      dirPath,
      dirName: path.basename(dirPath)
    });
  }

  /**
   * Queue file for processing
   * @private
   */
  queueFileForProcessing(folderConfig, filePath, action) {
    if (this.processingQueue.length >= this.maxQueueSize) {
      this.emit('queueOverflow', { folderId: folderConfig.id });
      return;
    }

    const queueItem = {
      folderId: folderConfig.id,
      filePath,
      action,
      queuedAt: new Date(),
      attempts: 0
    };

    this.processingQueue.push(queueItem);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      setTimeout(() => this.processQueue(), this.processDelay);
    }
  }

  /**
   * Process queued files
   * @private
   */
  async processQueue() {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.emit('queueProcessingStarted', { queueSize: this.processingQueue.length });

    while (this.processingQueue.length > 0) {
      const queueItem = this.processingQueue.shift();
      
      try {
        await this.processQueueItem(queueItem);
      } catch (error) {
        this.handleProcessingError(queueItem, error);
      }
    }

    this.isProcessing = false;
    this.emit('queueProcessingCompleted');
  }

  /**
   * Process individual queue item
   * @private
   */
  async processQueueItem(queueItem) {
    const folderConfig = this.watchedFolders.get(queueItem.folderId);
    if (!folderConfig || folderConfig.paused) {
      return;
    }

    try {
      // Check if file still exists and meets size requirements
      const stats = fs.statSync(queueItem.filePath);
      if (stats.size > folderConfig.maxFileSize) {
        this.emit('fileSkipped', {
          folderId: queueItem.folderId,
          filePath: queueItem.filePath,
          reason: 'File too large',
          size: stats.size
        });
        folderConfig.stats.filesSkipped++;
        return;
      }

      // Get file information
      const fileInfo = await this.getFileInfo(queueItem.filePath);
      
      // Process the file based on action
      if (queueItem.action === 'added') {
        this.emit('fileAdded', {
          folderId: queueItem.folderId,
          fileInfo,
          folderConfig
        });
      } else if (queueItem.action === 'changed') {
        this.emit('fileChanged', {
          folderId: queueItem.folderId,
          fileInfo,
          folderConfig
        });
      }

      folderConfig.stats.filesProcessed++;
      folderConfig.lastProcessed = new Date();

    } catch (error) {
      if (queueItem.attempts < 3) {
        queueItem.attempts++;
        this.processingQueue.push(queueItem); // Retry
      } else {
        this.handleProcessingError(queueItem, error);
      }
    }
  }

  /**
   * Handle processing errors
   * @private
   */
  handleProcessingError(queueItem, error) {
    const folderConfig = this.watchedFolders.get(queueItem.folderId);
    if (folderConfig) {
      folderConfig.stats.errors++;
    }

    this.emit('processingError', {
      folderId: queueItem.folderId,
      filePath: queueItem.filePath,
      error: error.message,
      attempts: queueItem.attempts
    });
  }

  /**
   * Process existing files in a folder
   * @private
   */
  async processExistingFiles(folderConfig) {
    try {
      const files = await this.scanFolder(folderConfig.path, folderConfig);
      
      for (const filePath of files) {
        if (this.isFileSupported(filePath, folderConfig)) {
          this.queueFileForProcessing(folderConfig, filePath, 'existing');
        }
      }

      this.emit('existingFilesScanned', {
        folderId: folderConfig.id,
        fileCount: files.length
      });

    } catch (error) {
      this.emit('scanError', {
        folderId: folderConfig.id,
        error: error.message
      });
    }
  }

  /**
   * Recursively scan folder for files
   * @private
   */
  async scanFolder(folderPath, folderConfig, files = []) {
    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
          if (folderConfig.recursive && !this.isExcluded(fullPath, folderConfig.excludePatterns)) {
            await this.scanFolder(fullPath, folderConfig, files);
          }
        } else if (entry.isFile()) {
          if (!this.isExcluded(fullPath, folderConfig.excludePatterns)) {
            files.push(fullPath);
          }
        }
      }

      return files;
    } catch (error) {
      throw new Error(`Failed to scan folder ${folderPath}: ${error.message}`);
    }
  }

  /**
   * Check if file is supported
   * @private
   */
  isFileSupported(filePath, folderConfig) {
    const extension = path.extname(filePath).toLowerCase();
    return folderConfig.fileTypes.includes(extension);
  }

  /**
   * Check if path matches exclude patterns
   * @private
   */
  isExcluded(filePath, excludePatterns) {
    return excludePatterns.some(pattern => {
      // Simple glob pattern matching
      const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
      return regex.test(filePath);
    });
  }

  /**
   * Get detailed file information
   * @private
   */
  async getFileInfo(filePath) {
    const stats = fs.statSync(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    return {
      path: filePath,
      name: path.basename(filePath),
      extension: extension.slice(1),
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime,
      type: this.getFileType(extension)
    };
  }

  /**
   * Determine file type from extension
   * @private
   */
  getFileType(extension) {
    const typeMap = {
      pdf: 'document', docx: 'document', doc: 'document', txt: 'document', md: 'document',
      jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', bmp: 'image', webp: 'image', svg: 'image',
      mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', m4a: 'audio', ogg: 'audio',
      mp4: 'video', avi: 'video', mkv: 'video', mov: 'video', wmv: 'video', webm: 'video',
      js: 'code', ts: 'code', py: 'code', java: 'code', cpp: 'code', c: 'code', h: 'code',
      xlsx: 'spreadsheet', xls: 'spreadsheet', csv: 'spreadsheet',
      pptx: 'presentation', ppt: 'presentation'
    };

    return typeMap[extension.slice(1)] || 'unknown';
  }

  /**
   * Generate unique folder ID
   * @private
   */
  generateFolderId() {
    return 'watch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get processing queue status
   * @returns {Object} Queue status
   */
  getQueueStatus() {
    return {
      queueSize: this.processingQueue.length,
      isProcessing: this.isProcessing,
      maxQueueSize: this.maxQueueSize
    };
  }

  /**
   * Clear processing queue
   */
  clearQueue() {
    this.processingQueue = [];
    this.emit('queueCleared');
  }

  /**
   * Cleanup watch folders service
   */
  destroy() {
    // Close all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }

    this.watchers.clear();
    this.watchedFolders.clear();
    this.processingQueue = [];
    this.removeAllListeners();
  }
}

module.exports = WatchFoldersService;
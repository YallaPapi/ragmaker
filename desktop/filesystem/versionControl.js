/**
 * File Versioning and History Tracking Service
 * Tracks file changes, maintains version history, and provides rollback capabilities
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

class VersionControl extends EventEmitter {
  constructor() {
    super();
    this.versions = new Map(); // filePath -> version history
    this.versionStorage = new Map(); // versionId -> version data
    this.watchedFiles = new Set();
    this.maxVersionsPerFile = 50;
    this.maxStorageSize = 1024 * 1024 * 1024; // 1GB
    this.currentStorageSize = 0;
    this.compressionEnabled = true;
  }

  /**
   * Start tracking a file for version control
   * @param {string} filePath - File path to track
   * @param {Object} options - Tracking options
   * @returns {Promise<string>} Initial version ID
   */
  async startTracking(filePath, options = {}) {
    try {
      // Check if file exists
      const stats = await fs.stat(filePath);
      
      if (this.watchedFiles.has(filePath)) {
        throw new Error('File is already being tracked');
      }

      // Create initial version
      const initialVersionId = await this.createVersion(filePath, {
        type: 'initial',
        comment: options.comment || 'Initial version',
        author: options.author || 'system'
      });

      this.watchedFiles.add(filePath);
      
      this.emit('trackingStarted', {
        filePath,
        initialVersionId,
        fileSize: stats.size
      });

      return initialVersionId;

    } catch (error) {
      this.emit('trackingError', { filePath, error: error.message });
      throw error;
    }
  }

  /**
   * Stop tracking a file
   * @param {string} filePath - File path to stop tracking
   * @param {Object} options - Stop options
   * @returns {boolean} Success status
   */
  async stopTracking(filePath, options = {}) {
    try {
      if (!this.watchedFiles.has(filePath)) {
        return false;
      }

      this.watchedFiles.delete(filePath);

      // Optionally clean up version history
      if (options.cleanupHistory) {
        await this.cleanupFileHistory(filePath);
      }

      this.emit('trackingStopped', { filePath });
      return true;

    } catch (error) {
      this.emit('trackingError', { filePath, error: error.message });
      return false;
    }
  }

  /**
   * Create a new version of a file
   * @param {string} filePath - File path
   * @param {Object} options - Version options
   * @returns {Promise<string>} Version ID
   */
  async createVersion(filePath, options = {}) {
    try {
      // Read file content
      const content = await fs.readFile(filePath);
      const stats = await fs.stat(filePath);
      
      // Calculate content hash
      const contentHash = this.calculateHash(content);
      
      // Check if content has changed from last version
      const fileVersions = this.versions.get(filePath) || [];
      if (fileVersions.length > 0) {
        const lastVersion = this.versionStorage.get(fileVersions[fileVersions.length - 1]);
        if (lastVersion && lastVersion.contentHash === contentHash) {
          // Content hasn't changed, no need for new version
          return lastVersion.id;
        }
      }

      // Create version ID
      const versionId = this.generateVersionId(filePath);
      
      // Create version object
      const version = {
        id: versionId,
        filePath,
        timestamp: new Date(),
        size: stats.size,
        contentHash,
        type: options.type || 'manual',
        comment: options.comment || '',
        author: options.author || 'unknown',
        tags: options.tags || [],
        metadata: {
          modified: stats.mtime,
          created: stats.birthtime,
          ...options.metadata
        }
      };

      // Store content (with optional compression)
      if (this.compressionEnabled && content.length > 1024) {
        version.content = this.compressContent(content);
        version.compressed = true;
      } else {
        version.content = content;
        version.compressed = false;
      }

      // Add to version history
      if (!this.versions.has(filePath)) {
        this.versions.set(filePath, []);
      }
      
      const versions = this.versions.get(filePath);
      versions.push(versionId);

      // Enforce max versions limit
      if (versions.length > this.maxVersionsPerFile) {
        const oldVersionId = versions.shift();
        this.removeVersionData(oldVersionId);
      }

      // Store version data
      this.versionStorage.set(versionId, version);
      this.currentStorageSize += version.content.length;

      // Check storage limits
      await this.enforceStorageLimits();

      this.emit('versionCreated', version);
      return versionId;

    } catch (error) {
      this.emit('versionError', { filePath, error: error.message });
      throw error;
    }
  }

  /**
   * Get version history for a file
   * @param {string} filePath - File path
   * @returns {Array} Version history
   */
  getFileHistory(filePath) {
    const versionIds = this.versions.get(filePath) || [];
    
    return versionIds.map(versionId => {
      const version = this.versionStorage.get(versionId);
      if (!version) return null;

      return {
        id: version.id,
        timestamp: version.timestamp,
        size: version.size,
        contentHash: version.contentHash,
        type: version.type,
        comment: version.comment,
        author: version.author,
        tags: version.tags,
        metadata: version.metadata
      };
    }).filter(Boolean);
  }

  /**
   * Get specific version details
   * @param {string} versionId - Version ID
   * @param {Object} options - Get options
   * @returns {Object|null} Version details
   */
  getVersion(versionId, options = {}) {
    const version = this.versionStorage.get(versionId);
    if (!version) return null;

    const result = {
      id: version.id,
      filePath: version.filePath,
      timestamp: version.timestamp,
      size: version.size,
      contentHash: version.contentHash,
      type: version.type,
      comment: version.comment,
      author: version.author,
      tags: version.tags,
      metadata: version.metadata,
      compressed: version.compressed
    };

    // Include content if requested
    if (options.includeContent) {
      if (version.compressed) {
        result.content = this.decompressContent(version.content);
      } else {
        result.content = version.content;
      }
    }

    return result;
  }

  /**
   * Restore file to a specific version
   * @param {string} filePath - File path
   * @param {string} versionId - Version ID to restore
   * @param {Object} options - Restore options
   * @returns {Promise<boolean>} Success status
   */
  async restoreVersion(filePath, versionId, options = {}) {
    try {
      const version = this.versionStorage.get(versionId);
      if (!version || version.filePath !== filePath) {
        throw new Error('Version not found or path mismatch');
      }

      // Create backup of current version before restoring
      if (options.createBackup !== false) {
        try {
          await this.createVersion(filePath, {
            type: 'backup',
            comment: `Backup before restore to ${versionId}`,
            author: options.author || 'system'
          });
        } catch (error) {
          // Continue with restore even if backup fails
          this.emit('backupError', { filePath, error: error.message });
        }
      }

      // Get version content
      let content;
      if (version.compressed) {
        content = this.decompressContent(version.content);
      } else {
        content = version.content;
      }

      // Write content to file
      await fs.writeFile(filePath, content);

      // Restore file timestamps if requested
      if (options.restoreTimestamps && version.metadata) {
        try {
          await fs.utimes(
            filePath, 
            version.metadata.accessed || version.metadata.modified,
            version.metadata.modified
          );
        } catch (error) {
          // Timestamp restoration is not critical
          this.emit('timestampError', { filePath, error: error.message });
        }
      }

      this.emit('versionRestored', {
        filePath,
        versionId,
        restoredSize: content.length
      });

      return true;

    } catch (error) {
      this.emit('restoreError', { filePath, versionId, error: error.message });
      throw error;
    }
  }

  /**
   * Compare two versions
   * @param {string} versionId1 - First version ID
   * @param {string} versionId2 - Second version ID
   * @returns {Object} Comparison result
   */
  compareVersions(versionId1, versionId2) {
    const version1 = this.versionStorage.get(versionId1);
    const version2 = this.versionStorage.get(versionId2);

    if (!version1 || !version2) {
      throw new Error('One or both versions not found');
    }

    const content1 = version1.compressed ? 
      this.decompressContent(version1.content) : version1.content;
    const content2 = version2.compressed ? 
      this.decompressContent(version2.content) : version2.content;

    return {
      version1: {
        id: version1.id,
        timestamp: version1.timestamp,
        size: version1.size,
        author: version1.author
      },
      version2: {
        id: version2.id,
        timestamp: version2.timestamp,
        size: version2.size,
        author: version2.author
      },
      differences: {
        sizeChange: version2.size - version1.size,
        hashMatch: version1.contentHash === version2.contentHash,
        timeDifference: version2.timestamp.getTime() - version1.timestamp.getTime(),
        contentDiff: this.generateContentDiff(content1, content2)
      }
    };
  }

  /**
   * Get file diff between current version and specific version
   * @param {string} filePath - File path
   * @param {string} versionId - Version ID to compare against
   * @returns {Promise<Object>} Diff result
   */
  async getDiff(filePath, versionId) {
    try {
      // Read current file content
      const currentContent = await fs.readFile(filePath);
      
      // Get version content
      const version = this.versionStorage.get(versionId);
      if (!version || version.filePath !== filePath) {
        throw new Error('Version not found');
      }

      const versionContent = version.compressed ? 
        this.decompressContent(version.content) : version.content;

      return {
        filePath,
        versionId,
        currentSize: currentContent.length,
        versionSize: versionContent.length,
        sizeDifference: currentContent.length - versionContent.length,
        diff: this.generateContentDiff(versionContent, currentContent)
      };

    } catch (error) {
      this.emit('diffError', { filePath, versionId, error: error.message });
      throw error;
    }
  }

  /**
   * Clean up old versions to free space
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanup(options = {}) {
    const results = {
      removedVersions: 0,
      freedSpace: 0,
      remainingVersions: 0
    };

    const cutoffDate = options.olderThan || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const toRemove = [];

    // Find versions to remove
    for (const [versionId, version] of this.versionStorage.entries()) {
      const shouldRemove = (
        (options.olderThan && version.timestamp < cutoffDate) ||
        (options.maxVersionsPerFile && this.getVersionCount(version.filePath) > options.maxVersionsPerFile) ||
        (options.removeUntracked && !this.watchedFiles.has(version.filePath))
      );

      if (shouldRemove) {
        // Keep at least one version per file
        const fileVersions = this.versions.get(version.filePath) || [];
        if (fileVersions.length > 1 && fileVersions[fileVersions.length - 1] !== versionId) {
          toRemove.push(versionId);
        }
      }
    }

    // Remove versions
    for (const versionId of toRemove) {
      const version = this.versionStorage.get(versionId);
      if (version) {
        results.freedSpace += version.content.length;
        this.removeVersionData(versionId);
        results.removedVersions++;
      }
    }

    results.remainingVersions = this.versionStorage.size;
    
    this.emit('cleanupCompleted', results);
    return results;
  }

  /**
   * Get version control statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const stats = {
      trackedFiles: this.watchedFiles.size,
      totalVersions: this.versionStorage.size,
      storageSize: this.currentStorageSize,
      maxStorageSize: this.maxStorageSize,
      storageUsagePercent: (this.currentStorageSize / this.maxStorageSize) * 100
    };

    // Per-file statistics
    stats.fileStats = {};
    for (const filePath of this.watchedFiles) {
      const versions = this.versions.get(filePath) || [];
      stats.fileStats[filePath] = {
        versionCount: versions.length,
        latestVersion: versions.length > 0 ? versions[versions.length - 1] : null
      };
    }

    return stats;
  }

  /**
   * Export version history
   * @param {Array} filePaths - Files to export (or all if empty)
   * @returns {Object} Export data
   */
  exportHistory(filePaths = []) {
    const exportData = {
      exportDate: new Date(),
      files: {}
    };

    const filesToExport = filePaths.length > 0 ? filePaths : Array.from(this.watchedFiles);

    for (const filePath of filesToExport) {
      const versionIds = this.versions.get(filePath) || [];
      const fileHistory = [];

      for (const versionId of versionIds) {
        const version = this.versionStorage.get(versionId);
        if (version) {
          fileHistory.push({
            id: version.id,
            timestamp: version.timestamp,
            size: version.size,
            contentHash: version.contentHash,
            type: version.type,
            comment: version.comment,
            author: version.author,
            tags: version.tags,
            metadata: version.metadata,
            content: version.compressed ? 
              this.decompressContent(version.content) : version.content
          });
        }
      }

      if (fileHistory.length > 0) {
        exportData.files[filePath] = fileHistory;
      }
    }

    return exportData;
  }

  /**
   * Calculate content hash
   * @private
   */
  calculateHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate version ID
   * @private
   */
  generateVersionId(filePath) {
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(filePath + timestamp).digest('hex');
    return `v_${timestamp}_${hash.substr(0, 8)}`;
  }

  /**
   * Compress content
   * @private
   */
  compressContent(content) {
    const zlib = require('zlib');
    return zlib.gzipSync(content);
  }

  /**
   * Decompress content
   * @private
   */
  decompressContent(compressedContent) {
    const zlib = require('zlib');
    return zlib.gunzipSync(compressedContent);
  }

  /**
   * Generate content diff
   * @private
   */
  generateContentDiff(content1, content2) {
    // Simple line-based diff
    const lines1 = content1.toString().split('\n');
    const lines2 = content2.toString().split('\n');
    
    const diff = {
      added: [],
      removed: [],
      changed: []
    };

    const maxLines = Math.max(lines1.length, lines2.length);
    
    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i];
      const line2 = lines2[i];
      
      if (line1 === undefined && line2 !== undefined) {
        diff.added.push({ lineNumber: i + 1, content: line2 });
      } else if (line1 !== undefined && line2 === undefined) {
        diff.removed.push({ lineNumber: i + 1, content: line1 });
      } else if (line1 !== line2) {
        diff.changed.push({ 
          lineNumber: i + 1, 
          old: line1, 
          new: line2 
        });
      }
    }

    return diff;
  }

  /**
   * Get version count for file
   * @private
   */
  getVersionCount(filePath) {
    const versions = this.versions.get(filePath);
    return versions ? versions.length : 0;
  }

  /**
   * Remove version data
   * @private
   */
  removeVersionData(versionId) {
    const version = this.versionStorage.get(versionId);
    if (version) {
      this.currentStorageSize -= version.content.length;
      this.versionStorage.delete(versionId);
      
      // Remove from file version list
      const fileVersions = this.versions.get(version.filePath);
      if (fileVersions) {
        const index = fileVersions.indexOf(versionId);
        if (index !== -1) {
          fileVersions.splice(index, 1);
        }
      }
    }
  }

  /**
   * Clean up all history for a file
   * @private
   */
  async cleanupFileHistory(filePath) {
    const versionIds = this.versions.get(filePath) || [];
    
    for (const versionId of versionIds) {
      this.removeVersionData(versionId);
    }
    
    this.versions.delete(filePath);
  }

  /**
   * Enforce storage limits
   * @private
   */
  async enforceStorageLimits() {
    if (this.currentStorageSize <= this.maxStorageSize) {
      return;
    }

    // Remove oldest versions until under limit
    const allVersions = Array.from(this.versionStorage.entries())
      .map(([id, version]) => ({ id, ...version }))
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const version of allVersions) {
      if (this.currentStorageSize <= this.maxStorageSize * 0.8) { // 80% of limit
        break;
      }

      // Don't remove the last version of any file
      const fileVersions = this.versions.get(version.filePath) || [];
      if (fileVersions.length > 1 && fileVersions[fileVersions.length - 1] !== version.id) {
        this.removeVersionData(version.id);
      }
    }

    this.emit('storageLimitEnforced', {
      currentSize: this.currentStorageSize,
      maxSize: this.maxStorageSize
    });
  }

  /**
   * Cleanup version control
   */
  destroy() {
    this.versions.clear();
    this.versionStorage.clear();
    this.watchedFiles.clear();
    this.removeAllListeners();
  }
}

module.exports = VersionControl;
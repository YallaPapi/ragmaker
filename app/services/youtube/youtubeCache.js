const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

/**
 * Local caching system for YouTube data
 * Provides efficient file-based caching with TTL support
 */
class YouTubeCache extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      cacheDir: options.cacheDir || path.join(process.cwd(), 'app', 'data', 'youtube-cache'),
      maxCacheSize: options.maxCacheSize || 500 * 1024 * 1024, // 500MB default
      cleanupInterval: options.cleanupInterval || 60 * 60 * 1000, // 1 hour
      defaultTTL: options.defaultTTL || 24 * 60 * 60 * 1000, // 24 hours
      enableCompression: options.enableCompression !== false,
      ...options
    };
    
    this.initialized = false;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      size: 0,
      entries: 0
    };
    
    // Cleanup timer
    this.cleanupTimer = null;
  }

  /**
   * Initialize the cache system
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Ensure cache directory exists
      await fs.mkdir(this.config.cacheDir, { recursive: true });
      
      // Load initial stats
      await this.updateStats();
      
      // Setup cleanup timer
      this.setupCleanup();
      
      this.initialized = true;
      this.emit('initialized');
      
      console.log(`YouTube cache initialized at ${this.config.cacheDir}`);
      console.log(`Cache stats: ${this.stats.entries} entries, ${this.formatSize(this.stats.size)}`);
    } catch (error) {
      console.error('Failed to initialize YouTube cache:', error);
      throw error;
    }
  }

  /**
   * Setup automatic cleanup
   */
  setupCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupExpired();
        await this.enforceMaxSize();
      } catch (error) {
        console.error('Error during cache cleanup:', error);
      }
    }, this.config.cleanupInterval);
  }

  /**
   * Generate cache key hash
   */
  hashKey(key) {
    // Simple hash function for file names
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get cache file path for key
   */
  getCacheFilePath(key) {
    const hashedKey = this.hashKey(key);
    const prefix = hashedKey.substr(0, 2);
    const dir = path.join(this.config.cacheDir, prefix);
    return path.join(dir, `${hashedKey}.json`);
  }

  /**
   * Get cache metadata file path
   */
  getMetadataFilePath(key) {
    const cacheFilePath = this.getCacheFilePath(key);
    return cacheFilePath.replace('.json', '.meta.json');
  }

  /**
   * Set cache entry
   */
  async set(key, value, ttl = null) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const cacheFilePath = this.getCacheFilePath(key);
      const metadataFilePath = this.getMetadataFilePath(key);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
      
      // Prepare data
      const now = Date.now();
      const expiresAt = ttl ? now + ttl : now + this.config.defaultTTL;
      
      const cacheData = {
        key,
        value,
        createdAt: now,
        expiresAt,
        size: JSON.stringify(value).length
      };
      
      const metadata = {
        key,
        createdAt: now,
        expiresAt,
        size: cacheData.size,
        accessed: now
      };
      
      // Write files
      await Promise.all([
        fs.writeFile(cacheFilePath, JSON.stringify(cacheData, null, 2)),
        fs.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2))
      ]);
      
      this.stats.sets++;
      this.stats.size += cacheData.size;
      this.stats.entries++;
      
      this.emit('set', { key, size: cacheData.size, expiresAt });
      
      return true;
    } catch (error) {
      console.error(`Error setting cache for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get cache entry
   */
  async get(key) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const cacheFilePath = this.getCacheFilePath(key);
      const metadataFilePath = this.getMetadataFilePath(key);
      
      // Check if files exist
      const [cacheExists, metaExists] = await Promise.all([
        this.fileExists(cacheFilePath),
        this.fileExists(metadataFilePath)
      ]);
      
      if (!cacheExists || !metaExists) {
        this.stats.misses++;
        this.emit('cacheMiss', { key });
        return null;
      }
      
      // Read metadata first to check expiry
      const metadataContent = await fs.readFile(metadataFilePath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      // Check if expired
      if (Date.now() > metadata.expiresAt) {
        // Clean up expired entry
        await this.delete(key);
        this.stats.misses++;
        this.emit('cacheMiss', { key, reason: 'expired' });
        return null;
      }
      
      // Read cache data
      const cacheContent = await fs.readFile(cacheFilePath, 'utf8');
      const cacheData = JSON.parse(cacheContent);
      
      // Update access time
      metadata.accessed = Date.now();
      await fs.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2));
      
      this.stats.hits++;
      this.emit('cacheHit', { key, size: metadata.size });
      
      return cacheData.value;
    } catch (error) {
      console.error(`Error getting cache for key ${key}:`, error);
      this.stats.misses++;
      this.emit('cacheMiss', { key, reason: 'error' });
      return null;
    }
  }

  /**
   * Delete cache entry
   */
  async delete(key) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const cacheFilePath = this.getCacheFilePath(key);
      const metadataFilePath = this.getMetadataFilePath(key);
      
      // Get size before deletion for stats
      let size = 0;
      try {
        const metadataContent = await fs.readFile(metadataFilePath, 'utf8');
        const metadata = JSON.parse(metadataContent);
        size = metadata.size || 0;
      } catch (error) {
        // Metadata might not exist
      }
      
      // Delete files
      await Promise.all([
        this.deleteFile(cacheFilePath),
        this.deleteFile(metadataFilePath)
      ]);
      
      this.stats.deletes++;
      this.stats.size = Math.max(0, this.stats.size - size);
      this.stats.entries = Math.max(0, this.stats.entries - 1);
      
      this.emit('delete', { key, size });
      
      return true;
    } catch (error) {
      console.error(`Error deleting cache for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if cache entry exists
   */
  async has(key) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const cacheFilePath = this.getCacheFilePath(key);
    const metadataFilePath = this.getMetadataFilePath(key);
    
    const [cacheExists, metaExists] = await Promise.all([
      this.fileExists(cacheFilePath),
      this.fileExists(metadataFilePath)
    ]);
    
    if (!cacheExists || !metaExists) {
      return false;
    }
    
    // Check if expired
    try {
      const metadataContent = await fs.readFile(metadataFilePath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      return Date.now() <= metadata.expiresAt;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Remove all files in cache directory
      await this.removeDirectory(this.config.cacheDir);
      
      // Recreate cache directory
      await fs.mkdir(this.config.cacheDir, { recursive: true });
      
      // Reset stats
      this.stats.size = 0;
      this.stats.entries = 0;
      this.stats.deletes += this.stats.entries;
      
      this.emit('cleared');
      
      return true;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return false;
    }
  }

  /**
   * Clean up expired entries
   */
  async cleanupExpired() {
    if (!this.initialized) return;
    
    let cleaned = 0;
    let freedSpace = 0;
    
    try {
      await this.walkCacheDirectory(async (metadataFilePath) => {
        try {
          const metadataContent = await fs.readFile(metadataFilePath, 'utf8');
          const metadata = JSON.parse(metadataContent);
          
          if (Date.now() > metadata.expiresAt) {
            const deleted = await this.delete(metadata.key);
            if (deleted) {
              cleaned++;
              freedSpace += metadata.size || 0;
            }
          }
        } catch (error) {
          // Invalid metadata file, remove it
          await this.deleteFile(metadataFilePath);
          const cacheFilePath = metadataFilePath.replace('.meta.json', '.json');
          await this.deleteFile(cacheFilePath);
        }
      });
      
      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} expired cache entries, freed ${this.formatSize(freedSpace)}`);
        this.emit('cleanup', { expired: cleaned, freedSpace });
      }
    } catch (error) {
      console.error('Error during expired cleanup:', error);
    }
  }

  /**
   * Enforce maximum cache size by removing oldest accessed entries
   */
  async enforceMaxSize() {
    if (!this.initialized) return;
    if (this.stats.size <= this.config.maxCacheSize) return;
    
    const entries = [];
    
    // Collect all entries with metadata
    await this.walkCacheDirectory(async (metadataFilePath) => {
      try {
        const metadataContent = await fs.readFile(metadataFilePath, 'utf8');
        const metadata = JSON.parse(metadataContent);
        entries.push(metadata);
      } catch (error) {
        // Invalid metadata, ignore
      }
    });
    
    // Sort by last accessed (oldest first)
    entries.sort((a, b) => (a.accessed || a.createdAt) - (b.accessed || b.createdAt));
    
    let removedEntries = 0;
    let freedSpace = 0;
    
    // Remove entries until under size limit
    for (const entry of entries) {
      if (this.stats.size <= this.config.maxCacheSize * 0.8) break; // Stop at 80% of limit
      
      const deleted = await this.delete(entry.key);
      if (deleted) {
        removedEntries++;
        freedSpace += entry.size || 0;
      }
    }
    
    if (removedEntries > 0) {
      console.log(`Enforced cache size limit: removed ${removedEntries} entries, freed ${this.formatSize(freedSpace)}`);
      this.emit('sizeEnforced', { removed: removedEntries, freedSpace });
    }
  }

  /**
   * Update cache statistics
   */
  async updateStats() {
    if (!this.initialized) return;
    
    let entries = 0;
    let size = 0;
    
    try {
      await this.walkCacheDirectory(async (metadataFilePath) => {
        try {
          const metadataContent = await fs.readFile(metadataFilePath, 'utf8');
          const metadata = JSON.parse(metadataContent);
          entries++;
          size += metadata.size || 0;
        } catch (error) {
          // Invalid metadata
        }
      });
      
      this.stats.entries = entries;
      this.stats.size = size;
    } catch (error) {
      console.error('Error updating cache stats:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    await this.updateStats();
    
    return {
      ...this.stats,
      sizeFormatted: this.formatSize(this.stats.size),
      hitRate: this.stats.hits + this.stats.misses > 0 
        ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2) + '%'
        : '0%',
      initialized: this.initialized,
      config: {
        cacheDir: this.config.cacheDir,
        maxCacheSize: this.config.maxCacheSize,
        maxCacheSizeFormatted: this.formatSize(this.config.maxCacheSize)
      }
    };
  }

  /**
   * Walk through cache directory and execute callback for each metadata file
   */
  async walkCacheDirectory(callback) {
    const walkDir = async (dir) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await walkDir(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.meta.json')) {
            await callback(fullPath);
          }
        }
      } catch (error) {
        // Directory might not exist or be readable
      }
    };
    
    await walkDir(this.config.cacheDir);
  }

  /**
   * Utility: Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Utility: Delete file safely
   */
  async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Utility: Remove directory recursively
   */
  async removeDirectory(dirPath) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Utility: Format bytes to human readable size
   */
  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
      
      this.removeAllListeners();
      
      console.log('YouTube cache cleaned up');
    } catch (error) {
      console.error('Error during cache cleanup:', error);
    }
  }
}

module.exports = YouTubeCache;
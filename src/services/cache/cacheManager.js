class CacheManager {
  constructor() {
    this.cache = new Map();
    this.ttlMap = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes
    
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  /**
   * Get value from cache
   * @param {string} key 
   * @returns {any|null} Cached value or null if not found/expired
   */
  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }

    const ttl = this.ttlMap.get(key);
    if (ttl && Date.now() > ttl) {
      this.delete(key);
      return null;
    }

    return this.cache.get(key);
  }

  /**
   * Set value in cache with TTL
   * @param {string} key 
   * @param {any} value 
   * @param {number} ttlMs Time to live in milliseconds (optional)
   */
  set(key, value, ttlMs = this.defaultTTL) {
    this.cache.set(key, value);
    if (ttlMs > 0) {
      this.ttlMap.set(key, Date.now() + ttlMs);
    }
  }

  /**
   * Delete entry from cache
   * @param {string} key 
   */
  delete(key) {
    this.cache.delete(key);
    this.ttlMap.delete(key);
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key 
   * @returns {boolean}
   */
  has(key) {
    if (!this.cache.has(key)) {
      return false;
    }

    const ttl = this.ttlMap.get(key);
    if (ttl && Date.now() > ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get or set pattern - execute function and cache result if not cached
   * @param {string} key 
   * @param {Function} fn Function to execute if cache miss
   * @param {number} ttlMs 
   * @returns {any}
   */
  async getOrSet(key, fn, ttlMs = this.defaultTTL) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const result = await fn();
    this.set(key, result, ttlMs);
    return result;
  }

  /**
   * Clear all entries
   */
  clear() {
    this.cache.clear();
    this.ttlMap.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, ttl] of this.ttlMap.entries()) {
      if (now > ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.delete(key);
    }

    if (expiredKeys.length > 0) {
      console.log(`Cache cleanup: removed ${expiredKeys.length} expired entries`);
    }
  }

  /**
   * Estimate memory usage (rough calculation)
   * @returns {number} Estimated bytes
   */
  estimateMemoryUsage() {
    let total = 0;
    
    for (const [key, value] of this.cache.entries()) {
      total += key.length * 2; // UTF-16 encoding
      
      if (typeof value === 'string') {
        total += value.length * 2;
      } else if (typeof value === 'object') {
        total += JSON.stringify(value).length * 2;
      } else {
        total += 8; // Rough estimate for other types
      }
    }

    return total;
  }

  /**
   * Shutdown cache manager
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

// Singleton instance
const cacheManager = new CacheManager();

// Graceful shutdown
process.on('SIGTERM', () => {
  cacheManager.shutdown();
});

process.on('SIGINT', () => {
  cacheManager.shutdown();
});

module.exports = cacheManager;
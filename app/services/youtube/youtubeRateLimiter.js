const Bottleneck = require('bottleneck');
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

/**
 * YouTube API Rate Limiter for Desktop Application
 * Provides high-performance rate limiting with local quota tracking
 */
class YouTubeRateLimiter extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration with defaults
    this.config = {
      quotaLimit: options.quotaLimit || 50000, // High quota limit
      quotaFilePath: options.quotaFilePath || path.join(process.cwd(), 'app', 'data', 'youtube-quota.json'),
      maxConcurrent: options.maxConcurrent || 10,
      minTime: options.minTime || 50, // 50ms between requests
      highWater: options.highWater || 100,
      retryDelays: options.retryDelays || [500, 1000, 2000, 5000, 10000],
      ...options
    };
    
    // State
    this.quotaUsed = 0;
    this.quotaResetDate = null;
    this.initialized = false;
    
    // API method costs in quota units
    this.quotaCosts = {
      'channels.list': 1,
      'videos.list': 1,
      'playlistItems.list': 1,
      'search.list': 100,
      'captions.list': 50,
      'captions.download': 200,
      'comments.list': 1,
      'commentThreads.list': 1
    };
    
    // Quota thresholds
    this.quotaWarningThreshold = 0.80;  // 80% usage warning
    this.quotaCriticalThreshold = 0.95; // 95% usage critical
    
    // Bottleneck limiter
    this.limiter = null;
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      quotaExhaustedCount: 0,
      retryCount: 0
    };
  }

  /**
   * Initialize the rate limiter
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      await this.loadQuotaInfo();
      await this.checkQuotaReset();
      this.setupBottleneck();
      this.setupPeriodicTasks();
      
      this.initialized = true;
      this.emit('initialized');
      
      console.log('YouTube Rate Limiter initialized successfully');
    } catch (error) {
      console.error('Failed to initialize YouTube Rate Limiter:', error);
      throw error;
    }
  }

  /**
   * Setup Bottleneck rate limiter
   */
  setupBottleneck() {
    this.limiter = new Bottleneck({
      maxConcurrent: this.config.maxConcurrent,
      minTime: this.config.minTime,
      reservoir: this.getRemainingQuota(),
      reservoirRefreshInterval: 24 * 60 * 60 * 1000, // 24 hours
      reservoirRefreshAmount: this.config.quotaLimit,
      
      // High performance settings
      highWater: this.config.highWater,
      strategy: Bottleneck.strategy.LEAK,
      rejectOnDrop: false
    });
    
    // Setup event handlers
    this.limiter.on('error', (error) => {
      console.error('Bottleneck error:', error);
      this.emit('error', error);
    });
    
    this.limiter.on('failed', async (error, jobInfo) => {
      const { retryCount = 0 } = jobInfo.options.id || {};
      
      this.metrics.failedRequests++;
      
      if (retryCount < this.config.retryDelays.length) {
        const delay = this.config.retryDelays[retryCount];
        console.log(`Retrying after ${delay}ms (attempt ${retryCount + 1}/${this.config.retryDelays.length})`);
        
        this.metrics.retryCount++;
        jobInfo.options.id.retryCount = retryCount + 1;
        
        return delay;
      }
      
      return null; // No more retries
    });
    
    this.limiter.on('retry', (error, jobInfo) => {
      console.log(`Retrying job ${jobInfo.options.id.method}`);
    });
  }

  /**
   * Setup periodic tasks
   */
  setupPeriodicTasks() {
    // Check quota reset every minute
    setInterval(() => this.checkQuotaReset(), 60000);
    
    // Save quota info every 5 minutes
    setInterval(() => this.saveQuotaInfo(), 5 * 60 * 1000);
    
    // Emit metrics every minute
    setInterval(() => this.emitMetrics(), 60000);
  }

  /**
   * Load quota information from file
   */
  async loadQuotaInfo() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.quotaFilePath);
      await fs.mkdir(dir, { recursive: true });
      
      const data = await fs.readFile(this.config.quotaFilePath, 'utf8');
      const quotaInfo = JSON.parse(data);
      
      this.quotaUsed = quotaInfo.used || 0;
      this.config.quotaLimit = quotaInfo.limit || this.config.quotaLimit;
      this.quotaResetDate = new Date(quotaInfo.resetDate);
      
      console.log(`Loaded quota: ${this.quotaUsed}/${this.config.quotaLimit} used, resets at ${this.quotaResetDate}`);
    } catch (error) {
      // First run or file doesn't exist
      console.log('No existing quota file, initializing new quota tracking');
      await this.resetQuota();
    }
  }

  /**
   * Save quota information to file
   */
  async saveQuotaInfo() {
    const quotaInfo = {
      used: this.quotaUsed,
      limit: this.config.quotaLimit,
      resetDate: this.quotaResetDate ? this.quotaResetDate.toISOString() : null,
      lastUpdated: new Date().toISOString(),
      metrics: this.metrics
    };
    
    try {
      const dir = path.dirname(this.config.quotaFilePath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(this.config.quotaFilePath, JSON.stringify(quotaInfo, null, 2));
    } catch (error) {
      console.error('Error saving quota info:', error);
    }
  }

  /**
   * Check if quota needs to be reset
   */
  async checkQuotaReset() {
    const now = new Date();
    
    if (!this.quotaResetDate || now >= this.quotaResetDate) {
      await this.resetQuota();
    }
  }

  /**
   * Reset quota for new day
   */
  async resetQuota() {
    console.log('Resetting YouTube API quota');
    
    const previousUsed = this.quotaUsed;
    this.quotaUsed = 0;
    
    // Set next reset to tomorrow at midnight Pacific Time
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    // Adjust for Pacific Time (UTC-7 or UTC-8)
    const utcOffset = tomorrow.getTimezoneOffset();
    const pacificOffset = 420; // UTC-7 in minutes
    tomorrow.setMinutes(tomorrow.getMinutes() + (pacificOffset - utcOffset));
    
    this.quotaResetDate = tomorrow;
    
    // Update bottleneck reservoir
    if (this.limiter) {
      await this.limiter.updateSettings({
        reservoir: this.config.quotaLimit
      });
    }
    
    await this.saveQuotaInfo();
    
    // Emit reset event
    this.emit('quotaReset', {
      quotaLimit: this.config.quotaLimit,
      resetDate: this.quotaResetDate,
      previousUsed
    });
  }

  /**
   * Get quota cost for API method
   */
  getQuotaCost(method) {
    const methodName = method.replace('youtube.', '').replace('youtube/v3/', '');
    return this.quotaCosts[methodName] || 1;
  }

  /**
   * Get remaining quota
   */
  getRemainingQuota() {
    return Math.max(0, this.config.quotaLimit - this.quotaUsed);
  }

  /**
   * Get quota usage percentage
   */
  getQuotaPercentUsed() {
    return (this.quotaUsed / this.config.quotaLimit) * 100;
  }

  /**
   * Check if quota is available for method
   */
  isQuotaAvailable(method) {
    const cost = this.getQuotaCost(method);
    return this.getRemainingQuota() >= cost;
  }

  /**
   * Update quota usage after API call
   */
  async updateQuotaUsage(method, actualCost = null) {
    const cost = actualCost || this.getQuotaCost(method);
    this.quotaUsed += cost;
    
    // Update bottleneck reservoir
    if (this.limiter) {
      const remaining = this.getRemainingQuota();
      await this.limiter.updateSettings({
        reservoir: remaining
      });
    }
    
    // Check thresholds and emit events
    const percentUsed = this.getQuotaPercentUsed();
    
    if (percentUsed >= this.quotaCriticalThreshold * 100) {
      this.emit('quotaCritical', {
        quotaUsed: this.quotaUsed,
        quotaLimit: this.config.quotaLimit,
        percentUsed,
        remaining: this.getRemainingQuota()
      });
    } else if (percentUsed >= this.quotaWarningThreshold * 100) {
      this.emit('quotaWarning', {
        quotaUsed: this.quotaUsed,
        quotaLimit: this.config.quotaLimit,
        percentUsed,
        remaining: this.getRemainingQuota()
      });
    }
    
    if (this.getRemainingQuota() <= 0) {
      this.metrics.quotaExhaustedCount++;
      this.emit('quotaExhausted', {
        quotaUsed: this.quotaUsed,
        quotaLimit: this.config.quotaLimit,
        resetDate: this.quotaResetDate
      });
    }
    
    // Periodic save
    if (this.quotaUsed % 100 === 0) {
      await this.saveQuotaInfo();
    }
  }

  /**
   * Execute API call with rate limiting and retry logic
   */
  async executeWithRetry(method, apiCall, priority = 5, maxRetries = null) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Check if quota is available
    if (!this.isQuotaAvailable(method)) {
      const error = new Error(`Insufficient quota for ${method}. Remaining: ${this.getRemainingQuota()}, Required: ${this.getQuotaCost(method)}`);
      error.code = 'QUOTA_INSUFFICIENT';
      throw error;
    }
    
    // Job options for bottleneck
    const jobOptions = {
      priority, // 0 = highest, 9 = lowest
      weight: this.getQuotaCost(method),
      expiration: 60000, // 1 minute
      id: { 
        method, 
        retryCount: 0,
        timestamp: Date.now()
      }
    };
    
    this.metrics.totalRequests++;
    
    try {
      const result = await this.limiter.schedule(jobOptions, async () => {
        // Execute the actual API call
        const response = await apiCall();
        
        // Update quota usage on success
        await this.updateQuotaUsage(method);
        this.metrics.successfulRequests++;
        
        return response;
      });
      
      return result;
    } catch (error) {
      this.metrics.failedRequests++;
      
      // Handle specific YouTube API errors
      if (error.response?.status === 403) {
        const errorData = error.response.data;
        if (errorData?.error?.errors?.[0]?.reason === 'quotaExceeded') {
          // YouTube says quota exceeded, sync our tracking
          this.quotaUsed = this.config.quotaLimit;
          await this.saveQuotaInfo();
          
          const quotaError = new Error('YouTube API quota exceeded. Please wait for quota reset.');
          quotaError.code = 'QUOTA_EXCEEDED';
          throw quotaError;
        }
      }
      
      // Add error context
      error.method = method;
      error.timestamp = new Date().toISOString();
      
      throw error;
    }
  }

  /**
   * Execute multiple operations in batch
   */
  async executeBatch(operations, options = {}) {
    const { maxConcurrent = 5, onProgress = null } = options;
    
    const results = [];
    const errors = [];
    
    // Process in chunks to avoid overwhelming the queue
    const chunks = [];
    for (let i = 0; i < operations.length; i += maxConcurrent) {
      chunks.push(operations.slice(i, i + maxConcurrent));
    }
    
    let completed = 0;
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (op) => {
        try {
          const result = await this.executeWithRetry(
            op.method, 
            op.apiCall, 
            op.priority || 5
          );
          
          results.push({ 
            success: true, 
            data: result, 
            operation: op,
            completedAt: new Date().toISOString()
          });
          
        } catch (error) {
          errors.push({ 
            success: false, 
            error, 
            operation: op,
            completedAt: new Date().toISOString()
          });
        }
        
        completed++;
        
        if (onProgress) {
          onProgress({
            completed,
            total: operations.length,
            currentChunk: chunk.length,
            success: results.length,
            errors: errors.length
          });
        }
      });
      
      await Promise.allSettled(promises);
    }
    
    return { 
      results, 
      errors, 
      total: operations.length,
      summary: {
        successful: results.length,
        failed: errors.length,
        quotaUsed: this.quotaUsed,
        quotaRemaining: this.getRemainingQuota()
      }
    };
  }

  /**
   * Get current status for monitoring
   */
  getStatus() {
    const remaining = this.getRemainingQuota();
    const percentUsed = this.getQuotaPercentUsed();
    
    return {
      quotaUsed: this.quotaUsed,
      quotaLimit: this.config.quotaLimit,
      quotaRemaining: remaining,
      percentUsed: percentUsed.toFixed(2),
      resetDate: this.quotaResetDate,
      resetIn: this.quotaResetDate ? Math.max(0, this.quotaResetDate - new Date()) : 0,
      status: percentUsed >= 95 ? 'critical' : percentUsed >= 80 ? 'warning' : 'normal',
      queueSize: this.limiter ? this.limiter.counts().QUEUED : 0,
      running: this.limiter ? this.limiter.counts().RUNNING : 0,
      metrics: { ...this.metrics },
      initialized: this.initialized
    };
  }

  /**
   * Emit metrics for monitoring
   */
  emitMetrics() {
    this.emit('metrics', {
      ...this.metrics,
      quotaStatus: this.getStatus(),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      if (this.limiter) {
        await this.limiter.stop();
      }
      
      await this.saveQuotaInfo();
      this.removeAllListeners();
      
      console.log('YouTube Rate Limiter cleaned up');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

module.exports = YouTubeRateLimiter;
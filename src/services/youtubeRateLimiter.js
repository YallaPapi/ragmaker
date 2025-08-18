const Bottleneck = require('bottleneck');
const fs = require('fs').promises;
const path = require('path');

class YouTubeRateLimiter {
  constructor() {
    // HIGH LIMITS CONFIGURATION (5x default quota)
    this.quotaLimit = 50000; // 50k units/day (vs 10k default)
    this.quotaUsed = 0;
    this.quotaResetDate = null;
    this.quotaFilePath = path.join(__dirname, '../../data/youtube-quota.json');
    
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
    
    // Bottleneck configuration for high performance
    this.limiter = new Bottleneck({
      maxConcurrent: 10,        // 10 concurrent requests
      minTime: 50,              // 50ms between requests (20 req/sec)
      reservoir: this.quotaLimit,
      reservoirRefreshInterval: 24 * 60 * 60 * 1000, // 24 hours
      reservoirRefreshAmount: this.quotaLimit,
      
      // High performance settings
      highWater: 100,           // Start processing when 100 jobs queued
      strategy: Bottleneck.strategy.LEAK, // Drop old jobs if queue fills
      rejectOnDrop: false       // Don't reject, just drop silently
    });
    
    // Retry configuration with shorter delays for high performance
    this.retryDelays = [500, 1000, 2000, 5000, 10000]; // ms
    
    // Quota thresholds
    this.quotaWarningThreshold = 0.80;  // 80% usage warning
    this.quotaCriticalThreshold = 0.95; // 95% usage critical
    
    // Event listeners
    this.eventListeners = {
      quotaWarning: [],
      quotaCritical: [],
      quotaExhausted: [],
      quotaReset: []
    };
    
    // Initialize
    this.initialize();
  }
  
  async initialize() {
    await this.loadQuotaInfo();
    await this.checkQuotaReset();
    
    // Set up periodic quota check (every minute)
    setInterval(() => this.checkQuotaReset(), 60000);
    
    // Set up bottleneck event handlers
    this.limiter.on('error', (error) => {
      console.error('Bottleneck error:', error);
    });
    
    this.limiter.on('failed', async (error, jobInfo) => {
      const { retryCount } = jobInfo.options.id;
      if (retryCount < this.retryDelays.length) {
        const delay = this.retryDelays[retryCount];
        console.log(`Retrying after ${delay}ms (attempt ${retryCount + 1}/${this.retryDelays.length})`);
        return delay;
      }
    });
    
    this.limiter.on('retry', (error, jobInfo) => {
      console.log(`Retrying job ${jobInfo.options.id}`);
    });
  }
  
  async loadQuotaInfo() {
    try {
      const data = await fs.readFile(this.quotaFilePath, 'utf8');
      const quotaInfo = JSON.parse(data);
      
      this.quotaUsed = quotaInfo.used || 0;
      this.quotaLimit = quotaInfo.limit || 50000;
      this.quotaResetDate = new Date(quotaInfo.resetDate);
      
      // Update reservoir with loaded quota
      const remaining = this.quotaLimit - this.quotaUsed;
      await this.limiter.updateSettings({
        reservoir: remaining
      });
      
      console.log(`Loaded quota: ${this.quotaUsed}/${this.quotaLimit} used, resets at ${this.quotaResetDate}`);
    } catch (error) {
      // First run or file doesn't exist
      console.log('No existing quota file, initializing new quota tracking');
      await this.resetQuota();
    }
  }
  
  async saveQuotaInfo() {
    const quotaInfo = {
      used: this.quotaUsed,
      limit: this.quotaLimit,
      resetDate: this.quotaResetDate.toISOString(),
      lastUpdated: new Date().toISOString()
    };
    
    try {
      // Ensure directory exists
      const dir = path.dirname(this.quotaFilePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Save quota info
      await fs.writeFile(this.quotaFilePath, JSON.stringify(quotaInfo, null, 2));
    } catch (error) {
      console.error('Error saving quota info:', error);
    }
  }
  
  async checkQuotaReset() {
    const now = new Date();
    
    if (!this.quotaResetDate || now >= this.quotaResetDate) {
      await this.resetQuota();
    }
  }
  
  async resetQuota() {
    console.log('Resetting YouTube API quota');
    
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
    
    // Reset the reservoir
    await this.limiter.updateSettings({
      reservoir: this.quotaLimit
    });
    
    await this.saveQuotaInfo();
    
    // Emit reset event
    this.emit('quotaReset', {
      quotaLimit: this.quotaLimit,
      resetDate: this.quotaResetDate
    });
  }
  
  getQuotaCost(method) {
    // Extract method name from full path if needed
    const methodName = method.replace('youtube.', '').replace('youtube/v3/', '');
    return this.quotaCosts[methodName] || 1;
  }
  
  getRemainingQuota() {
    return Math.max(0, this.quotaLimit - this.quotaUsed);
  }
  
  getQuotaPercentUsed() {
    return (this.quotaUsed / this.quotaLimit) * 100;
  }
  
  isQuotaAvailable(method) {
    const cost = this.getQuotaCost(method);
    return this.getRemainingQuota() >= cost;
  }
  
  async updateQuotaUsage(method, actualCost = null) {
    const cost = actualCost || this.getQuotaCost(method);
    this.quotaUsed += cost;
    
    // Update reservoir
    const remaining = this.getRemainingQuota();
    await this.limiter.updateSettings({
      reservoir: remaining
    });
    
    // Check thresholds
    const percentUsed = this.getQuotaPercentUsed();
    
    if (percentUsed >= this.quotaCriticalThreshold * 100) {
      this.emit('quotaCritical', {
        quotaUsed: this.quotaUsed,
        quotaLimit: this.quotaLimit,
        percentUsed,
        remaining: remaining
      });
    } else if (percentUsed >= this.quotaWarningThreshold * 100) {
      this.emit('quotaWarning', {
        quotaUsed: this.quotaUsed,
        quotaLimit: this.quotaLimit,
        percentUsed,
        remaining: remaining
      });
    }
    
    if (remaining <= 0) {
      this.emit('quotaExhausted', {
        quotaUsed: this.quotaUsed,
        quotaLimit: this.quotaLimit,
        resetDate: this.quotaResetDate
      });
    }
    
    // Save updated quota
    await this.saveQuotaInfo();
  }
  
  async executeWithRateLimit(method, apiCall, priority = 5) {
    // Check if quota is available
    if (!this.isQuotaAvailable(method)) {
      throw new Error(`Insufficient quota for ${method}. Remaining: ${this.getRemainingQuota()}, Required: ${this.getQuotaCost(method)}`);
    }
    
    // Schedule the API call with bottleneck
    const jobOptions = {
      priority, // 0 = highest, 9 = lowest
      weight: this.getQuotaCost(method), // Use quota cost as weight
      expiration: 60000, // Expire after 1 minute
      id: { method, retryCount: 0 }
    };
    
    try {
      const result = await this.limiter.schedule(jobOptions, async () => {
        // Execute the actual API call
        const response = await apiCall();
        
        // Update quota usage on success
        await this.updateQuotaUsage(method);
        
        return response;
      });
      
      return result;
    } catch (error) {
      // Handle specific YouTube API errors
      if (error.code === 403 && error.message?.includes('quotaExceeded')) {
        // YouTube says quota exceeded, sync our tracking
        this.quotaUsed = this.quotaLimit;
        await this.saveQuotaInfo();
        throw new Error('YouTube API quota exceeded. Please wait for quota reset.');
      }
      
      throw error;
    }
  }
  
  async executeWithRetry(method, apiCall, priority = 5, maxRetries = 5) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.executeWithRateLimit(method, apiCall, priority);
      } catch (error) {
        lastError = error;
        
        // Don't retry on quota errors
        if (error.message?.includes('quota')) {
          throw error;
        }
        
        // Don't retry on 4xx errors (except 429)
        if (error.code >= 400 && error.code < 500 && error.code !== 429) {
          throw error;
        }
        
        // Calculate delay with exponential backoff
        const delay = this.retryDelays[Math.min(i, this.retryDelays.length - 1)];
        console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms for ${method}`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
  
  // Event emitter methods
  on(event, listener) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(listener);
    }
  }
  
  off(event, listener) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(l => l !== listener);
    }
  }
  
  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }
  
  // Get current status for UI display
  getStatus() {
    const remaining = this.getRemainingQuota();
    const percentUsed = this.getQuotaPercentUsed();
    
    return {
      quotaUsed: this.quotaUsed,
      quotaLimit: this.quotaLimit,
      quotaRemaining: remaining,
      percentUsed: percentUsed.toFixed(2),
      resetDate: this.quotaResetDate,
      resetIn: this.quotaResetDate ? Math.max(0, this.quotaResetDate - new Date()) : 0,
      status: percentUsed >= 95 ? 'critical' : percentUsed >= 80 ? 'warning' : 'normal',
      queueSize: this.limiter.counts().QUEUED,
      running: this.limiter.counts().RUNNING
    };
  }
  
  // Convenience methods for common YouTube API operations
  async fetchChannelDetails(apiCall) {
    return this.executeWithRetry('channels.list', apiCall, 3);
  }
  
  async fetchVideoList(apiCall) {
    return this.executeWithRetry('videos.list', apiCall, 5);
  }
  
  async fetchPlaylistItems(apiCall) {
    return this.executeWithRetry('playlistItems.list', apiCall, 5);
  }
  
  async searchVideos(apiCall) {
    // Search is expensive (100 units), use lower priority
    return this.executeWithRetry('search.list', apiCall, 7);
  }
  
  async fetchCaptions(apiCall) {
    return this.executeWithRetry('captions.list', apiCall, 4);
  }
  
  async downloadCaptions(apiCall) {
    // Caption download is expensive (200 units), use highest priority
    return this.executeWithRetry('captions.download', apiCall, 1);
  }
  
  // Batch operations optimizer
  async executeBatch(operations, maxConcurrent = 5) {
    const results = [];
    const errors = [];
    
    // Process in chunks to avoid overwhelming the queue
    const chunks = [];
    for (let i = 0; i < operations.length; i += maxConcurrent) {
      chunks.push(operations.slice(i, i + maxConcurrent));
    }
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (op) => {
        try {
          const result = await this.executeWithRetry(op.method, op.apiCall, op.priority || 5);
          results.push({ success: true, data: result, operation: op });
        } catch (error) {
          errors.push({ success: false, error, operation: op });
        }
      });
      
      await Promise.allSettled(promises);
    }
    
    return { results, errors, total: operations.length };
  }
}

module.exports = YouTubeRateLimiter;
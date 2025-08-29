const axios = require('axios');
const { EventEmitter } = require('events');
const { Innertube } = require('youtubei.js');
const YouTubeRateLimiter = require('./youtubeRateLimiter');
const YouTubeCache = require('./youtubeCache');

/**
 * Local YouTube service for desktop application
 * Provides YouTube Data API integration with local caching and storage
 */
class YouTubeService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.apiKey = config.apiKey;
    this.innertube = null;
    this.rateLimiter = new YouTubeRateLimiter(config.rateLimiting);
    this.cache = new YouTubeCache(config.cache);
    
    this.initialized = false;
    this.retryDelays = [500, 1000, 2000, 5000];
    
    // Bind event handlers
    this.setupEventHandlers();
  }

  /**
   * Initialize the YouTube service
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      await this.initInnertube();
      await this.cache.initialize();
      await this.rateLimiter.initialize();
      
      this.initialized = true;
      this.emit('initialized');
      
      console.log('YouTube service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize YouTube service:', error);
      throw error;
    }
  }

  /**
   * Initialize Innertube for transcript fetching
   */
  async initInnertube() {
    if (!this.innertube) {
      this.innertube = await Innertube.create();
    }
    return this.innertube;
  }

  /**
   * Setup event handlers for rate limiter and cache
   */
  setupEventHandlers() {
    this.rateLimiter.on('quotaWarning', (data) => {
      this.emit('quotaWarning', data);
    });
    
    this.rateLimiter.on('quotaCritical', (data) => {
      this.emit('quotaCritical', data);
    });
    
    this.rateLimiter.on('quotaExhausted', (data) => {
      this.emit('quotaExhausted', data);
    });
    
    this.cache.on('cacheHit', (data) => {
      this.emit('cacheHit', data);
    });
    
    this.cache.on('cacheMiss', (data) => {
      this.emit('cacheMiss', data);
    });
  }

  /**
   * Resolve channel identifier to channel ID
   */
  async resolveChannelId(identifier) {
    // Check cache first
    const cached = await this.cache.get(`channel:id:${identifier}`);
    if (cached) {
      return cached;
    }

    // If already a channel ID, return as-is
    if (identifier.startsWith('UC') && identifier.length === 24) {
      await this.cache.set(`channel:id:${identifier}`, identifier, 24 * 60 * 60 * 1000); // 24 hours
      return identifier;
    }
    
    // Remove @ symbol if present
    const cleanIdentifier = identifier.startsWith('@') ? identifier.substring(1) : identifier;
    
    try {
      console.log(`Resolving channel ID for: ${identifier}`);
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(cleanIdentifier)}&key=${this.apiKey}`;
      
      // Use rate limiter for search API call (100 units)
      const response = await this.rateLimiter.executeWithRetry('search.list', async () => {
        return await axios.get(searchUrl, { timeout: 10000 });
      });
      
      if (response.data.items && response.data.items.length > 0) {
        const channelId = response.data.items[0].snippet.channelId;
        console.log(`Resolved ${identifier} to ${channelId}`);
        
        // Cache the resolution
        await this.cache.set(`channel:id:${identifier}`, channelId, 24 * 60 * 60 * 1000);
        
        return channelId;
      }
      
      console.log(`No results found for ${identifier}`);
    } catch (error) {
      console.error('Channel search error:', error.message);
    }
    
    // Fallback to clean identifier
    await this.cache.set(`channel:id:${identifier}`, cleanIdentifier, 24 * 60 * 60 * 1000);
    return cleanIdentifier;
  }

  /**
   * Get channel information
   */
  async getChannelInfo(channelId) {
    const resolvedId = await this.resolveChannelId(channelId);
    
    // Check cache first
    const cached = await this.cache.get(`channel:info:${resolvedId}`);
    if (cached) {
      return cached;
    }
    
    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&id=${resolvedId}&key=${this.apiKey}`;
    
    // Use rate limiter for channels API call (1 unit)
    const response = await this.rateLimiter.executeWithRetry('channels.list', async () => {
      return await axios.get(channelUrl, { timeout: 10000 });
    });
    
    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('Channel not found');
    }
    
    const channelData = response.data.items[0];
    const channelInfo = {
      id: resolvedId,
      name: channelData.snippet.title,
      description: channelData.snippet.description,
      thumbnail: channelData.snippet.thumbnails?.high?.url || channelData.snippet.thumbnails?.default?.url,
      subscriberCount: parseInt(channelData.statistics?.subscriberCount || 0),
      videoCount: parseInt(channelData.statistics?.videoCount || 0),
      uploadsPlaylistId: channelData.contentDetails?.relatedPlaylists?.uploads,
      publishedAt: channelData.snippet.publishedAt
    };
    
    // Cache channel info for 1 hour
    await this.cache.set(`channel:info:${resolvedId}`, channelInfo, 60 * 60 * 1000);
    
    return channelInfo;
  }

  /**
   * Get videos from a channel
   */
  async getChannelVideos(channelId, options = {}) {
    const { maxResults = 50, pageToken = '', publishedAfter = null } = options;
    
    try {
      const channelInfo = await this.getChannelInfo(channelId);
      const uploadsPlaylistId = channelInfo.uploadsPlaylistId;
      
      if (!uploadsPlaylistId) {
        throw new Error('No uploads playlist found for channel');
      }
      
      // Build cache key
      const cacheKey = `channel:videos:${channelId}:${maxResults}:${pageToken}:${publishedAfter || 'all'}`;
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
      
      let playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${this.apiKey}`;
      
      if (pageToken) {
        playlistUrl += `&pageToken=${pageToken}`;
      }
      
      if (publishedAfter) {
        playlistUrl += `&publishedAfter=${publishedAfter}`;
      }
      
      // Use rate limiter for playlistItems.list API (1 unit)
      const response = await this.rateLimiter.executeWithRetry('playlistItems.list', async () => {
        return await axios.get(playlistUrl, { timeout: 15000 });
      });
      
      const videos = [];
      for (const item of response.data.items) {
        videos.push({
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          publishedAt: item.snippet.publishedAt,
          url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url
        });
      }
      
      const result = {
        videos,
        nextPageToken: response.data.nextPageToken,
        totalResults: response.data.pageInfo?.totalResults || videos.length
      };
      
      // Cache for 30 minutes
      await this.cache.set(cacheKey, result, 30 * 60 * 1000);
      
      return result;
    } catch (error) {
      console.error('Error fetching channel videos:', error);
      throw error;
    }
  }

  /**
   * Get all videos from a channel (paginated)
   */
  async getAllChannelVideos(channelId, options = {}) {
    const { excludeShorts = false, publishedAfter = null, onProgress = null } = options;
    
    const allVideos = [];
    let pageToken = '';
    let pageCount = 0;
    
    const channelInfo = await this.getChannelInfo(channelId);
    
    do {
      try {
        const result = await this.getChannelVideos(channelId, {
          maxResults: 50,
          pageToken,
          publishedAfter
        });
        
        allVideos.push(...result.videos);
        pageToken = result.nextPageToken || '';
        pageCount++;
        
        if (onProgress) {
          onProgress({
            page: pageCount,
            totalVideos: allVideos.length,
            currentBatch: result.videos.length,
            hasMore: !!pageToken
          });
        }
        
        // Emit progress event
        this.emit('videosProgress', {
          channelId,
          channelName: channelInfo.name,
          totalVideos: allVideos.length,
          page: pageCount
        });
        
        // Small delay between requests
        if (pageToken) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.error(`Error fetching page ${pageCount + 1}:`, error);
        break;
      }
    } while (pageToken);
    
    // Filter out shorts if requested
    let finalVideos = allVideos;
    if (excludeShorts) {
      // Get metadata for duration filtering
      const videoIds = allVideos.map(v => v.videoId);
      const metadata = await this.getVideoMetadata(videoIds);
      
      finalVideos = allVideos.filter(video => {
        const videoMeta = metadata[video.videoId];
        if (!videoMeta || !videoMeta.duration) return true;
        
        const duration = this.parseDuration(videoMeta.duration);
        return duration >= 60; // Keep videos 60 seconds or longer
      });
      
      const shortsFiltered = allVideos.length - finalVideos.length;
      if (shortsFiltered > 0) {
        console.log(`Filtered out ${shortsFiltered} YouTube Shorts`);
      }
    }
    
    return {
      channelInfo,
      videos: finalVideos,
      totalFetched: allVideos.length,
      totalFiltered: finalVideos.length
    };
  }

  /**
   * Get video metadata in batches
   */
  async getVideoMetadata(videoIds) {
    const metadata = {};
    const chunks = [];
    
    // Process in chunks of 50 (API limit)
    for (let i = 0; i < videoIds.length; i += 50) {
      chunks.push(videoIds.slice(i, i + 50));
    }
    
    for (const chunk of chunks) {
      // Check cache first
      const uncachedIds = [];
      for (const videoId of chunk) {
        const cached = await this.cache.get(`video:metadata:${videoId}`);
        if (cached) {
          metadata[videoId] = cached;
        } else {
          uncachedIds.push(videoId);
        }
      }
      
      if (uncachedIds.length > 0) {
        const batch = uncachedIds.join(',');
        const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${batch}&key=${this.apiKey}`;
        
        try {
          const response = await this.rateLimiter.executeWithRetry('videos.list', async () => {
            return await axios.get(url, { timeout: 15000 });
          });
          
          for (const video of response.data.items) {
            const videoMetadata = {
              title: video.snippet.title,
              description: video.snippet.description,
              publishedAt: video.snippet.publishedAt,
              duration: video.contentDetails.duration,
              viewCount: parseInt(video.statistics.viewCount || 0),
              likeCount: parseInt(video.statistics.likeCount || 0),
              commentCount: parseInt(video.statistics.commentCount || 0),
              thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url
            };
            
            metadata[video.id] = videoMetadata;
            
            // Cache metadata for 2 hours
            await this.cache.set(`video:metadata:${video.id}`, videoMetadata, 2 * 60 * 60 * 1000);
          }
        } catch (error) {
          console.error('Error fetching video metadata:', error);
        }
      }
      
      // Small delay between chunks
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    return metadata;
  }

  /**
   * Get video transcript
   */
  async getVideoTranscript(videoId) {
    // Check cache first
    const cached = await this.cache.get(`video:transcript:${videoId}`);
    if (cached) {
      return cached;
    }

    const categorize = (msg) => {
      const m = (msg || '').toLowerCase();
      if (m.includes('disabled')) return 'CAPTIONS_DISABLED';
      if (m.includes('not available') || m.includes('no transcript')) return 'NO_CAPTIONS';
      if (m.includes('private') || m.includes('unavailable') || m.includes('age')) return 'PRIVATE_OR_RESTRICTED';
      if (m.includes('expandablemetadata') || m.includes('structure')) return 'STRUCTURE_UNSUPPORTED';
      if (m.includes('quota')) return 'RATE_LIMIT';
      if (m.includes('timeout') || m.includes('timed out') || m.includes('network') || m.includes('econn') || m.includes('socket')) return 'TRANSIENT_ERROR';
      return 'UNKNOWN';
    };
    
    const extractText = (transcriptInfo) => {
      if (!transcriptInfo || !transcriptInfo.transcript || !transcriptInfo.transcript.content || !transcriptInfo.transcript.content.body) {
        return { success: false, category: 'STRUCTURE_UNSUPPORTED', details: 'Invalid transcript structure' };
      }
      
      const segmentList = transcriptInfo.transcript.content.body;
      let segments = [];
      
      if (segmentList.initial_segments) {
        segments = segmentList.initial_segments;
      } else if (Array.isArray(segmentList)) {
        segments = segmentList[0]?.transcript_segment_list?.initial_segments || [];
      } else if (segmentList.transcript_segment_list) {
        segments = segmentList.transcript_segment_list.initial_segments || [];
      }
      
      if (segments.length === 0) {
        return { success: false, category: 'NO_CAPTIONS', details: 'No transcript segments' };
      }
      
      const fullText = segments
        .map(segment => segment?.snippet?.text || segment?.text || '')
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (fullText.length <= 10) {
        return { success: false, category: 'TOO_SHORT', details: `Transcript too short (${fullText.length} chars)` };
      }
      
      return { 
        success: true, 
        data: { 
          videoId, 
          transcript: fullText, 
          segments: segments.length,
          extractedAt: new Date().toISOString()
        } 
      };
    };
    
    try {
      await this.initInnertube();
      let info;
      
      try {
        info = await this.innertube.getInfo(videoId);
      } catch (e) {
        const category = categorize(e.message);
        const result = { success: false, category, details: e.message };
        
        // Cache failures for 1 hour to avoid repeated attempts
        if (['NO_CAPTIONS', 'PRIVATE_OR_RESTRICTED', 'CAPTIONS_DISABLED'].includes(category)) {
          await this.cache.set(`video:transcript:${videoId}`, result, 60 * 60 * 1000);
        }
        
        return result;
      }
      
      if (!info.captions || !info.captions.caption_tracks || info.captions.caption_tracks.length === 0) {
        const result = { success: false, category: 'NO_CAPTIONS', details: 'No captions available' };
        await this.cache.set(`video:transcript:${videoId}`, result, 60 * 60 * 1000);
        return result;
      }
      
      const availableLanguages = info.captions.caption_tracks.map(track => track.language?.name || 'unknown');
      console.log(`Available captions for ${videoId}: ${availableLanguages.join(', ')}`);
      
      // Try fetching transcript with retry for transient errors
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const transcriptInfo = await info.getTranscript();
          const extracted = extractText(transcriptInfo);
          
          if (extracted.success) {
            console.log(`Successfully extracted transcript for ${videoId} (attempt ${attempt})`);
            
            // Cache successful transcripts for 7 days
            await this.cache.set(`video:transcript:${videoId}`, extracted, 7 * 24 * 60 * 60 * 1000);
            
            return extracted;
          }
          
          // If extraction failed due to structure/too short, do not retry
          if (['STRUCTURE_UNSUPPORTED', 'TOO_SHORT', 'NO_CAPTIONS'].includes(extracted.category)) {
            await this.cache.set(`video:transcript:${videoId}`, extracted, 60 * 60 * 1000);
            return extracted;
          }
          
        } catch (transcriptError) {
          const category = categorize(transcriptError.message);
          
          // Retry only on transient errors
          if (category !== 'TRANSIENT_ERROR' || attempt === maxAttempts) {
            const result = { success: false, category, details: transcriptError.message };
            
            // Cache persistent failures
            if (!['TRANSIENT_ERROR'].includes(category)) {
              await this.cache.set(`video:transcript:${videoId}`, result, 60 * 60 * 1000);
            }
            
            return result;
          }
          
          const backoff = 300 * attempt;
          console.log(`Transcript fetch transient error for ${videoId}, retrying in ${backoff}ms (attempt ${attempt}/${maxAttempts})`);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
      
      const result = { success: false, category: 'UNKNOWN', details: 'Exhausted transcript attempts' };
      return result;
      
    } catch (error) {
      const category = categorize(error.message);
      const result = { success: false, category, details: error.message };
      
      // Cache certain failures
      if (!['TRANSIENT_ERROR'].includes(category)) {
        await this.cache.set(`video:transcript:${videoId}`, result, 60 * 60 * 1000);
      }
      
      return result;
    }
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  parseDuration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Get quota status
   */
  getQuotaStatus() {
    return this.rateLimiter.getStatus();
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return await this.cache.getStats();
  }

  /**
   * Clear cache
   */
  async clearCache() {
    await this.cache.clear();
    this.emit('cacheCleared');
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      await this.cache.cleanup();
      this.removeAllListeners();
      console.log('YouTube service cleaned up');
    } catch (error) {
      console.error('Error during YouTube service cleanup:', error);
    }
  }
}

module.exports = YouTubeService;
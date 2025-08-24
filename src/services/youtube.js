const axios = require('axios');
const config = require('../config');
const { Innertube } = require('youtubei.js');
const YouTubeRateLimiter = require('./youtubeRateLimiter');

class YouTubeService {
  constructor() {
    this.apiKey = config.youtube.apiKey;
    this.innertube = null;
    this.rateLimiter = new YouTubeRateLimiter();
  }

  async initInnertube() {
    if (!this.innertube) {
      this.innertube = await Innertube.create();
    }
    return this.innertube;
  }

  async resolveChannelId(identifier) {
    if (identifier.startsWith('UC') && identifier.length === 24) {
      return identifier;
    }
    
    // Remove @ symbol if present
    const cleanIdentifier = identifier.startsWith('@') ? identifier.substring(1) : identifier;
    
    try {
      console.log(`Resolving channel ID for: ${identifier}`);
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(cleanIdentifier)}&key=${this.apiKey}`;
      
      // Use rate limiter for search API call (1 unit)
      await this.rateLimiter.checkQuota('search.list', 1);
      const response = await axios.get(searchUrl, { timeout: 5000 });
      
      if (response.data.items && response.data.items.length > 0) {
        const channelId = response.data.items[0].snippet.channelId;
        console.log(`Resolved ${identifier} to ${channelId}`);
        return channelId;
      }
      
      console.log(`No results found for ${identifier}`);
    } catch (error) {
      console.error('Channel search error:', error.message);
    }
    
    return cleanIdentifier;
  }

  async getChannelInfo(channelId) {
    const resolvedId = await this.resolveChannelId(channelId);
    
    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&id=${resolvedId}&key=${this.apiKey}`;
    
    // Use rate limiter for channels API call (1 unit)
    await this.rateLimiter.checkQuota('channels.list', 1);
    const response = await axios.get(channelUrl, { timeout: 5000 });
    
    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('Channel not found');
    }
    
    return {
      id: resolvedId,
      name: response.data.items[0].snippet.title,
      description: response.data.items[0].snippet.description,
      uploadsPlaylistId: response.data.items[0].contentDetails.relatedPlaylists.uploads
    };
  }

  async getChannelVideos(channelId, options = {}) {
    try {
      const videos = [];
      let pageToken = '';
      
      const channelInfo = await this.getChannelInfo(channelId);
      const uploadsPlaylistId = channelInfo.uploadsPlaylistId;
      
      do {
        const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&pageToken=${pageToken}&key=${this.apiKey}`;
        
        // Use rate limiter for playlistItems.list API (1 unit)
        await this.rateLimiter.checkQuota('playlistItems.list', 1);
        const response = await axios.get(playlistUrl, { timeout: 10000 });
        
        for (const item of response.data.items) {
          videos.push({
            videoId: item.snippet.resourceId.videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            publishedAt: item.snippet.publishedAt,
            url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
          });
        }
        
        pageToken = response.data.nextPageToken || '';
      } while (pageToken);
      
      return videos;
    } catch (error) {
      console.error('Error fetching channel videos:', error);
      throw error;
    }
  }

  async getVideoTranscript(videoId) {
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
      return { success: true, data: { videoId, transcript: fullText, segments: segments.length } };
    };
    
    try {
      await this.initInnertube();
      let info;
      try {
        info = await this.innertube.getInfo(videoId);
      } catch (e) {
        const category = categorize(e.message);
        return { success: false, category, details: e.message };
      }
      if (!info.captions) {
        return { success: false, category: 'NO_CAPTIONS', details: 'No captions object' };
      }
      if (!info.captions.caption_tracks) {
        return { success: false, category: 'NO_CAPTIONS', details: 'No caption_tracks' };
      }
      if (info.captions.caption_tracks.length === 0) {
        return { success: false, category: 'NO_CAPTIONS', details: 'Empty caption_tracks' };
      }
      const availableLanguages = info.captions.caption_tracks.map(track => track.language?.name || 'unknown');
      console.log(`Available captions for ${videoId}: ${availableLanguages.join(', ')}`);
      
      // Try fetching transcript with small retry for transient errors
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const transcriptInfo = await info.getTranscript();
          const extracted = extractText(transcriptInfo);
          if (extracted.success) {
            console.log(`Successfully extracted transcript for ${videoId} (attempt ${attempt})`);
            return extracted;
          }
          // If extraction failed due to structure/too short, do not retry further
          if (['STRUCTURE_UNSUPPORTED', 'TOO_SHORT', 'NO_CAPTIONS'].includes(extracted.category)) {
            return extracted;
          }
        } catch (transcriptError) {
          const category = categorize(transcriptError.message);
          // Retry only on transient
          if (category !== 'TRANSIENT_ERROR' || attempt === maxAttempts) {
            return { success: false, category, details: transcriptError.message };
          }
          const backoff = 300 * attempt;
          console.log(`Transcript fetch transient error for ${videoId}, retrying in ${backoff}ms (attempt ${attempt}/${maxAttempts})`);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
      return { success: false, category: 'UNKNOWN', details: 'Exhausted transcript attempts' };
    } catch (error) {
      const category = categorize(error.message);
      return { success: false, category, details: error.message };
    }
  }

  async getVideoMetadata(videoIds) {
    const chunks = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50).join(',');
      const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${batch}&key=${this.apiKey}`;
      const response = await axios.get(url);
      chunks.push(...response.data.items);
    }
    
    return chunks.reduce((acc, video) => {
      acc[video.id] = {
        title: video.snippet.title,
        description: video.snippet.description,
        publishedAt: video.snippet.publishedAt,
        duration: video.contentDetails.duration,
        viewCount: parseInt(video.statistics.viewCount || 0),
        likeCount: parseInt(video.statistics.likeCount || 0),
        commentCount: parseInt(video.statistics.commentCount || 0),
        thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url
      };
      return acc;
    }, {});
  }

  async getChannelTranscripts(channelId, options = {}) {
    // Handle both old format (limit as number) and new format (options object)
    const config = typeof options === 'number' ? { limit: options } : options;
    const { limit = null, excludeShorts = false, skipExisting = [] } = config;
    
    console.log(`getChannelTranscripts called with excludeShorts: ${excludeShorts}, limit: ${limit}`);
    
    console.log(`Fetching channel info for ${channelId}...`);
    const channelInfo = await this.getChannelInfo(channelId);
    console.log(`Channel: ${channelInfo.name}`);
    
    console.log(`Fetching videos from channel...`);
    const videos = await this.getChannelVideos(channelId);
    console.log(`Found ${videos.length} videos`);
    
    // Filter out already indexed videos
    const skipExistingSet = new Set(skipExisting);
    let filteredVideos = videos.filter(v => !skipExistingSet.has(v.videoId));
    
    if (skipExisting.length > 0) {
      console.log(`Skipping ${skipExisting.length} already indexed videos`);
    }
    
    // If we need to filter shorts, we need to fetch metadata for more videos to ensure we get enough
    let videosToCheck = filteredVideos;
    if (excludeShorts && limit) {
      // Fetch extra videos in case some are shorts (fetch 50% more)
      videosToCheck = filteredVideos.slice(0, Math.ceil(limit * 1.5));
    } else if (limit && !excludeShorts) {
      // Only apply limit if we're not filtering shorts
      videosToCheck = filteredVideos.slice(0, limit);
    }
    // If excludeShorts=true but no limit, process all videos (they'll be filtered later)
    
    console.log('Fetching video metadata...');
    const videoIds = videosToCheck.map(v => v.videoId);
    const metadata = await this.getVideoMetadata(videoIds);
    
    // Filter out shorts if requested
    let finalVideosToProcess = videosToCheck;
    console.log(`About to filter shorts. excludeShorts=${excludeShorts}, videosToCheck=${videosToCheck.length}`);
    if (excludeShorts) {
      console.log('Entering shorts filtering logic...');
      finalVideosToProcess = videosToCheck.filter(video => {
        const videoMeta = metadata[video.videoId];
        if (!videoMeta || !videoMeta.duration) return true;
        
        // Parse ISO 8601 duration to seconds
        const duration = this.parseDuration(videoMeta.duration);
        // YouTube Shorts are typically under 60 seconds
        const isShort = duration < 60;
        if (isShort) {
          console.log(`Filtering short: ${video.title} (${duration}s)`);
        }
        return !isShort;
      });
      
      const shortsFiltered = videosToCheck.length - finalVideosToProcess.length;
      if (shortsFiltered > 0) {
        console.log(`Filtered out ${shortsFiltered} YouTube Shorts`);
      }
    }
    
    // Now apply the actual limit after shorts filtering
    if (limit) {
      finalVideosToProcess = finalVideosToProcess.slice(0, limit);
    }
    
    console.log(`Processing ${finalVideosToProcess.length} videos...`);
    
    // If no videos to process, return detailed explanation
    if (finalVideosToProcess.length === 0) {
      const totalVideos = videos.length;
      const skippedCount = skipExisting.length;
      const remainingAfterSkip = totalVideos - skippedCount;
      const shortsFilteredCount = excludeShorts ? (videosToCheck.length - finalVideosToProcess.length) : 0;
      
      let message = `No videos to process for this channel.`;
      
      if (totalVideos === 0) {
        message = `This channel has no videos.`;
      } else if (skippedCount > 0 && remainingAfterSkip === 0) {
        message = `All ${totalVideos} videos from this channel are already indexed. No new videos to process.`;
      } else if (excludeShorts && shortsFilteredCount > 0) {
        if (skippedCount > 0) {
          message = `After skipping ${skippedCount} already indexed videos and filtering out ${shortsFilteredCount} YouTube Shorts, no videos remain to process. Try unchecking "Exclude YouTube Shorts" if you want to index short-form content.`;
        } else {
          message = `All ${shortsFilteredCount} videos in this channel are YouTube Shorts. Try unchecking "Exclude YouTube Shorts" if you want to index short-form content.`;
        }
      } else if (skippedCount > 0) {
        message = `${skippedCount} of ${totalVideos} videos are already indexed, ${remainingAfterSkip} would be processed but none have available transcripts.`;
      }
      
      throw new Error(message);
    }
    
    const transcripts = [];
    const failed = [];
    
    for (const video of finalVideosToProcess) {
      console.log(`Fetching transcript for: ${video.title}`);
      
      const transcriptResult = await this.getVideoTranscript(video.videoId);
      
      if (transcriptResult && transcriptResult.success) {
        transcripts.push({
          ...video,
          ...transcriptResult.data,
          metadata: metadata[video.videoId]
        });
      } else {
        const reasonCategory = transcriptResult?.category || 'NO_CAPTIONS';
        const reasonDetails = transcriptResult?.details || 'No transcript available';
        failed.push({
          ...video,
          metadata: metadata[video.videoId],
          reason: reasonCategory,
          details: reasonDetails
        });
      }
      
      // Minimal delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`Successfully fetched ${transcripts.length} transcripts, ${failed.length} failed`);
    return {
      channelInfo,
      transcripts,
      failed,
      totalVideos: videos.length,
      processedVideos: finalVideosToProcess.length
    };
  }

  parseDuration(duration) {
    // Parse ISO 8601 duration (e.g., PT1M30S) to seconds
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);
    
    return hours * 3600 + minutes * 60 + seconds;
  }
  
  // Get rate limiter status for UI display
  getQuotaStatus() {
    return this.rateLimiter.getStatus();
  }
  
  // Subscribe to quota events
  onQuotaWarning(callback) {
    this.rateLimiter.on('quotaWarning', callback);
  }
  
  onQuotaCritical(callback) {
    this.rateLimiter.on('quotaCritical', callback);
  }
  
  onQuotaExhausted(callback) {
    this.rateLimiter.on('quotaExhausted', callback);
  }
  
  onQuotaReset(callback) {
    this.rateLimiter.on('quotaReset', callback);
  }
}

module.exports = YouTubeService;
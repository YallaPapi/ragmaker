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
    
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(identifier)}&key=${this.apiKey}`;
      
      // Use rate limiter for search API (expensive at 100 units)
      const response = await this.rateLimiter.searchVideos(async () => {
        return await axios.get(searchUrl);
      });
      
      if (response.data.items && response.data.items.length > 0) {
        return response.data.items[0].snippet.channelId;
      }
    } catch (error) {
      console.error('Channel search error:', error.message);
    }
    
    return identifier;
  }

  async getChannelInfo(channelId) {
    const resolvedId = await this.resolveChannelId(channelId);
    
    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&id=${resolvedId}&key=${this.apiKey}`;
    
    // Use rate limiter for channels.list API (1 unit)
    const response = await this.rateLimiter.fetchChannelDetails(async () => {
      return await axios.get(channelUrl);
    });
    
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
        const response = await this.rateLimiter.fetchPlaylistItems(async () => {
          return await axios.get(playlistUrl);
        });
        
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
    try {
      await this.initInnertube();
      
      // Get video info first
      const info = await this.innertube.getInfo(videoId);
      
      // Check if transcript is available
      if (!info.captions || !info.captions.caption_tracks || info.captions.caption_tracks.length === 0) {
        console.log(`No captions available for ${videoId}`);
        return null;
      }
      
      // Get transcript using the info object
      const transcriptInfo = await info.getTranscript();
      
      if (transcriptInfo && transcriptInfo.transcript && transcriptInfo.transcript.content && transcriptInfo.transcript.content.body) {
        const segmentList = transcriptInfo.transcript.content.body;
        
        // Extract segments
        let segments = [];
        if (segmentList.initial_segments) {
          segments = segmentList.initial_segments;
        } else if (Array.isArray(segmentList)) {
          segments = segmentList[0]?.transcript_segment_list?.initial_segments || [];
        } else if (segmentList.transcript_segment_list) {
          segments = segmentList.transcript_segment_list.initial_segments || [];
        }
        
        if (segments.length > 0) {
          // Extract text from segments
          const fullText = segments
            .map(segment => {
              // Handle different segment structures
              if (segment.snippet && segment.snippet.text) {
                return segment.snippet.text;
              } else if (segment.text) {
                return segment.text;
              }
              return '';
            })
            .filter(text => text.length > 0)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (fullText.length > 10) {
            console.log(`Got transcript for ${videoId} (${fullText.length} chars)`);
            return {
              videoId,
              transcript: fullText,
              segments: segments.length
            };
          }
        }
      }
    } catch (error) {
      console.log(`Error getting transcript for ${videoId}: ${error.message}`);
    }
    
    return null;
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
    
    // Apply limit after filtering
    const videosToProcess = limit ? filteredVideos.slice(0, limit) : filteredVideos;
    console.log(`Processing ${videosToProcess.length} videos...`);
    
    console.log('Fetching video metadata...');
    const videoIds = videosToProcess.map(v => v.videoId);
    const metadata = await this.getVideoMetadata(videoIds);
    
    // Filter out shorts if requested
    let finalVideosToProcess = videosToProcess;
    if (excludeShorts) {
      finalVideosToProcess = videosToProcess.filter(video => {
        const videoMeta = metadata[video.videoId];
        if (!videoMeta || !videoMeta.duration) return true;
        
        // Parse ISO 8601 duration to seconds
        const duration = this.parseDuration(videoMeta.duration);
        // YouTube Shorts are typically under 60 seconds
        return duration >= 60;
      });
      
      const shortsFiltered = videosToProcess.length - finalVideosToProcess.length;
      if (shortsFiltered > 0) {
        console.log(`Filtered out ${shortsFiltered} YouTube Shorts`);
      }
    }
    
    const transcripts = [];
    const failed = [];
    
    for (const video of finalVideosToProcess) {
      console.log(`Fetching transcript for: ${video.title}`);
      
      const transcript = await this.getVideoTranscript(video.videoId);
      
      if (transcript) {
        transcripts.push({
          ...video,
          ...transcript,
          metadata: metadata[video.videoId]
        });
      } else {
        failed.push({
          ...video,
          metadata: metadata[video.videoId],
          reason: 'No transcript available'
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
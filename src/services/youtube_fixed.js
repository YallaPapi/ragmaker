const { Innertube } = require('youtubei.js');
const axios = require('axios');
const config = require('../config');

class YouTubeServiceFixed {
  constructor() {
    this.apiKey = config.youtube.apiKey;
    this.youtube = null;
  }

  async initialize() {
    if (!this.youtube) {
      this.youtube = await Innertube.create();
    }
    return this.youtube;
  }

  async resolveChannelId(identifier) {
    // If it's already a channel ID
    if (identifier.startsWith('UC') && identifier.length === 24) {
      return identifier;
    }
    
    // Try YouTube API search
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(identifier)}&key=${this.apiKey}`;
      const response = await axios.get(searchUrl);
      
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
    const response = await axios.get(channelUrl);
    
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

  async getChannelVideos(channelId, limit = 50) {
    const videos = [];
    let pageToken = '';
    
    const channelInfo = await this.getChannelInfo(channelId);
    const uploadsPlaylistId = channelInfo.uploadsPlaylistId;
    
    // Fetch videos from uploads playlist
    do {
      const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&pageToken=${pageToken}&key=${this.apiKey}`;
      const response = await axios.get(playlistUrl);
      
      for (const item of response.data.items) {
        videos.push({
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          publishedAt: item.snippet.publishedAt,
          url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
        });
        
        if (limit && videos.length >= limit) {
          return videos.slice(0, limit);
        }
      }
      
      pageToken = response.data.nextPageToken || '';
    } while (pageToken && (!limit || videos.length < limit));
    
    return videos;
  }

  async getVideoTranscript(videoId) {
    try {
      await this.initialize();
      
      // Get video info
      const info = await this.youtube.getInfo(videoId);
      
      // Check if captions are available
      if (!info.captions || !info.captions.caption_tracks || info.captions.caption_tracks.length === 0) {
        console.log(`No captions available for video ${videoId}`);
        return null;
      }
      
      // Get the transcript
      try {
        const transcript = await info.getTranscript();
        
        if (transcript && transcript.content && transcript.content.body) {
          const segments = transcript.content.body.initial_segments || [];
          
          if (segments.length > 0) {
            // Extract text from segments
            const fullText = segments
              .map(segment => {
                // Handle different segment structures
                if (segment.snippet && segment.snippet.text) {
                  return segment.snippet.text;
                } else if (segment.text) {
                  return segment.text;
                } else if (typeof segment === 'string') {
                  return segment;
                }
                return '';
              })
              .filter(text => text.length > 0)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            
            if (fullText.length > 10) {
              return {
                videoId,
                transcript: fullText,
                segments: segments.length
              };
            }
          }
        }
      } catch (transcriptError) {
        console.log(`Transcript extraction failed for ${videoId}:`, transcriptError.message);
      }
      
      // Fallback: Try to get auto-generated captions
      const tracks = info.captions.caption_tracks;
      for (const track of tracks) {
        if (track.is_translatable || track.kind === 'asr') {
          // This is an auto-generated track
          console.log(`Found auto-generated track for ${videoId}`);
          // Note: youtubei.js may not directly expose caption text
          // We'd need to parse the track data
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting transcript for ${videoId}:`, error.message);
      return null;
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

  async getChannelTranscripts(channelId, limit = null) {
    console.log(`Fetching channel info for ${channelId}...`);
    const channelInfo = await this.getChannelInfo(channelId);
    console.log(`Channel: ${channelInfo.name}`);
    
    console.log(`Fetching videos from channel...`);
    const videos = await this.getChannelVideos(channelId, limit);
    console.log(`Found ${videos.length} videos`);
    
    // Get metadata for all videos
    console.log('Fetching video metadata...');
    const videoIds = videos.map(v => v.videoId);
    const metadata = await this.getVideoMetadata(videoIds);
    
    const transcripts = [];
    const failed = [];
    
    for (const video of videos) {
      console.log(`Fetching transcript for: ${video.title}`);
      
      const transcript = await this.getVideoTranscript(video.videoId);
      
      if (transcript) {
        transcripts.push({
          ...video,
          ...transcript,
          metadata: metadata[video.videoId]
        });
        console.log(`✅ Got transcript (${transcript.transcript.length} chars)`);
      } else {
        failed.push({
          ...video,
          metadata: metadata[video.videoId],
          reason: 'No transcript available'
        });
        console.log(`❌ No transcript available`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`Successfully fetched ${transcripts.length} transcripts, ${failed.length} failed`);
    return {
      channelInfo,
      transcripts,
      failed,
      totalVideos: videos.length,
      processedVideos: videos.length
    };
  }
}

module.exports = YouTubeServiceFixed;
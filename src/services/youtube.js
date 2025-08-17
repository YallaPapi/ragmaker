const { YoutubeTranscript } = require('youtube-transcript');
const axios = require('axios');
const config = require('../config');

class YouTubeService {
  constructor() {
    this.apiKey = config.youtube.apiKey;
  }

  async resolveChannelId(identifier) {
    // If it looks like a channel ID (starts with UC and 24 chars), use it directly
    if (identifier.startsWith('UC') && identifier.length === 24) {
      return identifier;
    }
    
    // Try to search for the channel by handle or username
    try {
      // First try as a handle/username search
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(identifier)}&key=${this.apiKey}`;
      const searchResponse = await axios.get(searchUrl);
      
      if (searchResponse.data.items && searchResponse.data.items.length > 0) {
        // Look for exact match in custom URL or title
        for (const item of searchResponse.data.items) {
          const channelId = item.snippet.channelId;
          // Get full channel details to check custom URL
          const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${this.apiKey}`;
          const channelResponse = await axios.get(channelUrl);
          
          if (channelResponse.data.items && channelResponse.data.items.length > 0) {
            const channel = channelResponse.data.items[0];
            // Check if custom URL matches
            if (channel.snippet.customUrl && 
                (channel.snippet.customUrl === `@${identifier}` || 
                 channel.snippet.customUrl === identifier ||
                 channel.snippet.customUrl.replace('@', '') === identifier)) {
              return channelId;
            }
          }
        }
        
        // If no exact match, return first result
        return searchResponse.data.items[0].snippet.channelId;
      }
    } catch (error) {
      console.error('Error resolving channel identifier:', error);
    }
    
    // If all else fails, try using it as a channel ID anyway
    return identifier;
  }

  async getChannelInfo(channelId) {
    // Resolve the channel ID first if needed
    const resolvedId = await this.resolveChannelId(channelId);
    
    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&id=${resolvedId}&key=${this.apiKey}`;
    const channelResponse = await axios.get(channelUrl);
    
    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      throw new Error('Channel not found');
    }
    
    return {
      id: resolvedId,
      name: channelResponse.data.items[0].snippet.title,
      description: channelResponse.data.items[0].snippet.description,
      uploadsPlaylistId: channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads
    };
  }

  async getChannelVideos(channelId) {
    try {
      const videos = [];
      let pageToken = '';
      
      // Get channel info including uploads playlist
      const channelInfo = await this.getChannelInfo(channelId);
      const uploadsPlaylistId = channelInfo.uploadsPlaylistId;
      
      // Fetch all videos from uploads playlist
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
    // Try multiple approaches to get transcript
    const attempts = [
      { lang: 'en' },
      { lang: 'en-US' },
      { lang: 'en-GB' },
      {}, // Try without language (gets auto-generated)
    ];
    
    for (const options of attempts) {
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId, options);
        
        if (transcript && transcript.length > 0) {
          const fullText = transcript
            .map(segment => segment.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (fullText && fullText.length >= 10) {
            console.log(`Got transcript for ${videoId} (lang: ${options.lang || 'auto'})`);
            return {
              videoId,
              transcript: fullText,
              segments: transcript
            };
          }
        }
      } catch (error) {
        // Try next option
        if (!options.lang) {
          console.log(`No transcript available for ${videoId}: ${error.message}`);
        }
      }
    }
    
    return null;
  }

  async getVideoMetadata(videoIds) {
    // Fetch detailed metadata for videos
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
    const videos = await this.getChannelVideos(channelId);
    console.log(`Found ${videos.length} videos`);
    
    // Allow optional limit for testing, otherwise process all videos
    const videosToProcess = limit ? videos.slice(0, limit) : videos;
    console.log(`Processing ${videosToProcess.length} videos...`);
    
    // Fetch video metadata for all videos
    console.log('Fetching video metadata...');
    const videoIds = videosToProcess.map(v => v.videoId);
    const metadata = await this.getVideoMetadata(videoIds);
    
    const transcripts = [];
    const failed = [];
    
    for (const video of videosToProcess) {
      console.log(`Fetching transcript for: ${video.title}`);
      
      // Retry logic for transcript fetching
      let transcript = null;
      let retries = 3;
      
      while (retries > 0 && !transcript) {
        transcript = await this.getVideoTranscript(video.videoId);
        if (!transcript && retries > 1) {
          console.log(`Retrying transcript fetch for ${video.videoId} (${retries - 1} retries left)...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
        }
        retries--;
      }
      
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
          reason: 'No transcript available after 3 attempts'
        });
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`Successfully fetched ${transcripts.length} transcripts, ${failed.length} failed`);
    return {
      channelInfo,
      transcripts,
      failed,
      totalVideos: videos.length,
      processedVideos: videosToProcess.length
    };
  }
}

module.exports = YouTubeService;
const { YoutubeTranscript } = require('youtube-transcript');
const axios = require('axios');
const config = require('../config');

class YouTubeService {
  constructor() {
    this.apiKey = config.youtube.apiKey;
  }

  async getChannelVideos(channelId) {
    try {
      const videos = [];
      let pageToken = '';
      
      // Get channel uploads playlist ID
      const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${this.apiKey}`;
      const channelResponse = await axios.get(channelUrl);
      
      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        throw new Error('Channel not found');
      }
      
      const uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;
      
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
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      
      // Combine all transcript segments into one text
      const fullText = transcript
        .map(segment => segment.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      return {
        videoId,
        transcript: fullText,
        segments: transcript // Keep original segments with timestamps
      };
    } catch (error) {
      console.error(`Error fetching transcript for video ${videoId}:`, error);
      // Return null if transcript not available
      return null;
    }
  }

  async getChannelTranscripts(channelId, limit = 10) {
    console.log(`Fetching videos from channel ${channelId}...`);
    const videos = await this.getChannelVideos(channelId);
    console.log(`Found ${videos.length} videos`);
    
    // Limit for testing
    const videosToProcess = videos.slice(0, limit);
    console.log(`Processing first ${videosToProcess.length} videos for testing...`);
    
    const transcripts = [];
    
    for (const video of videosToProcess) {
      console.log(`Fetching transcript for: ${video.title}`);
      const transcript = await this.getVideoTranscript(video.videoId);
      
      if (transcript) {
        transcripts.push({
          ...video,
          ...transcript
        });
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`Successfully fetched ${transcripts.length} transcripts`);
    return transcripts;
  }
}

module.exports = YouTubeService;
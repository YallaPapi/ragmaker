const axios = require('axios');
const config = require('../config');
const { Innertube } = require('youtubei.js');

class YouTubeServiceWorking {
  constructor() {
    this.apiKey = config.youtube.apiKey;
    this.innertube = null;
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

  async getChannelVideos(channelId) {
    try {
      const videos = [];
      let pageToken = '';
      
      const channelInfo = await this.getChannelInfo(channelId);
      const uploadsPlaylistId = channelInfo.uploadsPlaylistId;
      
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
      await this.initInnertube();
      
      // Use Innertube to get transcript
      const transcript = await this.innertube.getTranscript(videoId);
      
      if (transcript && transcript.content && transcript.content.body && transcript.content.body.initial_segments) {
        const segments = transcript.content.body.initial_segments;
        
        // Extract text from segments
        const fullText = segments
          .map(segment => {
            if (segment.snippet && segment.snippet.text) {
              return segment.snippet.text;
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
    } catch (error) {
      // Silently fail for individual videos
      console.log(`No transcript available for ${videoId}`);
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

  async getChannelTranscripts(channelId, limit = null) {
    console.log(`Fetching channel info for ${channelId}...`);
    const channelInfo = await this.getChannelInfo(channelId);
    console.log(`Channel: ${channelInfo.name}`);
    
    console.log(`Fetching videos from channel...`);
    const videos = await this.getChannelVideos(channelId);
    console.log(`Found ${videos.length} videos`);
    
    const videosToProcess = limit ? videos.slice(0, limit) : videos;
    console.log(`Processing ${videosToProcess.length} videos...`);
    
    console.log('Fetching video metadata...');
    const videoIds = videosToProcess.map(v => v.videoId);
    const metadata = await this.getVideoMetadata(videoIds);
    
    const transcripts = [];
    const failed = [];
    
    for (const video of videosToProcess) {
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
      processedVideos: videosToProcess.length
    };
  }
}

module.exports = YouTubeServiceWorking;
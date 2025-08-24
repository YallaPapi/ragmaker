const validation = require('../utils/validation');

class ChannelController {
  constructor(channelManager, youtubeService, embeddingService) {
    this.channelManager = channelManager;
    this.youtubeService = youtubeService;
    this.embeddingService = embeddingService;
    this.indexingProgress = new Map();
  }

  async getChannels(req, res) {
    try {
      const channels = await this.channelManager.getChannels();
      res.json({ success: true, channels });
    } catch (error) {
      console.error('Error getting channels:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to retrieve channels',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async addChannel(req, res) {
    try {
      const { channelId } = validation.validateChannelInput(req.body);
      
      // Check if channel already exists
      const existingChannel = await this.channelManager.getChannel(channelId);
      if (existingChannel) {
        return res.status(400).json({
          success: false,
          error: 'Channel already exists in the current project'
        });
      }

      // Get channel info from YouTube
      const channelInfo = await this.youtubeService.getChannelInfo(channelId);
      if (!channelInfo) {
        return res.status(404).json({
          success: false,
          error: 'Channel not found on YouTube'
        });
      }

      // Add to manager
      await this.channelManager.addChannel({
        id: channelId,
        name: channelInfo.name,
        description: channelInfo.description,
        subscriberCount: channelInfo.subscriberCount,
        videoCount: channelInfo.videoCount,
        addedAt: new Date().toISOString(),
        indexed: false
      });

      res.json({ 
        success: true, 
        message: 'Channel added successfully',
        channel: channelInfo
      });
    } catch (error) {
      if (error.message.includes('validation')) {
        return res.status(400).json({ success: false, error: error.message });
      }
      
      console.error('Error adding channel:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to add channel',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async deleteChannel(req, res) {
    try {
      const { channelId } = validation.validateChannelInput(req.params);
      
      const success = await this.channelManager.removeChannel(channelId);
      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Channel not found'
        });
      }

      res.json({ 
        success: true, 
        message: 'Channel removed successfully' 
      });
    } catch (error) {
      console.error('Error deleting channel:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to delete channel',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async indexChannel(req, res) {
    try {
      const { channelId } = validation.validateChannelInput(req.body);
      
      // Check if already indexing
      if (this.indexingProgress.has(channelId)) {
        return res.status(400).json({
          success: false,
          error: 'Channel indexing already in progress'
        });
      }

      // Start indexing process (async)
      this.startChannelIndexing(channelId);
      
      res.json({ 
        success: true, 
        message: 'Channel indexing started',
        channelId 
      });
    } catch (error) {
      console.error('Error starting channel indexing:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to start indexing',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async getIndexingProgress(req, res) {
    try {
      const { channelId } = req.query;
      
      if (channelId) {
        const progress = this.indexingProgress.get(channelId);
        return res.json({ 
          success: true, 
          progress: progress || null 
        });
      }

      // Return all indexing progress
      const allProgress = Object.fromEntries(this.indexingProgress);
      res.json({ success: true, progress: allProgress });
    } catch (error) {
      console.error('Error getting indexing progress:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get progress',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async startChannelIndexing(channelId) {
    try {
      // Initialize progress tracking
      this.indexingProgress.set(channelId, {
        status: 'starting',
        progress: 0,
        videosProcessed: 0,
        totalVideos: 0,
        startedAt: new Date().toISOString(),
        currentVideo: null
      });

      // Get channel videos
      const videos = await this.youtubeService.getChannelVideos(channelId);
      
      this.indexingProgress.set(channelId, {
        ...this.indexingProgress.get(channelId),
        status: 'processing',
        totalVideos: videos.length
      });

      let processed = 0;
      for (const video of videos) {
        try {
          // Update current progress
          this.indexingProgress.set(channelId, {
            ...this.indexingProgress.get(channelId),
            currentVideo: video.title,
            videosProcessed: processed
          });

          // Process video transcripts and embeddings
          await this.processVideoForIndexing(video, channelId);
          processed++;

          // Update progress
          const progress = Math.round((processed / videos.length) * 100);
          this.indexingProgress.set(channelId, {
            ...this.indexingProgress.get(channelId),
            progress,
            videosProcessed: processed
          });

        } catch (videoError) {
          console.error(`Error processing video ${video.id}:`, videoError);
          // Continue with next video rather than failing entire indexing
        }
      }

      // Mark as completed
      this.indexingProgress.set(channelId, {
        ...this.indexingProgress.get(channelId),
        status: 'completed',
        progress: 100,
        completedAt: new Date().toISOString(),
        currentVideo: null
      });

      // Update channel as indexed
      await this.channelManager.updateChannel(channelId, { indexed: true });

    } catch (error) {
      console.error(`Error indexing channel ${channelId}:`, error);
      
      this.indexingProgress.set(channelId, {
        ...this.indexingProgress.get(channelId),
        status: 'error',
        error: error.message,
        completedAt: new Date().toISOString()
      });
    }
  }

  async processVideoForIndexing(video, channelId) {
    // Get transcript
    const transcript = await this.youtubeService.getTranscript(video.id);
    if (!transcript || transcript.length === 0) {
      console.warn(`No transcript available for video: ${video.id}`);
      return;
    }

    // Create embeddings for transcript chunks
    const chunks = this.chunkTranscript(transcript, video);
    if (chunks.length > 0) {
      await this.embeddingService.embedAndStore(chunks, channelId);
    }
  }

  chunkTranscript(transcript, video, maxChunkSize = 1000) {
    const chunks = [];
    let currentChunk = {
      text: '',
      metadata: {
        videoId: video.id,
        videoTitle: video.title,
        publishedAt: video.publishedAt,
        startTime: 0
      }
    };

    for (const entry of transcript) {
      if (currentChunk.text.length + entry.text.length > maxChunkSize && currentChunk.text.length > 0) {
        chunks.push(currentChunk);
        currentChunk = {
          text: entry.text,
          metadata: {
            ...currentChunk.metadata,
            startTime: entry.start
          }
        };
      } else {
        if (currentChunk.text.length === 0) {
          currentChunk.metadata.startTime = entry.start;
        }
        currentChunk.text += (currentChunk.text.length > 0 ? ' ' : '') + entry.text;
      }
    }

    if (currentChunk.text.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }
}

module.exports = ChannelController;
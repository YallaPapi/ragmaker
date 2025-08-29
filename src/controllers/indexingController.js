const fs = require('fs').promises;
const path = require('path');
const validation = require('../utils/validation');

class IndexingController {
  constructor() {
    // Initialize indexing status tracking
    this.indexingStatus = {
      isIndexing: false,
      progress: 0,
      message: '',
      channelId: null,
      totalVideos: 0,
      processedVideos: 0,
      cancelled: false,
      successVideos: [],
      failedVideos: [],
      startTime: null,
      endTime: null
    };
    
    // Progress tracking storage
    this.indexingProgress = new Map();
    
    // Track active indexing promise
    this.activeIndexingJob = null;
    
    // Logs management
    this.indexingLogs = [];
    this.logsFile = path.join(__dirname, '../../data/indexing_logs.json');
    
    // Load logs on initialization
    this.loadLogs();
  }

  // Load logs from file
  async loadLogs() {
    try {
      const data = await fs.readFile(this.logsFile, 'utf8');
      this.indexingLogs = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet
      this.indexingLogs = [];
    }
  }

  // Save logs to file
  async saveLogs() {
    try {
      await fs.writeFile(this.logsFile, JSON.stringify(this.indexingLogs, null, 2));
    } catch (error) {
      console.error('Error saving logs:', error);
    }
  }

  // Get current indexing status
  getStatus() {
    return this.indexingStatus;
  }

  // Get progress for specific channel
  getProgress(channelId) {
    // Check new progress tracking system first
    if (this.indexingProgress.has(channelId)) {
      return this.indexingProgress.get(channelId);
    }
    
    // Fall back to old indexingStatus if it matches the channel
    if (this.indexingStatus.channelId === channelId) {
      return {
        status: this.indexingStatus.message || 'Processing...',
        processed: this.indexingStatus.processedVideos || 0,
        total: this.indexingStatus.totalVideos || 0,
        currentStep: this.indexingStatus.currentStep || 'Working...',
        percentage: this.indexingStatus.totalVideos > 0 
          ? Math.round((this.indexingStatus.processedVideos / this.indexingStatus.totalVideos) * 100)
          : 0,
        completed: !this.indexingStatus.isIndexing && this.indexingStatus.processedVideos > 0,
        failed: !this.indexingStatus.isIndexing && this.indexingStatus.processedVideos === 0 && this.indexingStatus.totalVideos > 0,
        error: this.indexingStatus.error
      };
    }
    
    // No progress found
    return {
      status: 'Not found',
      processed: 0,
      total: 0,
      currentStep: 'No indexing in progress',
      percentage: 0,
      completed: false,
      failed: false
    };
  }

  // Start indexing process
  async startIndexing(req, res) {
    try {
      // Validate and sanitize inputs
      const channelId = validation.validateChannelId(req.body.channelId);
      const videoLimit = validation.validateVideoLimit(req.body.videoLimit);
      const skipExisting = validation.validateBoolean(req.body.skipExisting, false);
      const excludeShorts = validation.validateBoolean(req.body.excludeShorts, false);
      
      if (this.indexingStatus.isIndexing) {
        return res.json({ 
          message: 'Indexing already in progress',
          channelId: this.indexingStatus.channelId,
          showProgress: true
        });
      }
      
      // Start indexing in background
      this.indexingStatus = {
        isIndexing: true,
        progress: 0,
        message: 'Starting indexing process...',
        channelId,
        totalVideos: 0,
        processedVideos: 0,
        cancelled: false,
        successVideos: [],
        failedVideos: [],
        startTime: null,
        endTime: null
      };
      
      res.json({ message: 'Indexing started', channelId });
      
      // Start background process
      this.runIndexingProcess(channelId, {
        videoLimit,
        skipExisting,
        excludeShorts
      });
      
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }
  }

  // Cancel indexing
  async cancelIndexing(req, res) {
    this.indexingStatus.cancelled = true;
    this.indexingStatus.message = 'Cancelling indexing...';
    
    // Wait for cancellation to propagate
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Force reset status
    this.resetStatus();
    
    res.json({ success: true, message: 'Indexing cancelled and reset' });
  }

  // Reset indexing status
  resetStatus() {
    // Force stop any active job
    if (this.activeIndexingJob) {
      this.indexingStatus.cancelled = true;
      this.activeIndexingJob = null;
    }
    
    this.indexingStatus = {
      isIndexing: false,
      progress: 0,
      message: '',
      channelId: null,
      totalVideos: 0,
      processedVideos: 0,
      cancelled: false,
      successVideos: [],
      failedVideos: [],
      startTime: null,
      endTime: null
    };
  }

  // Main indexing process
  async runIndexingProcess(channelId, options) {
    // Cancel any existing job
    if (this.activeIndexingJob) {
      this.indexingStatus.cancelled = true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Get services from app locals (will be injected)
    const { youtubeService, embeddingService, vectorStore, channelManager, upstashManager } = this.services;
    
    this.activeIndexingJob = (async () => {
      try {
        // Initialize progress tracking
        this.indexingStatus.startTime = new Date().toISOString();
        this.indexingStatus.currentStep = 'Fetching channel information and video list...';
        
        this.indexingProgress.set(channelId, {
          status: 'Starting...',
          processed: 0,
          total: 0,
          currentStep: 'Fetching channel information...',
          percentage: 0,
          completed: false,
          failed: false
        });
        
        // Get channel transcripts
        const result = await youtubeService.getChannelTranscripts(channelId, options);
        const { channelInfo, transcripts, failed, totalVideos, processedVideos } = result;
        
        if (transcripts.length === 0) {
          const errorMsg = failed && failed.length > 0 
            ? `No transcripts could be retrieved for any of the ${failed.length} videos from this channel.`
            : 'No transcripts found for this channel.';
          throw new Error(errorMsg);
        }
        
        // Process embeddings
        const embeddings = await this.processEmbeddings(transcripts, channelId);
        
        // Store in vector database
        await this.storeEmbeddings(embeddings, channelInfo, channelId, transcripts, upstashManager, channelManager);
        
        // Complete successfully
        this.completeIndexing(channelInfo, transcripts, failed, processedVideos);
        
      } catch (error) {
        this.handleIndexingError(error, channelId);
      } finally {
        this.activeIndexingJob = null;
      }
    })();
    
    this.activeIndexingJob.catch(error => {
      console.error('Indexing job error:', error);
      this.activeIndexingJob = null;
    });
  }

  // Process embeddings with progress tracking
  async processEmbeddings(transcripts, channelId) {
    const { embeddingService } = this.services;
    const embeddings = [];
    
    this.indexingStatus.message = `Processing ${transcripts.length} videos...`;
    this.indexingStatus.progress = 20;
    
    for (let i = 0; i < transcripts.length; i++) {
      // Check if cancelled
      if (this.indexingStatus.cancelled) {
        throw new Error('Indexing cancelled by user');
      }
      
      const video = transcripts[i];
      this.indexingStatus.message = `Processing video ${i + 1}/${transcripts.length}: ${video.title}`;
      this.indexingStatus.currentStep = `Creating embeddings for: ${video.title}`;
      this.indexingStatus.processedVideos = i + 1;
      this.indexingStatus.progress = 20 + Math.floor((i / transcripts.length) * 50);
      
      // Update progress tracking
      this.indexingProgress.set(channelId, {
        status: 'Processing videos...',
        processed: i + 1,
        total: transcripts.length,
        currentStep: `Creating embeddings for: ${video.title?.substring(0, 50) || 'Unknown video'}${video.title?.length > 50 ? '...' : ''}`,
        percentage: 20 + Math.floor((i / transcripts.length) * 50),
        completed: false,
        failed: false
      });
      
      try {
        if (!video.transcript) {
          console.warn(`Video ${video.videoId} has no transcript content`);
          this.indexingStatus.failedVideos.push({
            videoId: video.videoId,
            title: video.title,
            url: video.url,
            reason: 'No transcript content'
          });
          continue;
        }
        
        const chunks = await embeddingService.processVideo(video);
        embeddings.push(...chunks);
        
        // Track successful video
        this.indexingStatus.successVideos.push({
          videoId: video.videoId,
          title: video.title,
          url: video.url,
          duration: video.metadata?.duration,
          viewCount: video.metadata?.viewCount,
          chunksCreated: chunks.length
        });
      } catch (error) {
        console.error(`Error processing video ${video.videoId}:`, error);
        this.indexingStatus.failedVideos.push({
          videoId: video.videoId,
          title: video.title,
          url: video.url,
          reason: error.message
        });
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return embeddings;
  }

  // Store embeddings in vector database
  async storeEmbeddings(embeddings, channelInfo, channelId, transcripts, upstashManager, channelManager) {
    const { vectorStore } = this.services;
    
    this.indexingStatus.progress = 70;
    this.indexingStatus.message = 'Adding to knowledge base...';
    this.indexingStatus.currentStep = 'Storing embeddings in vector database...';
    
    this.indexingProgress.set(channelId, {
      status: 'Finalizing...',
      processed: transcripts.length,
      total: transcripts.length,
      currentStep: 'Storing embeddings in vector database...',
      percentage: 80,
      completed: false,
      failed: false
    });
    
    await vectorStore.indexChannel(embeddings);
    this.indexingStatus.progress = 100;
    
    // Save channel info
    const currentProject = upstashManager.getCurrentProject();
    const resolvedChannelId = channelInfo.id || channelId;
    const indexedVideoIds = this.indexingStatus.successVideos.map(v => v.videoId);
    
    if (channelManager.isChannelIndexed(resolvedChannelId)) {
      await channelManager.updateChannel(resolvedChannelId, {
        videoCount: channelManager.getChannel(resolvedChannelId).videoCount + transcripts.length,
        totalChunks: (channelManager.getChannel(resolvedChannelId).totalChunks || 0) + embeddings.length
      });
      await channelManager.addIndexedVideos(resolvedChannelId, indexedVideoIds);
    } else {
      await channelManager.addChannel(resolvedChannelId, {
        channelId: resolvedChannelId,
        channelName: channelInfo.name,
        videoCount: transcripts.length,
        totalChunks: embeddings.length
      }, currentProject?.id);
      await channelManager.addIndexedVideos(resolvedChannelId, indexedVideoIds);
    }
  }

  // Complete indexing successfully
  completeIndexing(channelInfo, transcripts, failed, processedVideos) {
    this.indexingStatus.endTime = new Date().toISOString();
    this.indexingStatus.isIndexing = false;
    this.indexingStatus.progress = 100;
    this.indexingStatus.message = `Successfully indexed ${this.indexingStatus.successVideos.length} videos, ${this.indexingStatus.failedVideos.length} failed`;
    this.indexingStatus.currentStep = 'Indexing completed successfully!';
    
    // Mark progress as completed
    this.indexingProgress.set(this.indexingStatus.channelId, {
      status: 'Completed!',
      processed: transcripts.length,
      total: transcripts.length,
      currentStep: `Successfully indexed ${this.indexingStatus.successVideos.length} videos`,
      percentage: 100,
      completed: true,
      failed: false
    });
    
    // Save to logs
    const logEntry = {
      timestamp: this.indexingStatus.startTime,
      channelId: channelInfo.id || this.indexingStatus.channelId,
      channelName: channelInfo.name,
      totalVideos: processedVideos,
      successCount: this.indexingStatus.successVideos.length,
      failedCount: this.indexingStatus.failedVideos.length,
      duration: Date.now() - new Date(this.indexingStatus.startTime).getTime(),
      successVideos: [...this.indexingStatus.successVideos],
      failedVideos: [...this.indexingStatus.failedVideos]
    };
    
    this.indexingLogs.push(logEntry);
    this.saveLogs();
  }

  // Handle indexing errors
  handleIndexingError(error, channelId) {
    console.error('Indexing error:', error);
    this.indexingStatus = {
      isIndexing: false,
      progress: 0,
      message: `Error: ${error.message}`,
      channelId,
      totalVideos: 0,
      processedVideos: 0,
      cancelled: this.indexingStatus.cancelled,
      successVideos: [],
      failedVideos: [],
      startTime: null,
      endTime: null,
      currentStep: 'Failed with error',
      error: error.message
    };
    
    // Mark progress as failed
    this.indexingProgress.set(channelId, {
      status: 'Failed',
      processed: 0,
      total: 0,
      currentStep: `Error: ${error.message}`,
      percentage: 0,
      completed: false,
      failed: true,
      error: error.message
    });
  }

  // Get all logs
  async getLogs() {
    await this.loadLogs();
    return this.indexingLogs;
  }

  // Inject services (to be called by server)
  setServices(services) {
    this.services = services;
  }
}

module.exports = IndexingController;
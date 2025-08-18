const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const YouTubeService = require('../services/youtube');
const EmbeddingService = require('../services/embeddings');
const VectorStoreService = require('../services/vectorStore');
const RAGService = require('../services/rag');
const ChannelManager = require('../services/channelManager');
const UpstashManager = require('../services/upstashManager');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// Services
const youtubeService = new YouTubeService();
const embeddingService = new EmbeddingService();
const channelManager = new ChannelManager();
const upstashManager = new UpstashManager();

// Initialize vector store with current project
let vectorStore = null;
let ragService = null;

const initializeServices = async () => {
  // Wait for managers to initialize
  await channelManager.initialized;
  await upstashManager.initialized;
  
  const project = upstashManager.getCurrentProject();
  if (project) {
    const creds = upstashManager.getProjectCredentials();
    vectorStore = new VectorStoreService(creds);
    ragService = new RAGService(vectorStore);
  } else {
    vectorStore = new VectorStoreService();
    ragService = new RAGService(vectorStore);
  }
};

// Initialize services before starting server
initializeServices().catch(console.error);

// Store indexing status and logs
let indexingStatus = {
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

// Store all indexing logs
let indexingLogs = [];
const logsFile = path.join(__dirname, '../../data/indexing_logs.json');

// Load logs from file
async function loadLogs() {
  try {
    const data = await fs.readFile(logsFile, 'utf8');
    indexingLogs = JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet
    indexingLogs = [];
  }
}

// Save logs to file
async function saveLogs() {
  try {
    await fs.writeFile(logsFile, JSON.stringify(indexingLogs, null, 2));
  } catch (error) {
    console.error('Error saving logs:', error);
  }
}

// Load logs on startup
loadLogs();

// Routes

// Index a YouTube channel (adds to existing knowledge base)
app.post('/api/index-channel', async (req, res) => {
  const { channelId, videoLimit, skipExisting = false, excludeShorts = false } = req.body;
  
  if (!channelId) {
    return res.status(400).json({ error: 'Channel ID is required' });
  }
  
  if (indexingStatus.isIndexing) {
    return res.status(409).json({ error: 'Already indexing a channel' });
  }
  
  // Check if channel already indexed (only block if not skipping existing)
  if (!skipExisting && channelManager.isChannelIndexed(channelId)) {
    return res.status(200).json({ 
      message: 'Channel already indexed', 
      channelId,
      alreadyIndexed: true 
    });
  }
  
  // Start indexing in background - ensure arrays are initialized
  indexingStatus = {
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
  
  // Background indexing process
  (async () => {
    try {
      // Fetch transcripts with custom limit or all videos
      indexingStatus.message = 'Fetching channel videos...';
      indexingStatus.startTime = new Date().toISOString();
      
      // Pass options to YouTube service
      const options = {
        limit: videoLimit,
        excludeShorts,
        skipExisting: skipExisting ? channelManager.getIndexedVideos(channelId) : []
      };
      
      const result = await youtubeService.getChannelTranscripts(channelId, options);
      const { channelInfo, transcripts, failed, totalVideos, processedVideos } = result;
      
      indexingStatus.totalVideos = processedVideos;
      // Add initial failed videos (no transcript available)
      if (failed && failed.length > 0) {
        indexingStatus.failedVideos = [...failed];
      }
      indexingStatus.progress = 20;
      
      if (transcripts.length === 0) {
        const errorMsg = failed && failed.length > 0 
          ? `No transcripts could be retrieved for any of the ${failed.length} videos from this channel. This may be due to: 1) Videos have disabled captions, 2) Channel uses members-only content, 3) Videos are age-restricted, or 4) Technical issues with caption APIs.`
          : 'No transcripts found for this channel. The channel may not have any videos or all videos have disabled captions.';
        throw new Error(errorMsg);
      }
      
      // Use actual channel name from YouTube API
      const channelName = channelInfo.name;
      
      // Process embeddings with progress tracking
      indexingStatus.message = `Processing ${transcripts.length} videos...`;
      const embeddings = [];
      
      for (let i = 0; i < transcripts.length; i++) {
        // Check if cancelled
        if (indexingStatus.cancelled) {
          throw new Error('Indexing cancelled by user');
        }
        
        const video = transcripts[i];
        indexingStatus.message = `Processing video ${i + 1}/${transcripts.length}: ${video.title}`;
        indexingStatus.processedVideos = i + 1;
        indexingStatus.progress = 20 + Math.floor((i / transcripts.length) * 50);
        
        try {
          // Make sure video has transcript property
          if (!video.transcript) {
            console.warn(`Video ${video.videoId} has no transcript content`);
            indexingStatus.failedVideos.push({
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
          indexingStatus.successVideos.push({
            videoId: video.videoId,
            title: video.title,
            url: video.url,
            duration: video.metadata?.duration,
            viewCount: video.metadata?.viewCount,
            chunksCreated: chunks.length
          });
        } catch (error) {
          console.error(`Error processing video ${video.videoId}:`, error);
          indexingStatus.failedVideos.push({
            videoId: video.videoId,
            title: video.title,
            url: video.url,
            reason: error.message
          });
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      indexingStatus.progress = 70;
      
      // Index to vector store (ADDS to existing data)
      indexingStatus.message = 'Adding to knowledge base...';
      await vectorStore.indexChannel(embeddings);
      indexingStatus.progress = 100;
      
      // Save channel info with project ID (use resolved channel ID)
      const currentProject = upstashManager.getCurrentProject();
      const resolvedChannelId = channelInfo.id || channelId;
      
      // Track indexed video IDs
      const indexedVideoIds = indexingStatus.successVideos.map(v => v.videoId);
      
      // If skipExisting was used, we're updating an existing channel
      if (skipExisting && channelManager.isChannelIndexed(resolvedChannelId)) {
        await channelManager.updateChannel(resolvedChannelId, {
          videoCount: channelManager.getChannel(resolvedChannelId).videoCount + transcripts.length,
          totalChunks: (channelManager.getChannel(resolvedChannelId).totalChunks || 0) + embeddings.length
        });
        await channelManager.addIndexedVideos(resolvedChannelId, indexedVideoIds);
      } else {
        await channelManager.addChannel(resolvedChannelId, {
          channelId: resolvedChannelId,
          channelName,
          videoCount: transcripts.length,
          totalChunks: embeddings.length
        }, currentProject?.id);
        await channelManager.addIndexedVideos(resolvedChannelId, indexedVideoIds);
      }
      
      indexingStatus.endTime = new Date().toISOString();
      indexingStatus.isIndexing = false;
      indexingStatus.progress = 100;
      indexingStatus.message = `Successfully indexed ${indexingStatus.successVideos.length} videos, ${indexingStatus.failedVideos.length} failed`;
      
      // Save to logs
      const logEntry = {
        timestamp: indexingStatus.startTime,
        channelId: resolvedChannelId,
        channelName,
        totalVideos: processedVideos,
        successCount: indexingStatus.successVideos.length,
        failedCount: indexingStatus.failedVideos.length,
        duration: Date.now() - new Date(indexingStatus.startTime).getTime(),
        successVideos: [...indexingStatus.successVideos],
        failedVideos: [...indexingStatus.failedVideos]
      };
      indexingLogs.push(logEntry);
      await saveLogs();
    } catch (error) {
      console.error('Indexing error:', error);
      indexingStatus = {
        isIndexing: false,
        progress: 0,
        message: `Error: ${error.message}`,
        channelId,
        totalVideos: 0,
        processedVideos: 0,
        cancelled: indexingStatus.cancelled
      };
    }
  })();
});

// Get indexing status
app.get('/api/index-status', (req, res) => {
  res.json(indexingStatus);
});

// Cancel indexing
app.post('/api/cancel-indexing', (req, res) => {
  if (indexingStatus.isIndexing) {
    indexingStatus.cancelled = true;
    indexingStatus.message = 'Cancelling indexing...';
    res.json({ success: true, message: 'Indexing cancellation requested' });
  } else {
    res.status(400).json({ error: 'No indexing in progress' });
  }
});

// Query the RAG system
app.post('/api/query', async (req, res) => {
  const { question } = req.body;
  
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }
  
  try {
    const response = await ragService.query(question);
    res.json(response);
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Failed to process query' });
  }
});

// Chat endpoint (maintains conversation)
app.post('/api/chat', async (req, res) => {
  const { messages, question } = req.body;
  
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }
  
  try {
    const response = await ragService.chat(messages || [], question);
    res.json(response);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat' });
  }
});

// Get vector store stats + indexed channels
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await vectorStore.getStats();
    const currentProject = upstashManager.getCurrentProject();
    const channels = channelManager.getAllChannels(currentProject?.id);
    const totalVideos = channelManager.getTotalVideos(currentProject?.id);
    
    res.json({
      ...stats,
      indexedChannels: Object.keys(channels).length,
      totalVideos,
      channels
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Get indexed channels with detailed info
app.get('/api/channels', (req, res) => {
  const currentProject = upstashManager.getCurrentProject();
  const channels = channelManager.getAllChannels(currentProject?.id);
  res.json(channels);
});

// Get YouTube API quota status
app.get('/api/quota', (req, res) => {
  try {
    const quotaStatus = youtubeService.getQuotaStatus();
    res.json(quotaStatus);
  } catch (error) {
    console.error('Error getting quota status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get indexing logs
app.get('/api/logs', async (req, res) => {
  await loadLogs(); // Reload from file
  res.json(indexingLogs);
});

// Get detailed channel info with videos
app.get('/api/channels/:channelId/videos', async (req, res) => {
  const { channelId } = req.params;
  
  try {
    // Find the most recent log for this channel
    const channelLogs = indexingLogs.filter(log => log.channelId === channelId);
    const latestLog = channelLogs[channelLogs.length - 1];
    
    if (!latestLog) {
      return res.status(404).json({ error: 'Channel not found in logs' });
    }
    
    res.json({
      channelId,
      channelName: latestLog.channelName,
      successVideos: latestLog.successVideos,
      failedVideos: latestLog.failedVideos,
      totalIndexed: latestLog.successCount,
      totalFailed: latestLog.failedCount
    });
  } catch (error) {
    console.error('Error fetching channel videos:', error);
    res.status(500).json({ error: 'Failed to fetch channel videos' });
  }
});

// Delete a channel
app.delete('/api/channels/:channelId', async (req, res) => {
  const { channelId } = req.params;
  
  try {
    await channelManager.removeChannel(channelId);
    res.json({ success: true, message: 'Channel removed successfully' });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// Reset vector store
app.post('/api/reset', async (req, res) => {
  try {
    await vectorStore.deleteNamespace();
    indexingStatus = {
      isIndexing: false,
      progress: 0,
      message: '',
      channelId: null
    };
    res.json({ message: 'Vector store reset successfully' });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ error: 'Failed to reset vector store' });
  }
});

// Project management endpoints
app.post('/api/projects', async (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }
  
  try {
    const project = await upstashManager.createProject(name, description);
    await initializeServices(); // Reinitialize with new project
    res.json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects', (req, res) => {
  const projects = upstashManager.getAllProjects();
  const currentProject = upstashManager.getCurrentProject();
  res.json({ projects, currentProject });
});

app.post('/api/projects/:id/switch', async (req, res) => {
  const { id } = req.params;
  
  try {
    const project = await upstashManager.switchProject(id);
    await initializeServices(); // Reinitialize with switched project
    res.json(project);
  } catch (error) {
    console.error('Error switching project:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await upstashManager.deleteProject(id);
    await initializeServices(); // Reinitialize after deletion
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-refresh settings
let autoRefreshSettings = {
  enabled: false,
  interval: 24 * 60 * 60 * 1000, // 24 hours
  lastCheck: null
};

const settingsFile = path.join(__dirname, '../../data/auto_refresh.json');

// Load auto-refresh settings
async function loadAutoRefreshSettings() {
  try {
    const data = await fs.readFile(settingsFile, 'utf8');
    autoRefreshSettings = JSON.parse(data);
  } catch (error) {
    // Use defaults
  }
}

// Save auto-refresh settings
async function saveAutoRefreshSettings() {
  try {
    await fs.writeFile(settingsFile, JSON.stringify(autoRefreshSettings, null, 2));
  } catch (error) {
    console.error('Error saving auto-refresh settings:', error);
  }
}

// Check for new videos
async function checkForNewVideos() {
  if (!autoRefreshSettings.enabled) return;
  
  console.log('Checking for new videos...');
  const channels = channelManager.getAllChannels();
  
  for (const [channelId, channelInfo] of Object.entries(channels)) {
    try {
      // Get latest videos from YouTube
      const videos = await youtubeService.getChannelVideos(channelId);
      const existingVideoCount = channelInfo.videoCount || 0;
      
      if (videos.length > existingVideoCount) {
        console.log(`Found ${videos.length - existingVideoCount} new videos for ${channelInfo.channelName}`);
        // Trigger indexing for new videos only
        // This would need to be implemented to only index new videos
      }
    } catch (error) {
      console.error(`Error checking channel ${channelId}:`, error);
    }
  }
  
  autoRefreshSettings.lastCheck = new Date().toISOString();
  await saveAutoRefreshSettings();
}

// Bulk channel import endpoint
app.post('/api/bulk-import', async (req, res) => {
  const { channels, videoLimit, excludeShorts } = req.body;
  
  if (!channels || !Array.isArray(channels) || channels.length === 0) {
    return res.status(400).json({ error: 'No channels provided' });
  }
  
  const queueStatus = {
    total: channels.length,
    processed: 0,
    successful: [],
    failed: [],
    inProgress: false
  };
  
  res.json({ 
    message: 'Bulk import started', 
    totalChannels: channels.length 
  });
  
  // Process channels sequentially in background
  (async () => {
    queueStatus.inProgress = true;
    
    for (const channelId of channels) {
      try {
        // Check if already processing
        if (indexingStatus.isIndexing) {
          // Wait for current indexing to complete
          while (indexingStatus.isIndexing) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        // Start indexing this channel
        const response = await fetch(`http://localhost:${config.server.port}/api/index-channel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId,
            videoLimit,
            excludeShorts,
            skipExisting: false
          })
        });
        
        if (response.ok) {
          // Wait for indexing to complete
          while (indexingStatus.isIndexing) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          queueStatus.successful.push(channelId);
        } else {
          queueStatus.failed.push({ channelId, error: 'Failed to start indexing' });
        }
      } catch (error) {
        queueStatus.failed.push({ channelId, error: error.message });
      }
      
      queueStatus.processed++;
    }
    
    queueStatus.inProgress = false;
  })();
});

// Get bulk import status
app.get('/api/bulk-import-status', (req, res) => {
  // This would need to be properly implemented with a queue manager
  res.json({ message: 'Status endpoint not fully implemented' });
});

// Export knowledge base endpoint
app.get('/api/export', async (req, res) => {
  try {
    const currentProject = upstashManager.getCurrentProject();
    const channels = channelManager.getAllChannels(currentProject?.id);
    
    // Get all logs for indexed videos
    const channelLogs = {};
    for (const [channelId, channel] of Object.entries(channels)) {
      const logs = indexingLogs.filter(log => log.channelId === channelId);
      if (logs.length > 0) {
        channelLogs[channelId] = logs[logs.length - 1]; // Get latest log
      }
    }
    
    const exportData = {
      exportDate: new Date().toISOString(),
      project: currentProject,
      channels: channels,
      videoDetails: channelLogs,
      stats: await vectorStore.getStats()
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="kb_export_${currentProject?.name || 'default'}_${Date.now()}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting knowledge base:', error);
    res.status(500).json({ error: 'Failed to export knowledge base' });
  }
});

// Auto-refresh endpoints
app.get('/api/auto-refresh', (req, res) => {
  res.json(autoRefreshSettings);
});

app.post('/api/auto-refresh', async (req, res) => {
  const { enabled, interval } = req.body;
  
  autoRefreshSettings.enabled = enabled !== undefined ? enabled : autoRefreshSettings.enabled;
  autoRefreshSettings.interval = interval || autoRefreshSettings.interval;
  
  await saveAutoRefreshSettings();
  
  if (autoRefreshSettings.enabled) {
    // Start checking
    scheduleAutoRefresh();
  }
  
  res.json(autoRefreshSettings);
});

app.post('/api/check-new-videos', async (req, res) => {
  // Manual trigger to check for new videos
  await checkForNewVideos();
  res.json({ message: 'Check completed', lastCheck: autoRefreshSettings.lastCheck });
});

// Schedule auto-refresh
let autoRefreshTimer = null;

function scheduleAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
  }
  
  if (autoRefreshSettings.enabled) {
    autoRefreshTimer = setInterval(checkForNewVideos, autoRefreshSettings.interval);
  }
}

// Load settings and start auto-refresh if enabled
loadAutoRefreshSettings().then(() => {
  if (autoRefreshSettings.enabled) {
    scheduleAutoRefresh();
  }
});

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
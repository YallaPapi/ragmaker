const express = require('express');
const cors = require('cors');
const path = require('path');
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

// Store indexing status
let indexingStatus = {
  isIndexing: false,
  progress: 0,
  message: '',
  channelId: null
};

// Routes

// Index a YouTube channel (adds to existing knowledge base)
app.post('/api/index-channel', async (req, res) => {
  const { channelId } = req.body;
  
  if (!channelId) {
    return res.status(400).json({ error: 'Channel ID is required' });
  }
  
  if (indexingStatus.isIndexing) {
    return res.status(409).json({ error: 'Already indexing a channel' });
  }
  
  // Check if channel already indexed
  if (channelManager.isChannelIndexed(channelId)) {
    return res.status(200).json({ 
      message: 'Channel already indexed', 
      channelId,
      alreadyIndexed: true 
    });
  }
  
  // Start indexing in background
  indexingStatus = {
    isIndexing: true,
    progress: 0,
    message: 'Starting indexing process...',
    channelId
  };
  
  res.json({ message: 'Indexing started', channelId });
  
  // Background indexing process
  (async () => {
    try {
      // Fetch transcripts
      indexingStatus.message = 'Fetching channel videos...';
      const transcripts = await youtubeService.getChannelTranscripts(channelId);
      indexingStatus.progress = 30;
      
      if (transcripts.length === 0) {
        throw new Error('No transcripts found for this channel');
      }
      
      // Get channel name from first video
      const channelName = transcripts[0].title ? 
        transcripts[0].title.split(' - ')[0] || channelId : 
        channelId;
      
      // Process embeddings
      indexingStatus.message = `Processing ${transcripts.length} videos...`;
      const embeddings = await embeddingService.processChannelTranscripts(transcripts);
      indexingStatus.progress = 70;
      
      // Index to vector store (ADDS to existing data)
      indexingStatus.message = 'Adding to knowledge base...';
      await vectorStore.indexChannel(embeddings);
      indexingStatus.progress = 100;
      
      // Save channel info
      await channelManager.addChannel(channelId, {
        channelId,
        channelName,
        videoCount: transcripts.length,
        totalChunks: embeddings.length
      });
      
      indexingStatus = {
        isIndexing: false,
        progress: 100,
        message: `Successfully added ${transcripts.length} videos to knowledge base!`,
        channelId
      };
    } catch (error) {
      console.error('Indexing error:', error);
      indexingStatus = {
        isIndexing: false,
        progress: 0,
        message: `Error: ${error.message}`,
        channelId
      };
    }
  })();
});

// Get indexing status
app.get('/api/index-status', (req, res) => {
  res.json(indexingStatus);
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
    const channels = channelManager.getAllChannels();
    const totalVideos = channelManager.getTotalVideos();
    
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

// Get indexed channels
app.get('/api/channels', (req, res) => {
  const channels = channelManager.getAllChannels();
  res.json(channels);
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

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
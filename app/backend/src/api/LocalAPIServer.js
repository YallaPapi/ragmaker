const express = require('express');
const cors = require('cors');
const path = require('path');
const LocalRAGService = require('../services/rag/LocalRAGService');
const LocalEmbeddingService = require('../services/embeddings/LocalEmbeddingService');
const LocalVectorStore = require('../services/vectorstore/LocalVectorStore');
const OllamaService = require('../services/ai/OllamaService');

class LocalAPIServer {
  constructor(options = {}) {
    this.config = {
      port: options.port || 3012,
      host: options.host || 'localhost',
      cors: options.cors !== false,
      
      // Service configurations
      vectorStorePath: options.vectorStorePath,
      useLocalEmbeddings: options.useLocalEmbeddings !== false,
      embeddingModel: options.embeddingModel || 'sentence-transformers/all-MiniLM-L6-v2',
      openaiApiKey: options.openaiApiKey,
      
      useOllama: options.useOllama !== false,
      ollamaModel: options.ollamaModel || 'llama3.2:3b',
      ollamaHost: options.ollamaHost || 'http://localhost:11434',
      
      enableDebug: options.enableDebug !== false,
      logRequests: options.logRequests !== false
    };

    this.app = express();
    this.server = null;
    this.isRunning = false;
    
    // Initialize services
    this.ragService = new LocalRAGService({
      vectorStorePath: this.config.vectorStorePath,
      useLocalEmbeddings: this.config.useLocalEmbeddings,
      embeddingModel: this.config.embeddingModel,
      openaiApiKey: this.config.openaiApiKey,
      useOllama: this.config.useOllama,
      ollamaModel: this.config.ollamaModel,
      ollamaHost: this.config.ollamaHost,
      enableDebug: this.config.enableDebug
    });

    // WebSocket connections for real-time updates
    this.wsConnections = new Set();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // CORS for desktop app
    if (this.config.cors) {
      this.app.use(cors({
        origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'file://', 'app://'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
      }));
    }

    // Body parsing
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Request logging
    if (this.config.logRequests) {
      this.app.use((req, res, next) => {
        console.log(new Date().toISOString() + ' - ' + req.method + ' ' + req.path);
        next();
      });
    }
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.ragService.healthCheck();
        res.json(health);
      } catch (error) {
        res.status(500).json({
          status: 'unhealthy',
          error: error.message
        });
      }
    });

    // RAG query endpoint
    this.app.post('/query', async (req, res) => {
      try {
        const { question, topK, profileId, customInstructions, collectionId } = req.body;
        
        if (!question) {
          return res.status(400).json({
            error: 'Question is required'
          });
        }

        const result = await this.ragService.query(
          question,
          topK,
          profileId || 'default',
          customInstructions,
          collectionId
        );

        res.json(result);
      } catch (error) {
        console.error('Query error:', error);
        res.status(500).json({
          error: 'Query failed',
          message: error.message
        });
      }
    });

    // Document indexing endpoint
    this.app.post('/index', async (req, res) => {
      try {
        const { documents, collectionId } = req.body;
        
        if (!documents || !Array.isArray(documents)) {
          return res.status(400).json({
            error: 'Documents array is required'
          });
        }

        // Set up progress tracking
        const progressId = Date.now().toString();
        
        this.ragService.addProgressCallback((progress) => {
          // Broadcast progress to connected WebSocket clients
          this.broadcastProgress(progressId, progress);
        });

        const result = await this.ragService.indexDocuments(documents, collectionId);
        
        res.json({
          ...result,
          progressId
        });
      } catch (error) {
        console.error('Indexing error:', error);
        res.status(500).json({
          error: 'Indexing failed',
          message: error.message
        });
      }
    });

    // Collections management
    this.app.get('/collections', async (req, res) => {
      try {
        const collections = await this.ragService.listCollections();
        res.json(collections);
      } catch (error) {
        console.error('Error listing collections:', error);
        res.status(500).json({
          error: 'Failed to list collections',
          message: error.message
        });
      }
    });

    this.app.post('/collections', async (req, res) => {
      try {
        const { id, name, description } = req.body;
        
        if (!id || !name) {
          return res.status(400).json({
            error: 'Collection ID and name are required'
          });
        }

        await this.ragService.vectorStore.createCollection(id, name, description);
        res.json({ success: true, collectionId: id });
      } catch (error) {
        console.error('Error creating collection:', error);
        res.status(500).json({
          error: 'Failed to create collection',
          message: error.message
        });
      }
    });

    this.app.delete('/collections/:id', async (req, res) => {
      try {
        const { id } = req.params;
        
        if (id === 'default') {
          return res.status(400).json({
            error: 'Cannot delete default collection'
          });
        }

        await this.ragService.deleteCollection(id);
        res.json({ success: true });
      } catch (error) {
        console.error('Error deleting collection:', error);
        res.status(500).json({
          error: 'Failed to delete collection',
          message: error.message
        });
      }
    });

    this.app.get('/collections/:id/stats', async (req, res) => {
      try {
        const { id } = req.params;
        const stats = await this.ragService.getCollectionStats(id);
        res.json(stats);
      } catch (error) {
        console.error('Error getting collection stats:', error);
        res.status(500).json({
          error: 'Failed to get collection stats',
          message: error.message
        });
      }
    });

    // RAG Profiles management
    this.app.get('/profiles', (req, res) => {
      try {
        const profiles = this.ragService.profiles.getAllProfiles();
        res.json(profiles);
      } catch (error) {
        console.error('Error getting profiles:', error);
        res.status(500).json({
          error: 'Failed to get profiles',
          message: error.message
        });
      }
    });

    this.app.get('/profiles/categories', (req, res) => {
      try {
        const categories = this.ragService.profiles.getProfilesByCategory();
        res.json(categories);
      } catch (error) {
        console.error('Error getting profile categories:', error);
        res.status(500).json({
          error: 'Failed to get profile categories',
          message: error.message
        });
      }
    });

    this.app.post('/profiles', async (req, res) => {
      try {
        const { id, profile } = req.body;
        
        if (!id || !profile) {
          return res.status(400).json({
            error: 'Profile ID and profile data are required'
          });
        }

        const validation = this.ragService.profiles.validateProfile(profile);
        if (!validation.isValid) {
          return res.status(400).json({
            error: 'Invalid profile',
            errors: validation.errors
          });
        }

        const success = await this.ragService.profiles.saveCustomProfile(id, profile);
        res.json({ success });
      } catch (error) {
        console.error('Error saving profile:', error);
        res.status(500).json({
          error: 'Failed to save profile',
          message: error.message
        });
      }
    });

    this.app.delete('/profiles/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const success = await this.ragService.profiles.deleteCustomProfile(id);
        res.json({ success });
      } catch (error) {
        console.error('Error deleting profile:', error);
        res.status(500).json({
          error: 'Failed to delete profile',
          message: error.message
        });
      }
    });

    // Ollama integration
    this.app.get('/ollama/models', async (req, res) => {
      try {
        const models = await this.ragService.ollamaService.listModels();
        res.json(models);
      } catch (error) {
        console.error('Error listing Ollama models:', error);
        res.status(500).json({
          error: 'Failed to list models',
          message: error.message
        });
      }
    });

    this.app.post('/ollama/models/pull', async (req, res) => {
      try {
        const { model } = req.body;
        
        if (!model) {
          return res.status(400).json({
            error: 'Model name is required'
          });
        }

        const result = await this.ragService.ollamaService.pullModel(model);
        res.json(result);
      } catch (error) {
        console.error('Error pulling Ollama model:', error);
        res.status(500).json({
          error: 'Failed to pull model',
          message: error.message
        });
      }
    });

    this.app.delete('/ollama/models/:model', async (req, res) => {
      try {
        const { model } = req.params;
        const result = await this.ragService.ollamaService.deleteModel(model);
        res.json(result);
      } catch (error) {
        console.error('Error deleting Ollama model:', error);
        res.status(500).json({
          error: 'Failed to delete model',
          message: error.message
        });
      }
    });

    // Configuration management
    this.app.get('/config', (req, res) => {
      try {
        const config = {
          ...this.config,
          openaiApiKey: this.config.openaiApiKey ? '***' : null // Hide API key
        };
        res.json(config);
      } catch (error) {
        console.error('Error getting config:', error);
        res.status(500).json({
          error: 'Failed to get configuration',
          message: error.message
        });
      }
    });

    this.app.put('/config', (req, res) => {
      try {
        const newConfig = req.body;
        
        // Update internal config
        this.config = { ...this.config, ...newConfig };
        
        // Update RAG service config
        this.ragService.updateConfig(newConfig);
        
        res.json({ success: true });
      } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({
          error: 'Failed to update configuration',
          message: error.message
        });
      }
    });

    // Current operation status
    this.app.get('/status', (req, res) => {
      try {
        const operation = this.ragService.getCurrentOperation();
        res.json({
          isRunning: this.isRunning,
          currentOperation: operation,
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({
          error: 'Failed to get status',
          message: error.message
        });
      }
    });

    // Embedding service utilities
    this.app.post('/embeddings/install', async (req, res) => {
      try {
        await this.ragService.embeddingService.installLocalModel();
        res.json({ success: true, message: 'Local model dependencies installed' });
      } catch (error) {
        console.error('Error installing embedding model:', error);
        res.status(500).json({
          error: 'Failed to install embedding model',
          message: error.message
        });
      }
    });

    // Static files for development/testing
    if (process.env.NODE_ENV === 'development') {
      this.app.get('/', (req, res) => {
        res.json({
          name: 'RAGMaker Local API',
          version: '1.0.0',
          status: 'running',
          endpoints: [
            'GET /health',
            'POST /query',
            'POST /index',
            'GET /collections',
            'GET /profiles',
            'GET /ollama/models',
            'GET /config',
            'GET /status'
          ]
        });
      });
    }
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path,
        method: req.method
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('Unhandled error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    });
  }

  broadcastProgress(progressId, progress) {
    const message = JSON.stringify({
      type: 'progress',
      progressId,
      data: progress
    });

    this.wsConnections.forEach(ws => {
      try {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(message);
        }
      } catch (error) {
        console.error('Error broadcasting progress:', error);
      }
    });
  }

  async start() {
    if (this.isRunning) {
      console.log('Server is already running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, this.config.host, (error) => {
        if (error) {
          reject(error);
          return;
        }

        this.isRunning = true;
        console.log('LocalAPIServer started on ' + this.config.host + ':' + this.config.port);
        console.log('Health check: http://' + this.config.host + ':' + this.config.port + '/health');
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('Server error:', error);
        this.isRunning = false;
      });
    });
  }

  async stop() {
    if (!this.isRunning || !this.server) {
      console.log('Server is not running');
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false;
        console.log('LocalAPIServer stopped');
        
        // Clean up resources
        if (this.ragService) {
          this.ragService.close();
        }
        
        resolve();
      });
    });
  }

  getServerInfo() {
    return {
      isRunning: this.isRunning,
      host: this.config.host,
      port: this.config.port,
      uptime: this.isRunning ? process.uptime() : 0,
      config: {
        ...this.config,
        openaiApiKey: this.config.openaiApiKey ? '***' : null
      }
    };
  }
}

module.exports = LocalAPIServer;
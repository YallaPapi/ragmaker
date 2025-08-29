/**
 * Service initialization and management utilities
 */

const YouTubeService = require('../services/youtube');
const EmbeddingService = require('../services/embeddings');
const VectorStoreService = require('../services/vectorStore');
const RAGService = require('../services/rag');
const ChannelManager = require('../services/channelManager');
const UpstashManager = require('../services/upstashManager');

class ServiceManager {
  constructor() {
    this.services = {};
    this.initialized = false;
  }

  async initializeServices() {
    if (this.initialized) {
      return this.services;
    }

    // Initialize core services
    this.services.youtubeService = new YouTubeService();
    this.services.embeddingService = new EmbeddingService();
    this.services.channelManager = new ChannelManager();
    this.services.upstashManager = new UpstashManager();

    // Wait for managers to initialize
    await this.services.channelManager.initialized;
    await this.services.upstashManager.initialized;

    // Initialize vector store and RAG service based on current project
    await this.initializeVectorServices();

    this.initialized = true;
    return this.services;
  }

  async initializeVectorServices() {
    const project = this.services.upstashManager.getCurrentProject();
    
    if (project) {
      const creds = this.services.upstashManager.getProjectCredentials();
      this.services.vectorStore = new VectorStoreService(creds);
    } else {
      this.services.vectorStore = new VectorStoreService();
    }
    
    this.services.ragService = new RAGService(this.services.vectorStore);
  }

  async reinitializeVectorServices() {
    // Reinitialize vector store and RAG service (used when switching projects)
    await this.initializeVectorServices();
    return this.services;
  }

  getServices() {
    if (!this.initialized) {
      throw new Error('Services not initialized. Call initializeServices() first.');
    }
    return this.services;
  }

  getService(serviceName) {
    if (!this.initialized) {
      throw new Error('Services not initialized. Call initializeServices() first.');
    }
    
    if (!this.services[serviceName]) {
      throw new Error(`Service '${serviceName}' not found.`);
    }
    
    return this.services[serviceName];
  }

  // Store services in Express app locals for easy access
  attachToApp(app) {
    const services = this.getServices();
    
    app.locals.channelManager = services.channelManager;
    app.locals.upstashManager = services.upstashManager;
    app.locals.youtubeService = services.youtubeService;
    app.locals.embeddingService = services.embeddingService;
    app.locals.vectorStore = services.vectorStore;
    app.locals.ragService = services.ragService;
  }

  // Create a reinitialize callback for controllers
  createReinitializeCallback() {
    return async () => {
      await this.reinitializeVectorServices();
      return this.services;
    };
  }
}

module.exports = ServiceManager;
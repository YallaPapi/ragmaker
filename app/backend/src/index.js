#!/usr/bin/env node

const path = require('path');
const LocalAPIServer = require('./api/LocalAPIServer');

// Configuration from environment or defaults
const config = {
  port: process.env.PORT || 3012,
  host: process.env.HOST || 'localhost',
  
  // Vector store
  vectorStorePath: process.env.VECTOR_DB_PATH || path.join(__dirname, '../database/vectors.db'),
  
  // Embedding configuration
  useLocalEmbeddings: process.env.USE_LOCAL_EMBEDDINGS !== 'false',
  embeddingModel: process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
  openaiApiKey: process.env.OPENAI_API_KEY,
  
  // Ollama configuration
  useOllama: process.env.USE_OLLAMA !== 'false',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:3b',
  ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
  
  // Debug options
  enableDebug: process.env.ENABLE_DEBUG !== 'false',
  logRequests: process.env.LOG_REQUESTS !== 'false'
};

// Create and start the server
const server = new LocalAPIServer(config);

async function startServer() {
  try {
    console.log('🚀 Starting RAGMaker Local Backend...');
    console.log('Configuration:');
    console.log('  - Port:', config.port);
    console.log('  - Host:', config.host);
    console.log('  - Vector DB:', config.vectorStorePath);
    console.log('  - Local Embeddings:', config.useLocalEmbeddings ? 'Enabled' : 'Disabled');
    console.log('  - Embedding Model:', config.embeddingModel);
    console.log('  - Ollama:', config.useOllama ? 'Enabled' : 'Disabled');
    console.log('  - Ollama Model:', config.ollamaModel);
    console.log('  - Debug:', config.enableDebug ? 'Enabled' : 'Disabled');
    console.log('');

    await server.start();
    
    console.log('✅ Server started successfully!');
    console.log('');
    console.log('Available endpoints:');
    console.log('  - Health Check: http://' + config.host + ':' + config.port + '/health');
    console.log('  - Query: POST http://' + config.host + ':' + config.port + '/query');
    console.log('  - Index Documents: POST http://' + config.host + ':' + config.port + '/index');
    console.log('  - Collections: GET http://' + config.host + ':' + config.port + '/collections');
    console.log('  - Profiles: GET http://' + config.host + ':' + config.port + '/profiles');
    console.log('  - Ollama Models: GET http://' + config.host + ':' + config.port + '/ollama/models');
    console.log('  - Configuration: GET http://' + config.host + ':' + config.port + '/config');
    console.log('');

    // Perform initial health check
    try {
      const health = await server.ragService.healthCheck();
      console.log('🔍 System Health Check:');
      console.log('  - Overall Status:', health.status.toUpperCase());
      
      if (health.services.embeddings) {
        console.log('  - Embeddings:', health.services.embeddings.status);
        if (health.services.embeddings.services) {
          if (health.services.embeddings.services.local) {
            console.log('    - Local:', health.services.embeddings.services.local.status);
          }
          if (health.services.embeddings.services.openai) {
            console.log('    - OpenAI:', health.services.embeddings.services.openai.status);
          }
        }
      }
      
      if (health.services.vectorStore) {
        console.log('  - Vector Store:', health.services.vectorStore.status);
      }
      
      if (health.services.ollama) {
        console.log('  - Ollama:', health.services.ollama.status);
        if (health.services.ollama.modelsAvailable !== undefined) {
          console.log('    - Models Available:', health.services.ollama.modelsAvailable);
          console.log('    - Default Model Available:', health.services.ollama.defaultModelAvailable ? 'Yes' : 'No');
        }
      }
      
      console.log('');
      
      if (health.status === 'healthy') {
        console.log('🎉 All systems operational!');
      } else {
        console.log('⚠️  Some services may need attention. Check logs for details.');
      }
      
    } catch (healthError) {
      console.error('❌ Health check failed:', healthError.message);
      console.log('ℹ️  Server is running but some services may not be available.');
    }

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    if (config.enableDebug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\\n🛑 Received SIGTERM, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\\n🛑 Received SIGINT, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  if (config.enableDebug) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  if (config.enableDebug && reason.stack) {
    console.error(reason.stack);
  }
});

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = { LocalAPIServer, config };
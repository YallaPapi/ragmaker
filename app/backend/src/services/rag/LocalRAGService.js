const LocalEmbeddingService = require('../embeddings/LocalEmbeddingService');
const LocalVectorStore = require('../vectorstore/LocalVectorStore');
const LocalRAGProfiles = require('./LocalRAGProfiles');
const OllamaService = require('../ai/OllamaService');

class LocalRAGService {
  constructor(options = {}) {
    this.config = {
      // Vector store configuration
      vectorStorePath: options.vectorStorePath,
      collectionId: options.collectionId || 'default',
      
      // Embedding configuration
      useLocalEmbeddings: options.useLocalEmbeddings !== false,
      embeddingModel: options.embeddingModel || 'sentence-transformers/all-MiniLM-L6-v2',
      openaiApiKey: options.openaiApiKey,
      
      // AI model configuration
      useOllama: options.useOllama !== false,
      ollamaModel: options.ollamaModel || 'llama3.2:3b',
      ollamaHost: options.ollamaHost || 'http://localhost:11434',
      fallbackToOpenAI: options.fallbackToOpenAI !== false,
      
      // Search configuration
      defaultTopK: options.defaultTopK || 10,
      minSimilarityScore: options.minSimilarityScore || 0.3,
      
      // Debug options
      enableDebug: options.enableDebug !== false
    };

    // Initialize services
    this.embeddingService = new LocalEmbeddingService({
      useLocal: this.config.useLocalEmbeddings,
      modelName: this.config.embeddingModel,
      openaiApiKey: this.config.openaiApiKey,
      fallbackToOpenAI: this.config.fallbackToOpenAI
    });

    this.vectorStore = new LocalVectorStore(this.config.vectorStorePath);
    this.profiles = new LocalRAGProfiles();
    
    this.ollamaService = new OllamaService({
      baseUrl: this.config.ollamaHost,
      defaultModel: this.config.ollamaModel
    });

    // Initialize progress tracking
    this.currentOperation = null;
    this.progressCallbacks = new Set();
  }

  // Progress tracking methods
  addProgressCallback(callback) {
    this.progressCallbacks.add(callback);
  }

  removeProgressCallback(callback) {
    this.progressCallbacks.delete(callback);
  }

  reportProgress(progress) {
    this.progressCallbacks.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.error('Error in progress callback:', error);
      }
    });
  }

  async query(question, topK = null, profileId = 'default', customInstructions = null, collectionId = null) {
    topK = topK || this.config.defaultTopK;
    collectionId = collectionId || this.config.collectionId;

    const debugInfo = {
      question,
      profileId,
      collectionId,
      chunksCount: 0,
      context: '',
      systemPrompt: '',
      userPrompt: '',
      searchResults: [],
      aiModel: this.config.useOllama ? this.config.ollamaModel : 'openai',
      error: null,
      timing: {
        embedding: 0,
        search: 0,
        generation: 0,
        total: 0
      }
    };

    const startTime = Date.now();

    try {
      this.reportProgress({
        stage: 'embedding',
        message: 'Creating embedding for question...',
        progress: 0.1
      });

      // Create embedding for the question
      const embeddingStart = Date.now();
      const questionEmbedding = await this.embeddingService.createEmbedding(question);
      debugInfo.timing.embedding = Date.now() - embeddingStart;

      this.reportProgress({
        stage: 'searching',
        message: 'Searching for relevant content...',
        progress: 0.3
      });

      // Query vector store for relevant chunks
      const searchStart = Date.now();
      const searchResults = await this.vectorStore.query(questionEmbedding, topK, collectionId);
      debugInfo.timing.search = Date.now() - searchStart;

      // Filter results by minimum similarity score
      const filteredResults = searchResults.filter(result => 
        result.score >= this.config.minSimilarityScore
      );

      debugInfo.searchResults = filteredResults.map(result => ({
        id: result.id,
        score: result.score,
        metadata: result.metadata
      }));

      if (filteredResults.length === 0) {
        debugInfo.chunksCount = 0;
        debugInfo.context = 'No relevant content found in knowledge base';
        debugInfo.systemPrompt = 'No system prompt generated - no context available';
        debugInfo.userPrompt = 'Question: ' + question;
        
        this.reportProgress({
          stage: 'complete',
          message: 'No relevant content found',
          progress: 1.0
        });

        return {
          answer: "I couldn't find any relevant information to answer your question. This could mean: 1) No content is indexed yet, 2) Your question is outside the scope of indexed content, or 3) The knowledge base is empty.",
          sources: [],
          chunks: [],
          debug: this.config.enableDebug ? debugInfo : null
        };
      }

      // Build context from search results
      const context = filteredResults
        .map((result, index) => {
          const metadata = result.metadata;
          return '[' + (index + 1) + '] From "' + metadata.videoTitle + '" (' + metadata.videoUrl + '):\n' + metadata.content;
        })
        .join('\n\n');

      debugInfo.chunksCount = filteredResults.length;
      debugInfo.context = context;

      this.reportProgress({
        stage: 'generating',
        message: 'Generating response...',
        progress: 0.7
      });

      // Generate answer using AI model with profile
      const generationStart = Date.now();
      const promptConfig = this.profiles.buildPrompt(profileId, context, question, customInstructions);
      
      debugInfo.systemPrompt = promptConfig.systemPrompt;
      debugInfo.userPrompt = promptConfig.userPrompt;

      let answer;
      
      if (this.config.useOllama) {
        try {
          const response = await this.ollamaService.chat([
            { role: 'system', content: promptConfig.systemPrompt },
            { role: 'user', content: promptConfig.userPrompt }
          ], {
            temperature: promptConfig.temperature
          });
          answer = response.message.content;
        } catch (error) {
          console.error('Ollama generation failed:', error.message);
          
          if (this.config.fallbackToOpenAI && this.embeddingService.openai) {
            console.log('Falling back to OpenAI...');
            const completion = await this.embeddingService.openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: promptConfig.systemPrompt },
                { role: 'user', content: promptConfig.userPrompt }
              ],
              temperature: promptConfig.temperature,
              max_tokens: 2000
            });
            answer = completion.choices[0].message.content;
            debugInfo.aiModel = 'openai-fallback';
          } else {
            throw error;
          }
        }
      } else if (this.embeddingService.openai) {
        const completion = await this.embeddingService.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: promptConfig.systemPrompt },
            { role: 'user', content: promptConfig.userPrompt }
          ],
          temperature: promptConfig.temperature,
          max_tokens: 2000
        });
        answer = completion.choices[0].message.content;
        debugInfo.aiModel = 'openai';
      } else {
        throw new Error('No AI model available for generation');
      }

      debugInfo.timing.generation = Date.now() - generationStart;
      debugInfo.timing.total = Date.now() - startTime;

      this.reportProgress({
        stage: 'complete',
        message: 'Response generated successfully',
        progress: 1.0
      });

      // Extract unique video sources
      const sources = [...new Map(filteredResults.map(r => [
        r.metadata.videoId,
        {
          videoId: r.metadata.videoId,
          title: r.metadata.videoTitle,
          url: r.metadata.videoUrl
        }
      ])).values()];

      return {
        answer,
        sources,
        chunks: filteredResults.map(r => ({
          content: r.metadata.content,
          videoTitle: r.metadata.videoTitle,
          score: r.score
        })),
        debug: this.config.enableDebug ? debugInfo : null
      };

    } catch (error) {
      console.error('Error in RAG query:', error);
      
      debugInfo.error = error.message;
      debugInfo.timing.total = Date.now() - startTime;
      
      this.reportProgress({
        stage: 'error',
        message: 'Error: ' + error.message,
        progress: 1.0,
        error: error.message
      });

      return {
        answer: "Sorry, I encountered an error processing your question. Please check the debug information for details.",
        sources: [],
        chunks: [],
        debug: this.config.enableDebug ? debugInfo : null
      };
    }
  }

  async indexDocuments(documents, collectionId = null, progressCallback = null) {
    collectionId = collectionId || this.config.collectionId;
    
    this.currentOperation = {
      type: 'indexing',
      collectionId,
      totalDocuments: documents.length,
      processedDocuments: 0,
      totalChunks: 0,
      startTime: Date.now()
    };

    try {
      // Ensure collection exists
      await this.vectorStore.createCollection(
        collectionId,
        'Collection ' + collectionId,
        'Local RAG collection',
        this.config.embeddingModel
      );

      this.reportProgress({
        stage: 'processing',
        message: 'Processing ' + documents.length + ' documents...',
        progress: 0.0,
        operation: this.currentOperation
      });

      // Process documents through embedding service
      const allChunks = await this.embeddingService.processChannelTranscripts(
        documents,
        (progress) => {
          this.currentOperation.processedDocuments = progress.processed;
          this.currentOperation.totalChunks = progress.totalChunks;
          
          this.reportProgress({
            stage: 'processing',
            message: 'Processing: ' + progress.currentVideo,
            progress: progress.processed / progress.total * 0.8, // Reserve 20% for indexing
            operation: this.currentOperation,
            error: progress.error
          });
          
          if (progressCallback) {
            progressCallback(progress);
          }
        }
      );

      this.reportProgress({
        stage: 'indexing',
        message: 'Indexing ' + allChunks.length + ' chunks...',
        progress: 0.8,
        operation: this.currentOperation
      });

      // Index chunks in vector store
      await this.vectorStore.upsertBatch(allChunks, collectionId);

      this.currentOperation.endTime = Date.now();
      this.currentOperation.status = 'completed';

      this.reportProgress({
        stage: 'complete',
        message: 'Successfully indexed ' + allChunks.length + ' chunks',
        progress: 1.0,
        operation: this.currentOperation
      });

      return {
        success: true,
        documentsProcessed: documents.length,
        chunksIndexed: allChunks.length,
        collectionId: collectionId,
        duration: this.currentOperation.endTime - this.currentOperation.startTime
      };

    } catch (error) {
      console.error('Error indexing documents:', error);
      
      if (this.currentOperation) {
        this.currentOperation.endTime = Date.now();
        this.currentOperation.status = 'failed';
        this.currentOperation.error = error.message;
      }

      this.reportProgress({
        stage: 'error',
        message: 'Indexing failed: ' + error.message,
        progress: 1.0,
        operation: this.currentOperation,
        error: error.message
      });

      throw error;
    } finally {
      this.currentOperation = null;
    }
  }

  async deleteCollection(collectionId) {
    await this.vectorStore.deleteCollection(collectionId);
    console.log('Collection ' + collectionId + ' deleted successfully');
  }

  async listCollections() {
    return await this.vectorStore.listCollections();
  }

  async getCollectionStats(collectionId = null) {
    collectionId = collectionId || this.config.collectionId;
    return await this.vectorStore.getStats(collectionId);
  }

  async healthCheck() {
    const health = {
      status: 'healthy',
      services: {},
      config: this.config,
      timestamp: new Date().toISOString()
    };

    // Check embedding service
    try {
      const embeddingHealth = await this.embeddingService.healthCheck();
      health.services.embeddings = embeddingHealth;
    } catch (error) {
      health.services.embeddings = {
        status: 'unhealthy',
        error: error.message
      };
      health.status = 'unhealthy';
    }

    // Check vector store
    try {
      const vectorHealth = await this.vectorStore.healthCheck();
      health.services.vectorStore = vectorHealth;
    } catch (error) {
      health.services.vectorStore = {
        status: 'unhealthy',
        error: error.message
      };
      health.status = 'unhealthy';
    }

    // Check Ollama service
    if (this.config.useOllama) {
      try {
        const ollamaHealth = await this.ollamaService.healthCheck();
        health.services.ollama = ollamaHealth;
      } catch (error) {
        health.services.ollama = {
          status: 'unhealthy',
          error: error.message
        };
        if (!this.config.fallbackToOpenAI) {
          health.status = 'unhealthy';
        }
      }
    }

    return health;
  }

  getCurrentOperation() {
    return this.currentOperation;
  }

  getConfig() {
    return { ...this.config };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Update underlying services
    this.embeddingService.updateConfig({
      useLocal: this.config.useLocalEmbeddings,
      modelName: this.config.embeddingModel,
      openaiApiKey: this.config.openaiApiKey,
      fallbackToOpenAI: this.config.fallbackToOpenAI
    });

    if (newConfig.ollamaHost || newConfig.ollamaModel) {
      this.ollamaService.updateConfig({
        baseUrl: this.config.ollamaHost,
        defaultModel: this.config.ollamaModel
      });
    }
  }

  close() {
    if (this.vectorStore) {
      this.vectorStore.close();
    }
    
    // Clear progress callbacks
    this.progressCallbacks.clear();
  }
}

module.exports = LocalRAGService;
const OpenAI = require('openai');
const EmbeddingService = require('./embeddings');
const VectorStoreService = require('./vectorStore');
const config = require('../config');
const RAGProfiles = require('./ragProfiles');

class RAGService {
  constructor(vectorStore = null) {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
    this.embeddingService = new EmbeddingService();
    this.vectorStore = vectorStore || new VectorStoreService();
    this.profiles = new RAGProfiles();
  }

  async query(question, topK = 10, profileId = 'default', customInstructions = null) {
    // Initialize debug info early
    const debugInfo = {
      question,
      profileId,
      chunksCount: 0,
      context: '',
      systemPrompt: '',
      userPrompt: '',
      error: null
    };
    
    try {
      // Create embedding for the question
      const questionEmbedding = await this.embeddingService.createEmbedding(question);
      
      // Query vector store for relevant chunks
      const searchResults = await this.vectorStore.query(questionEmbedding, topK);
      
      if (!searchResults || searchResults.length === 0) {
        debugInfo.chunksCount = 0;
        debugInfo.context = 'No relevant content found in knowledge base';
        debugInfo.systemPrompt = 'No system prompt generated - no context available';
        debugInfo.userPrompt = `Question: ${question}`;
        
        return {
          answer: "I couldn't find any relevant information to answer your question. This could mean: 1) No channels are indexed yet, 2) Your question is outside the scope of indexed content, or 3) The knowledge base is empty.",
          sources: [],
          chunks: [],
          debug: debugInfo
        };
      }
      
      // Build context from search results
      const context = searchResults
        .map((result, index) => {
          const metadata = result.metadata;
          return `[${index + 1}] From "${metadata.videoTitle}" (${metadata.videoUrl}):\n${metadata.content}`;
        })
        .join('\n\n');
      
      // Update debug info with search results
      debugInfo.chunksCount = searchResults.length;
      debugInfo.context = context;
      
      // Generate answer using OpenAI with profile
      const promptConfig = this.profiles.buildPrompt(profileId, context, question, customInstructions);
      
      // Add prompts to debug info
      debugInfo.systemPrompt = promptConfig.systemPrompt;
      debugInfo.userPrompt = promptConfig.userPrompt;
      
      const completion = await this.openai.chat.completions.create({
        model: config.generation.model,
        messages: [
          { role: 'system', content: promptConfig.systemPrompt },
          { role: 'user', content: promptConfig.userPrompt }
        ],
        temperature: promptConfig.temperature || config.generation.temperature,
        max_tokens: config.generation.maxTokens
      });
      
      const answer = completion.choices[0].message.content;
      
      // Extract unique video sources
      const sources = [...new Map(searchResults.map(r => [
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
        chunks: searchResults.map(r => ({
          content: r.metadata.content,
          videoTitle: r.metadata.videoTitle,
          score: r.score
        })),
        debug: debugInfo
      };
    } catch (error) {
      console.error('Error in RAG query:', error);
      
      // Update debug info with error details
      debugInfo.error = error.message;
      debugInfo.context = debugInfo.context || 'ERROR: Could not retrieve context';
      debugInfo.systemPrompt = debugInfo.systemPrompt || 'ERROR: Could not generate prompt';
      debugInfo.userPrompt = debugInfo.userPrompt || 'ERROR: Could not generate prompt';
      
      return {
        answer: "Sorry, I encountered an error processing your question. Please check the debug terminal for details.",
        sources: [],
        chunks: [],
        debug: debugInfo
      };
    }
  }

  async chat(messages, question) {
    // For chat mode, maintain conversation history
    const response = await this.query(question);
    
    return {
      role: 'assistant',
      content: response.answer,
      sources: response.sources
    };
  }
}

module.exports = RAGService;
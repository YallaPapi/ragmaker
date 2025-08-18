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

  async query(question, topK = 5, profileId = 'default') {
    try {
      // Create embedding for the question
      const questionEmbedding = await this.embeddingService.createEmbedding(question);
      
      // Query vector store for relevant chunks
      const searchResults = await this.vectorStore.query(questionEmbedding, topK);
      
      if (!searchResults || searchResults.length === 0) {
        return {
          answer: "I couldn't find any relevant information to answer your question.",
          sources: []
        };
      }
      
      // Build context from search results
      const context = searchResults
        .map((result, index) => {
          const metadata = result.metadata;
          return `[${index + 1}] From "${metadata.videoTitle}" (${metadata.videoUrl}):\n${metadata.content}`;
        })
        .join('\n\n');
      
      // Generate answer using OpenAI with profile
      const promptConfig = this.profiles.buildPrompt(profileId, context, question);
      
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
        }))
      };
    } catch (error) {
      console.error('Error in RAG query:', error);
      throw error;
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
const OpenAI = require('openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const config = require('../config');

class EmbeddingService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
    
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: config.embedding.chunkSize,
      chunkOverlap: config.embedding.chunkOverlap,
      separators: ['\n\n', '\n', '. ', ', ', ' ', '']
    });
  }

  async splitTranscript(transcript, metadata) {
    const chunks = await this.textSplitter.createDocuments(
      [transcript],
      [metadata]
    );
    
    return chunks.map((chunk, index) => ({
      content: chunk.pageContent,
      metadata: {
        ...chunk.metadata,
        chunkIndex: index,
        totalChunks: chunks.length
      }
    }));
  }

  async createEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: config.embedding.model,
        input: text
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error creating embedding:', error);
      throw error;
    }
  }

  async processVideo(video) {
    const chunks = await this.splitTranscript(video.transcript, {
      videoId: video.videoId,
      videoTitle: video.title,
      videoUrl: video.url,
      publishedAt: video.publishedAt
    });
    
    const processedChunks = [];
    
    for (const chunk of chunks) {
      const embedding = await this.createEmbedding(chunk.content);
      
      processedChunks.push({
        id: `${video.videoId}_chunk_${chunk.metadata.chunkIndex}`,
        vector: embedding,
        metadata: {
          ...chunk.metadata,
          content: chunk.content
        }
      });
    }
    
    return processedChunks;
  }

  async processChannelTranscripts(transcripts) {
    const allChunks = [];
    
    for (const video of transcripts) {
      console.log(`Processing embeddings for: ${video.title}`);
      const chunks = await this.processVideo(video);
      allChunks.push(...chunks);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`Created ${allChunks.length} embeddings total`);
    return allChunks;
  }
}

module.exports = EmbeddingService;
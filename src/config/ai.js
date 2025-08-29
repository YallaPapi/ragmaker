/**
 * AI service configuration
 */

module.exports = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    organization: process.env.OPENAI_ORG_ID,
    timeout: parseInt(process.env.OPENAI_TIMEOUT) || 30000
  },
  
  embedding: {
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS) || 1536,
    chunkSize: parseInt(process.env.CHUNK_SIZE) || 500,
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP) || 100,
    batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE) || 100
  },
  
  generation: {
    model: process.env.GENERATION_MODEL || 'gpt-4o-mini',
    temperature: parseFloat(process.env.GENERATION_TEMPERATURE) || 0.7,
    maxTokens: parseInt(process.env.GENERATION_MAX_TOKENS) || 2500,
    topP: parseFloat(process.env.GENERATION_TOP_P) || 1.0,
    frequencyPenalty: parseFloat(process.env.GENERATION_FREQUENCY_PENALTY) || 0,
    presencePenalty: parseFloat(process.env.GENERATION_PRESENCE_PENALTY) || 0
  },
  
  // Alternative AI providers
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
    maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS) || 4096
  },
  
  google: {
    apiKey: process.env.GOOGLE_AI_API_KEY,
    model: process.env.GOOGLE_AI_MODEL || 'gemini-pro'
  }
};
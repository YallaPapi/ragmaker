require('dotenv').config();

module.exports = {
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY
  },
  upstash: {
    url: process.env.UPSTASH_VECTOR_REST_URL,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY
  },
  embedding: {
    model: 'text-embedding-3-small',  // Must match Upstash dimension (1536)
    chunkSize: 1000,
    chunkOverlap: 200
  },
  generation: {
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 1000
  },
  server: {
    port: process.env.PORT || 3000
  }
};
require('dotenv').config();

const database = require('./database');
const ai = require('./ai');

module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    bodyLimit: process.env.BODY_LIMIT || '10mb'
  },

  // YouTube API configuration
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
    quotaLimit: parseInt(process.env.YOUTUBE_QUOTA_LIMIT) || 10000,
    rateLimitWindow: parseInt(process.env.YOUTUBE_RATE_LIMIT_WINDOW) || 60000,
    maxRetries: parseInt(process.env.YOUTUBE_MAX_RETRIES) || 3
  },

  // Database configurations
  ...database,

  // AI configurations
  ...ai,

  // Legacy aliases for backwards compatibility
  upstash: database.upstash,
  openai: ai.openai,
  embedding: ai.embedding,
  generation: ai.generation,

  // Security configuration
  security: {
    apiKeyRequired: process.env.API_KEY_REQUIRED !== 'false',
    adminApiKey: process.env.ADMIN_API_KEY,
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    jwtExpiration: process.env.JWT_EXPIRATION || '24h'
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
  },

  // File upload limits
  upload: {
    maxFileSize: process.env.MAX_FILE_SIZE || '50mb',
    allowedTypes: process.env.ALLOWED_FILE_TYPES ? process.env.ALLOWED_FILE_TYPES.split(',') : ['application/json', 'text/plain']
  }
};
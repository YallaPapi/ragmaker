/**
 * Database configuration
 */

module.exports = {
  upstash: {
    url: process.env.UPSTASH_VECTOR_REST_URL,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN,
    redis: {
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    }
  },
  
  // SQLite configuration for local development
  sqlite: {
    path: process.env.SQLITE_PATH || './data/ragmaker.db',
    options: {
      verbose: process.env.NODE_ENV === 'development' ? console.log : null
    }
  },
  
  // MongoDB configuration (if needed)
  mongodb: {
    url: process.env.MONGODB_URL || 'mongodb://localhost:27017/ragmaker',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },
  
  // PostgreSQL configuration (if needed)
  postgresql: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'ragmaker',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  }
};
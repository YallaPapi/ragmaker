# RAGMaker Local Backend

A standalone local backend for the RAGMaker desktop application, featuring local vector storage, embedding generation, and AI model integration.

## Features

### 🚀 Core Capabilities
- **Local Vector Database**: SQLite-based vector storage with similarity search
- **Local Embeddings**: Sentence-transformers integration for offline embedding generation
- **Local AI Models**: Ollama integration for local language model inference
- **Fallback Support**: OpenAI API fallback for embeddings and generation
- **Real-time Progress**: WebSocket support for indexing progress tracking

### 🛠 Services Included
- **LocalVectorStore**: SQLite vector database with collections support
- **LocalEmbeddingService**: Local/remote embedding generation with batching
- **LocalRAGService**: Complete RAG pipeline with search and generation
- **OllamaService**: Local AI model management and inference
- **LocalAPIServer**: REST API for desktop UI communication

### 📊 RAG Profiles
- **Default**: Comprehensive analysis with formatting
- **Technical**: Technical specifications and features focus
- **Casual**: Friendly conversational summaries
- **Research**: Academic-style analysis with citations
- **Simple**: 3rd-grade language for accessibility
- **Developer**: Code and programming focus
- **Business**: Market and strategy analysis
- **Custom**: User-defined profiles

## Quick Start

### Prerequisites

1. **Node.js** >= 18.0.0
2. **Python** >= 3.8 (for local embeddings)
3. **Ollama** (optional, for local AI models)

### Installation

```bash
# Navigate to backend directory
cd app/backend

# Install Node.js dependencies
npm install

# Install Python dependencies for local embeddings
npm run install:embedding-deps

# Setup Ollama (optional)
npm run setup:ollama
```

### Basic Usage

```bash
# Start the server
npm start

# Development mode with debug logging
npm run dev

# Full debug mode
npm run debug

# Check server health
npm run health
```

## Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3012
HOST=localhost

# Vector Database
VECTOR_DB_PATH=./database/vectors.db

# Embedding Configuration
USE_LOCAL_EMBEDDINGS=true
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
OPENAI_API_KEY=your-openai-api-key

# Ollama Configuration
USE_OLLAMA=true
OLLAMA_MODEL=llama3.2:3b
OLLAMA_HOST=http://localhost:11434

# Debug Options
ENABLE_DEBUG=true
LOG_REQUESTS=false
```

### Configuration File

Create `app/backend/.env` for persistent configuration:

```bash
cp .env.example .env
# Edit .env with your settings
```

## API Endpoints

### Core RAG Operations

```bash
# Health Check
GET /health

# Query knowledge base
POST /query
{
  "question": "Your question here",
  "topK": 10,
  "profileId": "default",
  "customInstructions": "Optional custom instructions",
  "collectionId": "default"
}

# Index documents
POST /index
{
  "documents": [
    {
      "videoId": "abc123",
      "title": "Video Title",
      "url": "https://youtube.com/watch?v=abc123",
      "transcript": "Video transcript content...",
      "publishedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "collectionId": "optional-collection-id"
}
```

### Collection Management

```bash
# List collections
GET /collections

# Create collection
POST /collections
{
  "id": "my-collection",
  "name": "My Collection",
  "description": "Description of the collection"
}

# Delete collection
DELETE /collections/:id

# Get collection stats
GET /collections/:id/stats
```

### Profile Management

```bash
# List all profiles
GET /profiles

# Get profiles by category
GET /profiles/categories

# Create/update custom profile
POST /profiles
{
  "id": "my-profile",
  "profile": {
    "name": "My Custom Profile",
    "systemPrompt": "You are a helpful assistant...",
    "temperature": 0.7,
    "tone": "custom",
    "focus": ["specific", "topics"]
  }
}

# Delete custom profile
DELETE /profiles/:id
```

### Ollama Integration

```bash
# List available models
GET /ollama/models

# Pull a model
POST /ollama/models/pull
{
  "model": "llama3.2:3b"
}

# Delete a model
DELETE /ollama/models/:model
```

### Configuration Management

```bash
# Get current configuration
GET /config

# Update configuration
PUT /config
{
  "ollamaModel": "llama3.2:1b",
  "embeddingModel": "sentence-transformers/all-mpnet-base-v2",
  "enableDebug": false
}
```

## Architecture

### Service Layer

```
LocalRAGService
├── LocalEmbeddingService
│   ├── Python Script (sentence-transformers)
│   └── OpenAI Fallback
├── LocalVectorStore (SQLite + vector search)
├── LocalRAGProfiles (response formatting)
└── OllamaService (local AI models)
```

### Data Flow

1. **Document Indexing**: Documents → Text Splitting → Embeddings → Vector Store
2. **Query Processing**: Question → Embedding → Vector Search → Context Building
3. **Response Generation**: Context + Question → AI Model → Formatted Response

### Database Schema

```sql
-- Collections table
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  embedding_model TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Vectors table
CREATE TABLE vectors (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  embedding BLOB NOT NULL,
  metadata TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(collection_id) REFERENCES collections(id)
);
```

## Performance Optimization

### Vector Search
- SQLite with binary embedding storage
- Cosine similarity calculation in memory
- Indexed metadata for fast filtering
- Batch processing for large datasets

### Embedding Generation
- Local sentence-transformers for offline operation
- Batch processing to reduce API calls
- Automatic retry with exponential backoff
- Memory-efficient text splitting

### Caching Strategy
- In-memory model caching
- Database connection pooling
- Prepared statement optimization
- Progressive loading for large collections

## Troubleshooting

### Common Issues

1. **Python Dependencies Not Found**
   ```bash
   # Install Python packages manually
   pip install sentence-transformers torch numpy
   ```

2. **Ollama Connection Failed**
   ```bash
   # Install and start Ollama
   curl https://ollama.ai/install.sh | sh
   ollama serve
   ollama pull llama3.2:3b
   ```

3. **SQLite Database Locked**
   ```bash
   # Stop all processes and restart
   pkill -f ragmaker-backend
   npm start
   ```

4. **Out of Memory During Indexing**
   ```bash
   # Reduce batch size in configuration
   export BATCH_SIZE=25
   npm start
   ```

### Debug Mode

```bash
# Enable full debug logging
NODE_ENV=development ENABLE_DEBUG=true LOG_REQUESTS=true npm start
```

### Health Check

```bash
# Comprehensive health check
curl http://localhost:3012/health | jq

# Check specific service
curl http://localhost:3012/ollama/models
```

## Development

### Testing

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Project Structure

```
app/backend/
├── src/
│   ├── api/              # REST API server
│   ├── services/         # Business logic services
│   │   ├── vectorstore/  # Vector database
│   │   ├── embeddings/   # Embedding generation
│   │   ├── rag/          # RAG pipeline
│   │   └── ai/           # AI model integration
│   ├── models/           # Data models
│   ├── utils/            # Utility functions
│   └── index.js          # Main entry point
├── scripts/              # Python scripts and utilities
├── database/             # SQLite databases
├── logs/                 # Application logs
├── data/                 # Configuration and profiles
└── tests/                # Test files
```

## Production Deployment

### Docker Deployment

```dockerfile
FROM node:18-alpine
RUN apk add --no-cache python3 py3-pip
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run install:embedding-deps
EXPOSE 3012
CMD ["npm", "start"]
```

### Security Considerations

- API keys stored in environment variables
- CORS configured for desktop app origins
- No external network access required (fully local)
- SQLite database with file-based permissions
- Input validation on all endpoints

### Performance Tuning

- Adjust `BATCH_SIZE` for indexing performance
- Configure SQLite `PRAGMA` settings for your workload
- Set appropriate `topK` limits for search results
- Monitor memory usage during large batch operations

## License

ISC License - see LICENSE file for details.

## Support

- **Issues**: Report bugs and feature requests
- **Documentation**: Check the `/docs` directory
- **Health Check**: Use `/health` endpoint for diagnostics
- **Logs**: Check application logs in `/logs` directory
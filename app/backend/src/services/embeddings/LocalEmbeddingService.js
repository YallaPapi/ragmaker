const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');

class LocalEmbeddingService {
  constructor(options = {}) {
    this.config = {
      // Local model options
      useLocal: options.useLocal !== false, // Default to local
      modelName: options.modelName || 'sentence-transformers/all-MiniLM-L6-v2',
      dimension: options.dimension || 384,
      
      // Fallback to OpenAI if local fails
      fallbackToOpenAI: options.fallbackToOpenAI !== false,
      openaiApiKey: options.openaiApiKey,
      openaiModel: options.openaiModel || 'text-embedding-ada-002',
      
      // Text splitting configuration
      chunkSize: options.chunkSize || 1000,
      chunkOverlap: options.chunkOverlap || 200,
      
      // Python environment
      pythonPath: options.pythonPath || 'python',
      embeddingScriptPath: options.embeddingScriptPath || path.join(__dirname, '../../../scripts/embedding_service.py')
    };

    // Initialize OpenAI client if API key is provided
    if (this.config.openaiApiKey) {
      this.openai = new OpenAI({
        apiKey: this.config.openaiApiKey
      });
    }

    // Initialize text splitter
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      separators: ['\n\n', '\n', '. ', ', ', ' ', '']
    });

    // Ensure embedding script exists
    this.ensureEmbeddingScript();
  }

  ensureEmbeddingScript() {
    const scriptDir = path.dirname(this.config.embeddingScriptPath);
    if (!fs.existsSync(scriptDir)) {
      fs.mkdirSync(scriptDir, { recursive: true });
    }

    if (!fs.existsSync(this.config.embeddingScriptPath)) {
      this.createEmbeddingScript();
    }
  }

  createEmbeddingScript() {
    const pythonScript = `#!/usr/bin/env python3
"""
Local embedding service using sentence-transformers
Standalone Python script for generating embeddings without external API calls
"""

import sys
import json
import numpy as np
from pathlib import Path
import argparse
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def install_requirements():
    """Install required packages if not available"""
    import subprocess
    
    required_packages = [
        'sentence-transformers',
        'torch',
        'numpy'
    ]
    
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            logger.info(f"Installing {package}...")
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', package])

def load_model(model_name='sentence-transformers/all-MiniLM-L6-v2'):
    """Load the sentence transformer model"""
    try:
        from sentence_transformers import SentenceTransformer
        logger.info(f"Loading model: {model_name}")
        model = SentenceTransformer(model_name)
        logger.info(f"Model loaded successfully. Dimension: {model.get_sentence_embedding_dimension()}")
        return model
    except Exception as e:
        logger.error(f"Error loading model: {e}")
        return None

def create_embeddings(texts, model):
    """Generate embeddings for a list of texts"""
    try:
        logger.info(f"Creating embeddings for {len(texts)} texts...")
        embeddings = model.encode(texts, convert_to_tensor=False, normalize_embeddings=True)
        
        # Convert to list for JSON serialization
        if hasattr(embeddings, 'tolist'):
            embeddings = embeddings.tolist()
        
        logger.info(f"Generated {len(embeddings)} embeddings")
        return embeddings
    except Exception as e:
        logger.error(f"Error creating embeddings: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description='Local Embedding Service')
    parser.add_argument('--model', default='sentence-transformers/all-MiniLM-L6-v2', help='Model name')
    parser.add_argument('--install', action='store_true', help='Install required packages')
    parser.add_argument('--text', help='Single text to embed')
    parser.add_argument('--batch', help='JSON file with batch of texts')
    parser.add_argument('--output', help='Output file for embeddings')
    
    args = parser.parse_args()
    
    if args.install:
        install_requirements()
        return
    
    # Load model
    model = load_model(args.model)
    if not model:
        sys.exit(1)
    
    # Process input
    texts = []
    if args.text:
        texts = [args.text]
    elif args.batch:
        try:
            with open(args.batch, 'r', encoding='utf-8') as f:
                batch_data = json.load(f)
                texts = batch_data.get('texts', [])
        except Exception as e:
            logger.error(f"Error reading batch file: {e}")
            sys.exit(1)
    else:
        # Read from stdin
        try:
            input_data = json.loads(sys.stdin.read())
            texts = input_data.get('texts', [])
        except Exception as e:
            logger.error(f"Error reading from stdin: {e}")
            sys.exit(1)
    
    if not texts:
        logger.error("No texts provided")
        sys.exit(1)
    
    # Generate embeddings
    embeddings = create_embeddings(texts, model)
    if embeddings is None:
        sys.exit(1)
    
    # Output results
    result = {
        'embeddings': embeddings,
        'model': args.model,
        'dimension': model.get_sentence_embedding_dimension(),
        'count': len(embeddings)
    }
    
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(result, f)
        logger.info(f"Embeddings saved to {args.output}")
    else:
        print(json.dumps(result))

if __name__ == '__main__':
    main()
`;

    fs.writeFileSync(this.config.embeddingScriptPath, pythonScript);
    console.log(`Created embedding script at: ${this.config.embeddingScriptPath}`);
  }

  async installLocalModel() {
    console.log('Installing local embedding model dependencies...');
    
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(this.config.pythonPath, [
        this.config.embeddingScriptPath,
        '--install'
      ]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log(data.toString());
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(data.toString());
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log('Local model dependencies installed successfully');
          resolve({ success: true, output });
        } else {
          console.error('Failed to install local model dependencies');
          reject(new Error(`Installation failed with code \${code}: \${errorOutput}`));
        }
      });
    });
  }

  async createLocalEmbedding(text) {
    if (!this.config.useLocal) {
      throw new Error('Local embedding is disabled');
    }

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(this.config.pythonPath, [
        this.config.embeddingScriptPath,
        '--model', this.config.modelName,
        '--text', text
      ]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result.embeddings[0]); // Return first embedding
          } catch (error) {
            reject(new Error(`Failed to parse embedding result: \${error.message}`));
          }
        } else {
          reject(new Error(`Python process failed with code \${code}: \${errorOutput}`));
        }
      });
    });
  }

  async createLocalEmbeddingBatch(texts) {
    if (!this.config.useLocal) {
      throw new Error('Local embedding is disabled');
    }

    console.log(`Creating local embeddings for \${texts.length} texts...`);

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(this.config.pythonPath, [
        this.config.embeddingScriptPath,
        '--model', this.config.modelName
      ]);

      let output = '';
      let errorOutput = '';

      // Send texts as JSON to stdin
      const input = JSON.stringify({ texts });
      pythonProcess.stdin.write(input);
      pythonProcess.stdin.end();

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            console.log(`Generated \${result.count} embeddings with dimension \${result.dimension}`);
            resolve(result.embeddings);
          } catch (error) {
            reject(new Error(`Failed to parse batch embedding result: \${error.message}`));
          }
        } else {
          reject(new Error(`Python process failed with code \${code}: \${errorOutput}`));
        }
      });
    });
  }

  async createOpenAIEmbedding(text) {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized. Provide API key.');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.config.openaiModel,
        input: text
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error creating OpenAI embedding:', error);
      throw error;
    }
  }

  async createEmbedding(text) {
    if (this.config.useLocal) {
      try {
        return await this.createLocalEmbedding(text);
      } catch (error) {
        console.error('Local embedding failed:', error.message);
        
        if (this.config.fallbackToOpenAI && this.openai) {
          console.log('Falling back to OpenAI...');
          return await this.createOpenAIEmbedding(text);
        }
        
        throw error;
      }
    } else if (this.openai) {
      return await this.createOpenAIEmbedding(text);
    } else {
      throw new Error('No embedding service available');
    }
  }

  async createEmbeddingBatch(texts, batchSize = 50) {
    const embeddings = [];
    
    // Process in smaller batches to avoid memory issues
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      console.log(`Processing batch \${Math.floor(i / batchSize) + 1} of \${Math.ceil(texts.length / batchSize)}`);
      
      if (this.config.useLocal) {
        try {
          const batchEmbeddings = await this.createLocalEmbeddingBatch(batch);
          embeddings.push(...batchEmbeddings);
        } catch (error) {
          console.error('Local batch embedding failed:', error.message);
          
          if (this.config.fallbackToOpenAI && this.openai) {
            console.log('Falling back to OpenAI for batch...');
            for (const text of batch) {
              const embedding = await this.createOpenAIEmbedding(text);
              embeddings.push(embedding);
              
              // Small delay to respect rate limits
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } else {
            throw error;
          }
        }
      } else if (this.openai) {
        for (const text of batch) {
          const embedding = await this.createOpenAIEmbedding(text);
          embeddings.push(embedding);
          
          // Small delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } else {
        throw new Error('No embedding service available');
      }
    }
    
    return embeddings;
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

  async processVideo(video) {
    console.log(`Processing video: \${video.title}`);
    
    const chunks = await this.splitTranscript(video.transcript, {
      videoId: video.videoId,
      videoTitle: video.title,
      videoUrl: video.url,
      publishedAt: video.publishedAt
    });
    
    // Extract text for batch embedding
    const texts = chunks.map(chunk => chunk.content);
    
    // Create embeddings in batch
    const embeddings = await this.createEmbeddingBatch(texts);
    
    // Combine chunks with embeddings
    const processedChunks = chunks.map((chunk, index) => ({
      id: `\${video.videoId}_chunk_\${chunk.metadata.chunkIndex}`,
      vector: embeddings[index],
      metadata: {
        ...chunk.metadata,
        content: chunk.content
      }
    }));
    
    console.log(`Processed \${processedChunks.length} chunks for video: \${video.title}`);
    return processedChunks;
  }

  async processChannelTranscripts(transcripts, progressCallback = null) {
    const allChunks = [];
    
    for (let i = 0; i < transcripts.length; i++) {
      const video = transcripts[i];
      console.log(`Processing video \${i + 1}/\${transcripts.length}: \${video.title}`);
      
      try {
        const chunks = await this.processVideo(video);
        allChunks.push(...chunks);
        
        // Report progress if callback provided
        if (progressCallback) {
          progressCallback({
            processed: i + 1,
            total: transcripts.length,
            currentVideo: video.title,
            totalChunks: allChunks.length
          });
        }
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error processing video \${video.title}:`, error);
        
        // Report error but continue with other videos
        if (progressCallback) {
          progressCallback({
            processed: i + 1,
            total: transcripts.length,
            currentVideo: video.title,
            error: error.message,
            totalChunks: allChunks.length
          });
        }
      }
    }
    
    console.log(`Created \${allChunks.length} embeddings total`);
    return allChunks;
  }

  async healthCheck() {
    const health = {
      status: 'healthy',
      services: {},
      config: {
        useLocal: this.config.useLocal,
        modelName: this.config.modelName,
        dimension: this.config.dimension,
        fallbackToOpenAI: this.config.fallbackToOpenAI
      }
    };

    // Test local embedding service
    if (this.config.useLocal) {
      try {
        const testEmbedding = await this.createLocalEmbedding('test');
        health.services.local = {
          status: 'healthy',
          dimension: testEmbedding.length
        };
      } catch (error) {
        health.services.local = {
          status: 'unhealthy',
          error: error.message
        };
        if (!this.config.fallbackToOpenAI) {
          health.status = 'unhealthy';
        }
      }
    }

    // Test OpenAI service if available
    if (this.openai) {
      try {
        const testEmbedding = await this.createOpenAIEmbedding('test');
        health.services.openai = {
          status: 'healthy',
          dimension: testEmbedding.length
        };
      } catch (error) {
        health.services.openai = {
          status: 'unhealthy',
          error: error.message
        };
        if (!this.config.useLocal) {
          health.status = 'unhealthy';
        }
      }
    }

    return health;
  }

  getConfig() {
    return { ...this.config };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize OpenAI client if API key changed
    if (newConfig.openaiApiKey) {
      this.openai = new OpenAI({
        apiKey: newConfig.openaiApiKey
      });
    }
    
    // Update text splitter if chunk settings changed
    if (newConfig.chunkSize || newConfig.chunkOverlap) {
      this.textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
        separators: ['\n\n', '\n', '. ', ', ', ' ', '']
      });
    }
  }
}

module.exports = LocalEmbeddingService;
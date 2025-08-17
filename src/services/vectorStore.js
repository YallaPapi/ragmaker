const { Index } = require('@upstash/vector');
const config = require('../config');

class VectorStoreService {
  constructor(credentials = null) {
    // Use provided credentials or fall back to config
    const creds = credentials || {
      url: config.upstash.url,
      token: config.upstash.token
    };
    
    this.index = new Index({
      url: creds.url,
      token: creds.token
    });
    
    this.namespace = creds.namespace || '';
  }

  async upsertBatch(chunks, batchSize = 100) {
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      // Add namespace prefix if needed
      const namespacedBatch = this.namespace ? 
        batch.map(chunk => ({
          ...chunk,
          id: `${this.namespace}_${chunk.id}`
        })) : batch;
      
      try {
        await this.index.upsert(namespacedBatch);
        console.log(`Indexed batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(chunks.length / batchSize)}`);
      } catch (error) {
        console.error('Error upserting batch:', error);
        throw error;
      }
    }
  }

  async indexChannel(embeddings) {
    console.log(`Indexing ${embeddings.length} chunks to Upstash Vector...`);
    await this.upsertBatch(embeddings);
    console.log('Indexing complete!');
  }

  async query(queryEmbedding, topK = 5) {
    try {
      const queryOptions = {
        vector: queryEmbedding,
        topK: topK * 3, // Get more results to filter
        includeMetadata: true
      };
      
      const results = await this.index.query(queryOptions);
      
      // Filter results by namespace if one is set
      if (this.namespace) {
        const filtered = results.filter(r => 
          r.id && r.id.startsWith(`${this.namespace}_`)
        );
        return filtered.slice(0, topK);
      }
      
      return results.slice(0, topK);
    } catch (error) {
      console.error('Error querying vector store:', error);
      throw error;
    }
  }

  async deleteNamespace(namespace) {
    try {
      // Delete all vectors with a specific namespace prefix
      await this.index.reset();
      console.log('Vector store reset successfully');
    } catch (error) {
      console.error('Error resetting vector store:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      const info = await this.index.info();
      return info;
    } catch (error) {
      console.error('Error getting vector store stats:', error);
      throw error;
    }
  }
}

module.exports = VectorStoreService;
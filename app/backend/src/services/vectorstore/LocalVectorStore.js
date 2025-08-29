const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class LocalVectorStore {
  constructor(dbPath = null) {
    // Set default database path to app/backend/database/vectors.db
    this.dbPath = dbPath || path.join(__dirname, '../../../database/vectors.db');
    
    // Ensure database directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    // Initialize SQLite database with vector extension support
    this.db = new Database(this.dbPath);
    
    // Enable foreign keys and WAL mode for better performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    
    this.initializeSchema();
    this.prepareBatchStatements();
  }

  initializeSchema() {
    // Create vectors table with metadata support
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_vectors_created_at ON vectors(created_at);
      
      -- Create collections table to organize vectors by namespace/project
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        embedding_model TEXT NOT NULL,
        dimension INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      
      -- Add collection_id to vectors table
      CREATE TABLE IF NOT EXISTS vectors_new (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        embedding BLOB NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE CASCADE
      );
      
      -- Migrate data if needed
      INSERT OR IGNORE INTO vectors_new (id, collection_id, embedding, metadata, created_at, updated_at)
      SELECT id, 'default', embedding, metadata, created_at, updated_at FROM vectors;
      
      DROP TABLE IF EXISTS vectors_old;
      ALTER TABLE vectors RENAME TO vectors_old;
      ALTER TABLE vectors_new RENAME TO vectors;
      
      CREATE INDEX IF NOT EXISTS idx_vectors_collection_id ON vectors(collection_id);
      CREATE INDEX IF NOT EXISTS idx_vectors_created_at ON vectors(created_at);
      
      -- Insert default collection if it doesn't exist
      INSERT OR IGNORE INTO collections (id, name, description, embedding_model, dimension)
      VALUES ('default', 'Default Collection', 'Default collection for vectors', 'text-embedding-ada-002', 1536);
    `);
  }

  prepareBatchStatements() {
    // Prepared statements for better performance
    this.insertVectorStmt = this.db.prepare(`
      INSERT OR REPLACE INTO vectors (id, collection_id, embedding, metadata, updated_at)
      VALUES (?, ?, ?, ?, strftime('%s', 'now'))
    `);
    
    this.selectSimilarStmt = this.db.prepare(`
      SELECT id, embedding, metadata, created_at
      FROM vectors 
      WHERE collection_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    
    this.deleteCollectionVectorsStmt = this.db.prepare(`
      DELETE FROM vectors WHERE collection_id = ?
    `);
    
    this.insertCollectionStmt = this.db.prepare(`
      INSERT OR REPLACE INTO collections (id, name, description, embedding_model, dimension)
      VALUES (?, ?, ?, ?, ?)
    `);
  }

  // Convert embedding array to binary blob for storage
  embeddingToBlob(embedding) {
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding must be an array');
    }
    
    const buffer = new ArrayBuffer(embedding.length * 4); // 4 bytes per float32
    const view = new Float32Array(buffer);
    
    for (let i = 0; i < embedding.length; i++) {
      view[i] = embedding[i];
    }
    
    return Buffer.from(buffer);
  }

  // Convert binary blob back to embedding array
  blobToEmbedding(blob) {
    if (!blob) return null;
    
    const buffer = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
    const view = new Float32Array(buffer);
    return Array.from(view);
  }

  // Calculate cosine similarity between two embeddings
  cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimension');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async createCollection(id, name, description, embeddingModel = 'text-embedding-ada-002', dimension = 1536) {
    try {
      this.insertCollectionStmt.run(id, name, description, embeddingModel, dimension);
      return { success: true, collectionId: id };
    } catch (error) {
      console.error('Error creating collection:', error);
      throw error;
    }
  }

  async upsertBatch(chunks, collectionId = 'default', batchSize = 100) {
    console.log(`Upserting ${chunks.length} vectors to collection ${collectionId}...`);
    
    const transaction = this.db.transaction((chunks) => {
      for (const chunk of chunks) {
        const embeddingBlob = this.embeddingToBlob(chunk.vector || chunk.embedding);
        const metadataJson = JSON.stringify(chunk.metadata);
        
        this.insertVectorStmt.run(
          chunk.id,
          collectionId,
          embeddingBlob,
          metadataJson
        );
      }
    });

    // Process in batches to avoid memory issues
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      transaction(batch);
      
      console.log(`Processed batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(chunks.length / batchSize)}`);
    }
    
    console.log('Batch upsert completed');
  }

  async query(queryEmbedding, topK = 5, collectionId = 'default') {
    try {
      console.log(`Querying collection ${collectionId} for top ${topK} similar vectors...`);
      
      // Get all vectors from the collection (in production, you'd want better indexing)
      // For now, we'll use a simple approach that works for moderate datasets
      const allVectors = this.db.prepare(`
        SELECT id, embedding, metadata FROM vectors WHERE collection_id = ?
      `).all(collectionId);

      if (allVectors.length === 0) {
        console.log('No vectors found in collection');
        return [];
      }

      console.log(`Calculating similarities for ${allVectors.length} vectors...`);
      
      // Calculate similarities
      const similarities = allVectors.map(row => {
        const embedding = this.blobToEmbedding(row.embedding);
        const similarity = this.cosineSimilarity(queryEmbedding, embedding);
        
        return {
          id: row.id,
          score: similarity,
          metadata: JSON.parse(row.metadata),
          embedding: embedding
        };
      });

      // Sort by similarity score (descending) and return top K
      const topResults = similarities
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      console.log(`Found ${topResults.length} results with scores: ${topResults.map(r => r.score.toFixed(4)).join(', ')}`);
      
      return topResults;
    } catch (error) {
      console.error('Error querying vectors:', error);
      throw error;
    }
  }

  async deleteCollection(collectionId) {
    try {
      console.log(`Deleting all vectors from collection: ${collectionId}`);
      this.deleteCollectionVectorsStmt.run(collectionId);
      
      // Also delete the collection itself if it's not default
      if (collectionId !== 'default') {
        this.db.prepare('DELETE FROM collections WHERE id = ?').run(collectionId);
      }
      
      console.log('Collection deleted successfully');
    } catch (error) {
      console.error('Error deleting collection:', error);
      throw error;
    }
  }

  async getStats(collectionId = null) {
    try {
      if (collectionId) {
        const stats = this.db.prepare(`
          SELECT COUNT(*) as count FROM vectors WHERE collection_id = ?
        `).get(collectionId);
        
        const collection = this.db.prepare(`
          SELECT * FROM collections WHERE id = ?
        `).get(collectionId);
        
        return {
          collection: collection,
          vectorCount: stats.count,
          dbSize: fs.statSync(this.dbPath).size
        };
      } else {
        const stats = this.db.prepare('SELECT COUNT(*) as count FROM vectors').get();
        const collections = this.db.prepare('SELECT * FROM collections').all();
        
        return {
          totalVectors: stats.count,
          collections: collections,
          dbSize: fs.statSync(this.dbPath).size
        };
      }
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  }

  async listCollections() {
    return this.db.prepare('SELECT * FROM collections ORDER BY created_at DESC').all();
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  // Health check method
  async healthCheck() {
    try {
      const stats = await this.getStats();
      return {
        status: 'healthy',
        database: 'connected',
        stats: stats
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        database: 'error',
        error: error.message
      };
    }
  }
}

module.exports = LocalVectorStore;
/**
 * Vector Store Service - Efficient vector storage and similarity search
 * Optimized for local SQLite with in-memory indexing for fast similarity search
 */

const crypto = require('crypto');

class VectorStore {
  constructor(database) {
    this.db = database;
    this.memoryIndex = new Map(); // In-memory vector index for fast search
    this.isDirty = false;
    this.lastIndexUpdate = null;
    
    // Initialize prepared statements
    this.prepareStatements();
    
    // Load vectors into memory on startup
    this.loadVectorsIntoMemory();
  }

  /**
   * Prepare SQL statements for vector operations
   */
  prepareStatements() {
    this.statements = {
      insertEmbedding: this.db.prepare(`
        INSERT INTO embeddings (id, chunk_id, document_id, project_id, embedding, model_name, dimensions, norm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),
      
      getEmbedding: this.db.prepare(`
        SELECT * FROM embeddings WHERE id = ?
      `),
      
      getEmbeddingsByChunk: this.db.prepare(`
        SELECT * FROM embeddings WHERE chunk_id = ?
      `),
      
      getEmbeddingsByDocument: this.db.prepare(`
        SELECT * FROM embeddings WHERE document_id = ?
      `),
      
      getEmbeddingsByProject: this.db.prepare(`
        SELECT e.*, tc.content, d.title, d.type 
        FROM embeddings e
        JOIN text_chunks tc ON e.chunk_id = tc.id
        JOIN documents d ON e.document_id = d.id
        WHERE e.project_id = ?
      `),
      
      deleteEmbeddingsByChunk: this.db.prepare(`
        DELETE FROM embeddings WHERE chunk_id = ?
      `),
      
      deleteEmbeddingsByDocument: this.db.prepare(`
        DELETE FROM embeddings WHERE document_id = ?
      `),
      
      deleteEmbeddingsByProject: this.db.prepare(`
        DELETE FROM embeddings WHERE project_id = ?
      `),
      
      getAllEmbeddings: this.db.prepare(`
        SELECT id, chunk_id, document_id, project_id, embedding, model_name, dimensions, norm
        FROM embeddings
      `)
    };
  }

  /**
   * Load all vectors into memory for fast similarity search
   */
  loadVectorsIntoMemory() {
    console.log('Loading vectors into memory index...');
    
    try {
      const embeddings = this.statements.getAllEmbeddings.all();
      this.memoryIndex.clear();
      
      for (const embedding of embeddings) {
        const vector = this.deserializeVector(embedding.embedding);
        this.memoryIndex.set(embedding.id, {
          id: embedding.id,
          chunk_id: embedding.chunk_id,
          document_id: embedding.document_id,
          project_id: embedding.project_id,
          vector: vector,
          model_name: embedding.model_name,
          dimensions: embedding.dimensions,
          norm: embedding.norm
        });
      }
      
      this.lastIndexUpdate = Date.now();
      this.isDirty = false;
      
      console.log(`Loaded ${embeddings.length} vectors into memory index`);
    } catch (error) {
      console.error('Failed to load vectors into memory:', error);
    }
  }

  /**
   * Store vector embedding
   */
  async storeEmbedding(chunkId, documentId, projectId, vector, modelName) {
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error('Invalid vector format');
    }

    const id = this.generateId();
    const dimensions = vector.length;
    const norm = this.calculateNorm(vector);
    const serializedVector = this.serializeVector(vector);

    try {
      // Store in database
      this.statements.insertEmbedding.run(
        id,
        chunkId,
        documentId,
        projectId,
        serializedVector,
        modelName,
        dimensions,
        norm
      );

      // Add to memory index
      this.memoryIndex.set(id, {
        id,
        chunk_id: chunkId,
        document_id: documentId,
        project_id: projectId,
        vector: vector,
        model_name: modelName,
        dimensions,
        norm
      });

      this.isDirty = true;
      return id;
    } catch (error) {
      console.error('Failed to store embedding:', error);
      throw error;
    }
  }

  /**
   * Bulk store multiple embeddings (more efficient)
   */
  async bulkStoreEmbeddings(embeddings) {
    const transaction = this.db.transaction(() => {
      const results = [];
      
      for (const { chunkId, documentId, projectId, vector, modelName } of embeddings) {
        const id = this.generateId();
        const dimensions = vector.length;
        const norm = this.calculateNorm(vector);
        const serializedVector = this.serializeVector(vector);

        this.statements.insertEmbedding.run(
          id,
          chunkId,
          documentId,
          projectId,
          serializedVector,
          modelName,
          dimensions,
          norm
        );

        // Add to memory index
        this.memoryIndex.set(id, {
          id,
          chunk_id: chunkId,
          document_id: documentId,
          project_id: projectId,
          vector: vector,
          model_name: modelName,
          dimensions,
          norm
        });

        results.push(id);
      }
      
      return results;
    });

    const results = transaction();
    this.isDirty = true;
    return results;
  }

  /**
   * Perform similarity search using cosine similarity
   */
  async similaritySearch(queryVector, options = {}) {
    const {
      projectId = null,
      topK = 10,
      threshold = 0.0,
      modelName = null,
      includeMetadata = true
    } = options;

    if (!Array.isArray(queryVector) || queryVector.length === 0) {
      throw new Error('Invalid query vector');
    }

    const queryNorm = this.calculateNorm(queryVector);
    const results = [];

    // Search through memory index
    for (const [embeddingId, embedding] of this.memoryIndex) {
      // Filter by project if specified
      if (projectId && embedding.project_id !== projectId) {
        continue;
      }

      // Filter by model if specified
      if (modelName && embedding.model_name !== modelName) {
        continue;
      }

      // Skip if dimensions don't match
      if (embedding.dimensions !== queryVector.length) {
        continue;
      }

      // Calculate cosine similarity
      const similarity = this.cosineSimilarity(
        queryVector,
        embedding.vector,
        queryNorm,
        embedding.norm
      );

      // Only include if above threshold
      if (similarity >= threshold) {
        results.push({
          id: embeddingId,
          chunk_id: embedding.chunk_id,
          document_id: embedding.document_id,
          project_id: embedding.project_id,
          similarity: similarity,
          model_name: embedding.model_name
        });
      }
    }

    // Sort by similarity (highest first) and limit results
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, topK);

    // Include metadata if requested
    if (includeMetadata) {
      return await this.enrichResultsWithMetadata(topResults);
    }

    return topResults;
  }

  /**
   * Enrich search results with chunk content and document metadata
   */
  async enrichResultsWithMetadata(results) {
    const enriched = [];

    for (const result of results) {
      try {
        // Get chunk and document data
        const embeddings = this.statements.getEmbeddingsByProject.all(result.project_id);
        const matching = embeddings.find(e => e.id === result.id);

        if (matching) {
          enriched.push({
            ...result,
            content: matching.content,
            title: matching.title,
            document_type: matching.type
          });
        } else {
          enriched.push(result);
        }
      } catch (error) {
        console.warn('Failed to enrich result:', error);
        enriched.push(result);
      }
    }

    return enriched;
  }

  /**
   * Get embeddings by various filters
   */
  getEmbedding(embeddingId) {
    const result = this.statements.getEmbedding.get(embeddingId);
    if (result) {
      result.vector = this.deserializeVector(result.embedding);
      delete result.embedding;
    }
    return result;
  }

  getEmbeddingsByChunk(chunkId) {
    return this.statements.getEmbeddingsByChunk.all(chunkId);
  }

  getEmbeddingsByDocument(documentId) {
    return this.statements.getEmbeddingsByDocument.all(documentId);
  }

  getEmbeddingsByProject(projectId) {
    return this.statements.getEmbeddingsByProject.all(projectId);
  }

  /**
   * Delete embeddings
   */
  deleteEmbeddingsByChunk(chunkId) {
    // Remove from memory index
    for (const [id, embedding] of this.memoryIndex) {
      if (embedding.chunk_id === chunkId) {
        this.memoryIndex.delete(id);
      }
    }

    // Delete from database
    const result = this.statements.deleteEmbeddingsByChunk.run(chunkId);
    this.isDirty = true;
    return result;
  }

  deleteDocumentEmbeddings(documentId) {
    // Remove from memory index
    for (const [id, embedding] of this.memoryIndex) {
      if (embedding.document_id === documentId) {
        this.memoryIndex.delete(id);
      }
    }

    // Delete from database
    const result = this.statements.deleteEmbeddingsByDocument.run(documentId);
    this.isDirty = true;
    return result;
  }

  deleteProjectEmbeddings(projectId) {
    // Remove from memory index
    for (const [id, embedding] of this.memoryIndex) {
      if (embedding.project_id === projectId) {
        this.memoryIndex.delete(id);
      }
    }

    // Delete from database
    const result = this.statements.deleteEmbeddingsByProject.run(projectId);
    this.isDirty = true;
    return result;
  }

  /**
   * Vector utility functions
   */
  serializeVector(vector) {
    // Convert to Float32Array for efficient storage
    const float32Array = new Float32Array(vector);
    return Buffer.from(float32Array.buffer);
  }

  deserializeVector(buffer) {
    // Convert back from Buffer to array
    const float32Array = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
    return Array.from(float32Array);
  }

  calculateNorm(vector) {
    return Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  }

  cosineSimilarity(vecA, vecB, normA = null, normB = null) {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let dotProduct = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
    }

    const normAValue = normA || this.calculateNorm(vecA);
    const normBValue = normB || this.calculateNorm(vecB);

    if (normAValue === 0 || normBValue === 0) {
      return 0;
    }

    return dotProduct / (normAValue * normBValue);
  }

  /**
   * Get statistics about vector store
   */
  getStats() {
    const stats = {
      total_embeddings: this.memoryIndex.size,
      memory_index_size: this.memoryIndex.size,
      last_index_update: this.lastIndexUpdate,
      is_dirty: this.isDirty,
      models: {},
      projects: {},
      dimensions: {}
    };

    // Count by model, project, and dimensions
    for (const [id, embedding] of this.memoryIndex) {
      // Count by model
      stats.models[embedding.model_name] = (stats.models[embedding.model_name] || 0) + 1;
      
      // Count by project
      stats.projects[embedding.project_id] = (stats.projects[embedding.project_id] || 0) + 1;
      
      // Count by dimensions
      stats.dimensions[embedding.dimensions] = (stats.dimensions[embedding.dimensions] || 0) + 1;
    }

    return stats;
  }

  /**
   * Refresh memory index from database
   */
  refreshIndex() {
    this.loadVectorsIntoMemory();
  }

  /**
   * Optimize vector storage (rebuild index, cleanup)
   */
  optimize() {
    console.log('Optimizing vector store...');
    
    // Rebuild memory index
    this.loadVectorsIntoMemory();
    
    // Could add more optimizations here:
    // - Quantization for reduced memory usage
    // - Hierarchical clustering for faster search
    // - Index compression
    
    console.log('Vector store optimization completed');
  }

  /**
   * Export vectors for backup
   */
  exportVectors(projectId = null) {
    const filter = projectId ? 
      Array.from(this.memoryIndex.values()).filter(e => e.project_id === projectId) :
      Array.from(this.memoryIndex.values());

    return filter.map(embedding => ({
      id: embedding.id,
      chunk_id: embedding.chunk_id,
      document_id: embedding.document_id,
      project_id: embedding.project_id,
      vector: embedding.vector,
      model_name: embedding.model_name,
      dimensions: embedding.dimensions,
      norm: embedding.norm
    }));
  }

  /**
   * Import vectors from backup
   */
  async importVectors(vectors) {
    const transaction = this.db.transaction(() => {
      for (const vector of vectors) {
        const serializedVector = this.serializeVector(vector.vector);
        
        this.statements.insertEmbedding.run(
          vector.id,
          vector.chunk_id,
          vector.document_id,
          vector.project_id,
          serializedVector,
          vector.model_name,
          vector.dimensions,
          vector.norm
        );

        // Add to memory index
        this.memoryIndex.set(vector.id, vector);
      }
    });

    transaction();
    this.isDirty = true;
    console.log(`Imported ${vectors.length} vectors`);
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `emb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate vector format
   */
  validateVector(vector) {
    if (!Array.isArray(vector)) {
      throw new Error('Vector must be an array');
    }
    
    if (vector.length === 0) {
      throw new Error('Vector cannot be empty');
    }
    
    if (!vector.every(v => typeof v === 'number' && isFinite(v))) {
      throw new Error('Vector must contain only finite numbers');
    }
    
    return true;
  }

  /**
   * Clear all vectors (use with caution)
   */
  clear() {
    this.memoryIndex.clear();
    this.db.prepare('DELETE FROM embeddings').run();
    this.isDirty = true;
  }
}

module.exports = VectorStore;
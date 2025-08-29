const { RAGService } = require('../../../src/services/rag');
const { VectorStore } = require('../../../src/services/vectorStore');
const { EmbeddingService } = require('../../../src/services/embeddings');
const { DatabaseService } = require('../../../src/services/database');

// Mock dependencies
jest.mock('../../../src/services/vectorStore');
jest.mock('../../../src/services/embeddings');
jest.mock('../../../src/services/database');

describe('RAG Service Unit Tests', () => {
  let ragService;
  let mockVectorStore;
  let mockEmbeddingService;
  let mockDatabaseService;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock instances
    mockVectorStore = {
      search: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      initialize: jest.fn()
    };
    
    mockEmbeddingService = {
      generateEmbedding: jest.fn(),
      batchGenerateEmbeddings: jest.fn()
    };
    
    mockDatabaseService = {
      getDocument: jest.fn(),
      saveDocument: jest.fn(),
      deleteDocument: jest.fn()
    };
    
    VectorStore.mockImplementation(() => mockVectorStore);
    EmbeddingService.mockImplementation(() => mockEmbeddingService);
    DatabaseService.mockImplementation(() => mockDatabaseService);
    
    ragService = new RAGService({
      vectorStore: mockVectorStore,
      embeddingService: mockEmbeddingService,
      databaseService: mockDatabaseService
    });
  });

  describe('Query Processing', () => {
    it('should process simple text query successfully', async () => {
      const query = 'What is machine learning?';
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockResults = [
        { id: '1', content: 'Machine learning definition', score: 0.95 },
        { id: '2', content: 'AI fundamentals', score: 0.85 }
      ];
      
      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.search.mockResolvedValue(mockResults);
      
      const result = await ragService.query(query);
      
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(query);
      expect(mockVectorStore.search).toHaveBeenCalledWith(mockEmbedding, { limit: 10 });
      expect(result).toEqual(mockResults);
    });

    it('should handle empty query gracefully', async () => {
      const result = await ragService.query('');
      
      expect(result).toEqual([]);
      expect(mockEmbeddingService.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should handle query with custom parameters', async () => {
      const query = 'test query';
      const options = { limit: 5, threshold: 0.8 };
      const mockEmbedding = [0.1, 0.2];
      
      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.search.mockResolvedValue([]);
      
      await ragService.query(query, options);
      
      expect(mockVectorStore.search).toHaveBeenCalledWith(mockEmbedding, options);
    });
  });

  describe('Document Management', () => {
    it('should index document successfully', async () => {
      const document = {
        id: 'doc-1',
        content: 'Test document content',
        metadata: { title: 'Test Doc', author: 'Test Author' }
      };
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
      
      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.upsert.mockResolvedValue(true);
      mockDatabaseService.saveDocument.mockResolvedValue(document);
      
      const result = await ragService.indexDocument(document);
      
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(document.content);
      expect(mockVectorStore.upsert).toHaveBeenCalledWith({
        id: document.id,
        values: mockEmbedding,
        metadata: document.metadata
      });
      expect(mockDatabaseService.saveDocument).toHaveBeenCalledWith(document);
      expect(result).toBe(true);
    });

    it('should handle indexing failure gracefully', async () => {
      const document = { id: 'doc-1', content: 'Test content' };
      
      mockEmbeddingService.generateEmbedding.mockRejectedValue(new Error('Embedding failed'));
      
      await expect(ragService.indexDocument(document)).rejects.toThrow('Embedding failed');
    });

    it('should batch index multiple documents', async () => {
      const documents = [
        { id: 'doc-1', content: 'Content 1' },
        { id: 'doc-2', content: 'Content 2' },
        { id: 'doc-3', content: 'Content 3' }
      ];
      const mockEmbeddings = [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]];
      
      mockEmbeddingService.batchGenerateEmbeddings
        .mockResolvedValue(mockEmbeddings);
      mockVectorStore.upsert.mockResolvedValue(true);
      mockDatabaseService.saveDocument.mockResolvedValue(true);
      
      const results = await ragService.batchIndexDocuments(documents);
      
      expect(mockEmbeddingService.batchGenerateEmbeddings)
        .toHaveBeenCalledWith(documents.map(d => d.content));
      expect(mockVectorStore.upsert).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(3);
      expect(results.every(r => r === true)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle vector store connection errors', async () => {
      const query = 'test query';
      mockEmbeddingService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
      mockVectorStore.search.mockRejectedValue(new Error('Vector store unavailable'));
      
      await expect(ragService.query(query)).rejects.toThrow('Vector store unavailable');
    });

    it('should handle embedding service timeouts', async () => {
      const document = { id: 'doc-1', content: 'Test content' };
      mockEmbeddingService.generateEmbedding.mockRejectedValue(new Error('Request timeout'));
      
      await expect(ragService.indexDocument(document)).rejects.toThrow('Request timeout');
    });

    it('should retry failed operations with exponential backoff', async () => {
      const query = 'test query';
      const mockEmbedding = [0.1, 0.2];
      
      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.search
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue([{ id: '1', content: 'Result', score: 0.9 }]);
      
      const result = await ragService.queryWithRetry(query, { maxRetries: 3 });
      
      expect(mockVectorStore.search).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(1);
    });
  });

  describe('Performance Optimization', () => {
    it('should cache frequently accessed embeddings', async () => {
      const query = 'repeated query';
      const mockEmbedding = [0.1, 0.2, 0.3];
      
      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.search.mockResolvedValue([]);
      
      // First call should generate embedding
      await ragService.query(query);
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);
      
      // Second call should use cached embedding
      await ragService.query(query);
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);
    });

    it('should handle large document processing efficiently', async () => {
      const largeDocument = {
        id: 'large-doc',
        content: 'Large content '.repeat(10000), // ~130KB text
        metadata: { type: 'large' }
      };
      
      mockEmbeddingService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
      mockVectorStore.upsert.mockResolvedValue(true);
      mockDatabaseService.saveDocument.mockResolvedValue(largeDocument);
      
      const startTime = Date.now();
      const result = await ragService.indexDocument(largeDocument);
      const duration = Date.now() - startTime;
      
      expect(result).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Data Validation', () => {
    it('should validate document structure before indexing', async () => {
      const invalidDocument = { content: 'Missing ID' };
      
      await expect(ragService.indexDocument(invalidDocument))
        .rejects.toThrow('Document must have an ID');
    });

    it('should sanitize input queries', async () => {
      const maliciousQuery = '<script>alert("xss")</script>What is AI?';
      const mockEmbedding = [0.1, 0.2];
      
      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.search.mockResolvedValue([]);
      
      await ragService.query(maliciousQuery);
      
      const sanitizedQuery = mockEmbeddingService.generateEmbedding.mock.calls[0][0];
      expect(sanitizedQuery).not.toContain('<script>');
      expect(sanitizedQuery).toContain('What is AI?');
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources on shutdown', async () => {
      await ragService.shutdown();
      
      expect(mockVectorStore.disconnect).toHaveBeenCalled();
      expect(mockDatabaseService.close).toHaveBeenCalled();
    });

    it('should limit concurrent operations to prevent memory exhaustion', async () => {
      const documents = Array.from({ length: 100 }, (_, i) => ({
        id: `doc-${i}`,
        content: `Content ${i}`
      }));
      
      mockEmbeddingService.batchGenerateEmbeddings.mockResolvedValue(
        Array.from({ length: 100 }, () => [0.1, 0.2])
      );
      mockVectorStore.upsert.mockResolvedValue(true);
      mockDatabaseService.saveDocument.mockResolvedValue(true);
      
      const startMemory = process.memoryUsage().heapUsed;
      await ragService.batchIndexDocuments(documents, { concurrency: 5 });
      const endMemory = process.memoryUsage().heapUsed;
      
      const memoryIncrease = endMemory - startMemory;
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
    });
  });
});

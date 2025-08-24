const VectorStoreService = require('../../src/services/vectorStore');

// Mock Upstash Vector SDK
jest.mock('@upstash/vector');

const { Index } = require('@upstash/vector');

describe('VectorStoreService', () => {
  let vectorStoreService;
  let mockIndex;

  beforeEach(() => {
    mockIndex = {
      upsert: jest.fn(),
      query: jest.fn(),
      reset: jest.fn(),
      info: jest.fn()
    };

    Index.mockImplementation(() => mockIndex);

    vectorStoreService = new VectorStoreService();
  });

  describe('constructor', () => {
    it('should initialize with default credentials', () => {
      expect(Index).toHaveBeenCalledWith({
        url: expect.any(String),
        token: expect.any(String)
      });
    });

    it('should initialize with provided credentials', () => {
      const customCreds = {
        url: 'custom-url',
        token: 'custom-token',
        namespace: 'custom-namespace'
      };

      const customService = new VectorStoreService(customCreds);

      expect(Index).toHaveBeenLastCalledWith({
        url: 'custom-url',
        token: 'custom-token'
      });
      expect(customService.namespace).toBe('custom-namespace');
    });
  });

  describe('upsertBatch', () => {
    it('should upsert chunks in batches successfully', async () => {
      const chunks = Array.from({ length: 250 }, (_, i) => 
        testData.createMockEmbedding({ id: `chunk_${i}` })
      );

      mockIndex.upsert.mockResolvedValue();

      await vectorStoreService.upsertBatch(chunks, 100);

      // Should make 3 calls (250 chunks / 100 batch size = 3 batches)
      expect(mockIndex.upsert).toHaveBeenCalledTimes(3);
      
      // First batch: chunks 0-99
      expect(mockIndex.upsert).toHaveBeenNthCalledWith(1, chunks.slice(0, 100));
      // Second batch: chunks 100-199
      expect(mockIndex.upsert).toHaveBeenNthCalledWith(2, chunks.slice(100, 200));
      // Third batch: chunks 200-249
      expect(mockIndex.upsert).toHaveBeenNthCalledWith(3, chunks.slice(200, 250));
    });

    it('should apply namespace prefix when namespace is set', async () => {
      const vectorStoreWithNamespace = new VectorStoreService({
        url: 'test-url',
        token: 'test-token',
        namespace: 'project1'
      });

      const chunks = [
        testData.createMockEmbedding({ id: 'video1_chunk_0' }),
        testData.createMockEmbedding({ id: 'video2_chunk_0' })
      ];

      mockIndex.upsert.mockResolvedValue();

      await vectorStoreWithNamespace.upsertBatch(chunks);

      const expectedChunks = [
        { ...chunks[0], id: 'project1_video1_chunk_0' },
        { ...chunks[1], id: 'project1_video2_chunk_0' }
      ];

      expect(mockIndex.upsert).toHaveBeenCalledWith(expectedChunks);
    });

    it('should handle upsert errors', async () => {
      const chunks = [testData.createMockEmbedding()];
      mockIndex.upsert.mockRejectedValue(new Error('Upstash API error'));

      await expect(vectorStoreService.upsertBatch(chunks))
        .rejects.toThrow('Upstash API error');
    });

    it('should use default batch size of 100', async () => {
      const chunks = Array.from({ length: 150 }, (_, i) => 
        testData.createMockEmbedding({ id: `chunk_${i}` })
      );

      mockIndex.upsert.mockResolvedValue();

      await vectorStoreService.upsertBatch(chunks);

      // Should make 2 calls with default batch size of 100
      expect(mockIndex.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('indexChannel', () => {
    it('should index channel embeddings', async () => {
      const embeddings = [
        testData.createMockEmbedding({ id: 'video1_chunk_0' }),
        testData.createMockEmbedding({ id: 'video1_chunk_1' }),
        testData.createMockEmbedding({ id: 'video2_chunk_0' })
      ];

      jest.spyOn(vectorStoreService, 'upsertBatch').mockResolvedValue();

      await vectorStoreService.indexChannel(embeddings);

      expect(vectorStoreService.upsertBatch).toHaveBeenCalledWith(embeddings);
    });

    it('should handle empty embeddings array', async () => {
      jest.spyOn(vectorStoreService, 'upsertBatch').mockResolvedValue();

      await vectorStoreService.indexChannel([]);

      expect(vectorStoreService.upsertBatch).toHaveBeenCalledWith([]);
    });
  });

  describe('query', () => {
    it('should query vector store successfully', async () => {
      const queryEmbedding = new Array(1536).fill(0.5);
      const mockResults = [
        testData.createMockSearchResult({ score: 0.95 }),
        testData.createMockSearchResult({ score: 0.87 }),
        testData.createMockSearchResult({ score: 0.75 })
      ];

      mockIndex.query.mockResolvedValue(mockResults);

      const result = await vectorStoreService.query(queryEmbedding, 3);

      expect(mockIndex.query).toHaveBeenCalledWith({
        vector: queryEmbedding,
        topK: 9, // 3 * 3 for filtering
        includeMetadata: true
      });
      expect(result).toEqual(mockResults.slice(0, 3));
    });

    it('should filter results by namespace when namespace is set', async () => {
      const vectorStoreWithNamespace = new VectorStoreService({
        url: 'test-url',
        token: 'test-token',
        namespace: 'project1'
      });

      const queryEmbedding = new Array(1536).fill(0.5);
      const mockResults = [
        { ...testData.createMockSearchResult(), id: 'project1_video1_chunk_0', score: 0.95 },
        { ...testData.createMockSearchResult(), id: 'other_video2_chunk_0', score: 0.90 },
        { ...testData.createMockSearchResult(), id: 'project1_video3_chunk_0', score: 0.85 },
        { ...testData.createMockSearchResult(), id: 'project1_video4_chunk_0', score: 0.80 }
      ];

      mockIndex.query.mockResolvedValue(mockResults);

      const result = await vectorStoreWithNamespace.query(queryEmbedding, 2);

      // Should return only results with matching namespace prefix, limited to topK
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('project1_video1_chunk_0');
      expect(result[1].id).toBe('project1_video3_chunk_0');
    });

    it('should handle query errors', async () => {
      const queryEmbedding = new Array(1536).fill(0.5);
      mockIndex.query.mockRejectedValue(new Error('Vector query failed'));

      await expect(vectorStoreService.query(queryEmbedding))
        .rejects.toThrow('Vector query failed');
    });

    it('should use default topK of 5', async () => {
      const queryEmbedding = new Array(1536).fill(0.5);
      mockIndex.query.mockResolvedValue([]);

      await vectorStoreService.query(queryEmbedding);

      expect(mockIndex.query).toHaveBeenCalledWith({
        vector: queryEmbedding,
        topK: 15, // 5 * 3 for filtering
        includeMetadata: true
      });
    });

    it('should handle empty query results', async () => {
      const queryEmbedding = new Array(1536).fill(0.5);
      mockIndex.query.mockResolvedValue([]);

      const result = await vectorStoreService.query(queryEmbedding);

      expect(result).toEqual([]);
    });
  });

  describe('deleteNamespace', () => {
    it('should reset the entire index', async () => {
      mockIndex.reset.mockResolvedValue();

      await vectorStoreService.deleteNamespace();

      expect(mockIndex.reset).toHaveBeenCalled();
    });

    it('should handle reset errors', async () => {
      mockIndex.reset.mockRejectedValue(new Error('Reset failed'));

      await expect(vectorStoreService.deleteNamespace())
        .rejects.toThrow('Reset failed');
    });
  });

  describe('getStats', () => {
    it('should return vector store statistics', async () => {
      const mockStats = {
        vectorCount: 1500,
        indexSize: '75MB',
        dimension: 1536
      };

      mockIndex.info.mockResolvedValue(mockStats);

      const result = await vectorStoreService.getStats();

      expect(mockIndex.info).toHaveBeenCalled();
      expect(result).toEqual(mockStats);
    });

    it('should handle stats retrieval errors', async () => {
      mockIndex.info.mockRejectedValue(new Error('Stats retrieval failed'));

      await expect(vectorStoreService.getStats())
        .rejects.toThrow('Stats retrieval failed');
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large batch operations efficiently', async () => {
      const largeChunkSet = Array.from({ length: 10000 }, (_, i) => 
        testData.createMockEmbedding({ id: `chunk_${i}` })
      );

      mockIndex.upsert.mockResolvedValue();

      await vectorStoreService.upsertBatch(largeChunkSet, 500);

      // Should process in 20 batches (10000 / 500)
      expect(mockIndex.upsert).toHaveBeenCalledTimes(20);
    });

    it('should handle concurrent query operations', async () => {
      const queryEmbedding = new Array(1536).fill(0.5);
      mockIndex.query.mockResolvedValue([testData.createMockSearchResult()]);

      const promises = Array.from({ length: 10 }, () => 
        vectorStoreService.query(queryEmbedding, 5)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(mockIndex.query).toHaveBeenCalledTimes(10);
    });

    it('should handle malformed embedding vectors', async () => {
      const invalidEmbedding = 'not-an-array';
      mockIndex.query.mockRejectedValue(new Error('Invalid vector format'));

      await expect(vectorStoreService.query(invalidEmbedding))
        .rejects.toThrow('Invalid vector format');
    });

    it('should handle network timeout errors gracefully', async () => {
      const chunks = [testData.createMockEmbedding()];
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'ETIMEDOUT';

      mockIndex.upsert.mockRejectedValue(timeoutError);

      await expect(vectorStoreService.upsertBatch(chunks))
        .rejects.toThrow('Request timeout');
    });
  });

  describe('Namespace Functionality', () => {
    it('should work correctly without namespace', async () => {
      const chunks = [testData.createMockEmbedding({ id: 'original_id' })];
      mockIndex.upsert.mockResolvedValue();

      await vectorStoreService.upsertBatch(chunks);

      // Should not modify IDs when no namespace
      expect(mockIndex.upsert).toHaveBeenCalledWith(chunks);
    });

    it('should handle empty namespace correctly', async () => {
      const vectorStoreWithEmptyNamespace = new VectorStoreService({
        url: 'test-url',
        token: 'test-token',
        namespace: ''
      });

      const chunks = [testData.createMockEmbedding({ id: 'test_id' })];
      mockIndex.upsert.mockResolvedValue();

      await vectorStoreWithEmptyNamespace.upsertBatch(chunks);

      // Empty namespace should behave like no namespace
      expect(mockIndex.upsert).toHaveBeenCalledWith(chunks);
    });

    it('should filter query results correctly with mixed namespaces', async () => {
      const vectorStoreWithNamespace = new VectorStoreService({
        url: 'test-url',
        token: 'test-token',
        namespace: 'proj1'
      });

      const queryEmbedding = new Array(1536).fill(0.5);
      const mixedResults = [
        { id: 'proj1_chunk1', score: 0.9, metadata: { content: 'Result 1' } },
        { id: 'proj2_chunk1', score: 0.85, metadata: { content: 'Result 2' } },
        { id: 'proj1_chunk2', score: 0.8, metadata: { content: 'Result 3' } },
        { id: 'no_prefix_chunk', score: 0.75, metadata: { content: 'Result 4' } },
        { id: 'proj1_chunk3', score: 0.7, metadata: { content: 'Result 5' } }
      ];

      mockIndex.query.mockResolvedValue(mixedResults);

      const result = await vectorStoreWithNamespace.query(queryEmbedding, 2);

      // Should only return results with 'proj1_' prefix, limited to 2
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('proj1_chunk1');
      expect(result[1].id).toBe('proj1_chunk2');
    });
  });
});
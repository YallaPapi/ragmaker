const request = require('supertest');
const express = require('express');

// Mock all service dependencies before importing server
jest.mock('../../src/services/youtube');
jest.mock('../../src/services/embeddings');
jest.mock('../../src/services/vectorStore');
jest.mock('../../src/services/rag');
jest.mock('../../src/services/channelManager');
jest.mock('../../src/services/upstashManager');

const YouTubeService = require('../../src/services/youtube');
const EmbeddingService = require('../../src/services/embeddings');
const VectorStoreService = require('../../src/services/vectorStore');
const RAGService = require('../../src/services/rag');
const ChannelManager = require('../../src/services/channelManager');
const UpstashManager = require('../../src/services/upstashManager');

describe('API Integration Tests', () => {
  let app;
  let mockYouTubeService;
  let mockEmbeddingService;
  let mockVectorStore;
  let mockRAGService;
  let mockChannelManager;
  let mockUpstashManager;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup service mocks
    mockYouTubeService = {
      getChannelTranscripts: jest.fn(),
      getQuotaStatus: jest.fn().mockReturnValue({ quotaUsed: 0, quotaLimit: 10000 })
    };
    mockEmbeddingService = {
      processVideo: jest.fn()
    };
    mockVectorStore = {
      indexChannel: jest.fn(),
      query: jest.fn(),
      getStats: jest.fn().mockResolvedValue({ vectorCount: 0 }),
      deleteNamespace: jest.fn()
    };
    mockRAGService = {
      query: jest.fn()
    };
    mockChannelManager = {
      initialized: Promise.resolve(),
      getAllChannels: jest.fn().mockReturnValue({}),
      getTotalVideos: jest.fn().mockReturnValue(0),
      isChannelIndexed: jest.fn().mockReturnValue(false),
      addChannel: jest.fn(),
      removeChannel: jest.fn(),
      getIndexedVideos: jest.fn().mockReturnValue([]),
      addIndexedVideos: jest.fn()
    };
    mockUpstashManager = {
      initialized: Promise.resolve(),
      getCurrentProject: jest.fn().mockReturnValue({ id: 'test-project', name: 'Test Project' }),
      getProjectCredentials: jest.fn().mockReturnValue({
        url: 'test-url',
        token: 'test-token'
      }),
      getAllProjects: jest.fn().mockReturnValue([]),
      createProject: jest.fn(),
      switchProject: jest.fn(),
      deleteProject: jest.fn(),
      updateProject: jest.fn()
    };

    // Apply mocks to constructors
    YouTubeService.mockImplementation(() => mockYouTubeService);
    EmbeddingService.mockImplementation(() => mockEmbeddingService);
    VectorStoreService.mockImplementation(() => mockVectorStore);
    RAGService.mockImplementation(() => mockRAGService);
    ChannelManager.mockImplementation(() => mockChannelManager);
    UpstashManager.mockImplementation(() => mockUpstashManager);

    // Create fresh app instance for each test
    delete require.cache[require.resolve('../../src/api/server')];
    
    // Mock the server listen method to prevent actual server startup
    const originalListen = express.application.listen;
    express.application.listen = jest.fn((port, callback) => {
      if (callback) callback();
      return { close: jest.fn() };
    });

    // Import app after mocks are set up
    app = require('../../src/api/server');
  });

  describe('POST /api/index-channel', () => {
    it('should start channel indexing successfully', async () => {
      const mockTranscriptResult = {
        channelInfo: { id: 'UC123', name: 'Test Channel' },
        transcripts: [testData.createMockVideo()],
        failed: [],
        totalVideos: 1,
        processedVideos: 1
      };

      mockYouTubeService.getChannelTranscripts.mockResolvedValue(mockTranscriptResult);
      mockEmbeddingService.processVideo.mockResolvedValue([testData.createMockEmbedding()]);
      mockVectorStore.indexChannel.mockResolvedValue();
      
      const response = await request(app)
        .post('/api/index-channel')
        .send({
          channelId: 'UC123456789012345678901',
          videoLimit: 10,
          skipExisting: false,
          excludeShorts: true
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Indexing started',
        channelId: 'UC123456789012345678901'
      });
    });

    it('should validate channel ID format', async () => {
      const response = await request(app)
        .post('/api/index-channel')
        .send({
          channelId: 'invalid<script>',
          videoLimit: 10
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Channel ID');
    });

    it('should prevent concurrent indexing', async () => {
      // Start first indexing request
      const firstPromise = request(app)
        .post('/api/index-channel')
        .send({ channelId: 'UC123456789012345678901' });

      // Immediately start second request
      const secondPromise = request(app)
        .post('/api/index-channel')
        .send({ channelId: 'UC098765432109876543210' });

      const [firstResponse, secondResponse] = await Promise.all([
        firstPromise,
        secondPromise
      ]);

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      
      // One should start indexing, the other should indicate already in progress
      const responses = [firstResponse.body, secondResponse.body];
      const startedResponse = responses.find(r => r.message === 'Indexing started');
      const inProgressResponse = responses.find(r => r.message === 'Indexing already in progress');
      
      expect(startedResponse).toBeDefined();
      expect(inProgressResponse).toBeDefined();
    });

    it('should handle video limit validation', async () => {
      const response = await request(app)
        .post('/api/index-channel')
        .send({
          channelId: 'UC123456789012345678901',
          videoLimit: 2000  // Above maximum
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Video limit must be between 1 and 1000');
    });
  });

  describe('GET /api/index-status', () => {
    it('should return current indexing status', async () => {
      const response = await request(app).get('/api/index-status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('isIndexing');
      expect(response.body).toHaveProperty('progress');
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/cancel-indexing', () => {
    it('should cancel ongoing indexing', async () => {
      const response = await request(app).post('/api/cancel-indexing');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Indexing cancelled and reset');
    });
  });

  describe('POST /api/query', () => {
    it('should process RAG queries successfully', async () => {
      const mockRAGResponse = {
        answer: 'This is a test response from the RAG system.',
        sources: [{ videoId: 'test-video', title: 'Test Video' }],
        chunks: []
      };

      mockRAGService.query.mockResolvedValue(mockRAGResponse);

      const response = await request(app)
        .post('/api/query')
        .send({
          question: 'What is artificial intelligence?'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockRAGResponse);
      expect(mockRAGService.query).toHaveBeenCalledWith('What is artificial intelligence?');
    });

    it('should validate query input', async () => {
      const response = await request(app)
        .post('/api/query')
        .send({
          question: '<script>alert("xss")</script>'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('dangerous content');
    });

    it('should handle RAG service errors', async () => {
      mockRAGService.query.mockRejectedValue(new Error('RAG service error'));

      const response = await request(app)
        .post('/api/query')
        .send({
          question: 'What is AI?'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to process query');
    });
  });

  describe('POST /api/chat', () => {
    it('should process chat queries with profile', async () => {
      const mockRAGResponse = {
        answer: 'Professional response about AI.',
        sources: [],
        chunks: [],
        debug: {
          question: 'What is AI?',
          profileId: 'professional',
          chunksCount: 0
        }
      };

      mockRAGService.query.mockResolvedValue(mockRAGResponse);

      const response = await request(app)
        .post('/api/chat')
        .send({
          question: 'What is AI?',
          profileId: 'professional',
          customInstructions: 'Be concise'
        });

      expect(response.status).toBe(200);
      expect(response.body.answer).toBe('Professional response about AI.');
      expect(response.body.debug).toBeDefined();
      expect(mockRAGService.query).toHaveBeenCalledWith(
        'What is AI?',
        10,
        'professional',
        'Be concise'
      );
    });

    it('should handle missing RAG service gracefully', async () => {
      // Simulate uninitialized RAG service
      app.locals.ragService = null;

      const response = await request(app)
        .post('/api/chat')
        .send({
          question: 'What is AI?'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('RAG service not initialized');
      expect(response.body.debug).toBeDefined();
    });
  });

  describe('GET /api/stats', () => {
    it('should return system statistics', async () => {
      mockVectorStore.getStats.mockResolvedValue({
        vectorCount: 1500,
        indexSize: '75MB'
      });

      mockChannelManager.getAllChannels.mockReturnValue({
        'UC123': { name: 'Channel 1', videoCount: 10 },
        'UC456': { name: 'Channel 2', videoCount: 15 }
      });

      mockChannelManager.getTotalVideos.mockReturnValue(25);

      const response = await request(app).get('/api/stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        vectorCount: 1500,
        indexSize: '75MB',
        indexedChannels: 2,
        totalVideos: 25,
        channels: {
          'UC123': { name: 'Channel 1', videoCount: 10 },
          'UC456': { name: 'Channel 2', videoCount: 15 }
        }
      });
    });

    it('should handle vector store errors', async () => {
      mockVectorStore.getStats.mockRejectedValue(new Error('Vector store error'));

      const response = await request(app).get('/api/stats');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to get stats');
    });
  });

  describe('GET /api/channels', () => {
    it('should return indexed channels', async () => {
      const mockChannels = {
        'UC123': { name: 'Test Channel 1', videoCount: 10 },
        'UC456': { name: 'Test Channel 2', videoCount: 20 }
      };

      mockChannelManager.getAllChannels.mockReturnValue(mockChannels);

      const response = await request(app).get('/api/channels');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockChannels);
    });
  });

  describe('DELETE /api/channels/:channelId', () => {
    it('should delete a channel successfully', async () => {
      mockChannelManager.removeChannel.mockResolvedValue();

      const response = await request(app)
        .delete('/api/channels/UC123456789012345678901');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockChannelManager.removeChannel).toHaveBeenCalledWith('UC123456789012345678901');
    });

    it('should validate channel ID for deletion', async () => {
      const response = await request(app)
        .delete('/api/channels/invalid<script>');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Channel ID');
    });
  });

  describe('POST /api/reset', () => {
    it('should reset vector store successfully', async () => {
      mockVectorStore.deleteNamespace.mockResolvedValue();

      const response = await request(app).post('/api/reset');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Vector store reset successfully');
    });
  });

  describe('Project Management Endpoints', () => {
    describe('POST /api/projects', () => {
      it('should create a new project', async () => {
        const newProject = { id: 'proj-123', name: 'New Project' };
        mockUpstashManager.createProject.mockResolvedValue(newProject);

        const response = await request(app)
          .post('/api/projects')
          .send({
            name: 'New Project',
            description: 'Test project description'
          });

        expect(response.status).toBe(200);
        expect(response.body).toEqual(newProject);
      });

      it('should validate project name', async () => {
        const response = await request(app)
          .post('/api/projects')
          .send({
            name: 'Invalid<script>Name'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Project name');
      });
    });

    describe('GET /api/projects', () => {
      it('should return all projects with current project', async () => {
        const mockProjects = [
          { id: 'proj-1', name: 'Project 1' },
          { id: 'proj-2', name: 'Project 2' }
        ];
        const currentProject = mockProjects[0];

        mockUpstashManager.getAllProjects.mockReturnValue(mockProjects);
        mockUpstashManager.getCurrentProject.mockReturnValue(currentProject);

        const response = await request(app).get('/api/projects');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          projects: mockProjects,
          currentProject
        });
      });
    });
  });

  describe('GET /api/quota', () => {
    it('should return YouTube API quota status', async () => {
      const quotaStatus = {
        quotaUsed: 1500,
        quotaLimit: 10000,
        percentUsed: 15
      };

      mockYouTubeService.getQuotaStatus.mockReturnValue(quotaStatus);

      const response = await request(app).get('/api/quota');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(quotaStatus);
    });
  });

  describe('POST /api/bulk-import', () => {
    it('should start bulk channel import', async () => {
      const response = await request(app)
        .post('/api/bulk-import')
        .send({
          channels: ['UC123456789012345678901', 'UC098765432109876543210'],
          videoLimit: 50,
          excludeShorts: true
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Bulk import started');
      expect(response.body.totalChannels).toBe(2);
    });

    it('should validate bulk import input', async () => {
      const response = await request(app)
        .post('/api/bulk-import')
        .send({
          channels: 'not-an-array'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('array');
    });

    it('should limit bulk import size', async () => {
      const tooManyChannels = new Array(51).fill('UC123456789012345678901');
      
      const response = await request(app)
        .post('/api/bulk-import')
        .send({
          channels: tooManyChannels
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('too long');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await request(app).get('/api/unknown-endpoint');

      expect(response.status).toBe(404);
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/query')
        .set('Content-Type', 'application/json')
        .send('{"malformed": json}');

      expect(response.status).toBe(400);
    });
  });
});
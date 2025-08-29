const { YouTubeService } = require('../../../src/services/youtube');
const { YouTubeRateLimiter } = require('../../../src/services/youtubeRateLimiter');
const { DatabaseService } = require('../../../src/services/database');
const { EmbeddingService } = require('../../../src/services/embeddings');

// Mock dependencies
jest.mock('../../../src/services/youtubeRateLimiter');
jest.mock('../../../src/services/database');
jest.mock('../../../src/services/embeddings');
jest.mock('youtube-transcript');
jest.mock('youtubei.js');

describe('YouTube Service Unit Tests', () => {
  let youtubeService;
  let mockRateLimiter;
  let mockDatabase;
  let mockEmbeddingService;
  let mockTranscriptAPI;
  let mockYouTubeAPI;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    mockRateLimiter = {
      checkQuota: jest.fn().mockResolvedValue(true),
      updateQuota: jest.fn(),
      getRemainingQuota: jest.fn().mockReturnValue(10000)
    };
    
    mockDatabase = {
      getChannel: jest.fn(),
      saveChannel: jest.fn(),
      getVideo: jest.fn(),
      saveVideo: jest.fn(),
      saveTranscript: jest.fn()
    };
    
    mockEmbeddingService = {
      generateEmbedding: jest.fn(),
      batchGenerateEmbeddings: jest.fn()
    };
    
    mockTranscriptAPI = {
      fetchTranscript: jest.fn()
    };
    
    mockYouTubeAPI = {
      getChannelInfo: jest.fn(),
      getChannelVideos: jest.fn(),
      getVideoInfo: jest.fn()
    };
    
    YouTubeRateLimiter.mockImplementation(() => mockRateLimiter);
    DatabaseService.mockImplementation(() => mockDatabase);
    EmbeddingService.mockImplementation(() => mockEmbeddingService);
    
    youtubeService = new YouTubeService({
      rateLimiter: mockRateLimiter,
      database: mockDatabase,
      embeddingService: mockEmbeddingService,
      transcriptAPI: mockTranscriptAPI,
      youtubeAPI: mockYouTubeAPI
    });
  });

  describe('Channel Processing', () => {
    it('should process channel successfully', async () => {
      const channelId = 'UCTestChannelId';
      const mockChannelInfo = {
        id: channelId,
        title: 'Test Channel',
        description: 'Test Description',
        subscriberCount: 1000000,
        videoCount: 500
      };
      
      const mockVideos = [
        { id: 'video1', title: 'Video 1', publishedAt: '2024-01-01' },
        { id: 'video2', title: 'Video 2', publishedAt: '2024-01-02' }
      ];
      
      mockYouTubeAPI.getChannelInfo.mockResolvedValue(mockChannelInfo);
      mockYouTubeAPI.getChannelVideos.mockResolvedValue(mockVideos);
      mockDatabase.getChannel.mockResolvedValue(null);
      mockDatabase.saveChannel.mockResolvedValue(mockChannelInfo);
      
      const result = await youtubeService.processChannel(channelId);
      
      expect(mockRateLimiter.checkQuota).toHaveBeenCalled();
      expect(mockYouTubeAPI.getChannelInfo).toHaveBeenCalledWith(channelId);
      expect(mockYouTubeAPI.getChannelVideos).toHaveBeenCalledWith(channelId);
      expect(mockDatabase.saveChannel).toHaveBeenCalledWith(mockChannelInfo);
      expect(result).toEqual({
        channelInfo: mockChannelInfo,
        videosFound: 2,
        videosProcessed: 2
      });
    });

    it('should handle rate limiting gracefully', async () => {
      const channelId = 'UCTestChannelId';
      mockRateLimiter.checkQuota.mockResolvedValue(false);
      
      await expect(youtubeService.processChannel(channelId))
        .rejects.toThrow('Rate limit exceeded');
      
      expect(mockYouTubeAPI.getChannelInfo).not.toHaveBeenCalled();
    });

    it('should skip already processed channels', async () => {
      const channelId = 'UCExistingChannel';
      const existingChannel = {
        id: channelId,
        title: 'Existing Channel',
        lastProcessed: new Date().toISOString()
      };
      
      mockDatabase.getChannel.mockResolvedValue(existingChannel);
      
      const result = await youtubeService.processChannel(channelId, { skipExisting: true });
      
      expect(mockYouTubeAPI.getChannelInfo).not.toHaveBeenCalled();
      expect(result).toEqual({
        channelInfo: existingChannel,
        skipped: true,
        reason: 'Already processed'
      });
    });
  });

  describe('Video Processing', () => {
    it('should process video with transcript successfully', async () => {
      const videoId = 'testVideoId123';
      const mockVideoInfo = {
        id: videoId,
        title: 'Test Video',
        description: 'Test video description',
        duration: 600,
        publishedAt: '2024-01-01T00:00:00Z'
      };
      
      const mockTranscript = [
        { text: 'Hello world', start: 0, duration: 2 },
        { text: 'This is a test', start: 2, duration: 3 },
        { text: 'End of video', start: 5, duration: 2 }
      ];
      
      mockYouTubeAPI.getVideoInfo.mockResolvedValue(mockVideoInfo);
      mockTranscriptAPI.fetchTranscript.mockResolvedValue(mockTranscript);
      mockDatabase.getVideo.mockResolvedValue(null);
      mockDatabase.saveVideo.mockResolvedValue(mockVideoInfo);
      mockDatabase.saveTranscript.mockResolvedValue(true);
      
      const result = await youtubeService.processVideo(videoId);
      
      expect(mockTranscriptAPI.fetchTranscript).toHaveBeenCalledWith(videoId);
      expect(mockDatabase.saveVideo).toHaveBeenCalledWith(mockVideoInfo);
      expect(mockDatabase.saveTranscript).toHaveBeenCalledWith({
        videoId,
        transcript: mockTranscript,
        processedAt: expect.any(String)
      });
      expect(result).toEqual({
        videoInfo: mockVideoInfo,
        transcriptLength: 3,
        processed: true
      });
    });

    it('should handle videos without transcripts', async () => {
      const videoId = 'noTranscriptVideo';
      const mockVideoInfo = {
        id: videoId,
        title: 'Video Without Transcript',
        description: 'This video has no transcript'
      };
      
      mockYouTubeAPI.getVideoInfo.mockResolvedValue(mockVideoInfo);
      mockTranscriptAPI.fetchTranscript.mockRejectedValue(new Error('No transcript available'));
      
      const result = await youtubeService.processVideo(videoId);
      
      expect(result).toEqual({
        videoInfo: mockVideoInfo,
        transcriptLength: 0,
        processed: false,
        error: 'No transcript available'
      });
    });

    it('should batch process multiple videos efficiently', async () => {
      const videoIds = ['vid1', 'vid2', 'vid3', 'vid4', 'vid5'];
      const mockResults = videoIds.map(id => ({
        videoInfo: { id, title: `Video ${id}` },
        transcriptLength: 10,
        processed: true
      }));
      
      // Mock individual video processing
      youtubeService.processVideo = jest.fn()
        .mockImplementation((id) => Promise.resolve(mockResults.find(r => r.videoInfo.id === id)));
      
      const startTime = Date.now();
      const results = await youtubeService.batchProcessVideos(videoIds, { concurrency: 3 });
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(5);
      expect(results.every(r => r.processed)).toBe(true);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe('Transcript Processing', () => {
    it('should chunk long transcripts appropriately', async () => {
      const longTranscript = Array.from({ length: 1000 }, (_, i) => ({
        text: `Segment ${i}`,
        start: i * 5,
        duration: 4
      }));
      
      const chunks = youtubeService.chunkTranscript(longTranscript, { maxChunkSize: 1000 });
      
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.every(chunk => chunk.text.length <= 1000)).toBe(true);
      expect(chunks.every(chunk => chunk.startTime !== undefined)).toBe(true);
    });

    it('should preserve timestamp information in chunks', async () => {
      const transcript = [
        { text: 'First part', start: 0, duration: 10 },
        { text: 'Second part', start: 10, duration: 10 },
        { text: 'Third part', start: 20, duration: 10 }
      ];
      
      const chunks = youtubeService.chunkTranscript(transcript, { maxChunkSize: 50 });
      
      expect(chunks).toHaveLength(2); // Should create 2 chunks
      expect(chunks[0]).toMatchObject({
        text: expect.stringContaining('First part'),
        startTime: 0,
        endTime: expect.any(Number)
      });
      expect(chunks[1]).toMatchObject({
        text: expect.stringContaining('Third part'),
        startTime: expect.any(Number),
        endTime: 30
      });
    });

    it('should generate embeddings for transcript chunks', async () => {
      const chunks = [
        { text: 'Chunk 1 content', startTime: 0, endTime: 10 },
        { text: 'Chunk 2 content', startTime: 10, endTime: 20 }
      ];
      const mockEmbeddings = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]];
      
      mockEmbeddingService.batchGenerateEmbeddings.mockResolvedValue(mockEmbeddings);
      
      const result = await youtubeService.generateTranscriptEmbeddings('video123', chunks);
      
      expect(mockEmbeddingService.batchGenerateEmbeddings)
        .toHaveBeenCalledWith(chunks.map(c => c.text));
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        videoId: 'video123',
        chunkIndex: 0,
        embedding: mockEmbeddings[0],
        metadata: expect.any(Object)
      });
    });
  });

  describe('Error Handling & Resilience', () => {
    it('should retry failed API calls with exponential backoff', async () => {
      const channelId = 'UCRetryTest';
      
      mockYouTubeAPI.getChannelInfo
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValue({ id: channelId, title: 'Success' });
      
      const result = await youtubeService.processChannelWithRetry(channelId, { maxRetries: 3 });
      
      expect(mockYouTubeAPI.getChannelInfo).toHaveBeenCalledTimes(3);
      expect(result.channelInfo.title).toBe('Success');
    });

    it('should handle API quota exhaustion gracefully', async () => {
      const videoId = 'quotaExhausted';
      
      mockRateLimiter.checkQuota.mockResolvedValue(true);
      mockYouTubeAPI.getVideoInfo.mockRejectedValue(
        new Error('quotaExceeded: Quota exceeded')
      );
      
      const result = await youtubeService.processVideo(videoId);
      
      expect(result).toEqual({
        videoInfo: null,
        processed: false,
        error: 'Quota exceeded - will retry later',
        retryAfter: expect.any(Date)
      });
    });

    it('should handle malformed video data', async () => {
      const videoId = 'malformedData';
      const malformedData = {
        // Missing required fields
        snippet: null,
        contentDetails: undefined
      };
      
      mockYouTubeAPI.getVideoInfo.mockResolvedValue(malformedData);
      
      const result = await youtubeService.processVideo(videoId);
      
      expect(result).toEqual({
        videoInfo: null,
        processed: false,
        error: 'Invalid video data structure',
        videoId
      });
    });
  });

  describe('Data Integrity & Validation', () => {
    it('should validate channel IDs before processing', async () => {
      const invalidChannelIds = ['', null, undefined, 'invalid-format', '123'];
      
      for (const invalidId of invalidChannelIds) {
        await expect(youtubeService.processChannel(invalidId))
          .rejects.toThrow('Invalid channel ID format');
      }
    });

    it('should validate video IDs before processing', async () => {
      const invalidVideoIds = ['', 'too-short', 'invalid@chars', null];
      
      for (const invalidId of invalidVideoIds) {
        await expect(youtubeService.processVideo(invalidId))
          .rejects.toThrow('Invalid video ID format');
      }
    });

    it('should sanitize transcript content', async () => {
      const transcript = [
        { text: 'Normal content', start: 0, duration: 5 },
        { text: '<script>alert("xss")</script>Malicious content', start: 5, duration: 5 },
        { text: 'Normal content again', start: 10, duration: 5 }
      ];
      
      const sanitized = youtubeService.sanitizeTranscript(transcript);
      
      expect(sanitized[1].text).not.toContain('<script>');
      expect(sanitized[1].text).toContain('Malicious content');
      expect(sanitized.every(s => typeof s.text === 'string')).toBe(true);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track processing metrics', async () => {
      const channelId = 'UCMetricsTest';
      const mockChannelInfo = { id: channelId, title: 'Metrics Test' };
      const mockVideos = Array.from({ length: 10 }, (_, i) => ({ id: `vid${i}` }));
      
      mockYouTubeAPI.getChannelInfo.mockResolvedValue(mockChannelInfo);
      mockYouTubeAPI.getChannelVideos.mockResolvedValue(mockVideos);
      mockDatabase.saveChannel.mockResolvedValue(mockChannelInfo);
      
      const startTime = Date.now();
      const result = await youtubeService.processChannel(channelId);
      const endTime = Date.now();
      
      expect(result.metrics).toBeDefined();
      expect(result.metrics).toMatchObject({
        processingTime: expect.any(Number),
        apiCallsUsed: expect.any(Number),
        videosProcessed: 10,
        errorsEncountered: 0
      });
      expect(result.metrics.processingTime).toBeLessThan(endTime - startTime + 100);
    });

    it('should handle memory efficiently with large datasets', async () => {
      const largeVideoList = Array.from({ length: 1000 }, (_, i) => `video${i}`);
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Mock efficient batch processing
      youtubeService.processVideo = jest.fn().mockResolvedValue({
        processed: true,
        transcriptLength: 10
      });
      
      await youtubeService.batchProcessVideos(largeVideoList, { 
        concurrency: 10,
        memoryLimit: 500 * 1024 * 1024 // 500MB limit
      });
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024); // Should stay under limit
    });
  });

  describe('Cleanup & Resource Management', () => {
    it('should clean up resources on service shutdown', async () => {
      youtubeService.database.close = jest.fn();
      youtubeService.rateLimiter.reset = jest.fn();
      
      await youtubeService.shutdown();
      
      expect(youtubeService.database.close).toHaveBeenCalled();
      expect(youtubeService.rateLimiter.reset).toHaveBeenCalled();
    });

    it('should handle concurrent shutdowns gracefully', async () => {
      const shutdownPromises = [
        youtubeService.shutdown(),
        youtubeService.shutdown(),
        youtubeService.shutdown()
      ];
      
      await expect(Promise.all(shutdownPromises)).resolves.toBeDefined();
    });
  });
});

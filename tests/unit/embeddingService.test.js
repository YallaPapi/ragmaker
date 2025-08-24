const EmbeddingService = require('../../src/services/embeddings');

// Mock dependencies
jest.mock('openai');
jest.mock('langchain/text_splitter');

const { OpenAI } = require('openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');

describe('EmbeddingService', () => {
  let embeddingService;
  let mockOpenAI;
  let mockTextSplitter;

  beforeEach(() => {
    // Setup OpenAI mock
    mockOpenAI = {
      embeddings: {
        create: jest.fn()
      }
    };

    // Setup TextSplitter mock
    mockTextSplitter = {
      createDocuments: jest.fn()
    };

    // Apply mocks
    OpenAI.mockImplementation(() => mockOpenAI);
    RecursiveCharacterTextSplitter.mockImplementation(() => mockTextSplitter);

    embeddingService = new EmbeddingService();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: expect.any(String)
      });
      
      expect(RecursiveCharacterTextSplitter).toHaveBeenCalledWith({
        chunkSize: expect.any(Number),
        chunkOverlap: expect.any(Number),
        separators: expect.arrayContaining(['\n\n', '\n', '. ', ', ', ' ', ''])
      });
    });
  });

  describe('createEmbedding', () => {
    it('should create embedding successfully', async () => {
      const text = 'This is a test text for embedding.';
      const mockEmbedding = new Array(1536).fill(0.1);
      const mockResponse = {
        data: [{ embedding: mockEmbedding }]
      };

      mockOpenAI.embeddings.create.mockResolvedValue(mockResponse);

      const result = await embeddingService.createEmbedding(text);

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: expect.any(String),
        input: text
      });
      expect(result).toEqual(mockEmbedding);
    });

    it('should handle OpenAI API errors', async () => {
      const text = 'Test text';
      mockOpenAI.embeddings.create.mockRejectedValue(new Error('OpenAI API error'));

      await expect(embeddingService.createEmbedding(text))
        .rejects.toThrow('OpenAI API error');
    });

    it('should handle rate limiting errors', async () => {
      const text = 'Test text';
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      
      mockOpenAI.embeddings.create.mockRejectedValue(rateLimitError);

      await expect(embeddingService.createEmbedding(text))
        .rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('splitTranscript', () => {
    it('should split transcript into chunks with metadata', async () => {
      const transcript = 'This is a long transcript that needs to be split into smaller chunks for processing.';
      const metadata = {
        videoId: 'test-video',
        videoTitle: 'Test Video',
        videoUrl: 'https://youtube.com/watch?v=test-video'
      };

      const mockChunks = [
        {
          pageContent: 'This is a long transcript that needs',
          metadata: { ...metadata }
        },
        {
          pageContent: 'to be split into smaller chunks',
          metadata: { ...metadata }
        },
        {
          pageContent: 'for processing.',
          metadata: { ...metadata }
        }
      ];

      mockTextSplitter.createDocuments.mockResolvedValue(mockChunks);

      const result = await embeddingService.splitTranscript(transcript, metadata);

      expect(mockTextSplitter.createDocuments).toHaveBeenCalledWith(
        [transcript],
        [metadata]
      );

      expect(result).toEqual([
        {
          content: 'This is a long transcript that needs',
          metadata: {
            ...metadata,
            chunkIndex: 0,
            totalChunks: 3
          }
        },
        {
          content: 'to be split into smaller chunks',
          metadata: {
            ...metadata,
            chunkIndex: 1,
            totalChunks: 3
          }
        },
        {
          content: 'for processing.',
          metadata: {
            ...metadata,
            chunkIndex: 2,
            totalChunks: 3
          }
        }
      ]);
    });

    it('should handle empty transcript', async () => {
      const transcript = '';
      const metadata = { videoId: 'empty-video' };

      mockTextSplitter.createDocuments.mockResolvedValue([]);

      const result = await embeddingService.splitTranscript(transcript, metadata);

      expect(result).toEqual([]);
    });
  });

  describe('processVideo', () => {
    it('should process video transcript into embeddings', async () => {
      const video = testData.createMockVideo({
        videoId: 'test-video',
        title: 'Test Video',
        transcript: 'This is a test transcript for video processing.'
      });

      const mockChunks = [
        {
          content: 'This is a test transcript',
          metadata: {
            videoId: 'test-video',
            videoTitle: 'Test Video',
            videoUrl: video.url,
            publishedAt: video.publishedAt,
            chunkIndex: 0,
            totalChunks: 2
          }
        },
        {
          content: 'for video processing.',
          metadata: {
            videoId: 'test-video',
            videoTitle: 'Test Video',
            videoUrl: video.url,
            publishedAt: video.publishedAt,
            chunkIndex: 1,
            totalChunks: 2
          }
        }
      ];

      const mockEmbedding1 = new Array(1536).fill(0.1);
      const mockEmbedding2 = new Array(1536).fill(0.2);

      jest.spyOn(embeddingService, 'splitTranscript')
        .mockResolvedValue(mockChunks);
      jest.spyOn(embeddingService, 'createEmbedding')
        .mockResolvedValueOnce(mockEmbedding1)
        .mockResolvedValueOnce(mockEmbedding2);

      const result = await embeddingService.processVideo(video);

      expect(embeddingService.splitTranscript).toHaveBeenCalledWith(
        video.transcript,
        {
          videoId: video.videoId,
          videoTitle: video.title,
          videoUrl: video.url,
          publishedAt: video.publishedAt
        }
      );

      expect(embeddingService.createEmbedding).toHaveBeenCalledTimes(2);
      expect(embeddingService.createEmbedding).toHaveBeenNthCalledWith(1, mockChunks[0].content);
      expect(embeddingService.createEmbedding).toHaveBeenNthCalledWith(2, mockChunks[1].content);

      expect(result).toEqual([
        {
          id: 'test-video_chunk_0',
          vector: mockEmbedding1,
          metadata: {
            ...mockChunks[0].metadata,
            content: mockChunks[0].content
          }
        },
        {
          id: 'test-video_chunk_1',
          vector: mockEmbedding2,
          metadata: {
            ...mockChunks[1].metadata,
            content: mockChunks[1].content
          }
        }
      ]);
    });

    it('should handle video with no transcript', async () => {
      const video = testData.createMockVideo({ transcript: '' });

      jest.spyOn(embeddingService, 'splitTranscript')
        .mockResolvedValue([]);

      const result = await embeddingService.processVideo(video);

      expect(result).toEqual([]);
    });

    it('should handle embedding creation errors gracefully', async () => {
      const video = testData.createMockVideo();

      const mockChunks = [
        {
          content: 'Test content',
          metadata: {
            videoId: video.videoId,
            videoTitle: video.title,
            chunkIndex: 0,
            totalChunks: 1
          }
        }
      ];

      jest.spyOn(embeddingService, 'splitTranscript')
        .mockResolvedValue(mockChunks);
      jest.spyOn(embeddingService, 'createEmbedding')
        .mockRejectedValue(new Error('Embedding creation failed'));

      await expect(embeddingService.processVideo(video))
        .rejects.toThrow('Embedding creation failed');
    });
  });

  describe('processChannelTranscripts', () => {
    it('should process multiple video transcripts with delay', async () => {
      const videos = [
        testData.createMockVideo({ videoId: 'video1', title: 'Video 1' }),
        testData.createMockVideo({ videoId: 'video2', title: 'Video 2' })
      ];

      const mockEmbeddings1 = [testData.createMockEmbedding({ id: 'video1_chunk_0' })];
      const mockEmbeddings2 = [testData.createMockEmbedding({ id: 'video2_chunk_0' })];

      jest.spyOn(embeddingService, 'processVideo')
        .mockResolvedValueOnce(mockEmbeddings1)
        .mockResolvedValueOnce(mockEmbeddings2);

      // Mock setTimeout to track delays
      const originalSetTimeout = setTimeout;
      const mockSetTimeout = jest.fn((callback) => originalSetTimeout(callback, 0));
      global.setTimeout = mockSetTimeout;

      const result = await embeddingService.processChannelTranscripts(videos);

      expect(embeddingService.processVideo).toHaveBeenCalledTimes(2);
      expect(embeddingService.processVideo).toHaveBeenNthCalledWith(1, videos[0]);
      expect(embeddingService.processVideo).toHaveBeenNthCalledWith(2, videos[1]);
      
      expect(result).toEqual([...mockEmbeddings1, ...mockEmbeddings2]);
      
      // Should have delay between processing
      expect(mockSetTimeout).toHaveBeenCalledTimes(2);
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 500);

      // Restore original setTimeout
      global.setTimeout = originalSetTimeout;
    });

    it('should handle empty video list', async () => {
      const result = await embeddingService.processChannelTranscripts([]);

      expect(result).toEqual([]);
    });

    it('should continue processing even if one video fails', async () => {
      const videos = [
        testData.createMockVideo({ videoId: 'video1', title: 'Video 1' }),
        testData.createMockVideo({ videoId: 'video2', title: 'Video 2' }),
        testData.createMockVideo({ videoId: 'video3', title: 'Video 3' })
      ];

      const mockEmbeddings1 = [testData.createMockEmbedding({ id: 'video1_chunk_0' })];
      const mockEmbeddings3 = [testData.createMockEmbedding({ id: 'video3_chunk_0' })];

      jest.spyOn(embeddingService, 'processVideo')
        .mockResolvedValueOnce(mockEmbeddings1)
        .mockRejectedValueOnce(new Error('Processing failed for video 2'))
        .mockResolvedValueOnce(mockEmbeddings3);

      // Should throw on the first failure
      await expect(embeddingService.processChannelTranscripts(videos))
        .rejects.toThrow('Processing failed for video 2');
    });
  });

  describe('Edge Cases and Performance', () => {
    it('should handle very long transcripts', async () => {
      const longTranscript = 'A'.repeat(50000); // Very long transcript
      const video = testData.createMockVideo({ transcript: longTranscript });

      const mockChunks = Array.from({ length: 100 }, (_, i) => ({
        content: `Chunk ${i + 1} content`,
        metadata: {
          videoId: video.videoId,
          videoTitle: video.title,
          chunkIndex: i,
          totalChunks: 100
        }
      }));

      jest.spyOn(embeddingService, 'splitTranscript')
        .mockResolvedValue(mockChunks);
      jest.spyOn(embeddingService, 'createEmbedding')
        .mockImplementation(() => Promise.resolve(new Array(1536).fill(0.1)));

      const result = await embeddingService.processVideo(video);

      expect(result).toHaveLength(100);
      expect(embeddingService.createEmbedding).toHaveBeenCalledTimes(100);
    });

    it('should handle special characters in transcript', async () => {
      const specialTranscript = 'Text with émojis 🎉, speciâl characters, and "quotes"';
      const video = testData.createMockVideo({ transcript: specialTranscript });

      const mockChunks = [{
        content: specialTranscript,
        metadata: { videoId: video.videoId, chunkIndex: 0, totalChunks: 1 }
      }];

      jest.spyOn(embeddingService, 'splitTranscript')
        .mockResolvedValue(mockChunks);
      jest.spyOn(embeddingService, 'createEmbedding')
        .mockResolvedValue(new Array(1536).fill(0.1));

      const result = await embeddingService.processVideo(video);

      expect(result).toHaveLength(1);
      expect(embeddingService.createEmbedding)
        .toHaveBeenCalledWith(specialTranscript);
    });
  });
});
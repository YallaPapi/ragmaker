const YouTubeService = require('../../src/services/youtube');
const axios = require('axios');
const { Innertube } = require('youtubei.js');

// Mock dependencies
jest.mock('axios');
jest.mock('youtubei.js');
jest.mock('../../src/services/youtubeRateLimiter');

const mockAxios = axios;
const mockInnertube = {
  create: jest.fn(),
  getInfo: jest.fn()
};

describe('YouTubeService', () => {
  let youtubeService;
  let mockRateLimiter;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup rate limiter mock
    mockRateLimiter = {
      checkQuota: jest.fn().mockResolvedValue(),
      getStatus: jest.fn().mockReturnValue({ quotaUsed: 0, quotaLimit: 10000 })
    };

    // Mock Innertube.create
    Innertube.create.mockResolvedValue(mockInnertube);
    
    youtubeService = new YouTubeService();
    youtubeService.rateLimiter = mockRateLimiter;
    youtubeService.apiKey = 'test-api-key';
  });

  describe('resolveChannelId', () => {
    it('should return UC channel ID unchanged when valid', async () => {
      const channelId = 'UC1234567890123456789012';
      const result = await youtubeService.resolveChannelId(channelId);
      expect(result).toBe(channelId);
    });

    it('should resolve handle to channel ID via search API', async () => {
      const handle = '@testchannel';
      const mockSearchResponse = {
        data: {
          items: [{
            snippet: {
              channelId: 'UC1234567890123456789012'
            }
          }]
        }
      };

      mockAxios.get.mockResolvedValue(mockSearchResponse);

      const result = await youtubeService.resolveChannelId(handle);
      
      expect(result).toBe('UC1234567890123456789012');
      expect(mockRateLimiter.checkQuota).toHaveBeenCalledWith('search.list', 1);
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('search?part=snippet&type=channel&q=testchannel'),
        { timeout: 5000 }
      );
    });

    it('should handle search API errors gracefully', async () => {
      const handle = '@testchannel';
      mockAxios.get.mockRejectedValue(new Error('API Error'));

      const result = await youtubeService.resolveChannelId(handle);
      
      expect(result).toBe('testchannel'); // Falls back to clean identifier
    });

    it('should remove @ symbol from handles', async () => {
      const handle = '@testchannel';
      mockAxios.get.mockRejectedValue(new Error('Not found'));

      const result = await youtubeService.resolveChannelId(handle);
      
      expect(result).toBe('testchannel');
    });
  });

  describe('getChannelInfo', () => {
    it('should fetch channel information successfully', async () => {
      const channelId = 'UC1234567890123456789012';
      const mockChannelResponse = {
        data: {
          items: [{
            snippet: {
              title: 'Test Channel',
              description: 'Test Description'
            },
            contentDetails: {
              relatedPlaylists: {
                uploads: 'UU1234567890123456789012'
              }
            }
          }]
        }
      };

      mockAxios.get.mockResolvedValue(mockChannelResponse);

      const result = await youtubeService.getChannelInfo(channelId);

      expect(result).toEqual({
        id: channelId,
        name: 'Test Channel',
        description: 'Test Description',
        uploadsPlaylistId: 'UU1234567890123456789012'
      });
    });

    it('should throw error when channel not found', async () => {
      const channelId = 'UC1234567890123456789012';
      mockAxios.get.mockResolvedValue({ data: { items: [] } });

      await expect(youtubeService.getChannelInfo(channelId))
        .rejects.toThrow('Channel not found');
    });
  });

  describe('getVideoTranscript', () => {
    beforeEach(() => {
      youtubeService.innertube = mockInnertube;
    });

    it('should extract transcript successfully', async () => {
      const videoId = 'test-video-id';
      const mockVideoInfo = {
        captions: {
          caption_tracks: [
            { language: { name: 'English' } }
          ]
        },
        getTranscript: jest.fn().mockResolvedValue({
          transcript: {
            content: {
              body: {
                initial_segments: [
                  { snippet: { text: 'Hello' } },
                  { snippet: { text: 'World' } }
                ]
              }
            }
          }
        })
      };

      mockInnertube.getInfo.mockResolvedValue(mockVideoInfo);

      const result = await youtubeService.getVideoTranscript(videoId);

      expect(result.success).toBe(true);
      expect(result.data.transcript).toBe('Hello World');
      expect(result.data.videoId).toBe(videoId);
    });

    it('should handle no captions available', async () => {
      const videoId = 'test-video-id';
      const mockVideoInfo = {
        captions: null
      };

      mockInnertube.getInfo.mockResolvedValue(mockVideoInfo);

      const result = await youtubeService.getVideoTranscript(videoId);

      expect(result.success).toBe(false);
      expect(result.category).toBe('NO_CAPTIONS');
      expect(result.details).toBe('No captions object');
    });

    it('should categorize errors correctly', async () => {
      const videoId = 'test-video-id';
      mockInnertube.getInfo.mockRejectedValue(new Error('Video is private'));

      const result = await youtubeService.getVideoTranscript(videoId);

      expect(result.success).toBe(false);
      expect(result.category).toBe('PRIVATE_OR_RESTRICTED');
    });

    it('should retry on transient errors', async () => {
      const videoId = 'test-video-id';
      const mockVideoInfo = {
        captions: {
          caption_tracks: [{ language: { name: 'English' } }]
        },
        getTranscript: jest.fn()
          .mockRejectedValueOnce(new Error('Network timeout'))
          .mockResolvedValueOnce({
            transcript: {
              content: {
                body: {
                  initial_segments: [
                    { snippet: { text: 'Success after retry' } }
                  ]
                }
              }
            }
          })
      };

      mockInnertube.getInfo.mockResolvedValue(mockVideoInfo);

      const result = await youtubeService.getVideoTranscript(videoId);

      expect(result.success).toBe(true);
      expect(mockVideoInfo.getTranscript).toHaveBeenCalledTimes(2);
    });
  });

  describe('parseDuration', () => {
    it('should parse ISO 8601 duration correctly', () => {
      expect(youtubeService.parseDuration('PT1H30M45S')).toBe(5445); // 1h 30m 45s
      expect(youtubeService.parseDuration('PT30M')).toBe(1800); // 30 minutes
      expect(youtubeService.parseDuration('PT45S')).toBe(45); // 45 seconds
      expect(youtubeService.parseDuration('PT1H')).toBe(3600); // 1 hour
    });

    it('should return 0 for invalid duration', () => {
      expect(youtubeService.parseDuration('invalid')).toBe(0);
      expect(youtubeService.parseDuration('')).toBe(0);
      expect(youtubeService.parseDuration(null)).toBe(0);
    });
  });

  describe('getChannelTranscripts', () => {
    beforeEach(() => {
      // Mock getChannelInfo
      jest.spyOn(youtubeService, 'getChannelInfo').mockResolvedValue({
        id: 'UC1234567890123456789012',
        name: 'Test Channel',
        uploadsPlaylistId: 'UU1234567890123456789012'
      });

      // Mock getChannelVideos
      jest.spyOn(youtubeService, 'getChannelVideos').mockResolvedValue([
        {
          videoId: 'video1',
          title: 'Video 1',
          url: 'https://youtube.com/watch?v=video1'
        },
        {
          videoId: 'video2',
          title: 'Short Video',
          url: 'https://youtube.com/watch?v=video2'
        }
      ]);

      // Mock getVideoMetadata
      jest.spyOn(youtubeService, 'getVideoMetadata').mockResolvedValue({
        video1: { duration: 'PT5M30S', title: 'Video 1' }, // 5:30 - normal video
        video2: { duration: 'PT45S', title: 'Short Video' } // 45s - short
      });
    });

    it('should fetch transcripts successfully', async () => {
      jest.spyOn(youtubeService, 'getVideoTranscript')
        .mockResolvedValueOnce({
          success: true,
          data: { videoId: 'video1', transcript: 'Transcript 1' }
        })
        .mockResolvedValueOnce({
          success: true,
          data: { videoId: 'video2', transcript: 'Transcript 2' }
        });

      const result = await youtubeService.getChannelTranscripts('UC1234567890123456789012');

      expect(result.transcripts).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.channelInfo.name).toBe('Test Channel');
    });

    it('should exclude YouTube Shorts when requested', async () => {
      jest.spyOn(youtubeService, 'getVideoTranscript')
        .mockResolvedValue({
          success: true,
          data: { videoId: 'video1', transcript: 'Transcript 1' }
        });

      const result = await youtubeService.getChannelTranscripts(
        'UC1234567890123456789012',
        { excludeShorts: true }
      );

      expect(result.transcripts).toHaveLength(1);
      expect(result.transcripts[0].videoId).toBe('video1'); // Only non-short video
    });

    it('should skip already indexed videos', async () => {
      jest.spyOn(youtubeService, 'getVideoTranscript')
        .mockResolvedValue({
          success: true,
          data: { videoId: 'video2', transcript: 'Transcript 2' }
        });

      const result = await youtubeService.getChannelTranscripts(
        'UC1234567890123456789012',
        { skipExisting: ['video1'] }
      );

      expect(result.transcripts).toHaveLength(1);
      expect(result.transcripts[0].videoId).toBe('video2');
    });

    it('should handle transcript fetch failures', async () => {
      jest.spyOn(youtubeService, 'getVideoTranscript')
        .mockResolvedValueOnce({
          success: false,
          category: 'NO_CAPTIONS',
          details: 'No captions available'
        })
        .mockResolvedValueOnce({
          success: true,
          data: { videoId: 'video2', transcript: 'Transcript 2' }
        });

      const result = await youtubeService.getChannelTranscripts('UC1234567890123456789012');

      expect(result.transcripts).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].reason).toBe('NO_CAPTIONS');
    });

    it('should apply video limit correctly', async () => {
      jest.spyOn(youtubeService, 'getVideoTranscript')
        .mockResolvedValue({
          success: true,
          data: { videoId: 'video1', transcript: 'Transcript 1' }
        });

      const result = await youtubeService.getChannelTranscripts(
        'UC1234567890123456789012',
        { limit: 1 }
      );

      expect(result.transcripts).toHaveLength(1);
      expect(youtubeService.getVideoTranscript).toHaveBeenCalledTimes(1);
    });

    it('should throw detailed error when no videos to process', async () => {
      jest.spyOn(youtubeService, 'getChannelVideos').mockResolvedValue([]);

      await expect(
        youtubeService.getChannelTranscripts('UC1234567890123456789012')
      ).rejects.toThrow('This channel has no videos');
    });
  });

  describe('getQuotaStatus', () => {
    it('should return rate limiter status', () => {
      const mockStatus = { quotaUsed: 500, quotaLimit: 10000, percentUsed: 5 };
      mockRateLimiter.getStatus.mockReturnValue(mockStatus);

      const result = youtubeService.getQuotaStatus();

      expect(result).toEqual(mockStatus);
    });
  });
});
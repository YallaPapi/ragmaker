const RAGService = require('../../src/services/rag');

// Mock dependencies
jest.mock('../../src/services/embeddings');
jest.mock('../../src/services/vectorStore');
jest.mock('../../src/services/ragProfiles');
jest.mock('openai');

const EmbeddingService = require('../../src/services/embeddings');
const VectorStoreService = require('../../src/services/vectorStore');
const RAGProfiles = require('../../src/services/ragProfiles');
const { OpenAI } = require('openai');

describe('RAGService', () => {
  let ragService;
  let mockEmbeddingService;
  let mockVectorStore;
  let mockProfiles;
  let mockOpenAI;

  beforeEach(() => {
    // Setup mocks
    mockEmbeddingService = {
      createEmbedding: jest.fn()
    };
    mockVectorStore = {
      query: jest.fn()
    };
    mockProfiles = {
      buildPrompt: jest.fn()
    };
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    };

    // Apply mocks
    EmbeddingService.mockImplementation(() => mockEmbeddingService);
    VectorStoreService.mockImplementation(() => mockVectorStore);
    RAGProfiles.mockImplementation(() => mockProfiles);
    OpenAI.mockImplementation(() => mockOpenAI);

    ragService = new RAGService();
  });

  describe('query', () => {
    it('should process queries successfully with context', async () => {
      const question = 'What is artificial intelligence?';
      const mockEmbedding = new Array(1536).fill(0.1);
      const mockSearchResults = [
        {
          score: 0.95,
          metadata: {
            videoId: 'video1',
            videoTitle: 'AI Explained',
            videoUrl: 'https://youtube.com/watch?v=video1',
            content: 'Artificial intelligence is a field of computer science...'
          }
        },
        {
          score: 0.87,
          metadata: {
            videoId: 'video2',
            videoTitle: 'Machine Learning Basics',
            videoUrl: 'https://youtube.com/watch?v=video2',
            content: 'Machine learning is a subset of AI that enables computers...'
          }
        }
      ];

      const mockPromptConfig = {
        systemPrompt: 'You are an AI assistant that answers questions based on YouTube transcripts.',
        userPrompt: 'Based on the following context, answer: What is artificial intelligence?',
        temperature: 0.7
      };

      const mockCompletion = {
        choices: [{
          message: {
            content: 'Artificial intelligence (AI) is a field of computer science focused on creating intelligent machines that can perform tasks typically requiring human intelligence.'
          }
        }]
      };

      // Setup method mocks
      mockEmbeddingService.createEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.query.mockResolvedValue(mockSearchResults);
      mockProfiles.buildPrompt.mockReturnValue(mockPromptConfig);
      mockOpenAI.chat.completions.create.mockResolvedValue(mockCompletion);

      const result = await ragService.query(question);

      // Verify the flow
      expect(mockEmbeddingService.createEmbedding).toHaveBeenCalledWith(question);
      expect(mockVectorStore.query).toHaveBeenCalledWith(mockEmbedding, 10);
      expect(mockProfiles.buildPrompt).toHaveBeenCalledWith(
        'default',
        expect.stringContaining('Artificial intelligence is a field'),
        question,
        null
      );
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: expect.any(String),
        messages: [
          { role: 'system', content: mockPromptConfig.systemPrompt },
          { role: 'user', content: mockPromptConfig.userPrompt }
        ],
        temperature: mockPromptConfig.temperature,
        max_tokens: expect.any(Number)
      });

      // Verify response structure
      expect(result).toEqual({
        answer: expect.stringContaining('Artificial intelligence'),
        sources: [
          {
            videoId: 'video1',
            title: 'AI Explained',
            url: 'https://youtube.com/watch?v=video1'
          },
          {
            videoId: 'video2',
            title: 'Machine Learning Basics',
            url: 'https://youtube.com/watch?v=video2'
          }
        ],
        chunks: [
          {
            content: 'Artificial intelligence is a field of computer science...',
            videoTitle: 'AI Explained',
            score: 0.95
          },
          {
            content: 'Machine learning is a subset of AI that enables computers...',
            videoTitle: 'Machine Learning Basics',
            score: 0.87
          }
        ],
        debug: {
          question,
          profileId: 'default',
          chunksCount: 2,
          context: expect.stringContaining('AI Explained'),
          systemPrompt: mockPromptConfig.systemPrompt,
          userPrompt: mockPromptConfig.userPrompt,
          error: null
        }
      });
    });

    it('should handle empty knowledge base gracefully', async () => {
      const question = 'What is quantum computing?';
      const mockEmbedding = new Array(1536).fill(0.1);

      mockEmbeddingService.createEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.query.mockResolvedValue([]);

      const result = await ragService.query(question);

      expect(result.answer).toContain("I couldn't find any relevant information");
      expect(result.sources).toEqual([]);
      expect(result.chunks).toEqual([]);
      expect(result.debug).toEqual({
        question,
        profileId: 'default',
        chunksCount: 0,
        context: 'No relevant content found in knowledge base',
        systemPrompt: 'No system prompt generated - no context available',
        userPrompt: `Question: ${question}`,
        error: null
      });
    });

    it('should use custom profile and instructions', async () => {
      const question = 'Explain AI simply';
      const profileId = 'simple';
      const customInstructions = 'Use simple language for a 5th grader';
      const mockEmbedding = new Array(1536).fill(0.1);
      const mockSearchResults = [testData.createMockSearchResult()];

      const mockPromptConfig = {
        systemPrompt: 'You explain things simply for children.',
        userPrompt: 'Explain AI in simple terms.',
        temperature: 0.5
      };

      mockEmbeddingService.createEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.query.mockResolvedValue(mockSearchResults);
      mockProfiles.buildPrompt.mockReturnValue(mockPromptConfig);
      mockOpenAI.chat.completions.create.mockResolvedValue(
        mockImplementations.mockOpenAICompletion('AI is like a smart robot brain!')
      );

      const result = await ragService.query(question, 5, profileId, customInstructions);

      expect(mockProfiles.buildPrompt).toHaveBeenCalledWith(
        profileId,
        expect.any(String),
        question,
        customInstructions
      );
      expect(mockVectorStore.query).toHaveBeenCalledWith(mockEmbedding, 5);
      expect(result.debug.profileId).toBe(profileId);
    });

    it('should handle OpenAI API errors gracefully', async () => {
      const question = 'What is AI?';
      const mockEmbedding = new Array(1536).fill(0.1);
      const mockSearchResults = [testData.createMockSearchResult()];

      mockEmbeddingService.createEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.query.mockResolvedValue(mockSearchResults);
      mockProfiles.buildPrompt.mockReturnValue({
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt'
      });
      mockOpenAI.chat.completions.create.mockRejectedValue(
        new Error('OpenAI API rate limit exceeded')
      );

      const result = await ragService.query(question);

      expect(result.answer).toContain('encountered an error');
      expect(result.debug.error).toBe('OpenAI API rate limit exceeded');
    });

    it('should handle embedding service errors', async () => {
      const question = 'What is AI?';

      mockEmbeddingService.createEmbedding.mockRejectedValue(
        new Error('Embedding service unavailable')
      );

      const result = await ragService.query(question);

      expect(result.answer).toContain('encountered an error');
      expect(result.debug.error).toBe('Embedding service unavailable');
    });

    it('should handle vector store errors', async () => {
      const question = 'What is AI?';
      const mockEmbedding = new Array(1536).fill(0.1);

      mockEmbeddingService.createEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.query.mockRejectedValue(
        new Error('Vector store connection failed')
      );

      const result = await ragService.query(question);

      expect(result.answer).toContain('encountered an error');
      expect(result.debug.error).toBe('Vector store connection failed');
    });

    it('should deduplicate sources from multiple chunks of same video', async () => {
      const question = 'What is AI?';
      const mockEmbedding = new Array(1536).fill(0.1);
      
      // Multiple chunks from same video
      const mockSearchResults = [
        {
          score: 0.95,
          metadata: {
            videoId: 'same-video',
            videoTitle: 'AI Tutorial',
            videoUrl: 'https://youtube.com/watch?v=same-video',
            content: 'First chunk about AI...'
          }
        },
        {
          score: 0.90,
          metadata: {
            videoId: 'same-video',
            videoTitle: 'AI Tutorial',
            videoUrl: 'https://youtube.com/watch?v=same-video',
            content: 'Second chunk about AI...'
          }
        },
        {
          score: 0.85,
          metadata: {
            videoId: 'different-video',
            videoTitle: 'ML Basics',
            videoUrl: 'https://youtube.com/watch?v=different-video',
            content: 'ML content...'
          }
        }
      ];

      mockEmbeddingService.createEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.query.mockResolvedValue(mockSearchResults);
      mockProfiles.buildPrompt.mockReturnValue({
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt'
      });
      mockOpenAI.chat.completions.create.mockResolvedValue(
        mockImplementations.mockOpenAICompletion('AI explanation')
      );

      const result = await ragService.query(question);

      // Should have only 2 unique sources despite 3 chunks
      expect(result.sources).toHaveLength(2);
      expect(result.sources).toEqual([
        {
          videoId: 'same-video',
          title: 'AI Tutorial',
          url: 'https://youtube.com/watch?v=same-video'
        },
        {
          videoId: 'different-video',
          title: 'ML Basics',
          url: 'https://youtube.com/watch?v=different-video'
        }
      ]);

      // Should still have all 3 chunks
      expect(result.chunks).toHaveLength(3);
    });

    it('should format context correctly for multiple sources', async () => {
      const question = 'What is AI?';
      const mockEmbedding = new Array(1536).fill(0.1);
      const mockSearchResults = [
        {
          metadata: {
            videoTitle: 'AI Basics',
            videoUrl: 'https://youtube.com/watch?v=video1',
            content: 'AI is computer intelligence.'
          }
        },
        {
          metadata: {
            videoTitle: 'Deep Learning',
            videoUrl: 'https://youtube.com/watch?v=video2',
            content: 'Deep learning uses neural networks.'
          }
        }
      ];

      mockEmbeddingService.createEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.query.mockResolvedValue(mockSearchResults);
      
      let capturedContext;
      mockProfiles.buildPrompt.mockImplementation((profileId, context, question) => {
        capturedContext = context;
        return {
          systemPrompt: 'System prompt',
          userPrompt: 'User prompt'
        };
      });
      
      mockOpenAI.chat.completions.create.mockResolvedValue(
        mockImplementations.mockOpenAICompletion('AI response')
      );

      await ragService.query(question);

      expect(capturedContext).toContain('[1] From "AI Basics"');
      expect(capturedContext).toContain('AI is computer intelligence.');
      expect(capturedContext).toContain('[2] From "Deep Learning"');
      expect(capturedContext).toContain('Deep learning uses neural networks.');
    });
  });

  describe('chat', () => {
    it('should delegate to query method', async () => {
      const messages = [];
      const question = 'What is machine learning?';
      const mockResponse = {
        answer: 'Machine learning is a subset of AI...',
        sources: [{ videoId: 'test', title: 'ML Video' }]
      };

      jest.spyOn(ragService, 'query').mockResolvedValue(mockResponse);

      const result = await ragService.chat(messages, question);

      expect(ragService.query).toHaveBeenCalledWith(question);
      expect(result).toEqual({
        role: 'assistant',
        content: mockResponse.answer,
        sources: mockResponse.sources
      });
    });
  });
});
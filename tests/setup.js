// Global test setup and utilities
process.env.NODE_ENV = 'test';

// Mock external APIs by default
jest.mock('openai');
jest.mock('youtubei.js');
jest.mock('@upstash/vector');
jest.mock('@upstash/redis');

// Global test utilities
global.mockYouTubeData = {
  channel: {
    id: 'UC123456789',
    name: 'Test Channel',
    description: 'A test channel for unit tests',
    subscriberCount: 1000000,
    videoCount: 50
  },
  video: {
    id: 'dQw4w9WgXcQ',
    title: 'Test Video Title',
    description: 'Test video description',
    publishedAt: '2023-01-01T00:00:00Z',
    duration: 'PT3M33S'
  },
  transcript: [
    { text: 'Hello and welcome to this test video', start: 0, duration: 3 },
    { text: 'Today we are going to learn about testing', start: 3, duration: 4 },
    { text: 'Testing is very important for code quality', start: 7, duration: 4 }
  ]
};

global.mockOpenAIResponse = {
  embeddings: [
    { embedding: new Array(1536).fill(0).map(() => Math.random()) },
    { embedding: new Array(1536).fill(0).map(() => Math.random()) }
  ],
  chatCompletion: {
    choices: [{
      message: {
        content: 'This is a test response from the RAG system based on the provided context.'
      }
    }]
  }
};

// Custom Jest matchers
expect.extend({
  toBeValidChannelId(received) {
    const isValid = /^UC[a-zA-Z0-9_-]{22}$/.test(received);
    return {
      message: () => `Expected ${received} to be a valid YouTube channel ID`,
      pass: isValid
    };
  },
  
  toBeValidVideoId(received) {
    const isValid = /^[a-zA-Z0-9_-]{11}$/.test(received);
    return {
      message: () => `Expected ${received} to be a valid YouTube video ID`,  
      pass: isValid
    };
  },

  toContainValidEmbedding(received) {
    const isValidEmbedding = Array.isArray(received) && 
                           received.length === 1536 &&
                           received.every(n => typeof n === 'number');
    return {
      message: () => `Expected ${received} to be a valid OpenAI embedding array`,
      pass: isValidEmbedding
    };
  }
});

// Mock console methods to reduce noise in tests
global.originalConsole = { ...console };
beforeEach(() => {
  console.log = jest.fn();
  console.info = jest.fn(); 
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});

// Clean up after all tests
afterAll(() => {
  console.log = global.originalConsole.log;
  console.info = global.originalConsole.info;
  console.warn = global.originalConsole.warn;
  console.error = global.originalConsole.error;
});
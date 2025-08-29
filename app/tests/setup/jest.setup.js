const path = require('path');
const fs = require('fs');

// Global test setup
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Suppress expected warnings during tests
console.error = (...args) => {
  // Suppress specific expected errors
  const message = args.join(' ');
  if (
    message.includes('Warning: ReactDOM.render is deprecated') ||
    message.includes('Warning: componentWillMount') ||
    message.includes('ExperimentalWarning')
  ) {
    return;
  }
  originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
  // Suppress specific expected warnings
  const message = args.join(' ');
  if (
    message.includes('deprecated') ||
    message.includes('experimental')
  ) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.TEST_MODE = 'true';
process.env.DISABLE_ANALYTICS = 'true';
process.env.DISABLE_TELEMETRY = 'true';

// Mock process.platform if needed for cross-platform testing
const originalPlatform = process.platform;
Object.defineProperty(process, 'platform', {
  value: process.env.TEST_PLATFORM || originalPlatform
});

// Global test timeout
jest.setTimeout(300000); // 5 minutes

// Mock external dependencies that shouldn't be called during tests
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(),
    quit: jest.fn(),
    on: jest.fn(),
    getPath: jest.fn().mockReturnValue('/tmp/test-app'),
    isReady: jest.fn().mockReturnValue(true),
    getName: jest.fn().mockReturnValue('RagMaker Test'),
    getVersion: jest.fn().mockReturnValue('1.0.0-test')
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn().mockResolvedValue(),
    loadURL: jest.fn().mockResolvedValue(),
    on: jest.fn(),
    webContents: {
      send: jest.fn(),
      on: jest.fn(),
      executeJavaScript: jest.fn().mockResolvedValue()
    },
    show: jest.fn(),
    hide: jest.fn(),
    close: jest.fn(),
    minimize: jest.fn(),
    maximize: jest.fn(),
    restore: jest.fn(),
    isMinimized: jest.fn().mockReturnValue(false),
    isMaximized: jest.fn().mockReturnValue(false),
    isFullScreen: jest.fn().mockReturnValue(false),
    setFullScreen: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false)
  })),
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn()
  },
  ipcRenderer: {
    invoke: jest.fn(),
    send: jest.fn(),
    on: jest.fn()
  },
  shell: {
    openExternal: jest.fn().mockResolvedValue(),
    showItemInFolder: jest.fn()
  },
  Menu: {
    setApplicationMenu: jest.fn(),
    buildFromTemplate: jest.fn().mockReturnValue({})
  },
  Tray: jest.fn().mockImplementation(() => ({
    setToolTip: jest.fn(),
    setContextMenu: jest.fn(),
    on: jest.fn()
  })),
  Notification: jest.fn().mockImplementation(() => ({
    show: jest.fn(),
    on: jest.fn()
  })),
  dialog: {
    showOpenDialog: jest.fn().mockResolvedValue({ canceled: true }),
    showSaveDialog: jest.fn().mockResolvedValue({ canceled: true }),
    showMessageBox: jest.fn().mockResolvedValue({ response: 0 })
  }
}), { virtual: true });

// Mock node-fetch for HTTP requests
jest.mock('node-fetch', () => {
  return jest.fn().mockImplementation((url) => {
    // Mock successful responses for test URLs
    if (url.includes('youtube.com') || url.includes('googleapis.com')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ kind: 'youtube#searchListResponse', items: [] }),
        text: () => Promise.resolve('Mock response'),
        headers: new Map([['content-type', 'application/json']])
      });
    }
    
    // Mock error responses for malicious URLs
    if (url.includes('malicious.com') || url.includes('badssl.com')) {
      return Promise.reject(new Error('Network request blocked'));
    }
    
    // Default mock response
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('Mock response'),
      headers: new Map()
    });
  });
});

// Mock YouTube API
jest.mock('youtubei.js', () => {
  return jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue({
      items: [
        {
          id: { videoId: 'mock-video-id' },
          snippet: {
            title: 'Mock Video Title',
            description: 'Mock video description',
            channelId: 'mock-channel-id',
            channelTitle: 'Mock Channel'
          }
        }
      ]
    }),
    getChannel: jest.fn().mockResolvedValue({
      id: 'mock-channel-id',
      snippet: {
        title: 'Mock Channel',
        description: 'Mock channel description'
      }
    }),
    getVideo: jest.fn().mockResolvedValue({
      id: 'mock-video-id',
      snippet: {
        title: 'Mock Video',
        description: 'Mock video description'
      }
    })
  }));
});

// Mock youtube-transcript
jest.mock('youtube-transcript', () => ({
  YoutubeTranscript: {
    fetchTranscript: jest.fn().mockResolvedValue([
      { text: 'Mock transcript segment 1', start: 0, duration: 5 },
      { text: 'Mock transcript segment 2', start: 5, duration: 5 },
      { text: 'Mock transcript segment 3', start: 10, duration: 5 }
    ])
  }
}));

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: {
      create: jest.fn().mockResolvedValue({
        data: [{
          embedding: Array.from({ length: 1536 }, () => Math.random() - 0.5)
        }]
      })
    },
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'Mock AI response for testing purposes.'
            }
          }]
        })
      }
    }
  }));
});

// Mock vector database (Upstash)
jest.mock('@upstash/vector', () => ({
  Index: jest.fn().mockImplementation(() => ({
    upsert: jest.fn().mockResolvedValue({ upserted: 1 }),
    query: jest.fn().mockResolvedValue({
      matches: [
        { id: 'match-1', score: 0.95, metadata: {} },
        { id: 'match-2', score: 0.87, metadata: {} }
      ]
    }),
    delete: jest.fn().mockResolvedValue({ deleted: 1 }),
    info: jest.fn().mockResolvedValue({
      vectorCount: 1000,
      pendingVectorCount: 0,
      indexSize: 1024000
    })
  }))
}));

// Mock better-sqlite3
jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => {
    const mockDB = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
        get: jest.fn().mockReturnValue(null),
        all: jest.fn().mockReturnValue([]),
        finalize: jest.fn()
      }),
      exec: jest.fn(),
      close: jest.fn(),
      pragma: jest.fn(),
      transaction: jest.fn().mockImplementation((fn) => {
        return (...args) => fn.apply(null, args);
      })
    };
    return mockDB;
  });
});

// Global test helpers
global.testHelpers = {
  // Create mock document
  createMockDocument: (overrides = {}) => ({
    id: 'test-doc-' + Math.random().toString(36).substr(2, 9),
    title: 'Test Document',
    content: 'This is test content for the document.',
    metadata: {
      createdAt: new Date().toISOString(),
      type: 'test'
    },
    ...overrides
  }),
  
  // Create mock video
  createMockVideo: (overrides = {}) => ({
    id: 'test-video-' + Math.random().toString(36).substr(2, 9),
    title: 'Test Video',
    description: 'This is a test video description.',
    channelId: 'test-channel-id',
    publishedAt: new Date().toISOString(),
    duration: 'PT10M30S',
    viewCount: 1000,
    ...overrides
  }),
  
  // Create mock channel
  createMockChannel: (overrides = {}) => ({
    id: 'UC' + Math.random().toString(36).substr(2, 20),
    title: 'Test Channel',
    description: 'This is a test channel description.',
    subscriberCount: 10000,
    videoCount: 100,
    publishedAt: new Date().toISOString(),
    ...overrides
  }),
  
  // Wait for condition
  waitFor: async (condition, timeout = 5000, interval = 100) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('Condition not met within timeout');
  },
  
  // Mock file system operations
  mockFileSystem: {
    createTempDir: () => {
      const tempDir = path.join(__dirname, 'temp', Math.random().toString(36).substr(2, 9));
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      return tempDir;
    },
    
    cleanupTempDir: (dir) => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
};

// Error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process in tests, just log the error
});

// Cleanup function for after each test
aftereachEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Reset modules
  jest.resetModules();
  
  // Clean up any global state
  if (global.gc) {
    global.gc();
  }
});

// Global teardown
afterAll(() => {
  // Restore original console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  
  // Clean up any remaining resources
  if (global.gc) {
    global.gc();
  }
});

console.log('Jest setup completed for desktop application testing');

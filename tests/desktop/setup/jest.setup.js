const { app, BrowserWindow } = require('electron');
const mockIpc = require('electron-mock-ipc');

// Global test timeout
jest.setTimeout(30000);

// Mock Electron APIs
beforeAll(() => {
  // Mock app module
  Object.defineProperty(app, 'isReady', {
    value: jest.fn().mockReturnValue(true),
    writable: true
  });
  
  Object.defineProperty(app, 'whenReady', {
    value: jest.fn().mockResolvedValue(undefined),
    writable: true
  });
  
  Object.defineProperty(app, 'quit', {
    value: jest.fn(),
    writable: true
  });
  
  Object.defineProperty(app, 'getPath', {
    value: jest.fn().mockImplementation((name) => {
      const paths = {
        'userData': '/tmp/test-user-data',
        'downloads': '/tmp/test-downloads',
        'documents': '/tmp/test-documents',
        'appData': '/tmp/test-app-data'
      };
      return paths[name] || '/tmp/test';
    }),
    writable: true
  });
  
  // Mock BrowserWindow
  Object.defineProperty(BrowserWindow, 'getAllWindows', {
    value: jest.fn().mockReturnValue([]),
    writable: true
  });
  
  // Initialize mock IPC
  mockIpc.createMockIpc();
});

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
  mockIpc.clearAll();
});

// Global error handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in test:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Helper functions for tests
global.testHelpers = {
  createMockWindow: (options = {}) => {
    return {
      loadURL: jest.fn().mockResolvedValue(undefined),
      show: jest.fn(),
      close: jest.fn(),
      destroy: jest.fn(),
      webContents: {
        send: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        executeJavaScript: jest.fn().mockResolvedValue(undefined)
      },
      on: jest.fn(),
      once: jest.fn(),
      ...options
    };
  },
  
  waitForEvent: (emitter, event, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Event '${event}' did not fire within ${timeout}ms`));
      }, timeout);
      
      emitter.once(event, (...args) => {
        clearTimeout(timer);
        resolve(args);
      });
    });
  },
  
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};
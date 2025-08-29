const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const request = require('supertest');
const WebSocket = require('ws');

// Mock electron modules for testing
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(),
    quit: jest.fn(),
    on: jest.fn(),
    getPath: jest.fn().mockReturnValue('/tmp/test-app'),
    isReady: jest.fn().mockReturnValue(true)
  },
  BrowserWindow: jest.fn(),
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
    openExternal: jest.fn()
  }
}));

// Import after mocking
const MainProcess = require('../../../desktop/src/main');
const IPCManager = require('../../../desktop/src/ipcManager');
const WindowManager = require('../../../desktop/src/windowManager');
const server = require('../../../src/api/server');

describe('Desktop UI-Backend Integration Tests', () => {
  let mainWindow;
  let backendServer;
  let ipcManager;
  let windowManager;
  const TEST_PORT = 3012;
  const BACKEND_URL = `http://localhost:${TEST_PORT}`;

  beforeAll(async () => {
    // Start backend server
    process.env.NODE_ENV = 'test';
    process.env.PORT = TEST_PORT;
    backendServer = spawn('node', [path.join(__dirname, '../../../src/api/server.js')], {
      env: { ...process.env, PORT: TEST_PORT },
      stdio: 'pipe'
    });
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Setup desktop components
    windowManager = new WindowManager();
    ipcManager = new IPCManager(windowManager);
    
    // Mock main window
    mainWindow = {
      webContents: {
        send: jest.fn(),
        executeJavaScript: jest.fn().mockResolvedValue(),
        on: jest.fn()
      },
      on: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      close: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false)
    };
    
    BrowserWindow.mockImplementation(() => mainWindow);
  });

  afterAll(async () => {
    if (backendServer) {
      backendServer.kill('SIGTERM');
    }
    if (ipcManager) {
      ipcManager.cleanup();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('IPC Communication', () => {
    it('should handle project creation from UI to backend', async () => {
      const projectData = {
        name: 'Test Project',
        description: 'Integration test project',
        type: 'youtube',
        settings: {
          maxVideos: 100,
          includeTranscripts: true
        }
      };
      
      // Mock IPC handler
      const mockResponse = { success: true, projectId: 'proj-123' };
      ipcMain.handle.mockImplementation((channel, handler) => {
        if (channel === 'create-project') {
          return handler(null, projectData);
        }
      });
      
      // Simulate backend API call
      const backendResponse = await request(BACKEND_URL)
        .post('/api/projects')
        .send(projectData)
        .expect(201);
      
      expect(backendResponse.body).toMatchObject({
        success: true,
        project: expect.objectContaining({
          name: projectData.name,
          id: expect.any(String)
        })
      });
      
      // Verify IPC communication
      expect(ipcMain.handle).toHaveBeenCalledWith('create-project', expect.any(Function));
    });

    it('should handle YouTube channel indexing with progress updates', async () => {
      const channelData = {
        channelId: 'UCTestChannelId',
        projectId: 'proj-123',
        options: {
          maxVideos: 50,
          includeShorts: false
        }
      };
      
      // Mock progress updates
      const progressUpdates = [];
      mainWindow.webContents.send.mockImplementation((event, data) => {
        if (event === 'indexing-progress') {
          progressUpdates.push(data);
        }
      });
      
      // Start indexing via IPC
      ipcMain.handle.mockImplementation((channel, handler) => {
        if (channel === 'start-indexing') {
          return handler(null, channelData);
        }
      });
      
      // Simulate backend indexing process
      const indexingResponse = await request(BACKEND_URL)
        .post('/api/indexing/start')
        .send(channelData)
        .expect(200);
      
      expect(indexingResponse.body).toMatchObject({
        success: true,
        message: 'Indexing started',
        jobId: expect.any(String)
      });
      
      // Wait for progress updates
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify progress was communicated to UI
      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        'indexing-progress',
        expect.objectContaining({
          channelId: channelData.channelId,
          progress: expect.any(Number)
        })
      );
    });

    it('should handle RAG queries with real-time results', async () => {
      const queryData = {
        query: 'What is machine learning?',
        projectId: 'proj-123',
        options: {
          maxResults: 10,
          includeTranscripts: true
        }
      };
      
      // Mock IPC query handler
      const mockResults = {
        results: [
          { id: '1', content: 'ML is...', score: 0.95, source: 'video1' },
          { id: '2', content: 'Machine learning...', score: 0.87, source: 'video2' }
        ],
        totalResults: 2,
        processingTime: 150
      };
      
      ipcMain.handle.mockImplementation((channel, handler) => {
        if (channel === 'rag-query') {
          return handler(null, queryData);
        }
      });
      
      // Execute query via backend
      const queryResponse = await request(BACKEND_URL)
        .post('/api/rag/query')
        .send(queryData)
        .expect(200);
      
      expect(queryResponse.body).toMatchObject({
        success: true,
        results: expect.arrayContaining([
          expect.objectContaining({
            content: expect.any(String),
            score: expect.any(Number)
          })
        ])
      });
      
      // Verify results sent to UI
      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        'query-results',
        expect.objectContaining({
          results: expect.any(Array),
          query: queryData.query
        })
      );
    });

    it('should handle file drag-and-drop operations', async () => {
      const droppedFiles = [
        '/path/to/document1.pdf',
        '/path/to/document2.txt',
        '/path/to/document3.docx'
      ];
      
      // Mock file drop IPC handler
      ipcMain.handle.mockImplementation((channel, handler) => {
        if (channel === 'process-dropped-files') {
          return handler(null, { files: droppedFiles, projectId: 'proj-123' });
        }
      });
      
      // Simulate file processing
      const fileResponse = await request(BACKEND_URL)
        .post('/api/documents/bulk-upload')
        .send({ files: droppedFiles, projectId: 'proj-123' })
        .expect(200);
      
      expect(fileResponse.body).toMatchObject({
        success: true,
        processed: droppedFiles.length,
        results: expect.arrayContaining([
          expect.objectContaining({
            file: expect.any(String),
            status: 'processed'
          })
        ])
      });
    });
  });

  describe('Real-time Communication', () => {
    let wsClient;
    
    beforeEach(() => {
      // Setup WebSocket client for real-time communication
      wsClient = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
    });
    
    afterEach(() => {
      if (wsClient) {
        wsClient.close();
      }
    });

    it('should handle real-time indexing progress via WebSocket', (done) => {
      const expectedUpdates = ['starting', 'processing', 'completed'];
      let updateCount = 0;
      
      wsClient.on('open', () => {
        // Start indexing process
        request(BACKEND_URL)
          .post('/api/indexing/start')
          .send({ channelId: 'UCTestChannel', projectId: 'proj-123' })
          .end(() => {});
      });
      
      wsClient.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'indexing-progress') {
          expect(message.data).toMatchObject({
            channelId: expect.any(String),
            status: expect.any(String),
            progress: expect.any(Number)
          });
          
          updateCount++;
          if (updateCount >= expectedUpdates.length) {
            done();
          }
        }
      });
      
      wsClient.on('error', done);
    });

    it('should handle system notifications', (done) => {
      wsClient.on('open', () => {
        // Trigger system notification
        request(BACKEND_URL)
          .post('/api/system/notify')
          .send({ 
            type: 'info', 
            message: 'Test notification',
            targetWindow: 'main'
          })
          .end(() => {});
      });
      
      wsClient.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'system-notification') {
          expect(message.data).toMatchObject({
            type: 'info',
            message: 'Test notification'
          });
          done();
        }
      });
    });
  });

  describe('Error Handling & Recovery', () => {
    it('should handle backend disconnection gracefully', async () => {
      // Simulate backend server crash
      if (backendServer) {
        backendServer.kill('SIGKILL');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // IPC should handle connection errors
      ipcMain.handle.mockImplementation((channel, handler) => {
        if (channel === 'check-backend-status') {
          return handler(null, {});
        }
      });
      
      // Verify error handling in UI
      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        'backend-disconnected',
        expect.objectContaining({
          error: expect.any(String),
          timestamp: expect.any(String)
        })
      );
    });

    it('should handle invalid IPC messages', async () => {
      const invalidMessage = {
        // Missing required fields
        incomplete: true
      };
      
      ipcMain.handle.mockImplementation((channel, handler) => {
        if (channel === 'invalid-request') {
          return handler(null, invalidMessage);
        }
      });
      
      // Should not crash and should return appropriate error
      const response = await ipcManager.handleRequest('invalid-request', invalidMessage);
      
      expect(response).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid request format')
      });
    });

    it('should handle UI freeze scenarios', async () => {
      // Simulate long-running operation
      const longOperation = {
        operation: 'heavy-processing',
        data: { size: 'large' }
      };
      
      ipcMain.handle.mockImplementation((channel, handler) => {
        if (channel === 'heavy-processing') {
          // Simulate long delay
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({ success: true, result: 'completed' });
            }, 100); // Shortened for test
          });
        }
      });
      
      const startTime = Date.now();
      const result = await ipcManager.handleRequest('heavy-processing', longOperation);
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(200); // Should complete reasonably quickly
    });
  });

  describe('Data Synchronization', () => {
    it('should sync project data between UI and backend', async () => {
      const projectId = 'sync-test-project';
      
      // Create project via backend
      const createResponse = await request(BACKEND_URL)
        .post('/api/projects')
        .send({ name: 'Sync Test', id: projectId })
        .expect(201);
      
      // Verify project appears in UI
      ipcMain.handle.mockImplementation((channel, handler) => {
        if (channel === 'get-projects') {
          return handler(null, {});
        }
      });
      
      const uiProjects = await ipcManager.handleRequest('get-projects', {});
      
      expect(uiProjects.projects).toContainEqual(
        expect.objectContaining({
          id: projectId,
          name: 'Sync Test'
        })
      );
    });

    it('should handle concurrent data modifications', async () => {
      const channelId = 'UCConcurrentTest';
      
      // Simulate concurrent operations
      const operations = [
        request(BACKEND_URL).post('/api/channels').send({ id: channelId, name: 'Test Channel' }),
        request(BACKEND_URL).put(`/api/channels/${channelId}`).send({ status: 'processing' }),
        request(BACKEND_URL).patch(`/api/channels/${channelId}`).send({ videoCount: 100 })
      ];
      
      const results = await Promise.allSettled(operations);
      
      // At least one operation should succeed
      expect(results.some(r => r.status === 'fulfilled')).toBe(true);
      
      // Verify final state is consistent
      const finalState = await request(BACKEND_URL)
        .get(`/api/channels/${channelId}`)
        .expect(200);
      
      expect(finalState.body.channel).toMatchObject({
        id: channelId,
        name: 'Test Channel'
      });
    });
  });

  describe('Performance & Resource Management', () => {
    it('should handle memory-intensive operations without leaks', async () => {
      const initialMemory = process.memoryUsage();
      
      // Simulate memory-intensive operation
      const heavyData = {
        operation: 'bulk-indexing',
        data: Array.from({ length: 10000 }, (_, i) => ({
          id: `item-${i}`,
          content: `Large content block ${i}`.repeat(100)
        }))
      };
      
      await request(BACKEND_URL)
        .post('/api/bulk-process')
        .send(heavyData)
        .expect(200);
      
      // Force garbage collection and check memory
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });

    it('should handle high-frequency IPC messages', async () => {
      const messageCount = 1000;
      const messages = Array.from({ length: messageCount }, (_, i) => ({
        id: i,
        type: 'ping',
        timestamp: Date.now()
      }));
      
      const startTime = Date.now();
      
      // Send messages rapidly
      const promises = messages.map(msg => 
        ipcManager.handleRequest('ping', msg)
      );
      
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(messageCount);
      expect(results.every(r => r.success)).toBe(true);
      expect(duration).toBeLessThan(5000); // Should handle 1000 messages in under 5 seconds
    });
  });

  describe('Security & Validation', () => {
    it('should validate IPC message origins', async () => {
      const maliciousMessage = {
        channel: 'system-command',
        data: {
          command: 'rm -rf /', // Dangerous command
          execute: true
        }
      };
      
      // IPC should reject dangerous commands
      const result = await ipcManager.handleRequest('system-command', maliciousMessage);
      
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('Unauthorized operation')
      });
    });

    it('should sanitize user inputs in IPC communications', async () => {
      const unsafeInput = {
        query: '<script>alert("xss")</script>What is AI?',
        projectId: 'test-project'
      };
      
      const result = await ipcManager.handleRequest('rag-query', unsafeInput);
      
      // Input should be sanitized before processing
      expect(result.data.sanitizedQuery).not.toContain('<script>');
      expect(result.data.sanitizedQuery).toContain('What is AI?');
    });

    it('should enforce rate limiting on IPC calls', async () => {
      const rapidRequests = Array.from({ length: 100 }, () => 
        ipcManager.handleRequest('rate-limited-endpoint', {})
      );
      
      const results = await Promise.allSettled(rapidRequests);
      
      // Some requests should be rate limited
      const rateLimited = results.filter(r => 
        r.status === 'fulfilled' && 
        r.value.error && 
        r.value.error.includes('rate limit')
      );
      
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});

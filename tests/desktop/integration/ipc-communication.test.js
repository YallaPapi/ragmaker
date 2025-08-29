const { app, BrowserWindow, ipcMain, ipcRenderer } = require('electron');
const mockIpc = require('electron-mock-ipc');

describe('IPC Communication Integration Tests', () => {
  let mainWindow;
  let mockRenderer;

  beforeEach(async () => {
    // Create mock window
    mainWindow = global.testHelpers.createMockWindow();
    
    // Setup mock renderer
    mockRenderer = mockIpc.createMockRenderer();
    
    // Wait for app to be ready
    await app.whenReady();
  });

  afterEach(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
    mockIpc.clearAll();
  });

  describe('Bidirectional Communication', () => {
    test('should send message from main to renderer', async () => {
      const testMessage = { type: 'TEST', data: 'Hello from main' };
      
      // Setup renderer listener
      const rendererCallback = jest.fn();
      mockRenderer.on('main-to-renderer', rendererCallback);
      
      // Send from main
      mainWindow.webContents.send('main-to-renderer', testMessage);
      
      // Verify message received
      expect(rendererCallback).toHaveBeenCalledWith(
        expect.any(Object), // event
        testMessage
      );
    });

    test('should handle invoke/handle pattern', async () => {
      const testData = { query: 'test search' };
      const mockResponse = { results: ['item1', 'item2'] };
      
      // Setup main handler
      ipcMain.handle('search-documents', async (event, data) => {
        expect(data).toEqual(testData);
        return mockResponse;
      });
      
      // Invoke from renderer
      const result = await mockRenderer.invoke('search-documents', testData);
      
      expect(result).toEqual(mockResponse);
    });

    test('should handle multiple concurrent invocations', async () => {
      let callCount = 0;
      
      ipcMain.handle('async-operation', async (event, delay) => {
        callCount++;
        await global.testHelpers.sleep(delay);
        return { id: callCount, delay };
      });
      
      // Make concurrent calls
      const promises = [
        mockRenderer.invoke('async-operation', 100),
        mockRenderer.invoke('async-operation', 50),
        mockRenderer.invoke('async-operation', 75)
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      expect(results.map(r => r.id)).toEqual([1, 2, 3]);
    });
  });

  describe('File Operations IPC', () => {
    test('should handle file read requests', async () => {
      const mockFileContent = 'Test file content';
      const filePath = '/test/path/file.txt';
      
      ipcMain.handle('read-file', async (event, path) => {
        // Mock file system operation
        if (path === filePath) {
          return { success: true, content: mockFileContent };
        }
        return { success: false, error: 'File not found' };
      });
      
      const result = await mockRenderer.invoke('read-file', filePath);
      
      expect(result).toEqual({
        success: true,
        content: mockFileContent
      });
    });

    test('should handle file write requests', async () => {
      const filePath = '/test/path/output.txt';
      const content = 'Content to write';
      
      ipcMain.handle('write-file', async (event, path, data) => {
        // Mock file write operation
        return { 
          success: true, 
          path,
          bytesWritten: data.length 
        };
      });
      
      const result = await mockRenderer.invoke('write-file', filePath, content);
      
      expect(result).toEqual({
        success: true,
        path: filePath,
        bytesWritten: content.length
      });
    });
  });

  describe('Database Operations IPC', () => {
    test('should handle database queries', async () => {
      const mockResults = [
        { id: 1, title: 'Document 1' },
        { id: 2, title: 'Document 2' }
      ];
      
      ipcMain.handle('database-query', async (event, query, params) => {
        // Mock database operation
        if (query.includes('SELECT')) {
          return { success: true, results: mockResults };
        }
        return { success: false, error: 'Invalid query' };
      });
      
      const result = await mockRenderer.invoke('database-query', 
        'SELECT * FROM documents', []
      );
      
      expect(result).toEqual({
        success: true,
        results: mockResults
      });
    });

    test('should handle database transactions', async () => {
      let transactionState = 'idle';
      
      ipcMain.handle('database-transaction', async (event, operations) => {
        transactionState = 'running';
        
        try {
          // Mock transaction operations
          for (const op of operations) {
            if (op.type === 'INSERT') {
              // Mock insert
            } else if (op.type === 'UPDATE') {
              // Mock update
            }
          }
          
          transactionState = 'committed';
          return { success: true, operations: operations.length };
        } catch (error) {
          transactionState = 'failed';
          return { success: false, error: error.message };
        }
      });
      
      const operations = [
        { type: 'INSERT', table: 'documents', data: { title: 'New Doc' } },
        { type: 'UPDATE', table: 'documents', id: 1, data: { title: 'Updated' } }
      ];
      
      const result = await mockRenderer.invoke('database-transaction', operations);
      
      expect(result).toEqual({
        success: true,
        operations: 2
      });
      expect(transactionState).toBe('committed');
    });
  });

  describe('Error Handling', () => {
    test('should handle IPC errors gracefully', async () => {
      ipcMain.handle('error-operation', async () => {
        throw new Error('Simulated error');
      });
      
      await expect(
        mockRenderer.invoke('error-operation')
      ).rejects.toThrow('Simulated error');
    });

    test('should handle timeout scenarios', async () => {
      jest.setTimeout(10000);
      
      ipcMain.handle('slow-operation', async () => {
        await global.testHelpers.sleep(5000);
        return 'completed';
      });
      
      // This should timeout before completion
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), 2000);
      });
      
      await expect(
        Promise.race([
          mockRenderer.invoke('slow-operation'),
          timeoutPromise
        ])
      ).rejects.toThrow('Operation timeout');
    });

    test('should validate IPC message format', async () => {
      ipcMain.handle('validate-message', async (event, message) => {
        if (!message || typeof message !== 'object') {
          throw new Error('Invalid message format');
        }
        
        if (!message.type || !message.data) {
          throw new Error('Missing required fields');
        }
        
        return { valid: true };
      });
      
      // Valid message
      const validResult = await mockRenderer.invoke('validate-message', {
        type: 'TEST',
        data: { value: 123 }
      });
      
      expect(validResult).toEqual({ valid: true });
      
      // Invalid message
      await expect(
        mockRenderer.invoke('validate-message', 'invalid')
      ).rejects.toThrow('Invalid message format');
    });
  });

  describe('Performance', () => {
    test('should handle high-frequency IPC calls', async () => {
      let callCount = 0;
      
      ipcMain.handle('counter', async () => {
        return ++callCount;
      });
      
      // Make many rapid calls
      const promises = Array.from({ length: 100 }, (_, i) =>
        mockRenderer.invoke('counter')
      );
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(100);
      expect(callCount).toBe(100);
      expect(results[99]).toBe(100); // Last call should have highest count
    });

    test('should measure IPC call latency', async () => {
      ipcMain.handle('ping', async () => {
        return Date.now();
      });
      
      const startTime = Date.now();
      const serverTime = await mockRenderer.invoke('ping');
      const endTime = Date.now();
      
      const latency = endTime - startTime;
      
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(100); // Should be fast in tests
    });
  });
});
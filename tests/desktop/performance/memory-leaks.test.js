const { app, BrowserWindow, webContents } = require('electron');

describe('Memory Leak Detection and Performance Tests', () => {
  let mainWindow;
  const initialMemory = process.memoryUsage();

  beforeEach(async () => {
    mainWindow = global.testHelpers.createMockWindow();
    await app.whenReady();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  afterEach(async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
      mainWindow = null;
    }
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
    
    await global.testHelpers.sleep(100);
  });

  describe('Memory Usage Monitoring', () => {
    test('should not leak memory when creating and destroying windows', async () => {
      const iterations = 50;
      const memoryMeasurements = [];
      
      for (let i = 0; i < iterations; i++) {
        // Create window
        const testWindow = global.testHelpers.createMockWindow();
        
        // Simulate window usage
        await global.testHelpers.sleep(10);
        
        // Destroy window
        testWindow.close();
        
        // Measure memory every 10 iterations
        if (i % 10 === 0) {
          if (global.gc) global.gc();
          const memory = process.memoryUsage();
          memoryMeasurements.push({
            iteration: i,
            heapUsed: memory.heapUsed,
            heapTotal: memory.heapTotal,
            external: memory.external
          });
        }
      }
      
      // Analyze memory growth
      const firstMeasurement = memoryMeasurements[0];
      const lastMeasurement = memoryMeasurements[memoryMeasurements.length - 1];
      
      const heapGrowth = lastMeasurement.heapUsed - firstMeasurement.heapUsed;
      const heapGrowthMB = heapGrowth / (1024 * 1024);
      
      console.log(`Memory measurements:`, memoryMeasurements);
      console.log(`Heap growth: ${heapGrowthMB.toFixed(2)} MB`);
      
      // Memory growth should be minimal (less than 10MB)
      expect(heapGrowthMB).toBeLessThan(10);
    });

    test('should handle large document processing without memory explosion', async () => {
      const documentSizes = [1, 5, 10, 25, 50]; // MB
      const memoryBeforeProcessing = process.memoryUsage().heapUsed;
      
      for (const size of documentSizes) {
        // Simulate processing large document
        const largeDocument = {
          id: `doc-${size}mb`,
          content: 'A'.repeat(size * 1024 * 1024), // size in MB
          metadata: {
            size: size * 1024 * 1024,
            processedAt: new Date()
          }
        };
        
        // Simulate document processing
        await mainWindow.webContents.executeJavaScript(`
          window.testProcessDocument(${JSON.stringify({
            id: largeDocument.id,
            size: largeDocument.metadata.size
          })});
        `);
        
        // Force cleanup
        if (global.gc) global.gc();
        
        const currentMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = (currentMemory - memoryBeforeProcessing) / (1024 * 1024);
        
        console.log(`Processing ${size}MB document - Memory increase: ${memoryIncrease.toFixed(2)}MB`);
        
        // Memory increase should be proportional but not excessive
        expect(memoryIncrease).toBeLessThan(size * 3); // Max 3x the document size
      }
    });

    test('should clean up event listeners properly', async () => {
      const eventCounts = {
        before: 0,
        after: 0
      };
      
      // Count initial event listeners
      eventCounts.before = mainWindow.webContents.listenerCount('did-finish-load') +
                           mainWindow.webContents.listenerCount('dom-ready') +
                           mainWindow.listenerCount('closed');
      
      // Add and remove many event listeners
      for (let i = 0; i < 100; i++) {
        const handler = () => {};
        
        mainWindow.on('focus', handler);
        mainWindow.webContents.on('did-finish-load', handler);
        
        // Remove listeners
        mainWindow.removeListener('focus', handler);
        mainWindow.webContents.removeListener('did-finish-load', handler);
      }
      
      // Count final event listeners
      eventCounts.after = mainWindow.webContents.listenerCount('did-finish-load') +
                         mainWindow.webContents.listenerCount('dom-ready') +
                         mainWindow.listenerCount('closed');
      
      // Should not have accumulated listeners
      expect(eventCounts.after).toBeLessThanOrEqual(eventCounts.before + 5);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should maintain responsive UI during heavy operations', async () => {
      const responseTimeThreshold = 100; // ms
      const testIterations = 20;
      const responseTimes = [];
      
      for (let i = 0; i < testIterations; i++) {
        const startTime = Date.now();
        
        // Simulate heavy operation
        await mainWindow.webContents.executeJavaScript(`
          new Promise((resolve) => {
            // Simulate CPU-intensive task
            const start = Date.now();
            while (Date.now() - start < 50) {
              Math.sqrt(Math.random() * 1000000);
            }
            resolve();
          });
        `);
        
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }
      
      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      
      console.log(`Average response time: ${averageResponseTime.toFixed(2)}ms`);
      console.log(`Max response time: ${maxResponseTime}ms`);
      
      expect(averageResponseTime).toBeLessThan(responseTimeThreshold);
      expect(maxResponseTime).toBeLessThan(responseTimeThreshold * 2);
    });

    test('should handle concurrent operations efficiently', async () => {
      const concurrentOperations = 10;
      const operationDuration = 100; // ms
      
      const startTime = Date.now();
      
      // Run concurrent operations
      const operations = Array.from({ length: concurrentOperations }, async (_, i) => {
        return await mainWindow.webContents.executeJavaScript(`
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({ 
                operation: ${i}, 
                result: Math.random() * 1000,
                timestamp: Date.now()
              });
            }, ${operationDuration});
          });
        `);
      });
      
      const results = await Promise.all(operations);
      const totalTime = Date.now() - startTime;
      
      // Concurrent operations should complete faster than sequential
      expect(totalTime).toBeLessThan(operationDuration * concurrentOperations);
      expect(results).toHaveLength(concurrentOperations);
      
      // All operations should complete
      results.forEach((result, index) => {
        expect(result.operation).toBe(index);
        expect(result.result).toBeGreaterThan(0);
      });
    });

    test('should optimize database query performance', async () => {
      const queryTypes = ['simple', 'complex', 'aggregation'];
      const performanceMetrics = {};
      
      for (const queryType of queryTypes) {
        const iterations = 10;
        const queryTimes = [];
        
        for (let i = 0; i < iterations; i++) {
          const startTime = Date.now();
          
          // Simulate database query
          await mainWindow.webContents.executeJavaScript(`
            window.mockDatabase.query('${queryType}', { 
              limit: 100,
              offset: ${i * 100}
            });
          `);
          
          const queryTime = Date.now() - startTime;
          queryTimes.push(queryTime);
        }
        
        performanceMetrics[queryType] = {
          average: queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length,
          min: Math.min(...queryTimes),
          max: Math.max(...queryTimes)
        };
      }
      
      console.log('Query performance metrics:', performanceMetrics);
      
      // Simple queries should be fast
      expect(performanceMetrics.simple.average).toBeLessThan(50);
      
      // Complex queries should still be reasonable
      expect(performanceMetrics.complex.average).toBeLessThan(200);
      
      // Aggregation queries may be slower but bounded
      expect(performanceMetrics.aggregation.average).toBeLessThan(500);
    });
  });

  describe('Resource Usage Monitoring', () => {
    test('should monitor CPU usage during operations', async () => {
      const cpuUsageBeforeTest = process.cpuUsage();
      
      // Simulate CPU-intensive operations
      for (let i = 0; i < 5; i++) {
        await mainWindow.webContents.executeJavaScript(`
          // CPU-intensive calculation
          for (let j = 0; j < 1000000; j++) {
            Math.sqrt(j);
          }
        `);
        
        await global.testHelpers.sleep(100);
      }
      
      const cpuUsageAfterTest = process.cpuUsage(cpuUsageBeforeTest);
      const userTimeMs = cpuUsageAfterTest.user / 1000;
      const systemTimeMs = cpuUsageAfterTest.system / 1000;
      
      console.log(`CPU Usage - User: ${userTimeMs}ms, System: ${systemTimeMs}ms`);
      
      // CPU usage should be reasonable
      expect(userTimeMs + systemTimeMs).toBeLessThan(5000); // Less than 5 seconds
    });

    test('should monitor file handle usage', async () => {
      const initialHandles = process.getActiveResourcesInfo();
      
      // Simulate file operations
      const fileOperations = [];
      for (let i = 0; i < 20; i++) {
        fileOperations.push(
          mainWindow.webContents.executeJavaScript(`
            window.mockFileSystem.readFile('test-file-${i}.txt');
          `)
        );
      }
      
      await Promise.all(fileOperations);
      
      const finalHandles = process.getActiveResourcesInfo();
      
      console.log('Resource handles:', { 
        initial: initialHandles.length, 
        final: finalHandles.length 
      });
      
      // File handles should not accumulate excessively
      const handleIncrease = finalHandles.length - initialHandles.length;
      expect(handleIncrease).toBeLessThan(10);
    });

    test('should detect WebContents leaks', async () => {
      const initialWebContents = webContents.getAllWebContents().length;
      
      // Create and destroy multiple WebContents
      const webContentsList = [];
      
      for (let i = 0; i < 10; i++) {
        const window = global.testHelpers.createMockWindow();
        webContentsList.push(window.webContents);
        
        // Simulate usage
        await global.testHelpers.sleep(10);
        
        // Destroy window
        window.close();
      }
      
      // Force cleanup
      if (global.gc) global.gc();
      await global.testHelpers.sleep(100);
      
      const finalWebContents = webContents.getAllWebContents().length;
      
      console.log('WebContents count:', { 
        initial: initialWebContents, 
        final: finalWebContents 
      });
      
      // Should not leak WebContents
      expect(finalWebContents).toBeLessThanOrEqual(initialWebContents + 2);
    });
  });

  describe('Long-Running Performance', () => {
    test('should maintain performance over extended usage', async () => {
      const testDuration = 30000; // 30 seconds
      const startTime = Date.now();
      const performanceSamples = [];
      
      while (Date.now() - startTime < testDuration) {
        const operationStart = Date.now();
        
        // Simulate typical application operations
        await mainWindow.webContents.executeJavaScript(`
          // Simulate search operation
          window.mockSearch('performance test query');
        `);
        
        const operationTime = Date.now() - operationStart;
        performanceSamples.push({
          timestamp: Date.now() - startTime,
          operationTime,
          memoryUsage: process.memoryUsage().heapUsed
        });
        
        await global.testHelpers.sleep(1000); // 1 second intervals
      }
      
      // Analyze performance degradation
      const firstSample = performanceSamples[0];
      const lastSample = performanceSamples[performanceSamples.length - 1];
      
      const performanceDegradation = 
        (lastSample.operationTime - firstSample.operationTime) / firstSample.operationTime;
      
      const memoryGrowth = 
        (lastSample.memoryUsage - firstSample.memoryUsage) / (1024 * 1024);
      
      console.log(`Performance degradation: ${(performanceDegradation * 100).toFixed(2)}%`);
      console.log(`Memory growth: ${memoryGrowth.toFixed(2)} MB`);
      
      // Performance should not degrade significantly
      expect(performanceDegradation).toBeLessThan(0.5); // Less than 50% degradation
      
      // Memory growth should be controlled
      expect(memoryGrowth).toBeLessThan(50); // Less than 50MB growth
    });
  });
});
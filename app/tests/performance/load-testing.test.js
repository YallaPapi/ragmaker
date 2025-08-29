const { performance } = require('perf_hooks');
const cluster = require('cluster');
const os = require('os');
const { RAGService } = require('../../../src/services/rag');
const { YouTubeService } = require('../../../src/services/youtube');
const { DatabaseService } = require('../../../src/services/database');
const { VectorStore } = require('../../../src/services/vectorStore');

describe('Performance & Load Testing', () => {
  let ragService;
  let youtubeService;
  let databaseService;
  let vectorStore;

  beforeAll(async () => {
    // Initialize services for performance testing
    databaseService = new DatabaseService({ dbPath: ':memory:' });
    await databaseService.initialize();
    
    vectorStore = new VectorStore({ testMode: true });
    await vectorStore.initialize();
    
    ragService = new RAGService({
      databaseService,
      vectorStore,
      testMode: true
    });
    
    youtubeService = new YouTubeService({
      databaseService,
      testMode: true
    });
  });

  afterAll(async () => {
    await databaseService.close();
    await vectorStore.close();
  });

  describe('Memory Performance', () => {
    test('should handle large document collections without memory leaks', async () => {
      const initialMemory = process.memoryUsage();
      const documentCount = 10000;
      
      // Generate large document collection
      const documents = Array.from({ length: documentCount }, (_, i) => ({
        id: `doc-${i}`,
        title: `Document ${i}`,
        content: `This is the content for document number ${i}. `.repeat(100), // ~5KB per doc
        metadata: {
          index: i,
          category: i % 10,
          timestamp: new Date().toISOString()
        }
      }));
      
      console.log(`\nProcessing ${documentCount} documents...`);
      const startTime = performance.now();
      
      // Process documents in batches to simulate real-world usage
      const batchSize = 100;
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        await ragService.batchIndexDocuments(batch);
        
        // Check memory usage periodically
        if (i % 1000 === 0) {
          const currentMemory = process.memoryUsage();
          const memoryIncrease = currentMemory.heapUsed - initialMemory.heapUsed;
          console.log(`Batch ${i / batchSize + 1}: Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
          
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
        }
      }
      
      const processingTime = performance.now() - startTime;
      const finalMemory = process.memoryUsage();
      const totalMemoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`Total processing time: ${(processingTime / 1000).toFixed(2)}s`);
      console.log(`Total memory increase: ${(totalMemoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      
      // Performance assertions
      expect(processingTime).toBeLessThan(120000); // Under 2 minutes
      expect(totalMemoryIncrease).toBeLessThan(500 * 1024 * 1024); // Under 500MB increase
      
      // Test memory cleanup
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const cleanedMemory = process.memoryUsage();
        const memoryAfterGC = cleanedMemory.heapUsed - initialMemory.heapUsed;
        
        expect(memoryAfterGC).toBeLessThan(totalMemoryIncrease * 0.8); // At least 20% cleanup
      }
    }, 300000); // 5 minute timeout

    test('should handle memory-intensive search operations', async () => {
      const initialMemory = process.memoryUsage();
      const queryCount = 1000;
      
      // Create complex queries
      const queries = Array.from({ length: queryCount }, (_, i) => 
        `Complex search query number ${i} with multiple terms and conditions ${Math.random().toString(36)}`
      );
      
      console.log(`\nExecuting ${queryCount} search queries...`);
      const startTime = performance.now();
      
      // Execute queries concurrently in batches
      const concurrency = 10;
      const results = [];
      
      for (let i = 0; i < queries.length; i += concurrency) {
        const batch = queries.slice(i, i + concurrency);
        const batchPromises = batch.map(query => ragService.query(query));
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Monitor memory during execution
        if (i % 100 === 0) {
          const currentMemory = process.memoryUsage();
          const memoryIncrease = currentMemory.heapUsed - initialMemory.heapUsed;
          console.log(`Batch ${Math.floor(i / concurrency) + 1}: Memory: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
        }
      }
      
      const totalTime = performance.now() - startTime;
      const finalMemory = process.memoryUsage();
      
      console.log(`Average query time: ${(totalTime / queryCount).toFixed(2)}ms`);
      console.log(`Total memory increase: ${((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)}MB`);
      
      // Performance assertions
      expect(totalTime / queryCount).toBeLessThan(100); // Under 100ms per query
      expect(results).toHaveLength(queryCount);
      expect(finalMemory.heapUsed - initialMemory.heapUsed).toBeLessThan(200 * 1024 * 1024); // Under 200MB increase
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent indexing operations', async () => {
      const concurrentJobs = 5;
      const documentsPerJob = 500;
      
      console.log(`\nRunning ${concurrentJobs} concurrent indexing jobs...`);
      const startTime = performance.now();
      
      // Create concurrent indexing jobs
      const indexingPromises = Array.from({ length: concurrentJobs }, (_, jobIndex) => {
        const documents = Array.from({ length: documentsPerJob }, (_, docIndex) => ({
          id: `job${jobIndex}-doc${docIndex}`,
          title: `Job ${jobIndex} Document ${docIndex}`,
          content: `Content for job ${jobIndex} document ${docIndex}. `.repeat(50)
        }));
        
        return ragService.batchIndexDocuments(documents);
      });
      
      const results = await Promise.all(indexingPromises);
      const totalTime = performance.now() - startTime;
      
      console.log(`Concurrent indexing completed in: ${(totalTime / 1000).toFixed(2)}s`);
      
      // Verify all jobs completed successfully
      expect(results).toHaveLength(concurrentJobs);
      expect(results.every(result => Array.isArray(result) && result.length === documentsPerJob)).toBe(true);
      
      // Performance should be better than sequential processing
      const estimatedSequentialTime = (totalTime / concurrentJobs) * concurrentJobs;
      expect(totalTime).toBeLessThan(estimatedSequentialTime * 0.8); // At least 20% improvement
    });

    test('should handle concurrent search operations under load', async () => {
      const concurrentUsers = 20;
      const queriesPerUser = 50;
      const searchQueries = [
        'machine learning algorithms',
        'artificial intelligence basics',
        'data science fundamentals',
        'neural networks explained',
        'deep learning concepts'
      ];
      
      console.log(`\nSimulating ${concurrentUsers} users with ${queriesPerUser} queries each...`);
      const startTime = performance.now();
      
      // Simulate concurrent users
      const userPromises = Array.from({ length: concurrentUsers }, (_, userIndex) => {
        return Promise.all(
          Array.from({ length: queriesPerUser }, (_, queryIndex) => {
            const query = searchQueries[queryIndex % searchQueries.length];
            return ragService.query(`${query} user${userIndex} query${queryIndex}`);
          })
        );
      });
      
      const allResults = await Promise.all(userPromises);
      const totalTime = performance.now() - startTime;
      const totalQueries = concurrentUsers * queriesPerUser;
      
      console.log(`Processed ${totalQueries} queries in ${(totalTime / 1000).toFixed(2)}s`);
      console.log(`Average response time: ${(totalTime / totalQueries).toFixed(2)}ms`);
      
      // Performance assertions
      expect(allResults).toHaveLength(concurrentUsers);
      expect(allResults.every(userResults => userResults.length === queriesPerUser)).toBe(true);
      expect(totalTime / totalQueries).toBeLessThan(200); // Under 200ms average
    });
  });

  describe('Database Performance', () => {
    test('should handle large database operations efficiently', async () => {
      const recordCount = 50000;
      
      console.log(`\nTesting database performance with ${recordCount} records...`);
      
      // Test bulk insert performance
      const documents = Array.from({ length: recordCount }, (_, i) => ({
        id: `perf-doc-${i}`,
        title: `Performance Test Document ${i}`,
        content: `Content for performance testing document ${i}`,
        metadata: JSON.stringify({ index: i, category: i % 100 })
      }));
      
      const insertStartTime = performance.now();
      await databaseService.bulkSaveDocuments(documents);
      const insertTime = performance.now() - insertStartTime;
      
      console.log(`Bulk insert time: ${(insertTime / 1000).toFixed(2)}s`);
      console.log(`Insert rate: ${(recordCount / (insertTime / 1000)).toFixed(0)} records/sec`);
      
      // Test query performance
      const queryStartTime = performance.now();
      const results = await databaseService.searchDocuments('performance testing', { limit: 100 });
      const queryTime = performance.now() - queryStartTime;
      
      console.log(`Search query time: ${queryTime.toFixed(2)}ms`);
      
      // Test pagination performance
      const paginationTests = [];
      for (let page = 0; page < 10; page++) {
        const pageStartTime = performance.now();
        const pageResults = await databaseService.getDocuments({ 
          limit: 1000, 
          offset: page * 1000 
        });
        const pageTime = performance.now() - pageStartTime;
        paginationTests.push(pageTime);
      }
      
      const avgPaginationTime = paginationTests.reduce((a, b) => a + b, 0) / paginationTests.length;
      console.log(`Average pagination time: ${avgPaginationTime.toFixed(2)}ms`);
      
      // Performance assertions
      expect(insertTime / 1000).toBeLessThan(30); // Under 30 seconds for bulk insert
      expect(queryTime).toBeLessThan(100); // Under 100ms for search
      expect(avgPaginationTime).toBeLessThan(50); // Under 50ms for pagination
      expect(results.length).toBeGreaterThan(0);
    });

    test('should maintain performance with complex queries', async () => {
      const complexQueries = [
        {
          name: 'Full-text search with filters',
          query: () => databaseService.searchDocuments('machine learning', {
            filters: { category: [1, 5, 10] },
            dateRange: { start: '2024-01-01', end: '2024-12-31' },
            limit: 50
          })
        },
        {
          name: 'Aggregation query',
          query: () => databaseService.getAggregatedStats({
            groupBy: ['category'],
            metrics: ['count', 'avg_score'],
            filters: { content_length: { min: 100 } }
          })
        },
        {
          name: 'Join query with sorting',
          query: () => databaseService.getDocumentsWithMetadata({
            sortBy: 'relevance_score',
            order: 'DESC',
            limit: 100,
            includeStats: true
          })
        }
      ];
      
      console.log('\nTesting complex query performance...');
      
      for (const { name, query } of complexQueries) {
        const iterations = 10;
        const times = [];
        
        for (let i = 0; i < iterations; i++) {
          const startTime = performance.now();
          await query();
          times.push(performance.now() - startTime);
        }
        
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        
        console.log(`${name}: avg=${avgTime.toFixed(2)}ms, min=${minTime.toFixed(2)}ms, max=${maxTime.toFixed(2)}ms`);
        
        // All complex queries should complete within reasonable time
        expect(avgTime).toBeLessThan(500); // Under 500ms average
        expect(maxTime).toBeLessThan(1000); // Under 1s worst case
      }
    });
  });

  describe('Vector Store Performance', () => {
    test('should handle large-scale vector operations', async () => {
      const vectorCount = 10000;
      const dimensions = 1536; // OpenAI embedding dimensions
      
      console.log(`\nTesting vector store with ${vectorCount} vectors...`);
      
      // Generate test vectors
      const vectors = Array.from({ length: vectorCount }, (_, i) => ({
        id: `vector-${i}`,
        values: Array.from({ length: dimensions }, () => Math.random() - 0.5),
        metadata: { index: i, category: i % 50 }
      }));
      
      // Test batch upsert performance
      const upsertStartTime = performance.now();
      await vectorStore.batchUpsert(vectors, { batchSize: 100 });
      const upsertTime = performance.now() - upsertStartTime;
      
      console.log(`Vector upsert time: ${(upsertTime / 1000).toFixed(2)}s`);
      console.log(`Upsert rate: ${(vectorCount / (upsertTime / 1000)).toFixed(0)} vectors/sec`);
      
      // Test search performance with different parameters
      const searchTests = [
        { name: 'Top-5 search', topK: 5 },
        { name: 'Top-20 search', topK: 20 },
        { name: 'Top-100 search', topK: 100 },
        { name: 'Filtered search', topK: 10, filter: { category: { $in: [1, 2, 3] } } }
      ];
      
      for (const { name, topK, filter } of searchTests) {
        const queryVector = Array.from({ length: dimensions }, () => Math.random() - 0.5);
        const searchTimes = [];
        
        for (let i = 0; i < 10; i++) {
          const searchStartTime = performance.now();
          const results = await vectorStore.search(queryVector, { 
            topK, 
            filter,
            includeMetadata: true 
          });
          searchTimes.push(performance.now() - searchStartTime);
          
          expect(results.length).toBeLessThanOrEqual(topK);
        }
        
        const avgSearchTime = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
        console.log(`${name}: ${avgSearchTime.toFixed(2)}ms average`);
        
        expect(avgSearchTime).toBeLessThan(100); // Under 100ms for vector search
      }
    });
  });

  describe('Resource Utilization', () => {
    test('should monitor CPU and memory usage under load', async () => {
      const initialStats = {
        cpu: process.cpuUsage(),
        memory: process.memoryUsage()
      };
      
      console.log('\nMonitoring resource usage under load...');
      
      // Create sustained load
      const loadDuration = 30000; // 30 seconds
      const loadInterval = 100; // 100ms intervals
      const statsInterval = 1000; // Collect stats every second
      
      const stats = [];
      const statsTimer = setInterval(() => {
        const currentCpu = process.cpuUsage(initialStats.cpu);
        const currentMemory = process.memoryUsage();
        
        stats.push({
          timestamp: Date.now(),
          cpu: {
            user: currentCpu.user / 1000, // Convert to milliseconds
            system: currentCpu.system / 1000
          },
          memory: {
            heapUsed: currentMemory.heapUsed / 1024 / 1024, // Convert to MB
            external: currentMemory.external / 1024 / 1024
          }
        });
      }, statsInterval);
      
      // Generate continuous load
      const loadTimer = setInterval(async () => {
        // Mix of different operations to simulate real usage
        const operations = [
          () => ragService.query(`load test query ${Math.random()}`),
          () => databaseService.searchDocuments(`search ${Math.random()}`),
          () => vectorStore.search(Array.from({ length: 100 }, () => Math.random()))
        ];
        
        const operation = operations[Math.floor(Math.random() * operations.length)];
        try {
          await operation();
        } catch (error) {
          // Ignore errors during load testing
        }
      }, loadInterval);
      
      // Run load test
      await new Promise(resolve => setTimeout(resolve, loadDuration));
      
      clearInterval(statsTimer);
      clearInterval(loadTimer);
      
      // Analyze resource usage
      const avgMemory = stats.reduce((sum, stat) => sum + stat.memory.heapUsed, 0) / stats.length;
      const maxMemory = Math.max(...stats.map(stat => stat.memory.heapUsed));
      const totalCpuTime = stats[stats.length - 1].cpu.user + stats[stats.length - 1].cpu.system;
      
      console.log(`Average memory usage: ${avgMemory.toFixed(2)}MB`);
      console.log(`Peak memory usage: ${maxMemory.toFixed(2)}MB`);
      console.log(`Total CPU time: ${totalCpuTime.toFixed(2)}ms`);
      
      // Resource usage should be reasonable
      expect(maxMemory).toBeLessThan(1000); // Under 1GB peak memory
      expect(totalCpuTime).toBeLessThan(loadDuration * 2); // CPU time shouldn't exceed 2x wall time
    });

    test('should handle graceful degradation under resource pressure', async () => {
      // Simulate memory pressure
      const memoryPressureSimulator = [];
      
      try {
        // Allocate memory to simulate pressure
        for (let i = 0; i < 100; i++) {
          memoryPressureSimulator.push(new Array(1024 * 1024).fill(i)); // 1MB arrays
        }
        
        console.log('\nTesting under memory pressure...');
        
        // Operations should still work but potentially with reduced performance
        const startTime = performance.now();
        
        const results = await Promise.all([
          ragService.query('memory pressure test query 1'),
          ragService.query('memory pressure test query 2'),
          databaseService.searchDocuments('pressure test')
        ]);
        
        const responseTime = performance.now() - startTime;
        
        // Operations should complete, even if slower
        expect(results).toHaveLength(3);
        expect(responseTime).toBeLessThan(10000); // Should complete within 10 seconds
        
        console.log(`Operations completed under pressure in: ${responseTime.toFixed(2)}ms`);
        
      } finally {
        // Clean up memory pressure
        memoryPressureSimulator.length = 0;
        if (global.gc) {
          global.gc();
        }
      }
    });
  });

  describe('Benchmarking', () => {
    test('should provide performance benchmarks for comparison', async () => {
      console.log('\n=== PERFORMANCE BENCHMARKS ===');
      
      const benchmarks = {
        'Single document indexing': async () => {
          const doc = {
            id: 'benchmark-doc',
            title: 'Benchmark Document',
            content: 'This is a benchmark document for testing indexing performance. '.repeat(100)
          };
          await ragService.indexDocument(doc);
        },
        
        'Batch document indexing (100 docs)': async () => {
          const docs = Array.from({ length: 100 }, (_, i) => ({
            id: `batch-doc-${i}`,
            title: `Batch Document ${i}`,
            content: `Batch indexing content ${i}. `.repeat(50)
          }));
          await ragService.batchIndexDocuments(docs);
        },
        
        'Simple text query': async () => {
          await ragService.query('simple benchmark query');
        },
        
        'Complex semantic query': async () => {
          await ragService.query('complex semantic search with multiple concepts and contextual understanding requirements');
        },
        
        'Database insertion (1000 records)': async () => {
          const records = Array.from({ length: 1000 }, (_, i) => ({
            id: `db-record-${i}`,
            data: `Database record ${i}`,
            timestamp: new Date().toISOString()
          }));
          await databaseService.bulkInsert('benchmark_table', records);
        },
        
        'Vector similarity search': async () => {
          const queryVector = Array.from({ length: 1536 }, () => Math.random());
          await vectorStore.search(queryVector, { topK: 20 });
        }
      };
      
      const results = {};
      
      for (const [name, benchmark] of Object.entries(benchmarks)) {
        const iterations = 5;
        const times = [];
        
        for (let i = 0; i < iterations; i++) {
          const startTime = performance.now();
          await benchmark();
          times.push(performance.now() - startTime);
          
          // Small delay between iterations
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const stdDev = Math.sqrt(
          times.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / times.length
        );
        
        results[name] = {
          average: avgTime,
          min: minTime,
          max: maxTime,
          stdDev: stdDev,
          iterations: iterations
        };
        
        console.log(`${name}:`);
        console.log(`  Average: ${avgTime.toFixed(2)}ms`);
        console.log(`  Range: ${minTime.toFixed(2)}ms - ${maxTime.toFixed(2)}ms`);
        console.log(`  Std Dev: ${stdDev.toFixed(2)}ms`);
        console.log('');
      }
      
      // Save benchmark results for comparison
      const benchmarkData = {
        timestamp: new Date().toISOString(),
        system: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          cpuCount: os.cpus().length
        },
        results: results
      };
      
      // In a real implementation, this would be saved to a file for tracking
      console.log('Benchmark data collected successfully');
      
      // Basic performance assertions
      expect(results['Simple text query'].average).toBeLessThan(100);
      expect(results['Single document indexing'].average).toBeLessThan(500);
      expect(results['Vector similarity search'].average).toBeLessThan(200);
    });
  });
});

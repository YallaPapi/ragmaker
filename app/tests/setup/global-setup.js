const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { spawn } = require('child_process');

module.exports = async () => {
  console.log('🚀 Starting global test setup...');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.TEST_MODE = 'true';
  process.env.DISABLE_ANALYTICS = 'true';
  process.env.DISABLE_TELEMETRY = 'true';
  process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
  
  // Create test directories
  const testDirs = [
    path.join(__dirname, '../temp'),
    path.join(__dirname, '../fixtures'),
    path.join(__dirname, '../coverage'),
    path.join(__dirname, '../reports')
  ];
  
  for (const dir of testDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }
  
  // Create test fixtures
  await createTestFixtures();
  
  // Setup test database
  await setupTestDatabase();
  
  // Setup mock services
  await setupMockServices();
  
  // Start test servers if needed
  await startTestServers();
  
  console.log('✅ Global test setup completed');
};

async function createTestFixtures() {
  const fixturesDir = path.join(__dirname, '../fixtures');
  
  // Create sample documents
  const sampleDocuments = {
    'sample-document.pdf': 'Mock PDF content for testing document processing',
    'test-transcript.txt': 'This is a sample transcript with multiple sentences. It contains various topics and should be processed correctly by the RAG system.',
    'large-document.txt': 'Large document content. '.repeat(1000),
    'empty-document.txt': '',
    'unicode-document.txt': 'Document with unicode characters: 你好世界 🚀 émojis and äccénts'
  };
  
  for (const [filename, content] of Object.entries(sampleDocuments)) {
    const filePath = path.join(fixturesDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
  }
  
  // Create sample project file
  const sampleProject = {
    name: 'Test Project',
    description: 'Project for testing purposes',
    type: 'youtube',
    settings: {
      maxVideos: 100,
      includeTranscripts: true,
      language: 'en'
    },
    channels: [
      {
        id: 'UCTestChannelId',
        name: 'Test Channel',
        url: 'https://www.youtube.com/@TestChannel'
      }
    ],
    documents: [],
    createdAt: new Date().toISOString(),
    version: '1.0.0'
  };
  
  const projectPath = path.join(fixturesDir, 'test-project.ragmaker');
  await fs.writeFile(projectPath, JSON.stringify(sampleProject, null, 2), 'utf8');
  
  console.log('📁 Test fixtures created');
}

async function setupTestDatabase() {
  // Create in-memory database configurations for different test scenarios
  const dbConfigs = {
    empty: {
      type: 'sqlite',
      connection: ':memory:',
      tables: ['documents', 'channels', 'videos', 'transcripts']
    },
    populated: {
      type: 'sqlite', 
      connection: ':memory:',
      tables: ['documents', 'channels', 'videos', 'transcripts'],
      seedData: true
    },
    large: {
      type: 'sqlite',
      connection: ':memory:', 
      tables: ['documents', 'channels', 'videos', 'transcripts'],
      seedData: true,
      dataSize: 'large'
    }
  };
  
  // Store configurations globally for tests to use
  global.testDatabaseConfigs = dbConfigs;
  
  console.log('🗄️ Test database configurations prepared');
}

async function setupMockServices() {
  // Create mock API responses
  const mockResponses = {
    youtube: {
      channel: {
        kind: 'youtube#channel',
        etag: 'mock-etag',
        id: 'UCTestChannelId',
        snippet: {
          title: 'Test Channel',
          description: 'This is a test channel for automated testing',
          customUrl: '@testchannel',
          publishedAt: '2020-01-01T00:00:00Z',
          thumbnails: {
            default: { url: 'https://example.com/thumb.jpg' }
          },
          country: 'US'
        },
        statistics: {
          subscriberCount: '1000000',
          videoCount: '500',
          viewCount: '50000000'
        }
      },
      video: {
        kind: 'youtube#video',
        etag: 'mock-etag',
        id: 'testVideoId123',
        snippet: {
          title: 'Test Video Title',
          description: 'This is a test video description with keywords about machine learning and AI.',
          channelId: 'UCTestChannelId',
          channelTitle: 'Test Channel',
          publishedAt: '2024-01-01T12:00:00Z',
          tags: ['machine learning', 'AI', 'technology', 'tutorial']
        },
        contentDetails: {
          duration: 'PT10M30S',
          licensedContent: false
        },
        statistics: {
          viewCount: '10000',
          likeCount: '500',
          commentCount: '50'
        }
      },
      transcript: [
        {
          text: 'Welcome to this tutorial about machine learning.',
          start: 0,
          duration: 3
        },
        {
          text: 'Today we will explore the fundamentals of artificial intelligence.',
          start: 3,
          duration: 4
        },
        {
          text: 'Machine learning is a subset of AI that focuses on algorithms.',
          start: 7,
          duration: 5
        },
        {
          text: 'These algorithms can learn and make predictions from data.',
          start: 12,
          duration: 4
        }
      ]
    },
    openai: {
      embedding: Array.from({ length: 1536 }, () => Math.random() - 0.5),
      chat: {
        id: 'chatcmpl-test123',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-3.5-turbo',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a mock response from the AI assistant for testing purposes. The response includes relevant information about the query and demonstrates proper formatting.'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80
        }
      }
    }
  };
  
  // Store mock responses globally
  global.mockAPIResponses = mockResponses;
  
  console.log('🔧 Mock services configured');
}

async function startTestServers() {
  const servers = [];
  
  try {
    // Start mock backend server for integration tests
    const backendPort = process.env.TEST_BACKEND_PORT || 3099;
    
    // Only start if not already running
    if (!process.env.TEST_SERVERS_RUNNING) {
      const mockServer = await startMockServer(backendPort);
      servers.push({ name: 'mock-backend', port: backendPort, process: mockServer });
      
      // Start mock vector database server if needed
      const vectorPort = process.env.TEST_VECTOR_PORT || 3098;
      const vectorServer = await startMockVectorServer(vectorPort);
      servers.push({ name: 'mock-vector', port: vectorPort, process: vectorServer });
      
      process.env.TEST_SERVERS_RUNNING = 'true';
    }
    
    // Store server information globally
    global.testServers = servers;
    
    if (servers.length > 0) {
      console.log(`🌐 Test servers started: ${servers.map(s => `${s.name}:${s.port}`).join(', ')}`);
    }
    
  } catch (error) {
    console.warn('⚠️ Could not start test servers:', error.message);
    // Continue with tests even if servers fail to start
  }
}

async function startMockServer(port) {
  return new Promise((resolve, reject) => {
    const serverScript = `
      const express = require('express');
      const cors = require('cors');
      const app = express();
      
      app.use(cors());
      app.use(express.json());
      
      // Mock endpoints
      app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
      });
      
      app.post('/api/projects', (req, res) => {
        res.status(201).json({
          success: true,
          project: { id: 'test-project-' + Date.now(), ...req.body }
        });
      });
      
      app.post('/api/indexing/start', (req, res) => {
        res.json({
          success: true,
          message: 'Indexing started',
          jobId: 'test-job-' + Date.now()
        });
      });
      
      app.post('/api/rag/query', (req, res) => {
        res.json({
          success: true,
          results: [
            { id: '1', content: 'Mock search result 1', score: 0.95 },
            { id: '2', content: 'Mock search result 2', score: 0.87 }
          ],
          query: req.body.query
        });
      });
      
      const server = app.listen(${port}, () => {
        console.log('Mock server started on port ${port}');
        process.send('ready');
      });
      
      process.on('SIGTERM', () => {
        server.close(() => process.exit(0));
      });
    `;
    
    const child = spawn('node', ['-e', serverScript], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      detached: false
    });
    
    child.on('message', (msg) => {
      if (msg === 'ready') {
        resolve(child);
      }
    });
    
    child.on('error', reject);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      child.kill();
      reject(new Error('Mock server startup timeout'));
    }, 10000);
  });
}

async function startMockVectorServer(port) {
  return new Promise((resolve, reject) => {
    const serverScript = `
      const express = require('express');
      const app = express();
      
      app.use(express.json());
      
      // Mock vector operations
      app.post('/upsert', (req, res) => {
        res.json({ upserted: req.body.vectors?.length || 1 });
      });
      
      app.post('/query', (req, res) => {
        res.json({
          matches: [
            { id: 'match-1', score: 0.95, metadata: {} },
            { id: 'match-2', score: 0.87, metadata: {} }
          ]
        });
      });
      
      app.delete('/delete', (req, res) => {
        res.json({ deleted: 1 });
      });
      
      const server = app.listen(${port}, () => {
        console.log('Mock vector server started on port ${port}');
        process.send('ready');
      });
      
      process.on('SIGTERM', () => {
        server.close(() => process.exit(0));
      });
    `;
    
    const child = spawn('node', ['-e', serverScript], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      detached: false
    });
    
    child.on('message', (msg) => {
      if (msg === 'ready') {
        resolve(child);
      }
    });
    
    child.on('error', reject);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      child.kill();
      reject(new Error('Mock vector server startup timeout'));
    }, 10000);
  });
}

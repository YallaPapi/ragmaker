const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { LocalAPIServer } = require('../src/index');

describe('RAGMaker Local Backend Integration Tests', () => {
  let server;
  let app;
  const testDbPath = path.join(__dirname, '../database/test_vectors.db');
  
  const testConfig = {
    port: 3013, // Different port for testing
    host: 'localhost',
    vectorStorePath: testDbPath,
    useLocalEmbeddings: false, // Disable for faster tests
    openaiApiKey: process.env.OPENAI_API_KEY || 'test-key',
    useOllama: false, // Disable for testing unless specifically needed
    enableDebug: false,
    logRequests: false
  };

  beforeAll(async () => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create server instance
    server = new LocalAPIServer(testConfig);
    app = server.app;
    
    // Start server
    await server.start();
  });

  afterAll(async () => {
    // Stop server
    if (server) {
      await server.stop();
    }
    
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Health Check', () => {
    test('GET /health should return server status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('vectorStore');
      expect(response.body.services).toHaveProperty('embeddings');
    });
  });

  describe('Configuration Management', () => {
    test('GET /config should return current configuration', async () => {
      const response = await request(app)
        .get('/config')
        .expect(200);

      expect(response.body).toHaveProperty('port', testConfig.port);
      expect(response.body).toHaveProperty('host', testConfig.host);
      expect(response.body).toHaveProperty('useLocalEmbeddings');
    });

    test('PUT /config should update configuration', async () => {
      const newConfig = {
        enableDebug: true,
        defaultTopK: 15
      };

      const response = await request(app)
        .put('/config')
        .send(newConfig)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Collections Management', () => {
    test('GET /collections should return collections list', async () => {
      const response = await request(app)
        .get('/collections')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('POST /collections should create a new collection', async () => {
      const newCollection = {
        id: 'test-collection',
        name: 'Test Collection',
        description: 'A test collection for integration tests'
      };

      const response = await request(app)
        .post('/collections')
        .send(newCollection)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('collectionId', 'test-collection');
    });

    test('GET /collections/:id/stats should return collection statistics', async () => {
      const response = await request(app)
        .get('/collections/test-collection/stats')
        .expect(200);

      expect(response.body).toHaveProperty('vectorCount');
      expect(response.body).toHaveProperty('collection');
      expect(response.body.collection).toHaveProperty('id', 'test-collection');
    });

    test('DELETE /collections/:id should delete collection', async () => {
      const response = await request(app)
        .delete('/collections/test-collection')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    test('DELETE /collections/default should be rejected', async () => {
      const response = await request(app)
        .delete('/collections/default')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('RAG Profiles Management', () => {
    test('GET /profiles should return all profiles', async () => {
      const response = await request(app)
        .get('/profiles')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      // Check for default profiles
      const profileIds = response.body.map(p => p.id);
      expect(profileIds).toContain('default');
      expect(profileIds).toContain('technical');
      expect(profileIds).toContain('casual');
    });

    test('GET /profiles/categories should return categorized profiles', async () => {
      const response = await request(app)
        .get('/profiles/categories')
        .expect(200);

      expect(response.body).toHaveProperty('general');
      expect(response.body).toHaveProperty('technical');
      expect(response.body).toHaveProperty('educational');
      expect(response.body).toHaveProperty('professional');
      expect(response.body).toHaveProperty('custom');
    });

    test('POST /profiles should create custom profile', async () => {
      const customProfile = {
        id: 'test-profile',
        profile: {
          name: 'Test Profile',
          systemPrompt: 'You are a test assistant.',
          temperature: 0.5,
          tone: 'test',
          focus: ['testing', 'validation']
        }
      };

      const response = await request(app)
        .post('/profiles')
        .send(customProfile)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    test('DELETE /profiles/:id should delete custom profile', async () => {
      const response = await request(app)
        .delete('/profiles/test-profile')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    test('DELETE /profiles/default should be rejected', async () => {
      const response = await request(app)
        .delete('/profiles/default')
        .expect(500); // Should fail because it's a default profile

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('RAG Query Operations', () => {
    test('POST /query without question should return error', async () => {
      const response = await request(app)
        .post('/query')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Question is required');
    });

    test('POST /query with question should return response (no context)', async () => {
      const queryData = {
        question: 'What is artificial intelligence?',
        topK: 5,
        profileId: 'default'
      };

      const response = await request(app)
        .post('/query')
        .send(queryData)
        .expect(200);

      expect(response.body).toHaveProperty('answer');
      expect(response.body).toHaveProperty('sources');
      expect(response.body).toHaveProperty('chunks');
      expect(Array.isArray(response.body.sources)).toBe(true);
      expect(Array.isArray(response.body.chunks)).toBe(true);
    });
  });

  describe('Document Indexing', () => {
    test('POST /index without documents should return error', async () => {
      const response = await request(app)
        .post('/index')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Documents array is required');
    });

    test('POST /index with invalid documents should return error', async () => {
      const response = await request(app)
        .post('/index')
        .send({ documents: 'not-an-array' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Documents array is required');
    });

    // Skip actual indexing test if no embeddings service available
    test.skip('POST /index with valid documents should index successfully', async () => {
      const documents = [
        {
          videoId: 'test123',
          title: 'Test Video',
          url: 'https://youtube.com/watch?v=test123',
          transcript: 'This is a test transcript about artificial intelligence and machine learning.',
          publishedAt: '2024-01-01T00:00:00Z'
        }
      ];

      const response = await request(app)
        .post('/index')
        .send({ documents })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('documentsProcessed', 1);
      expect(response.body).toHaveProperty('chunksIndexed');
    });
  });

  describe('Server Status', () => {
    test('GET /status should return server status', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);

      expect(response.body).toHaveProperty('isRunning', true);
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.uptime).toBe('number');
    });
  });

  describe('Ollama Integration', () => {
    test('GET /ollama/models should handle Ollama unavailable', async () => {
      // This test assumes Ollama is not running
      const response = await request(app)
        .get('/ollama/models');

      // Should either return models (if Ollama is running) or error
      expect(response.status).toBeOneOf([200, 500]);
    });
  });

  describe('Error Handling', () => {
    test('GET /nonexistent should return 404', async () => {
      const response = await request(app)
        .get('/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Not found');
      expect(response.body).toHaveProperty('path', '/nonexistent');
      expect(response.body).toHaveProperty('method', 'GET');
    });

    test('POST /query with malformed JSON should be handled', async () => {
      const response = await request(app)
        .post('/query')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });
  });

  describe('CORS Headers', () => {
    test('OPTIONS requests should include CORS headers', async () => {
      const response = await request(app)
        .options('/health')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });

    test('GET requests should include CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Development Endpoints', () => {
    test('GET / should return API info in development mode', async () => {
      // Set NODE_ENV for this test
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('status', 'running');
      expect(response.body).toHaveProperty('endpoints');
      expect(Array.isArray(response.body.endpoints)).toBe(true);

      // Restore original NODE_ENV
      process.env.NODE_ENV = originalEnv;
    });
  });
});

// Custom Jest matcher
expect.extend({
  toBeOneOf(received, expected) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => \`expected \${received} not to be one of \${expected.join(', ')}\`,
        pass: true,
      };
    } else {
      return {
        message: () => \`expected \${received} to be one of \${expected.join(', ')}\`,
        pass: false,
      };
    }
  },
});
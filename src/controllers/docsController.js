const swaggerSpec = require('../docs/swagger');

class DocsController {
  /**
   * Serve Swagger UI documentation
   */
  static getSwaggerUI() {
    return require('swagger-ui-express').setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'RAGMaker API Documentation',
      swaggerOptions: {
        filter: true,
        showRequestHeaders: true,
        docExpansion: 'list',
        defaultModelsExpandDepth: 2
      }
    });
  }

  /**
   * Get OpenAPI spec as JSON
   */
  static getSpec(req, res) {
    res.json(swaggerSpec);
  }

  /**
   * Health check endpoint with API information
   */
  static getHealth(req, res) {
    res.json({
      success: true,
      service: 'RAGMaker API',
      version: require('../../package.json').version,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      endpoints: {
        documentation: '/docs',
        openapi: '/docs/openapi.json',
        health: '/health'
      },
      features: [
        'YouTube channel indexing',
        'Vector search and retrieval',
        'RAG-based question answering',
        'Multiple response styles',
        'Project management',
        'Real-time progress tracking'
      ]
    });
  }

  /**
   * API information and getting started guide
   */
  static getInfo(req, res) {
    res.json({
      success: true,
      info: {
        title: 'RAGMaker API',
        description: 'Transform YouTube channels into searchable knowledge bases using RAG (Retrieval-Augmented Generation)',
        version: require('../../package.json').version,
        documentation: `${req.protocol}://${req.get('host')}/docs`,
        
        gettingStarted: {
          step1: {
            description: 'Get an API key',
            details: 'Set the API_KEY environment variable or contact support'
          },
          step2: {
            description: 'Create a project',
            endpoint: 'POST /api/projects',
            example: {
              name: 'My AI Learning Project',
              description: 'Educational content about AI and ML'
            }
          },
          step3: {
            description: 'Add YouTube channels',
            endpoint: 'POST /api/channels',
            example: {
              channelId: 'UCBJycsmduvYEL83R_U4JriQ'
            }
          },
          step4: {
            description: 'Index channel content',
            endpoint: 'POST /api/index-channel',
            note: 'This process may take several minutes depending on channel size'
          },
          step5: {
            description: 'Query the knowledge base',
            endpoint: 'POST /api/query',
            example: {
              query: 'What is machine learning?',
              responseStyle: 'academic',
              maxResults: 5
            }
          }
        },

        authentication: {
          type: 'API Key',
          header: 'x-api-key',
          description: 'Include your API key in the x-api-key header for all requests'
        },

        rateLimits: {
          general: '100 requests per 15 minutes',
          queries: '20 queries per 5 minutes',
          indexing: '5 indexing operations per hour'
        },

        supportedFeatures: [
          'YouTube channel analysis and indexing',
          'Semantic search using OpenAI embeddings',
          'RAG-based question answering',
          'Multiple response styles (academic, conversational, simple, custom)',
          'Real-time indexing progress tracking',
          'Project-based organization',
          'Bulk channel import',
          'Source attribution with timestamps'
        ],

        examples: {
          basicQuery: {
            method: 'POST',
            url: '/api/query',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': 'your-api-key'
            },
            body: {
              query: 'Explain neural networks',
              maxResults: 3,
              responseStyle: 'conversational'
            }
          },
          
          addChannel: {
            method: 'POST', 
            url: '/api/channels',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': 'your-api-key'
            },
            body: {
              channelId: 'UCBJycsmduvYEL83R_U4JriQ'
            }
          }
        }
      }
    });
  }
}

module.exports = DocsController;
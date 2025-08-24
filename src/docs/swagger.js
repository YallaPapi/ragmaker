const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'RAGMaker API',
      version: '1.0.0',
      description: 'YouTube RAG (Retrieval-Augmented Generation) API for creating searchable knowledge bases from YouTube channels',
      contact: {
        name: 'RAGMaker Support',
        url: 'https://github.com/your-repo/ragmaker',
        email: 'support@ragmaker.com'
      },
      license: {
        name: 'ISC',
        url: 'https://opensource.org/licenses/ISC'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://your-domain.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'API key for authentication'
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authenticated endpoints'
        }
      },
      schemas: {
        Channel: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              pattern: '^UC[a-zA-Z0-9_-]{22}$',
              description: 'YouTube channel ID',
              example: 'UCBJycsmduvYEL83R_U4JriQ'
            },
            name: {
              type: 'string',
              description: 'Channel display name',
              example: 'Example Tech Channel'
            },
            description: {
              type: 'string',
              description: 'Channel description',
              example: 'Learn about technology and programming'
            },
            subscriberCount: {
              type: 'integer',
              description: 'Number of subscribers',
              example: 150000
            },
            videoCount: {
              type: 'integer',
              description: 'Number of videos on channel',
              example: 342
            },
            indexed: {
              type: 'boolean',
              description: 'Whether the channel has been indexed',
              example: false
            },
            addedAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the channel was added',
              example: '2024-01-15T10:30:00Z'
            }
          },
          required: ['id', 'name']
        },
        Project: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Project identifier',
              example: 'my-ai-project'
            },
            name: {
              type: 'string',
              description: 'Project display name',
              example: 'AI Learning Project'
            },
            description: {
              type: 'string',
              description: 'Project description',
              example: 'Collection of AI and ML educational content'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the project was created',
              example: '2024-01-10T09:00:00Z'
            },
            channelCount: {
              type: 'integer',
              description: 'Number of channels in project',
              example: 5
            }
          },
          required: ['id', 'name']
        },
        QueryRequest: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              minLength: 1,
              maxLength: 1000,
              description: 'The question to ask about the indexed content',
              example: 'What is machine learning and how does it work?'
            },
            maxResults: {
              type: 'integer',
              minimum: 1,
              maximum: 20,
              default: 10,
              description: 'Maximum number of results to return',
              example: 5
            },
            responseStyle: {
              type: 'string',
              enum: ['academic', 'conversational', 'simple', 'custom'],
              default: 'conversational',
              description: 'Style of the response',
              example: 'academic'
            },
            customPrompt: {
              type: 'string',
              description: 'Custom prompt when using custom response style',
              example: 'Explain this in a way a 10-year-old would understand'
            }
          },
          required: ['query']
        },
        QueryResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the query was successful',
              example: true
            },
            response: {
              type: 'string',
              description: 'The generated response based on indexed content',
              example: 'Machine learning is a subset of artificial intelligence...'
            },
            sources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  videoId: {
                    type: 'string',
                    description: 'YouTube video ID',
                    example: 'dQw4w9WgXcQ'
                  },
                  videoTitle: {
                    type: 'string',
                    description: 'Video title',
                    example: 'Introduction to Machine Learning'
                  },
                  timestamp: {
                    type: 'integer',
                    description: 'Timestamp in seconds where relevant content appears',
                    example: 125
                  },
                  relevanceScore: {
                    type: 'number',
                    format: 'float',
                    description: 'Relevance score (0-1)',
                    example: 0.87
                  }
                }
              }
            },
            debug: {
              type: 'object',
              description: 'Debug information (only in development)',
              properties: {
                searchQuery: { type: 'string' },
                resultsCount: { type: 'integer' },
                processingTime: { type: 'number' },
                tokensUsed: { type: 'integer' }
              }
            }
          },
          required: ['success', 'response']
        },
        IndexingProgress: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['starting', 'processing', 'completed', 'error'],
              description: 'Current indexing status',
              example: 'processing'
            },
            progress: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: 'Completion percentage',
              example: 45
            },
            videosProcessed: {
              type: 'integer',
              description: 'Number of videos processed',
              example: 23
            },
            totalVideos: {
              type: 'integer',
              description: 'Total number of videos to process',
              example: 50
            },
            currentVideo: {
              type: 'string',
              nullable: true,
              description: 'Currently processing video title',
              example: 'Neural Networks Explained'
            },
            startedAt: {
              type: 'string',
              format: 'date-time',
              description: 'When indexing started',
              example: '2024-01-15T14:30:00Z'
            },
            completedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'When indexing completed',
              example: '2024-01-15T15:45:00Z'
            },
            error: {
              type: 'string',
              nullable: true,
              description: 'Error message if status is error',
              example: 'Failed to fetch video transcripts'
            }
          },
          required: ['status', 'progress']
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              description: 'Error message',
              example: 'Invalid channel ID format'
            },
            details: {
              type: 'string',
              description: 'Additional error details (development only)',
              example: 'Channel ID must start with UC and be 24 characters long'
            },
            code: {
              type: 'string',
              description: 'Error code for programmatic handling',
              example: 'INVALID_CHANNEL_ID'
            }
          },
          required: ['success', 'error']
        }
      }
    },
    security: [
      {
        ApiKeyAuth: []
      }
    ]
  },
  apis: ['./src/api/routes/*.js', './src/controllers/*.js'], // Path to the API files
};

module.exports = swaggerJsdoc(options);
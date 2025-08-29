const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

async function globalSetup() {
  console.log('Setting up Electron testing environment...');
  
  // Setup test data directory
  const testDataDir = path.join(__dirname, '../../../data/test');
  try {
    await fs.mkdir(testDataDir, { recursive: true });
    console.log(`Created test data directory: ${testDataDir}`);
  } catch (error) {
    console.log(`Test data directory already exists or error: ${error.message}`);
  }
  
  // Create test configuration
  const testConfig = {
    database: {
      path: path.join(testDataDir, 'test-database.db'),
      type: 'sqlite'
    },
    api: {
      baseUrl: 'http://localhost:3001',
      timeout: 10000
    },
    features: {
      enableTesting: true,
      mockExternalServices: true,
      enableDebugLogging: true
    }
  };
  
  const configPath = path.join(testDataDir, 'test-config.json');
  await fs.writeFile(configPath, JSON.stringify(testConfig, null, 2));
  console.log(`Created test configuration: ${configPath}`);
  
  // Setup environment variables
  process.env.NODE_ENV = 'test';
  process.env.ELECTRON_RUN_AS_NODE = undefined;
  process.env.TEST_DATA_DIR = testDataDir;
  
  // Create test database
  await setupTestDatabase(testConfig.database.path);
  
  // Setup mock data
  await createMockData(testDataDir);
  
  console.log('Global setup completed successfully');
}

async function setupTestDatabase(dbPath) {
  console.log(`Setting up test database: ${dbPath}`);
  
  try {
    // Create database directory if it doesn't exist
    const dbDir = path.dirname(dbPath);
    await fs.mkdir(dbDir, { recursive: true });
    
    // Create empty database file
    await fs.writeFile(dbPath, '');
    
    console.log('Test database created successfully');
  } catch (error) {
    console.error('Error setting up test database:', error);
    throw error;
  }
}

async function createMockData(testDataDir) {
  console.log('Creating mock data for tests...');
  
  // Mock documents
  const mockDocuments = [
    {
      id: 'doc1',
      title: 'AI Research Paper',
      content: 'This is a comprehensive research paper about artificial intelligence and machine learning techniques.',
      metadata: {
        author: 'Test Author',
        created: new Date().toISOString(),
        tags: ['ai', 'research', 'machine-learning']
      }
    },
    {
      id: 'doc2', 
      title: 'Data Science Guide',
      content: 'A complete guide to data science methodologies, including statistical analysis and data visualization.',
      metadata: {
        author: 'Data Scientist',
        created: new Date().toISOString(),
        tags: ['data-science', 'statistics', 'visualization']
      }
    },
    {
      id: 'doc3',
      title: 'Software Engineering Best Practices',
      content: 'Best practices for software engineering, including testing, code quality, and architecture patterns.',
      metadata: {
        author: 'Senior Engineer',
        created: new Date().toISOString(),
        tags: ['software-engineering', 'best-practices', 'architecture']
      }
    }
  ];
  
  const documentsPath = path.join(testDataDir, 'mock-documents.json');
  await fs.writeFile(documentsPath, JSON.stringify(mockDocuments, null, 2));
  
  // Mock channels (if applicable)
  const mockChannels = [
    {
      id: 'channel1',
      name: 'Tech Talks',
      url: 'https://www.youtube.com/@techchannel',
      subscribers: 100000,
      videoCount: 150
    },
    {
      id: 'channel2',
      name: 'AI Research Hub',
      url: 'https://www.youtube.com/@airesearch',
      subscribers: 75000,
      videoCount: 89
    }
  ];
  
  const channelsPath = path.join(testDataDir, 'mock-channels.json');
  await fs.writeFile(channelsPath, JSON.stringify(mockChannels, null, 2));
  
  // Mock search results
  const mockSearchResults = {
    'machine learning': [
      { id: 'doc1', score: 0.95 },
      { id: 'doc2', score: 0.78 }
    ],
    'software engineering': [
      { id: 'doc3', score: 0.92 }
    ]
  };
  
  const searchResultsPath = path.join(testDataDir, 'mock-search-results.json');
  await fs.writeFile(searchResultsPath, JSON.stringify(mockSearchResults, null, 2));
  
  console.log('Mock data created successfully');
}

module.exports = globalSetup;
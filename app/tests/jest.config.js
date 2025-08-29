module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/unit/**/*.test.js',
    '<rootDir>/integration/**/*.test.js',
    '<rootDir>/e2e/**/*.test.js',
    '<rootDir>/performance/**/*.test.js',
    '<rootDir>/platform/**/*.test.js',
    '<rootDir>/security/**/*.test.js'
  ],
  
  // Files to ignore
  testPathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/dist/',
    '/coverage/'
  ],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/setup/jest.setup.js'
  ],
  
  // Global setup and teardown
  globalSetup: '<rootDir>/setup/global-setup.js',
  globalTeardown: '<rootDir>/setup/global-teardown.js',
  
  // Test timeout (5 minutes for comprehensive tests)
  testTimeout: 300000,
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    '../../../src/**/*.js',
    '../../../desktop/src/**/*.js',
    '!../../../src/**/*.test.js',
    '!../../../src/**/*.spec.js',
    '!../../../node_modules/**',
    '!../../../desktop/node_modules/**'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    // Higher thresholds for critical services
    '../../../src/services/rag.js': {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
    },
    '../../../src/services/database.js': {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
    },
    '../../../src/services/youtube.js': {
      branches: 88,
      functions: 92,
      lines: 88,
      statements: 88
    },
    // Desktop application critical files
    '../../../desktop/src/main.js': {
      branches: 85,
      functions: 90,
      lines: 85,
      statements: 85
    },
    '../../../desktop/src/ipcManager.js': {
      branches: 88,
      functions: 92,
      lines: 88,
      statements: 88
    }
  },
  
  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'cobertura',
    'json'
  ],
  
  // Module name mapping for aliases
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/../../../src/$1',
    '^@desktop/(.*)$': '<rootDir>/../../../desktop/src/$1',
    '^@tests/(.*)$': '<rootDir>/$1'
  },
  
  // Transform configuration
  transform: {
    '^.+\\.jsx?$': 'babel-jest'
  },
  
  // Module file extensions
  moduleFileExtensions: [
    'js',
    'json',
    'jsx',
    'node'
  ],
  
  // Test result processors
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/coverage',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true
      }
    ]
  ],
  
  // Verbose output
  verbose: true,
  
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Maximum worker processes
  maxWorkers: '50%',
  
  // Test projects for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/unit/**/*.test.js'],
      testTimeout: 30000
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/integration/**/*.test.js'],
      testTimeout: 120000
    },
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/e2e/**/*.test.js'],
      testTimeout: 300000,
      setupFilesAfterEnv: ['<rootDir>/setup/e2e.setup.js']
    },
    {
      displayName: 'performance',
      testMatch: ['<rootDir>/performance/**/*.test.js'],
      testTimeout: 600000, // 10 minutes for performance tests
      setupFilesAfterEnv: ['<rootDir>/setup/performance.setup.js']
    },
    {
      displayName: 'platform',
      testMatch: ['<rootDir>/platform/**/*.test.js'],
      testTimeout: 180000
    },
    {
      displayName: 'security',
      testMatch: ['<rootDir>/security/**/*.test.js'],
      testTimeout: 120000
    }
  ],
  
  // Error on deprecated features
  errorOnDeprecated: true,
  
  // Notify mode
  notify: false,
  
  // Watch mode configuration
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/build/',
    '/dist/'
  ]
};

module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/taskmaster/',
    '/.taskmaster/',
    '/.claude-flow/',
    '/.cursor/',
    '/.windsurf/'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/api/server.js', // Exclude main server file from coverage
    '!node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'text-summary', 
    'html',
    'lcov',
    'cobertura'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Critical services require higher coverage
    './src/services/youtube.js': {
      branches: 85,
      functions: 90,
      lines: 85,
      statements: 85
    },
    './src/services/rag.js': {
      branches: 85,
      functions: 90,
      lines: 85,
      statements: 85
    },
    './src/utils/validation.js': {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  verbose: true,
  collectCoverage: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};
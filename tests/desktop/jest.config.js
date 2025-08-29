module.exports = {
  // Test environment configuration
  testEnvironment: 'node',
  
  // Root directory
  rootDir: '.',
  
  // Test directories
  testMatch: [
    '<rootDir>/unit/**/*.test.js',
    '<rootDir>/integration/**/*.test.js', 
    '<rootDir>/e2e/**/*.test.js',
    '<rootDir>/performance/**/*.test.js',
    '<rootDir>/platform/**/*.test.js'
  ],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/setup/jest.setup.js'
  ],
  
  // Module name mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/../src/$1',
    '^@tests/(.*)$': '<rootDir>/$1'
  },
  
  // Coverage configuration
  collectCoverageFrom: [
    '../src/**/*.{js,ts}',
    '!../src/**/*.d.ts',
    '!../src/**/node_modules/**'
  ],
  
  coverageDirectory: 'coverage',
  
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json'
  ],
  
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Test timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Transform configuration for different file types
  transform: {
    '^.+\\.(js|ts)$': 'babel-jest'
  },
  
  // Test environment options
  testEnvironmentOptions: {
    url: 'http://localhost'
  },
  
  // Global test configuration
  globals: {
    'ts-jest': {
      useESM: true
    }
  }
};
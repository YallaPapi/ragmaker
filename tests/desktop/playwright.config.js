const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  // Test directory
  testDir: './e2e',
  
  // Run tests in files in parallel
  fullyParallel: false, // Electron tests should run sequentially
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-results.json' }],
    ['junit', { outputFile: 'playwright-junit.xml' }]
  ],
  
  // Shared settings for all the projects below
  use: {
    // Base URL for web assertions
    baseURL: 'http://localhost:3000',
    
    // Collect trace when retrying the failed test
    trace: 'on-first-retry',
    
    // Capture screenshot on failure
    screenshot: 'only-on-failure',
    
    // Record video on failure
    video: 'retain-on-failure',
    
    // Context options
    viewport: { width: 1280, height: 720 },
    
    // Additional context options for Electron
    launchOptions: {
      executablePath: require('electron'), // Path to Electron executable
      args: [
        '--disable-web-security',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ]
    }
  },
  
  // Configure projects for major browsers and Electron
  projects: [
    {
      name: 'electron',
      use: { 
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        launchOptions: {
          executablePath: require('electron')
        }
      }
    },
    
    // Cross-platform testing
    {
      name: 'electron-windows',
      use: {
        ...devices['Desktop Chrome'],
        platform: 'win32'
      },
      testIgnore: process.platform !== 'win32' ? '**/*' : undefined
    },
    
    {
      name: 'electron-macos',
      use: {
        ...devices['Desktop Safari'],
        platform: 'darwin'
      },
      testIgnore: process.platform !== 'darwin' ? '**/*' : undefined
    },
    
    {
      name: 'electron-linux',
      use: {
        ...devices['Desktop Chrome'],
        platform: 'linux'
      },
      testIgnore: process.platform !== 'linux' ? '**/*' : undefined
    }
  ],
  
  // Global setup and teardown
  globalSetup: require.resolve('./setup/global-setup.js'),
  globalTeardown: require.resolve('./setup/global-teardown.js'),
  
  // Test timeout
  timeout: 30000,
  
  // Expect timeout
  expect: {
    timeout: 10000
  },
  
  // Output directory
  outputDir: 'test-results/',
  
  // Web server for testing (if needed)
  webServer: {
    command: 'npm start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
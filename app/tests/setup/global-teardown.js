const path = require('path');
const fs = require('fs').promises;

module.exports = async () => {
  console.log('\n🧹 Starting global test teardown...');
  
  try {
    // Stop test servers
    await stopTestServers();
    
    // Clean up test files
    await cleanupTestFiles();
    
    // Clear global state
    await clearGlobalState();
    
    // Generate test reports
    await generateTestReports();
    
    console.log('✅ Global test teardown completed');
    
  } catch (error) {
    console.error('❌ Error during global teardown:', error.message);
    // Don't fail the entire test suite if teardown has issues
  }
};

async function stopTestServers() {
  if (global.testServers && Array.isArray(global.testServers)) {
    console.log('🛑 Stopping test servers...');
    
    const shutdownPromises = global.testServers.map(async (server) => {
      try {
        if (server.process && !server.process.killed) {
          server.process.kill('SIGTERM');
          
          // Wait for graceful shutdown
          await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              if (!server.process.killed) {
                server.process.kill('SIGKILL');
              }
              resolve();
            }, 5000);
            
            server.process.on('exit', () => {
              clearTimeout(timeout);
              resolve();
            });
          });
          
          console.log(`  ✓ Stopped ${server.name} (port ${server.port})`);
        }
      } catch (error) {
        console.warn(`  ⚠️ Error stopping ${server.name}:`, error.message);
      }
    });
    
    await Promise.all(shutdownPromises);
    delete global.testServers;
  }
}

async function cleanupTestFiles() {
  console.log('🗑️ Cleaning up test files...');
  
  const tempDirs = [
    path.join(__dirname, '../temp'),
    path.join(__dirname, '../fixtures')
  ];
  
  for (const dir of tempDirs) {
    try {
      const exists = await fs.access(dir).then(() => true).catch(() => false);
      if (exists) {
        await fs.rm(dir, { recursive: true, force: true });
        console.log(`  ✓ Cleaned ${dir}`);
      }
    } catch (error) {
      console.warn(`  ⚠️ Could not clean ${dir}:`, error.message);
    }
  }
  
  // Clean up any database files created during tests
  const dbFiles = [
    'test.db',
    'test.db-wal',
    'test.db-shm',
    'backup-test.sqlite'
  ];
  
  for (const dbFile of dbFiles) {
    try {
      const filePath = path.join(__dirname, '../../..', dbFile);
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      if (exists) {
        await fs.unlink(filePath);
        console.log(`  ✓ Cleaned database file ${dbFile}`);
      }
    } catch (error) {
      // Ignore errors for files that don't exist
    }
  }
}

async function clearGlobalState() {
  console.log('🔄 Clearing global test state...');
  
  // Clear global test variables
  const globalVarsToClean = [
    'testDatabaseConfigs',
    'mockAPIResponses',
    'testHelpers',
    'testServers'
  ];
  
  globalVarsToClean.forEach(varName => {
    if (global[varName]) {
      delete global[varName];
    }
  });
  
  // Clear environment variables set during tests
  const testEnvVars = [
    'TEST_MODE',
    'DISABLE_ANALYTICS', 
    'DISABLE_TELEMETRY',
    'TEST_SERVERS_RUNNING',
    'TEST_BACKEND_PORT',
    'TEST_VECTOR_PORT'
  ];
  
  testEnvVars.forEach(varName => {
    if (process.env[varName]) {
      delete process.env[varName];
    }
  });
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  console.log('  ✓ Global state cleared');
}

async function generateTestReports() {
  console.log('📊 Generating test reports...');
  
  try {
    const reportsDir = path.join(__dirname, '../reports');
    
    // Ensure reports directory exists
    await fs.mkdir(reportsDir, { recursive: true });
    
    // Generate test summary report
    const testSummary = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
      testEnvironment: {
        NODE_ENV: process.env.NODE_ENV,
        CI: process.env.CI,
        testRunner: 'Jest'
      },
      systemInfo: {
        totalMemory: Math.round(require('os').totalmem() / 1024 / 1024 / 1024),
        cpuCores: require('os').cpus().length,
        architecture: process.arch
      },
      testConfiguration: {
        timeout: 300000,
        maxWorkers: '50%',
        testMatch: [
          'unit/**/*.test.js',
          'integration/**/*.test.js', 
          'e2e/**/*.test.js',
          'performance/**/*.test.js',
          'platform/**/*.test.js',
          'security/**/*.test.js'
        ]
      },
      coverageThresholds: {
        global: {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85
        }
      }
    };
    
    const summaryPath = path.join(reportsDir, 'test-summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(testSummary, null, 2), 'utf8');
    
    console.log(`  ✓ Test summary saved to ${summaryPath}`);
    
    // Generate environment report
    const environmentReport = {
      timestamp: new Date().toISOString(),
      testRun: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        workingDirectory: process.cwd()
      },
      environment: {
        ...Object.fromEntries(
          Object.entries(process.env)
            .filter(([key]) => key.startsWith('TEST_') || key.startsWith('NODE_') || key === 'CI')
        )
      },
      dependencies: {
        jest: require('jest/package.json').version,
        node: process.version
      }
    };
    
    const envReportPath = path.join(reportsDir, 'environment-report.json');
    await fs.writeFile(envReportPath, JSON.stringify(environmentReport, null, 2), 'utf8');
    
    console.log(`  ✓ Environment report saved to ${envReportPath}`);
    
  } catch (error) {
    console.warn('  ⚠️ Could not generate test reports:', error.message);
  }
}

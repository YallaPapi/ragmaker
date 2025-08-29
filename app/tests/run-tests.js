#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test runner for the desktop application
class TestRunner {
  constructor() {
    this.testTypes = {
      unit: {
        description: 'Unit tests for individual components',
        pattern: 'unit/**/*.test.js',
        timeout: 30000
      },
      integration: {
        description: 'Integration tests for UI-backend communication',
        pattern: 'integration/**/*.test.js', 
        timeout: 120000
      },
      e2e: {
        description: 'End-to-end workflow tests',
        pattern: 'e2e/**/*.test.js',
        timeout: 300000
      },
      performance: {
        description: 'Performance and load testing',
        pattern: 'performance/**/*.test.js',
        timeout: 600000
      },
      platform: {
        description: 'Cross-platform compatibility tests',
        pattern: 'platform/**/*.test.js',
        timeout: 180000
      },
      security: {
        description: 'Security validation tests',
        pattern: 'security/**/*.test.js',
        timeout: 120000
      }
    };
  }

  async runTests(options = {}) {
    const {
      type = 'all',
      coverage = true,
      watch = false,
      verbose = false,
      parallel = true,
      bail = false,
      updateSnapshots = false
    } = options;

    console.log('🚀 Starting Desktop Application Test Suite');
    console.log('='.repeat(50));
    
    // Validate test type
    if (type !== 'all' && !this.testTypes[type]) {
      console.error(`❌ Invalid test type: ${type}`);
      console.log('Available types:', Object.keys(this.testTypes).join(', '), 'all');
      process.exit(1);
    }

    // Build Jest command
    const jestCommand = this.buildJestCommand({
      type,
      coverage,
      watch,
      verbose,
      parallel,
      bail,
      updateSnapshots
    });

    console.log(`🏃 Running ${type === 'all' ? 'all' : type} tests...\n`);
    
    if (type !== 'all') {
      console.log(`Description: ${this.testTypes[type].description}`);
      console.log(`Pattern: ${this.testTypes[type].pattern}`);
      console.log(`Timeout: ${this.testTypes[type].timeout}ms\n`);
    }

    // Run tests
    const startTime = Date.now();
    const exitCode = await this.executeJest(jestCommand);
    const duration = Date.now() - startTime;

    console.log('\n' + '='.repeat(50));
    if (exitCode === 0) {
      console.log(`✅ Tests completed successfully in ${(duration / 1000).toFixed(2)}s`);
    } else {
      console.log(`❌ Tests failed after ${(duration / 1000).toFixed(2)}s`);
    }

    // Show coverage report location if coverage was enabled
    if (coverage && exitCode === 0) {
      const coverageDir = path.join(__dirname, 'coverage');
      if (fs.existsSync(path.join(coverageDir, 'index.html'))) {
        console.log(`📊 Coverage report: file://${path.join(coverageDir, 'index.html')}`);
      }
    }

    return exitCode;
  }

  buildJestCommand(options) {
    const {
      type,
      coverage,
      watch,
      verbose,
      parallel,
      bail,
      updateSnapshots
    } = options;

    let command = ['jest'];
    
    // Configuration file
    command.push('--config', path.join(__dirname, 'jest.config.js'));
    
    // Test pattern
    if (type !== 'all') {
      command.push('--testPathPattern', this.testTypes[type].pattern);
    }
    
    // Coverage
    if (coverage) {
      command.push('--coverage');
      command.push('--coverageDirectory', path.join(__dirname, 'coverage'));
    }
    
    // Watch mode
    if (watch) {
      command.push('--watch');
    }
    
    // Verbose output
    if (verbose) {
      command.push('--verbose');
    }
    
    // Parallel execution
    if (!parallel) {
      command.push('--runInBand');
    }
    
    // Fail fast
    if (bail) {
      command.push('--bail');
    }
    
    // Update snapshots
    if (updateSnapshots) {
      command.push('--updateSnapshot');
    }
    
    // CI environment optimizations
    if (process.env.CI) {
      command.push('--ci');
      command.push('--watchAll=false');
      command.push('--passWithNoTests');
    }
    
    return command;
  }

  executeJest(command) {
    return new Promise((resolve) => {
      const jest = spawn('npx', command, {
        stdio: 'inherit',
        shell: true,
        cwd: __dirname
      });

      jest.on('close', (code) => {
        resolve(code);
      });

      jest.on('error', (error) => {
        console.error('❌ Failed to start Jest:', error.message);
        resolve(1);
      });
    });
  }

  async checkDependencies() {
    const requiredDeps = [
      'jest',
      'playwright',
      'supertest',
      '@playwright/test'
    ];

    const missingDeps = [];
    
    for (const dep of requiredDeps) {
      try {
        require.resolve(dep);
      } catch (error) {
        missingDeps.push(dep);
      }
    }

    if (missingDeps.length > 0) {
      console.error('❌ Missing dependencies:');
      missingDeps.forEach(dep => console.error(`  - ${dep}`));
      console.log('\nPlease run: npm install --save-dev', missingDeps.join(' '));
      return false;
    }

    return true;
  }

  printUsage() {
    console.log('Desktop Application Test Runner');
    console.log('\nUsage: node run-tests.js [options]');
    console.log('\nOptions:');
    console.log('  --type <type>      Test type to run (default: all)');
    console.log('                     Options:', Object.keys(this.testTypes).join(', '), 'all');
    console.log('  --no-coverage      Disable coverage reporting');
    console.log('  --watch            Run tests in watch mode');
    console.log('  --verbose          Show verbose output');
    console.log('  --no-parallel      Run tests serially');
    console.log('  --bail             Stop after first test failure');
    console.log('  --update-snapshots Update Jest snapshots');
    console.log('  --help             Show this help message');
    console.log('\nTest Types:');
    Object.entries(this.testTypes).forEach(([key, config]) => {
      console.log(`  ${key.padEnd(12)} ${config.description}`);
    });
    console.log('\nExamples:');
    console.log('  node run-tests.js --type unit');
    console.log('  node run-tests.js --type e2e --verbose');
    console.log('  node run-tests.js --watch --no-coverage');
    console.log('  node run-tests.js --type performance --bail');
  }
}

// CLI handling
if (require.main === module) {
  const runner = new TestRunner();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    type: 'all',
    coverage: true,
    watch: false,
    verbose: false,
    parallel: true,
    bail: false,
    updateSnapshots: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--help':
      case '-h':
        runner.printUsage();
        process.exit(0);
        break;
      
      case '--type':
        if (i + 1 < args.length) {
          options.type = args[++i];
        } else {
          console.error('❌ --type requires a value');
          process.exit(1);
        }
        break;
      
      case '--no-coverage':
        options.coverage = false;
        break;
      
      case '--watch':
        options.watch = true;
        break;
      
      case '--verbose':
        options.verbose = true;
        break;
      
      case '--no-parallel':
        options.parallel = false;
        break;
      
      case '--bail':
        options.bail = true;
        break;
      
      case '--update-snapshots':
        options.updateSnapshots = true;
        break;
      
      default:
        console.error(`❌ Unknown option: ${arg}`);
        console.log('Use --help for usage information');
        process.exit(1);
    }
  }

  // Run tests
  (async () => {
    try {
      // Check dependencies first
      const depsOk = await runner.checkDependencies();
      if (!depsOk) {
        process.exit(1);
      }

      const exitCode = await runner.runTests(options);
      process.exit(exitCode);
    } catch (error) {
      console.error('❌ Test runner error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = TestRunner;

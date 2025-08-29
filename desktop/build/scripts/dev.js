#!/usr/bin/env node

const { spawn } = require('child_process');
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const chokidar = require('chokidar');

let mainWindow = null;
let rendererProcess = null;
let electronProcess = null;

async function startDevelopment() {
  try {
    console.log(chalk.blue('🚀 Starting RAGMaker Desktop in development mode...'));
    
    // Set development environment
    process.env.NODE_ENV = 'development';
    process.env.ELECTRON_IS_DEV = '1';
    
    // Start renderer development server
    await startRendererServer();
    
    // Start Electron with hot reload
    await startElectronWithHotReload();
    
    // Set up file watchers
    setupFileWatchers();
    
    console.log(chalk.green('✅ Development environment started successfully'));
    console.log(chalk.gray('  - Renderer server running on http://localhost:3000'));
    console.log(chalk.gray('  - Electron app running with hot reload'));
    console.log(chalk.gray('  - File watchers active'));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to start development environment:'), error);
    process.exit(1);
  }
}

async function startRendererServer() {
  return new Promise((resolve, reject) => {
    console.log(chalk.yellow('📦 Starting renderer development server...'));
    
    rendererProcess = spawn('npm', ['run', 'start'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true
    });
    
    let serverReady = false;
    
    rendererProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(chalk.gray('[Renderer]'), output.trim());
      
      if (output.includes('Local:') && !serverReady) {
        serverReady = true;
        resolve();
      }
    });
    
    rendererProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (!output.includes('warning')) {
        console.error(chalk.red('[Renderer Error]'), output.trim());
      }
    });
    
    rendererProcess.on('close', (code) => {
      if (code !== 0 && !serverReady) {
        reject(new Error(`Renderer server exited with code ${code}`));
      }
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (!serverReady) {
        reject(new Error('Renderer server failed to start within 30 seconds'));
      }
    }, 30000);
  });
}

async function startElectronWithHotReload() {
  return new Promise((resolve) => {
    console.log(chalk.yellow('⚡ Starting Electron with hot reload...'));
    
    const electronPath = require('electron');
    
    electronProcess = spawn(electronPath, ['.'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1'
      }
    });
    
    electronProcess.on('close', (code) => {
      console.log(chalk.yellow(`Electron process exited with code ${code}`));
      if (rendererProcess) {
        rendererProcess.kill();
      }
    });
    
    resolve();
  });
}

function setupFileWatchers() {
  console.log(chalk.yellow('👀 Setting up file watchers...'));
  
  // Watch main process files
  const mainWatcher = chokidar.watch([
    'desktop/main.js',
    'desktop/preload.js',
    'desktop/menu.js',
    'desktop/updater.js'
  ], {
    ignored: /node_modules/,
    persistent: true
  });
  
  mainWatcher.on('change', (path) => {
    console.log(chalk.blue('🔄 Main process file changed:'), path);
    restartElectron();
  });
  
  // Watch package.json for dependency changes
  const packageWatcher = chokidar.watch('package.json', {
    persistent: true
  });
  
  packageWatcher.on('change', () => {
    console.log(chalk.blue('🔄 package.json changed, restarting...'));
    restartAll();
  });
  
  console.log(chalk.green('✅ File watchers set up successfully'));
}

function restartElectron() {
  if (electronProcess) {
    console.log(chalk.yellow('🔄 Restarting Electron...'));
    electronProcess.kill();
    
    setTimeout(() => {
      startElectronWithHotReload();
    }, 1000);
  }
}

function restartAll() {
  console.log(chalk.yellow('🔄 Restarting entire development environment...'));
  
  if (electronProcess) {
    electronProcess.kill();
  }
  
  if (rendererProcess) {
    rendererProcess.kill();
  }
  
  setTimeout(() => {
    startDevelopment();
  }, 2000);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n🛑 Shutting down development environment...'));
  
  if (electronProcess) {
    electronProcess.kill();
  }
  
  if (rendererProcess) {
    rendererProcess.kill();
  }
  
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (electronProcess) {
    electronProcess.kill();
  }
  
  if (rendererProcess) {
    rendererProcess.kill();
  }
  
  process.exit(0);
});

// Start development
startDevelopment().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
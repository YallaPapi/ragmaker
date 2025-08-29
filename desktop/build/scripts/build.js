#!/usr/bin/env node

const { build } = require('electron-builder');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  publish: args.includes('--publish') ? 'always' : 'never',
  platform: args.find(arg => arg.startsWith('--platform='))?.split('=')[1],
  arch: args.find(arg => arg.startsWith('--arch='))?.split('=')[1],
  draft: args.includes('--draft'),
  prerelease: args.includes('--prerelease')
};

async function main() {
  try {
    console.log(chalk.blue('🚀 Starting Electron build process...'));
    
    // Set environment
    process.env.NODE_ENV = 'production';
    
    // Validate build environment
    await validateEnvironment();
    
    // Build configuration
    const config = require('../configs/electron-builder.config.js');
    
    // Override config based on options
    if (options.platform) {
      config.platform = options.platform;
    }
    
    if (options.arch) {
      config.arch = options.arch;
    }
    
    // Start build
    const startTime = Date.now();
    
    const result = await build({
      config,
      publish: options.publish,
      draft: options.draft,
      prerelease: options.prerelease
    });
    
    const buildTime = Math.round((Date.now() - startTime) / 1000);
    
    console.log(chalk.green(`✅ Build completed successfully in ${buildTime}s`));
    console.log(chalk.gray('Generated files:'));
    
    result.forEach(file => {
      console.log(chalk.gray(`  - ${path.basename(file)}`));
    });
    
    // Post-build tasks
    await postBuildTasks(result);
    
  } catch (error) {
    console.error(chalk.red('❌ Build failed:'), error);
    process.exit(1);
  }
}

async function validateEnvironment() {
  console.log(chalk.yellow('🔍 Validating build environment...'));
  
  // Check required files
  const requiredFiles = [
    'package.json',
    'desktop/main.js',
    'desktop/preload.js'
  ];
  
  for (const file of requiredFiles) {
    if (!await fs.pathExists(file)) {
      throw new Error(`Required file not found: ${file}`);
    }
  }
  
  // Check code signing certificates
  if (process.platform === 'win32' && process.env.WINDOWS_CERTIFICATE_FILE) {
    if (!await fs.pathExists(process.env.WINDOWS_CERTIFICATE_FILE)) {
      console.warn(chalk.yellow('⚠️  Windows certificate file not found, skipping code signing'));
    }
  }
  
  if (process.platform === 'darwin' && !process.env.APPLE_ID) {
    console.warn(chalk.yellow('⚠️  Apple ID not configured, skipping notarization'));
  }
  
  console.log(chalk.green('✅ Environment validation passed'));
}

async function postBuildTasks(buildResults) {
  console.log(chalk.yellow('🔧 Running post-build tasks...'));
  
  // Generate build report
  const buildReport = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    files: buildResults.map(file => ({
      name: path.basename(file),
      path: file,
      size: (await fs.stat(file)).size
    }))
  };
  
  await fs.writeJSON('dist/build-report.json', buildReport, { spaces: 2 });
  
  // Upload to release (if configured)
  if (options.publish === 'always') {
    console.log(chalk.blue('📤 Publishing release...'));
    // Publishing is handled by electron-builder
  }
  
  console.log(chalk.green('✅ Post-build tasks completed'));
}

// Handle signals
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n⚠️  Build interrupted by user'));
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n⚠️  Build terminated'));
  process.exit(1);
});

// Run build
main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
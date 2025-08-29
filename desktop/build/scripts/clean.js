#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

async function clean() {
  const dirsToClean = [
    'dist',
    'out',
    'desktop/renderer/dist',
    'node_modules/.cache/electron',
    'node_modules/.cache/electron-builder'
  ];

  console.log(chalk.blue('🧹 Cleaning build directories...'));

  for (const dir of dirsToClean) {
    const dirPath = path.resolve(dir);
    
    try {
      if (await fs.pathExists(dirPath)) {
        await fs.remove(dirPath);
        console.log(chalk.green(`✅ Cleaned: ${dir}`));
      } else {
        console.log(chalk.gray(`⏭️  Skipped: ${dir} (doesn't exist)`));
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to clean ${dir}:`), error.message);
    }
  }

  console.log(chalk.green('✅ Cleanup completed!'));
}

if (require.main === module) {
  clean().catch(error => {
    console.error(chalk.red('Cleanup failed:'), error);
    process.exit(1);
  });
}

module.exports = clean;
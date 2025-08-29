#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const semver = require('semver');

async function release() {
  try {
    const args = process.argv.slice(2);
    const versionType = args[0] || 'patch'; // patch, minor, major, or specific version
    const skipTests = args.includes('--skip-tests');
    const dryRun = args.includes('--dry-run');

    console.log(chalk.blue('🚀 Starting release process...'));

    // Validate version type
    if (!['patch', 'minor', 'major'].includes(versionType) && !semver.valid(versionType)) {
      throw new Error('Invalid version type. Use patch, minor, major, or a specific version (e.g., 1.2.3)');
    }

    // Check if we're on the correct branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    if (currentBranch !== 'master' && currentBranch !== 'main') {
      console.warn(chalk.yellow(`⚠️  You're on branch '${currentBranch}', not master/main`));
    }

    // Check for uncommitted changes
    try {
      execSync('git diff --exit-code', { stdio: 'ignore' });
      execSync('git diff --cached --exit-code', { stdio: 'ignore' });
    } catch {
      throw new Error('You have uncommitted changes. Please commit or stash them before releasing.');
    }

    // Pull latest changes
    console.log(chalk.yellow('📥 Pulling latest changes...'));
    if (!dryRun) {
      execSync('git pull origin ' + currentBranch, { stdio: 'inherit' });
    }

    // Run tests
    if (!skipTests) {
      console.log(chalk.yellow('🧪 Running tests...'));
      execSync('npm test', { stdio: 'inherit' });
      console.log(chalk.green('✅ Tests passed'));
    }

    // Clean build directories
    console.log(chalk.yellow('🧹 Cleaning build directories...'));
    await require('./clean')();

    // Update version
    console.log(chalk.yellow(`📈 Bumping version (${versionType})...`));
    if (!dryRun) {
      if (semver.valid(versionType)) {
        execSync(`npm version ${versionType} --no-git-tag-version`, { stdio: 'inherit' });
      } else {
        execSync(`npm version ${versionType}`, { stdio: 'inherit' });
      }
    }

    // Get new version
    const packageJson = await fs.readJSON('package.json');
    const newVersion = packageJson.version;
    console.log(chalk.green(`📦 New version: ${newVersion}`));

    // Build the application
    console.log(chalk.yellow('🔨 Building application...'));
    if (!dryRun) {
      execSync('npm run build:desktop', { stdio: 'inherit' });
    }

    // Generate changelog (if conventional commits are used)
    console.log(chalk.yellow('📝 Generating changelog...'));
    try {
      if (!dryRun) {
        execSync('npx conventional-changelog -p angular -i CHANGELOG.md -s', { stdio: 'inherit' });
      }
    } catch {
      console.log(chalk.gray('⏭️  Skipped changelog generation (conventional-changelog not available)'));
    }

    // Commit version bump and changelog
    if (!dryRun && !semver.valid(versionType)) {
      console.log(chalk.yellow('💾 Committing version bump...'));
      execSync('git add .', { stdio: 'inherit' });
      execSync(`git commit -m "chore: release v${newVersion}"`, { stdio: 'inherit' });
    }

    // Create and push tag
    console.log(chalk.yellow('🏷️  Creating and pushing tag...'));
    if (!dryRun) {
      execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { stdio: 'inherit' });
      execSync(`git push origin v${newVersion}`, { stdio: 'inherit' });
      execSync(`git push origin ${currentBranch}`, { stdio: 'inherit' });
    }

    // GitHub release will be created automatically by the CI/CD workflow

    console.log(chalk.green('🎉 Release process completed successfully!'));
    console.log(chalk.gray('The CI/CD pipeline will handle building and publishing the release.'));

    if (dryRun) {
      console.log(chalk.blue('This was a dry run. No actual changes were made.'));
    }

  } catch (error) {
    console.error(chalk.red('❌ Release failed:'), error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  release();
}

module.exports = release;
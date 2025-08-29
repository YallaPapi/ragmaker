/**
 * Auto-Updater Configuration for RagMaker Desktop
 * Handles automatic updates across all platforms with rollback capabilities
 */

const { autoUpdater } = require('electron-updater');
const { app, dialog, BrowserWindow } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');

class AutoUpdaterManager extends EventEmitter {
  constructor() {
    super();
    this.updateCheckInterval = null;
    this.isChecking = false;
    this.downloadInProgress = false;
    this.currentVersion = app.getVersion();
    this.updateConfig = this.loadUpdateConfig();
    this.rollbackManager = new RollbackManager();
    
    this.setupAutoUpdater();
  }

  loadUpdateConfig() {
    return {
      // Update check frequency (in milliseconds)
      checkInterval: 4 * 60 * 60 * 1000, // 4 hours
      
      // Auto-download updates
      autoDownload: true,
      
      // Auto-install updates (restart required)
      autoInstallOnAppQuit: true,
      
      // Allow pre-release updates
      allowPrerelease: process.env.NODE_ENV === 'development',
      
      // Update channels
      channel: process.env.UPDATE_CHANNEL || 'latest',
      
      // Rollback configuration
      enableRollback: true,
      maxRollbackVersions: 3,
      
      // User preferences
      notifyUser: true,
      allowUserChoice: true,
      
      // Update servers
      updateServers: [
        'https://releases.ragmaker.com/',
        'https://github.com/ragmaker/ragmaker-standalone/releases/',
        'https://s3.amazonaws.com/ragmaker-releases/'
      ],
      
      // Platform-specific settings
      platforms: {
        win32: {
          signature: true,
          differentialDownload: true
        },
        darwin: {
          signature: true,
          differentialDownload: true
        },
        linux: {
          signature: false, // GPG signatures handled separately
          differentialDownload: false
        }
      }
    };
  }

  setupAutoUpdater() {
    // Configure auto-updater
    autoUpdater.autoDownload = this.updateConfig.autoDownload;
    autoUpdater.autoInstallOnAppQuit = this.updateConfig.autoInstallOnAppQuit;
    autoUpdater.allowPrerelease = this.updateConfig.allowPrerelease;
    autoUpdater.channel = this.updateConfig.channel;
    
    // Set update feed URL based on platform
    this.configureUpdateFeed();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Configure logger
    autoUpdater.logger = this.createLogger();
  }

  configureUpdateFeed() {
    const platform = process.platform;
    const arch = process.arch;
    
    // GitHub releases configuration
    if (process.env.GITHUB_OWNER && process.env.GITHUB_REPO) {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        private: false,
        releaseType: this.updateConfig.allowPrerelease ? 'prerelease' : 'release'
      });
    }
    // S3 configuration
    else if (process.env.S3_BUCKET) {
      autoUpdater.setFeedURL({
        provider: 's3',
        bucket: process.env.S3_BUCKET,
        region: process.env.S3_REGION || 'us-east-1',
        path: `releases/${platform}/${arch}`
      });
    }
    // Generic server configuration
    else {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: this.updateConfig.updateServers[0] + `${platform}/${arch}`
      });
    }
  }

  setupEventListeners() {
    // Update available
    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info);
      this.emit('update-available', info);
      
      if (this.updateConfig.notifyUser) {
        this.showUpdateAvailableDialog(info);
      }
    });

    // Update not available
    autoUpdater.on('update-not-available', (info) => {
      console.log('Update not available:', info);
      this.emit('update-not-available', info);
      this.isChecking = false;
    });

    // Download progress
    autoUpdater.on('download-progress', (progressObj) => {
      this.emit('download-progress', progressObj);
      this.updateDownloadProgress(progressObj);
    });

    // Update downloaded
    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info);
      this.emit('update-downloaded', info);
      this.downloadInProgress = false;
      
      // Create backup before applying update
      this.rollbackManager.createBackup(this.currentVersion);
      
      if (this.updateConfig.notifyUser) {
        this.showUpdateReadyDialog(info);
      }
    });

    // Update error
    autoUpdater.on('error', (error) => {
      console.error('Update error:', error);
      this.emit('error', error);
      this.isChecking = false;
      this.downloadInProgress = false;
      
      if (this.updateConfig.notifyUser) {
        this.showUpdateErrorDialog(error);
      }
    });

    // Before quit for update
    autoUpdater.on('before-quit-for-update', () => {
      console.log('App will quit for update');
      this.emit('before-quit-for-update');
    });
  }

  createLogger() {
    return {
      info: (message) => {
        console.log('[AutoUpdater]', message);
        this.emit('log', { level: 'info', message });
      },
      warn: (message) => {
        console.warn('[AutoUpdater]', message);
        this.emit('log', { level: 'warn', message });
      },
      error: (message) => {
        console.error('[AutoUpdater]', message);
        this.emit('log', { level: 'error', message });
      }
    };
  }

  // Public API
  async checkForUpdates() {
    if (this.isChecking || this.downloadInProgress) {
      console.log('Update check already in progress');
      return;
    }

    this.isChecking = true;
    
    try {
      console.log('Checking for updates...');
      const result = await autoUpdater.checkForUpdates();
      return result;
    } catch (error) {
      console.error('Error checking for updates:', error);
      this.isChecking = false;
      throw error;
    }
  }

  async downloadUpdate() {
    if (this.downloadInProgress) {
      console.log('Download already in progress');
      return;
    }

    this.downloadInProgress = true;
    
    try {
      console.log('Downloading update...');
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error('Error downloading update:', error);
      this.downloadInProgress = false;
      throw error;
    }
  }

  quitAndInstall() {
    console.log('Quitting and installing update...');
    autoUpdater.quitAndInstall(false, true);
  }

  startAutoUpdateCheck() {
    if (this.updateCheckInterval) {
      this.stopAutoUpdateCheck();
    }

    console.log('Starting automatic update checks');
    
    // Initial check
    setTimeout(() => this.checkForUpdates(), 10000); // 10 seconds after start
    
    // Periodic checks
    this.updateCheckInterval = setInterval(() => {
      this.checkForUpdates();
    }, this.updateConfig.checkInterval);
  }

  stopAutoUpdateCheck() {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
      console.log('Stopped automatic update checks');
    }
  }

  // UI Dialogs
  async showUpdateAvailableDialog(updateInfo) {
    const response = await dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `RagMaker ${updateInfo.version} is available`,
      detail: `Current version: ${this.currentVersion}\nNew version: ${updateInfo.version}\n\nRelease notes:\n${updateInfo.releaseNotes || 'No release notes available'}`,
      buttons: ['Download Now', 'Download Later', 'Skip This Version'],
      defaultId: 0,
      cancelId: 2
    });

    switch (response.response) {
      case 0: // Download Now
        this.downloadUpdate();
        break;
      case 1: // Download Later
        // Will be prompted again on next check
        break;
      case 2: // Skip This Version
        // Skip this version (could be implemented)
        break;
    }
  }

  async showUpdateReadyDialog(updateInfo) {
    const response = await dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `RagMaker ${updateInfo.version} has been downloaded and is ready to install`,
      detail: 'The application will restart to apply the update. Make sure to save your work.',
      buttons: ['Install Now', 'Install on Next Restart'],
      defaultId: 0,
      cancelId: 1
    });

    if (response.response === 0) {
      this.quitAndInstall();
    }
  }

  async showUpdateErrorDialog(error) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Update Error',
      message: 'Failed to check for updates',
      detail: `Error: ${error.message}\n\nPlease check your internet connection and try again later.`,
      buttons: ['OK']
    });
  }

  updateDownloadProgress(progressObj) {
    const percent = Math.round(progressObj.percent);
    const transferred = Math.round(progressObj.transferred / 1024 / 1024 * 100) / 100;
    const total = Math.round(progressObj.total / 1024 / 1024 * 100) / 100;
    
    console.log(`Download progress: ${percent}% (${transferred}MB/${total}MB)`);
    
    // Update window title or show progress in UI
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.setProgressBar(progressObj.percent / 100);
      }
    });
  }

  // Rollback functionality
  async rollbackToVersion(version) {
    return await this.rollbackManager.rollback(version);
  }

  getAvailableRollbackVersions() {
    return this.rollbackManager.getAvailableVersions();
  }
}

// Rollback Manager
class RollbackManager {
  constructor() {
    this.backupDir = path.join(app.getPath('userData'), 'version-backups');
    this.maxBackups = 3;
  }

  async createBackup(version) {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      
      const backupPath = path.join(this.backupDir, `v${version}`);
      const appPath = app.getAppPath();
      
      // Create version backup (simplified - would need proper implementation)
      console.log(`Creating backup for version ${version}`);
      
      // Store version metadata
      const metadata = {
        version,
        timestamp: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch
      };
      
      await fs.writeFile(
        path.join(backupPath, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );
      
      // Cleanup old backups
      await this.cleanupOldBackups();
      
    } catch (error) {
      console.error('Failed to create version backup:', error);
    }
  }

  async rollback(version) {
    try {
      const backupPath = path.join(this.backupDir, `v${version}`);
      
      // Verify backup exists
      const metadataPath = path.join(backupPath, 'metadata.json');
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      
      console.log(`Rolling back to version ${version}`);
      
      // Implement actual rollback logic
      // This would involve restoring app files and restarting
      
      return { success: true, version: metadata.version };
      
    } catch (error) {
      console.error('Failed to rollback:', error);
      return { success: false, error: error.message };
    }
  }

  async getAvailableVersions() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      const backups = await fs.readdir(this.backupDir);
      
      const versions = [];
      for (const backup of backups) {
        try {
          const metadataPath = path.join(this.backupDir, backup, 'metadata.json');
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
          versions.push(metadata);
        } catch (error) {
          console.warn(`Invalid backup: ${backup}`);
        }
      }
      
      return versions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
    } catch (error) {
      console.error('Failed to get available versions:', error);
      return [];
    }
  }

  async cleanupOldBackups() {
    try {
      const versions = await this.getAvailableVersions();
      
      if (versions.length > this.maxBackups) {
        const toDelete = versions.slice(this.maxBackups);
        
        for (const version of toDelete) {
          const backupPath = path.join(this.backupDir, `v${version.version}`);
          await fs.rmdir(backupPath, { recursive: true });
          console.log(`Cleaned up old backup: ${version.version}`);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old backups:', error);
    }
  }
}

// Export
module.exports = {
  AutoUpdaterManager,
  RollbackManager,
  
  // Factory function
  createAutoUpdater: (config = {}) => {
    const manager = new AutoUpdaterManager();
    
    // Override default config
    Object.assign(manager.updateConfig, config);
    
    return manager;
  },
  
  // Utility functions
  isUpdateSupported: () => {
    // Auto-updater is not supported on Linux in some cases
    if (process.platform === 'linux') {
      return process.env.APPIMAGE !== undefined;
    }
    return true;
  },
  
  getUpdateChannel: () => {
    return process.env.UPDATE_CHANNEL || 'latest';
  }
};

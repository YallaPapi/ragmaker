const { autoUpdater } = require('electron-updater');
const { dialog, BrowserWindow } = require('electron');
const log = require('electron-log');

class AutoUpdater {
  constructor() {
    this.mainWindow = null;
    this.updateCheckInProgress = false;
    this.downloadInProgress = false;
    
    // Configure auto-updater
    this.configureUpdater();
    this.setupEventHandlers();
  }

  configureUpdater() {
    // Configure logging
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    
    // Configure update server
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'your-username',
      repo: 'ragmaker',
      private: false
    });

    // Update check settings
    autoUpdater.autoDownload = false; // Don't auto-download updates
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;

    // Check for updates every 4 hours in production
    if (!process.env.ELECTRON_IS_DEV) {
      setInterval(() => {
        this.checkForUpdates();
      }, 4 * 60 * 60 * 1000);
    }
  }

  setupEventHandlers() {
    // Update available
    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info);
      this.showUpdateDialog(info);
    });

    // No update available
    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info);
      this.updateCheckInProgress = false;
      
      // Show notification if user manually checked
      if (this.manualCheck) {
        this.showNoUpdateDialog();
        this.manualCheck = false;
      }
    });

    // Update error
    autoUpdater.on('error', (error) => {
      log.error('Update error:', error);
      this.updateCheckInProgress = false;
      this.downloadInProgress = false;
      
      this.showErrorDialog(error);
    });

    // Download progress
    autoUpdater.on('download-progress', (progress) => {
      log.info('Download progress:', progress);
      this.updateDownloadProgress(progress);
    });

    // Update downloaded
    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info);
      this.downloadInProgress = false;
      this.showInstallDialog(info);
    });

    // Before quit for update
    autoUpdater.on('before-quit-for-update', () => {
      log.info('App will quit for update');
      // Save app state if needed
    });
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  async checkForUpdates(manual = false) {
    if (this.updateCheckInProgress) {
      log.info('Update check already in progress');
      return;
    }

    if (process.env.ELECTRON_IS_DEV) {
      log.info('Skipping update check in development mode');
      if (manual) {
        this.showDevModeDialog();
      }
      return;
    }

    try {
      this.updateCheckInProgress = true;
      this.manualCheck = manual;
      
      if (manual) {
        this.showCheckingDialog();
      }

      log.info('Checking for updates...');
      await autoUpdater.checkForUpdates();
    } catch (error) {
      log.error('Failed to check for updates:', error);
      this.updateCheckInProgress = false;
      
      if (manual) {
        this.showErrorDialog(error);
      }
    }
  }

  downloadUpdate() {
    if (this.downloadInProgress) {
      log.info('Download already in progress');
      return;
    }

    this.downloadInProgress = true;
    this.showDownloadDialog();
    
    autoUpdater.downloadUpdate();
  }

  quitAndInstall() {
    log.info('Quitting and installing update...');
    autoUpdater.quitAndInstall(false, true);
  }

  // Dialog methods
  showUpdateDialog(info) {
    if (!this.mainWindow) return;

    const response = dialog.showMessageBoxSync(this.mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available!`,
      detail: `Current version: ${require('../package.json').version}\nNew version: ${info.version}\n\nWould you like to download it now?`,
      buttons: ['Download Now', 'Later', 'Release Notes'],
      defaultId: 0,
      cancelId: 1
    });

    switch (response) {
      case 0: // Download Now
        this.downloadUpdate();
        break;
      case 1: // Later
        log.info('User chose to update later');
        break;
      case 2: // Release Notes
        require('electron').shell.openExternal(`https://github.com/your-username/ragmaker/releases/tag/v${info.version}`);
        // Show dialog again after opening release notes
        setTimeout(() => this.showUpdateDialog(info), 1000);
        break;
    }
  }

  showNoUpdateDialog() {
    if (!this.mainWindow) return;

    dialog.showMessageBoxSync(this.mainWindow, {
      type: 'info',
      title: 'No Updates Available',
      message: 'You are using the latest version!',
      detail: `Current version: ${require('../package.json').version}`,
      buttons: ['OK']
    });
  }

  showErrorDialog(error) {
    if (!this.mainWindow) return;

    dialog.showMessageBoxSync(this.mainWindow, {
      type: 'error',
      title: 'Update Error',
      message: 'Failed to check for updates',
      detail: `Error: ${error.message}\n\nPlease try again later or check your internet connection.`,
      buttons: ['OK']
    });
  }

  showCheckingDialog() {
    if (!this.mainWindow) return;

    // This could be implemented as a non-blocking notification
    this.mainWindow.webContents.send('update-status', {
      type: 'checking',
      message: 'Checking for updates...'
    });
  }

  showDownloadDialog() {
    if (!this.mainWindow) return;

    this.mainWindow.webContents.send('update-status', {
      type: 'downloading',
      message: 'Downloading update...',
      progress: 0
    });
  }

  updateDownloadProgress(progress) {
    if (!this.mainWindow) return;

    this.mainWindow.webContents.send('update-status', {
      type: 'downloading',
      message: `Downloading update... ${Math.round(progress.percent)}%`,
      progress: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    });
  }

  showInstallDialog(info) {
    if (!this.mainWindow) return;

    const response = dialog.showMessageBoxSync(this.mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded successfully!',
      detail: `Version ${info.version} is ready to install.\n\nThe application will restart to complete the installation.`,
      buttons: ['Install Now', 'Install on Exit'],
      defaultId: 0
    });

    if (response === 0) {
      this.quitAndInstall();
    } else {
      log.info('User chose to install on exit');
      // Update will be installed when app quits naturally
    }
  }

  showDevModeDialog() {
    if (!this.mainWindow) return;

    dialog.showMessageBoxSync(this.mainWindow, {
      type: 'info',
      title: 'Development Mode',
      message: 'Auto-updater is disabled in development mode',
      detail: 'Updates are only available in production builds.',
      buttons: ['OK']
    });
  }

  // Public API methods
  checkForUpdatesManually() {
    this.checkForUpdates(true);
  }

  getUpdateStatus() {
    return {
      checking: this.updateCheckInProgress,
      downloading: this.downloadInProgress,
      version: require('../package.json').version
    };
  }

  // Initialize updater when app is ready
  init() {
    // Check for updates on startup (delayed)
    if (!process.env.ELECTRON_IS_DEV) {
      setTimeout(() => {
        this.checkForUpdates();
      }, 10000); // Check 10 seconds after startup
    }
  }
}

module.exports = new AutoUpdater();
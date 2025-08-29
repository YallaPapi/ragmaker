const { autoUpdater } = require('electron-updater');
const { dialog, Notification } = require('electron');
const log = require('electron-log');

class UpdaterManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.isDev = process.env.NODE_ENV === 'development';
    
    this.setupLogging();
    this.setupAutoUpdater();
    this.setupEventHandlers();
  }

  setupLogging() {
    // Configure electron-log for auto-updater
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    
    if (this.isDev) {
      log.info('Auto-updater initialized in development mode');
    }
  }

  setupAutoUpdater() {
    // Auto-updater configuration
    autoUpdater.autoDownload = false; // Don't auto-download updates
    autoUpdater.autoInstallOnAppQuit = true; // Install on quit
    
    // Set update check interval (24 hours)
    autoUpdater.checkForUpdatesAndNotify();
    
    if (!this.isDev) {
      // Check for updates every 24 hours
      setInterval(() => {
        this.checkForUpdates();
      }, 24 * 60 * 60 * 1000);
    }

    // Configure update server (replace with your actual server)
    if (process.platform === 'win32') {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'ragmaker',
        repo: 'ragmaker-desktop',
        private: false,
        token: process.env.GITHUB_TOKEN // Optional for private repos
      });
    } else if (process.platform === 'darwin') {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'ragmaker',
        repo: 'ragmaker-desktop',
        private: false
      });
    } else {
      // Linux
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'ragmaker',
        repo: 'ragmaker-desktop',
        private: false
      });
    }
  }

  setupEventHandlers() {
    // Checking for update
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...');
      this.sendToRenderer('update-status', { 
        status: 'checking',
        message: 'Checking for updates...' 
      });
    });

    // Update available
    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info);
      this.sendToRenderer('update-status', { 
        status: 'available',
        message: 'Update available',
        info 
      });
      
      this.showUpdateAvailableDialog(info);
    });

    // Update not available
    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info);
      this.sendToRenderer('update-status', { 
        status: 'not-available',
        message: 'No updates available',
        info 
      });
    });

    // Update error
    autoUpdater.on('error', (err) => {
      log.error('Update error:', err);
      this.sendToRenderer('update-status', { 
        status: 'error',
        message: 'Update error',
        error: err.message 
      });
      
      this.showUpdateErrorDialog(err);
    });

    // Download progress
    autoUpdater.on('download-progress', (progressObj) => {
      const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
      log.info(logMessage);
      
      this.sendToRenderer('update-progress', progressObj);
      
      // Update progress notification
      if (this.downloadNotification) {
        this.downloadNotification.body = `Downloaded ${Math.round(progressObj.percent)}%`;
      }
    });

    // Update downloaded
    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info);
      this.sendToRenderer('update-status', { 
        status: 'downloaded',
        message: 'Update ready to install',
        info 
      });
      
      this.showUpdateReadyDialog(info);
    });

    // Before quit for update
    autoUpdater.on('before-quit-for-update', () => {
      log.info('App will quit for update');
      this.sendToRenderer('update-status', { 
        status: 'installing',
        message: 'Installing update...' 
      });
    });
  }

  checkForUpdates() {
    if (this.isDev) {
      log.info('Skipping update check in development mode');
      return;
    }

    try {
      autoUpdater.checkForUpdatesAndNotify();
    } catch (error) {
      log.error('Failed to check for updates:', error);
    }
  }

  downloadUpdate() {
    try {
      autoUpdater.downloadUpdate();
      this.showDownloadNotification();
    } catch (error) {
      log.error('Failed to download update:', error);
    }
  }

  installUpdate() {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (error) {
      log.error('Failed to install update:', error);
    }
  }

  async showUpdateAvailableDialog(info) {
    try {
      const result = await dialog.showMessageBox(this.mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) of RagMaker is available.`,
        detail: info.releaseNotes || 'Would you like to download it now?',
        buttons: ['Download Now', 'Later'],
        defaultId: 0,
        cancelId: 1
      });

      if (result.response === 0) {
        this.downloadUpdate();
      }
    } catch (error) {
      log.error('Error showing update dialog:', error);
    }
  }

  async showUpdateReadyDialog(info) {
    try {
      const result = await dialog.showMessageBox(this.mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Update to version ${info.version} is ready to install.`,
        detail: 'The application will restart to complete the installation.',
        buttons: ['Install and Restart', 'Install on Exit'],
        defaultId: 0,
        cancelId: 1
      });

      if (result.response === 0) {
        this.installUpdate();
      }
    } catch (error) {
      log.error('Error showing update ready dialog:', error);
    }
  }

  showUpdateErrorDialog(error) {
    dialog.showErrorBox(
      'Update Error', 
      `Failed to update the application: ${error.message}`
    );
  }

  showDownloadNotification() {
    if (Notification.isSupported()) {
      this.downloadNotification = new Notification({
        title: 'RagMaker Update',
        body: 'Downloading update...',
        icon: '../assets/icons/icon.png'
      });
      
      this.downloadNotification.show();
    }
  }

  showUpdateCompleteNotification() {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'RagMaker Updated',
        body: 'Update installed successfully!',
        icon: '../assets/icons/icon.png'
      });
      
      notification.show();
    }
  }

  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // Manual update check (for menu item)
  async manualCheckForUpdates() {
    try {
      const result = await autoUpdater.checkForUpdatesAndNotify();
      
      if (!result || !result.updateInfo) {
        dialog.showMessageBox(this.mainWindow, {
          type: 'info',
          title: 'No Updates',
          message: 'RagMaker is up to date.',
          detail: `Current version: ${require('../../package.json').version}`
        });
      }
    } catch (error) {
      log.error('Manual update check failed:', error);
      dialog.showErrorBox('Update Check Failed', error.message);
    }
  }

  // Get current version info
  getCurrentVersion() {
    const packageJson = require('../../package.json');
    return {
      version: packageJson.version,
      name: packageJson.name,
      description: packageJson.description
    };
  }

  // Clean up resources
  cleanup() {
    if (this.downloadNotification) {
      this.downloadNotification.close();
    }
    
    // Remove all listeners
    autoUpdater.removeAllListeners();
  }
}

module.exports = { UpdaterManager };
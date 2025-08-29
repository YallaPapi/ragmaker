const { app, BrowserWindow, Menu, ipcMain, shell, dialog, autoUpdater } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';
const { WindowManager } = require('./windowManager');
const { MenuManager } = require('./menuManager');
const { IPCManager } = require('./ipcManager');
const { SecurityManager } = require('./securityManager');

// Initialize managers
let windowManager;
let menuManager;
let ipcManager;
let securityManager;

class RagMakerApp {
  constructor() {
    this.mainWindow = null;
    this.isQuitting = false;
    this.initializeManagers();
    this.setupAppEvents();
  }

  initializeManagers() {
    windowManager = new WindowManager();
    menuManager = new MenuManager();
    ipcManager = new IPCManager();
    securityManager = new SecurityManager();
  }

  setupAppEvents() {
    // App ready event
    app.whenReady().then(() => {
      this.createMainWindow();
      this.setupMenu();
      this.setupIPC();
      this.setupAutoUpdater();
      
      // macOS specific: Re-create window when dock icon is clicked
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createMainWindow();
        }
      });
    });

    // All windows closed
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Before quit event
    app.on('before-quit', (event) => {
      this.isQuitting = true;
    });

    // Certificate error handling
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
      if (isDev) {
        // In development, ignore certificate errors
        event.preventDefault();
        callback(true);
      } else {
        // In production, use default behavior
        callback(false);
      }
    });

    // Handle protocol for deep linking
    app.setAsDefaultProtocolClient('ragmaker');
  }

  createMainWindow() {
    try {
      this.mainWindow = windowManager.createMainWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: path.join(__dirname, 'preload.js'),
          webSecurity: !isDev,
          allowRunningInsecureContent: false,
          experimentalFeatures: false
        }
      });

      // Apply security policies
      securityManager.applySecurityPolicies(this.mainWindow);

      // Load the application
      const startUrl = isDev 
        ? 'http://localhost:3000' 
        : `file://${path.join(__dirname, '../../build/index.html')}`;
      
      this.mainWindow.loadURL(startUrl);

      // Show window when ready
      this.mainWindow.once('ready-to-show', () => {
        this.mainWindow.show();
        if (isDev) {
          this.mainWindow.webContents.openDevTools();
        }
      });

      // Handle window closed
      this.mainWindow.on('closed', () => {
        this.mainWindow = null;
      });

      // Handle external links
      this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
      });

      return this.mainWindow;
    } catch (error) {
      console.error('Failed to create main window:', error);
      dialog.showErrorBox('Startup Error', 'Failed to create application window');
    }
  }

  setupMenu() {
    const menu = menuManager.createApplicationMenu({
      onNewWindow: () => this.createMainWindow(),
      onToggleDevTools: () => {
        if (this.mainWindow) {
          this.mainWindow.webContents.toggleDevTools();
        }
      },
      onReload: () => {
        if (this.mainWindow) {
          this.mainWindow.reload();
        }
      },
      onAbout: () => this.showAboutDialog()
    });
    
    Menu.setApplicationMenu(menu);
  }

  setupIPC() {
    ipcManager.setupHandlers({
      app: this,
      mainWindow: this.mainWindow,
      windowManager: windowManager
    });
  }

  setupAutoUpdater() {
    if (!isDev) {
      // Configure auto-updater
      autoUpdater.setFeedURL({
        url: 'https://your-update-server.com/updates',
        headers: {
          'User-Agent': `RagMaker/${app.getVersion()}`
        }
      });

      // Auto-updater events
      autoUpdater.on('checking-for-update', () => {
        console.log('Checking for update...');
      });

      autoUpdater.on('update-available', () => {
        console.log('Update available.');
        this.showUpdateDialog();
      });

      autoUpdater.on('update-not-available', () => {
        console.log('Update not available.');
      });

      autoUpdater.on('error', (err) => {
        console.error('Error in auto-updater:', err);
      });

      autoUpdater.on('download-progress', (progressObj) => {
        let log_message = `Download speed: ${progressObj.bytesPerSecond}`;
        log_message = `${log_message} - Downloaded ${progressObj.percent}%`;
        log_message = `${log_message} (${progressObj.transferred}/${progressObj.total})`;
        console.log(log_message);
        
        // Send progress to renderer
        if (this.mainWindow) {
          this.mainWindow.webContents.send('update-progress', progressObj);
        }
      });

      autoUpdater.on('update-downloaded', () => {
        console.log('Update downloaded');
        this.showUpdateReadyDialog();
      });

      // Check for updates on startup (after 3 seconds)
      setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify();
      }, 3000);
    }
  }

  showAboutDialog() {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'About RagMaker',
      message: 'RagMaker Desktop',
      detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}`
    });
  }

  showUpdateDialog() {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: 'A new version of RagMaker is available.',
      detail: 'The update will be downloaded in the background.',
      buttons: ['OK']
    });
  }

  showUpdateReadyDialog() {
    const response = dialog.showMessageBoxSync(this.mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded and ready to install.',
      detail: 'The application will restart to apply the update.',
      buttons: ['Restart Now', 'Later']
    });

    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  }

  // Graceful shutdown
  async shutdown() {
    try {
      // Save application state
      await this.saveApplicationState();
      
      // Close all windows
      BrowserWindow.getAllWindows().forEach(window => {
        window.close();
      });
      
      console.log('Application shutdown complete');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }

  async saveApplicationState() {
    // Implement state saving logic here
    // This could include window positions, user preferences, etc.
    console.log('Saving application state...');
  }
}

// Create application instance
const ragMakerApp = new RagMakerApp();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox('Unexpected Error', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = ragMakerApp;
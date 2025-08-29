const { BrowserWindow, screen } = require('electron');
const path = require('path');

class WindowManager {
  constructor() {
    this.windows = new Map();
    this.defaultWindowSettings = {
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      titleBarStyle: 'default',
      backgroundColor: '#ffffff',
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false
      }
    };
  }

  createMainWindow(options = {}) {
    const settings = {
      ...this.defaultWindowSettings,
      ...options,
      webPreferences: {
        ...this.defaultWindowSettings.webPreferences,
        ...options.webPreferences,
        preload: path.join(__dirname, 'preload.js')
      }
    };

    // Center the window on the primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    
    settings.x = Math.floor((screenWidth - settings.width) / 2);
    settings.y = Math.floor((screenHeight - settings.height) / 2);

    const window = new BrowserWindow(settings);
    
    // Store window reference
    this.windows.set('main', window);

    // Setup window event handlers
    this.setupWindowEvents(window, 'main');

    return window;
  }

  createSettingsWindow() {
    if (this.windows.has('settings')) {
      const settingsWindow = this.windows.get('settings');
      settingsWindow.focus();
      return settingsWindow;
    }

    const mainWindow = this.windows.get('main');
    const settings = {
      width: 600,
      height: 500,
      minWidth: 500,
      minHeight: 400,
      parent: mainWindow,
      modal: true,
      resizable: true,
      maximizable: false,
      title: 'Settings - RagMaker',
      webPreferences: {
        ...this.defaultWindowSettings.webPreferences,
        preload: path.join(__dirname, 'preload.js')
      }
    };

    const window = new BrowserWindow(settings);
    this.windows.set('settings', window);
    this.setupWindowEvents(window, 'settings');

    return window;
  }

  createAboutWindow() {
    if (this.windows.has('about')) {
      const aboutWindow = this.windows.get('about');
      aboutWindow.focus();
      return aboutWindow;
    }

    const mainWindow = this.windows.get('main');
    const settings = {
      width: 400,
      height: 300,
      parent: mainWindow,
      modal: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      title: 'About RagMaker',
      webPreferences: {
        ...this.defaultWindowSettings.webPreferences,
        preload: path.join(__dirname, 'preload.js')
      }
    };

    const window = new BrowserWindow(settings);
    this.windows.set('about', window);
    this.setupWindowEvents(window, 'about');

    return window;
  }

  setupWindowEvents(window, windowId) {
    // Window closed event
    window.on('closed', () => {
      this.windows.delete(windowId);
    });

    // Window focus event
    window.on('focus', () => {
      console.log(`Window ${windowId} focused`);
    });

    // Window blur event
    window.on('blur', () => {
      console.log(`Window ${windowId} blurred`);
    });

    // Window maximize event
    window.on('maximize', () => {
      window.webContents.send('window-state-changed', { maximized: true });
    });

    // Window unmaximize event
    window.on('unmaximize', () => {
      window.webContents.send('window-state-changed', { maximized: false });
    });

    // Window minimize event
    window.on('minimize', () => {
      window.webContents.send('window-state-changed', { minimized: true });
    });

    // Window restore event
    window.on('restore', () => {
      window.webContents.send('window-state-changed', { 
        minimized: false, 
        maximized: window.isMaximized() 
      });
    });

    // Handle window move/resize for state persistence
    let resizeTimeout;
    window.on('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.saveWindowState(windowId, window);
      }, 500);
    });

    window.on('move', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.saveWindowState(windowId, window);
      }, 500);
    });
  }

  getWindow(windowId) {
    return this.windows.get(windowId);
  }

  getAllWindows() {
    return Array.from(this.windows.values());
  }

  closeWindow(windowId) {
    const window = this.windows.get(windowId);
    if (window && !window.isDestroyed()) {
      window.close();
    }
  }

  closeAllWindows() {
    this.windows.forEach((window, windowId) => {
      if (!window.isDestroyed()) {
        window.close();
      }
    });
    this.windows.clear();
  }

  minimizeWindow(windowId) {
    const window = this.windows.get(windowId);
    if (window && !window.isDestroyed()) {
      window.minimize();
    }
  }

  maximizeWindow(windowId) {
    const window = this.windows.get(windowId);
    if (window && !window.isDestroyed()) {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    }
  }

  focusWindow(windowId) {
    const window = this.windows.get(windowId);
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) {
        window.restore();
      }
      window.focus();
    }
  }

  saveWindowState(windowId, window) {
    try {
      const bounds = window.getBounds();
      const state = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: window.isMaximized(),
        isMinimized: window.isMinimized()
      };
      
      // Save to settings or preferences
      // This would typically be saved to a config file or database
      console.log(`Saving window state for ${windowId}:`, state);
    } catch (error) {
      console.error(`Failed to save window state for ${windowId}:`, error);
    }
  }

  restoreWindowState(windowId, window) {
    try {
      // Load from settings or preferences
      // This would typically be loaded from a config file or database
      const savedState = this.loadWindowState(windowId);
      
      if (savedState) {
        window.setBounds({
          x: savedState.x,
          y: savedState.y,
          width: savedState.width,
          height: savedState.height
        });
        
        if (savedState.isMaximized) {
          window.maximize();
        }
      }
    } catch (error) {
      console.error(`Failed to restore window state for ${windowId}:`, error);
    }
  }

  loadWindowState(windowId) {
    // Implementation would load from persistent storage
    // For now, return null to use default positioning
    return null;
  }

  // Utility methods
  centerWindow(windowId) {
    const window = this.windows.get(windowId);
    if (window && !window.isDestroyed()) {
      window.center();
    }
  }

  setWindowTitle(windowId, title) {
    const window = this.windows.get(windowId);
    if (window && !window.isDestroyed()) {
      window.setTitle(title);
    }
  }

  getWindowBounds(windowId) {
    const window = this.windows.get(windowId);
    return window && !window.isDestroyed() ? window.getBounds() : null;
  }
}

module.exports = { WindowManager };
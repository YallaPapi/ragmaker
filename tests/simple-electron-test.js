const { app, BrowserWindow } = require('electron');
const path = require('path');

// Simple Electron app for testing
class SimpleElectronApp {
  constructor() {
    this.window = null;
    this.setupApp();
  }

  async setupApp() {
    await app.whenReady();
    this.createWindow();
    
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }

  createWindow() {
    this.window = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // Load a simple HTML page
    this.window.loadURL('data:text/html,<html><body><h1>RAGMaker Desktop Test</h1><p>✅ Electron app started successfully!</p></body></html>');
    
    this.window.on('closed', () => {
      this.window = null;
    });
    
    console.log('✅ Simple Electron app running');
  }
}

new SimpleElectronApp();
const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const express = require('express');

const isDev = process.env.NODE_ENV === 'development';

class MinimalRAGMaker {
  constructor() {
    this.mainWindow = null;
    this.server = null;
    this.setupApp();
  }

  async setupApp() {
    await app.whenReady();
    
    // Start basic server
    await this.startBasicServer();
    
    // Create window
    this.createMainWindow();
    
    // Setup events
    this.setupAppEvents();
  }

  async startBasicServer() {
    const expressApp = express();
    expressApp.use(express.json());
    expressApp.use(express.static(path.join(__dirname, '../app/frontend')));

    // Basic health endpoint
    expressApp.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    return new Promise((resolve) => {
      this.server = expressApp.listen(0, () => {
        this.port = this.server.address().port;
        console.log(`✅ Basic server running on port ${this.port}`);
        resolve();
      });
    });
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../app/preload.js')
      },
      show: false
    });

    // Load from local server
    this.mainWindow.loadURL(`http://localhost:${this.port}`);
    
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      console.log('✅ Window displayed successfully');
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  setupAppEvents() {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        if (this.server) {
          this.server.close();
        }
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });
  }
}

new MinimalRAGMaker();
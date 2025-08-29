const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const isDev = process.env.NODE_ENV === 'development';

class RAGMakerDesktopApp {
  constructor() {
    this.backendServer = null;
    this.httpServer = null;
    this.wsServer = null;
    this.mainWindow = null;
    this.backendPort = null;
    this.frontendPort = 3000;
    
    this.setupApp();
  }

  async setupApp() {
    // Wait for Electron to be ready
    await app.whenReady();
    
    // Start backend services FIRST and wait for them to be ready
    await this.startBackendServices();
    
    // THEN create main window
    this.createMainWindow();
    
    // Setup application menu
    this.setupMenu();
    
    // Setup IPC handlers
    this.setupIPC();

    // Handle app events
    this.setupAppEvents();
  }

  async startBackendServices() {
    try {
      // Start Express server for API
      const expressApp = express();
      expressApp.use(cors());
      expressApp.use(express.json());
      
      // Serve static frontend files
      expressApp.use(express.static(path.join(__dirname, 'frontend')));
      
      // API routes
      expressApp.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: Date.now() });
      });
      
      // Basic API endpoints for testing
      expressApp.get('/api/status', (req, res) => {
        res.json({ 
          status: 'ok', 
          timestamp: Date.now(),
          message: 'RAGMaker Desktop Basic API'
        });
      });

      expressApp.post('/api/test', (req, res) => {
        res.json({ 
          success: true, 
          data: req.body,
          timestamp: Date.now() 
        });
      });

      // Proxy API requests to backend server running on port 3012
      const { createProxyMiddleware } = require('http-proxy-middleware');
      expressApp.use('/api', createProxyMiddleware({
        target: 'http://localhost:3012',
        changeOrigin: true,
        logLevel: 'silent'
      }));

      console.log('✅ API proxy to backend server initialized');
      
      // Start HTTP server
      this.httpServer = http.createServer(expressApp);
      
      // Setup WebSocket for real-time updates
      this.wsServer = new WebSocket.Server({ server: this.httpServer });
      this.wsServer.on('connection', (ws) => {
        console.log('WebSocket client connected');
        ws.send(JSON.stringify({ type: 'connected', data: 'RAGMaker Desktop ready' }));
      });
      
      // Start listening and wait for server to be ready
      await new Promise((resolve, reject) => {
        this.httpServer.listen(0, (error) => {
          if (error) {
            reject(error);
            return;
          }
          
          this.frontendPort = this.httpServer.address().port;
          console.log(`🚀 RAGMaker Desktop frontend running on port ${this.frontendPort}`);
          resolve();
        });
      });
      
    } catch (error) {
      console.error('❌ Failed to start backend services:', error);
      dialog.showErrorBox('Backend Error', `Failed to start backend services: ${error.message}`);
      throw error;
    }
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      icon: path.join(__dirname, 'frontend/assets/icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: !isDev
      },
      titleBarStyle: 'hiddenInset',
      show: false
    });

    // Load the frontend using the frontend port (FIXED!)
    const startUrl = `http://localhost:${this.frontendPort}`;
    console.log(`Loading frontend from: ${startUrl}`);
    this.mainWindow.loadURL(startUrl);

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      console.log('✅ Main window displayed');
      
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
  }

  setupMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'New Project',
            accelerator: 'CmdOrCtrl+N',
            click: () => this.sendToRenderer('menu:new-project')
          },
          {
            label: 'Open Project',
            accelerator: 'CmdOrCtrl+O',
            click: async () => {
              const result = await dialog.showOpenDialog(this.mainWindow, {
                properties: ['openDirectory'],
                title: 'Select Project Directory'
              });
              if (!result.canceled) {
                this.sendToRenderer('menu:open-project', result.filePaths[0]);
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => app.quit()
          }
        ]
      },
      {
        label: 'RAG',
        submenu: [
          {
            label: 'Index Documents',
            accelerator: 'CmdOrCtrl+I',
            click: () => this.sendToRenderer('menu:index-documents')
          },
          {
            label: 'Search Knowledge Base',
            accelerator: 'CmdOrCtrl+F',
            click: () => this.sendToRenderer('menu:search')
          }
        ]
      },
      {
        label: 'YouTube',
        submenu: [
          {
            label: 'Add Channel',
            accelerator: 'CmdOrCtrl+Shift+A',
            click: () => this.sendToRenderer('menu:add-youtube-channel')
          },
          {
            label: 'Bulk Import',
            accelerator: 'CmdOrCtrl+Shift+I',
            click: () => this.sendToRenderer('menu:bulk-import-youtube')
          }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  setupIPC() {
    // File operations
    ipcMain.handle('file:select', async (event, options = {}) => {
      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        ...options
      });
      return result;
    });

    ipcMain.handle('file:save', async (event, options = {}) => {
      const result = await dialog.showSaveDialog(this.mainWindow, options);
      return result;
    });

    // App operations
    ipcMain.handle('app:getVersion', () => {
      return app.getVersion();
    });

    ipcMain.handle('app:quit', () => {
      app.quit();
    });

    // Window operations
    ipcMain.handle('window:minimize', () => {
      if (this.mainWindow) this.mainWindow.minimize();
    });

    ipcMain.handle('window:maximize', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMaximized()) {
          this.mainWindow.unmaximize();
        } else {
          this.mainWindow.maximize();
        }
      }
    });

    ipcMain.handle('window:close', () => {
      if (this.mainWindow) this.mainWindow.close();
    });
  }

  setupAppEvents() {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.cleanup();
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    app.on('before-quit', () => {
      this.cleanup();
    });
  }

  sendToRenderer(channel, data = null) {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  cleanup() {
    console.log('🧹 Cleaning up RAGMaker Desktop...');
    
    if (this.httpServer) {
      this.httpServer.close();
    }
    
    if (this.wsServer) {
      this.wsServer.close();
    }
    
    console.log('✅ Cleanup complete');
  }
}

// Initialize the app
try {
  new RAGMakerDesktopApp();
} catch (error) {
  console.error('❌ Failed to start RAGMaker Desktop:', error);
  app.whenReady().then(() => {
    dialog.showErrorBox('Startup Error', `Failed to start application: ${error.message}`);
    app.quit();
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox('Application Error', error.message);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});
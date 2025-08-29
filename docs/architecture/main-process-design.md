# Main Process Architecture Design

## Overview

The main process serves as the central orchestrator for the RAGMaker Electron application, managing application lifecycle, security boundaries, native integrations, and business logic coordination.

## Core Responsibilities

### 1. Application Lifecycle Management
- Application startup and shutdown procedures
- Window creation and management
- Process spawning and coordination
- Resource cleanup and memory management

### 2. Security Enforcement
- Context isolation enforcement
- IPC message validation and sanitization  
- CSP policy enforcement
- Secure API exposure management

### 3. Native System Integration
- File system operations with proper permissions
- System tray and menu management
- Native notifications
- Auto-updater coordination

### 4. Business Logic Orchestration
- RAG system coordination
- YouTube service management
- Vector store operations
- Data persistence management

## Detailed Architecture

### Application Bootstrap Layer

```javascript
// src/main/bootstrap/app-manager.js
class ApplicationManager {
  constructor() {
    this.securityManager = new SecurityManager();
    this.windowManager = new WindowManager();
    this.ipcController = new IPCController();
    this.nativeIntegrations = new NativeIntegrations();
    this.serviceManager = new ServiceManager();
  }

  async initialize() {
    // 1. Security setup (must be first)
    await this.securityManager.initialize();
    
    // 2. Native integrations
    await this.nativeIntegrations.initialize();
    
    // 3. Service layer
    await this.serviceManager.initialize();
    
    // 4. IPC setup
    await this.ipcController.initialize();
    
    // 5. Window creation
    await this.windowManager.createMainWindow();
  }
}
```

### Security Manager

```javascript
// src/main/security/security-manager.js
class SecurityManager {
  constructor() {
    this.cspPolicy = this.buildCSPPolicy();
    this.allowedOrigins = ['app://rse'];
    this.trustedHosts = ['api.openai.com', '*.upstash.io'];
  }

  buildCSPPolicy() {
    return {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'", ...this.trustedHosts],
      'font-src': ["'self'"],
      'object-src': ["'none'"],
      'media-src': ["'none'"]
    };
  }

  validateIPCMessage(channel, data) {
    // Implement message validation logic
    const allowedChannels = [
      'rag:query', 'channel:index', 'channel:list',
      'project:create', 'project:switch', 'settings:update'
    ];
    
    if (!allowedChannels.includes(channel)) {
      throw new Error(`Unauthorized IPC channel: ${channel}`);
    }
    
    // Validate data structure based on channel
    return this.validateChannelData(channel, data);
  }
}
```

### Window Manager

```javascript
// src/main/window/window-manager.js
class WindowManager {
  constructor() {
    this.windows = new Map();
    this.defaultWindowConfig = {
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webSecurity: true,
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
      sandbox: true
    };
  }

  async createMainWindow() {
    const mainWindow = new BrowserWindow({
      ...this.defaultWindowConfig,
      webPreferences: {
        preload: path.join(__dirname, '../../preload/main-preload.js'),
        contextIsolation: true,
        enableRemoteModule: false,
        nodeIntegration: false,
        sandbox: true
      }
    });

    // Load the app
    if (isDevelopment) {
      await mainWindow.loadURL('http://localhost:3000');
      mainWindow.webContents.openDevTools();
    } else {
      await mainWindow.loadFile('dist/index.html');
    }

    this.windows.set('main', mainWindow);
    return mainWindow;
  }

  createSettingsWindow() {
    // Settings window with restricted permissions
    const settingsWindow = new BrowserWindow({
      width: 800,
      height: 600,
      parent: this.windows.get('main'),
      modal: true,
      webPreferences: {
        preload: path.join(__dirname, '../../preload/settings-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    this.windows.set('settings', settingsWindow);
    return settingsWindow;
  }
}
```

### IPC Controller

```javascript
// src/main/ipc/ipc-controller.js
class IPCController {
  constructor(securityManager, serviceManager) {
    this.security = securityManager;
    this.services = serviceManager;
    this.handlers = new Map();
  }

  async initialize() {
    // RAG System Handlers
    this.registerHandler('rag:query', this.handleRAGQuery.bind(this));
    this.registerHandler('rag:chat', this.handleRAGChat.bind(this));
    
    // Channel Management Handlers
    this.registerHandler('channel:index', this.handleChannelIndex.bind(this));
    this.registerHandler('channel:list', this.handleChannelList.bind(this));
    this.registerHandler('channel:delete', this.handleChannelDelete.bind(this));
    
    // Project Management Handlers
    this.registerHandler('project:create', this.handleProjectCreate.bind(this));
    this.registerHandler('project:switch', this.handleProjectSwitch.bind(this));
    this.registerHandler('project:list', this.handleProjectList.bind(this));
    
    // Settings Handlers
    this.registerHandler('settings:get', this.handleSettingsGet.bind(this));
    this.registerHandler('settings:update', this.handleSettingsUpdate.bind(this));
  }

  registerHandler(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        // Security validation
        this.security.validateIPCMessage(channel, args);
        
        // Execute handler
        const result = await handler(event, ...args);
        
        // Log successful operation
        logger.info(`IPC handler executed successfully: ${channel}`);
        
        return result;
      } catch (error) {
        logger.error(`IPC handler error for ${channel}:`, error);
        throw error;
      }
    });
  }

  async handleRAGQuery(event, question, options = {}) {
    const ragService = this.services.get('rag');
    const result = await ragService.query(question, options);
    
    // Send progress updates if needed
    this.sendProgressUpdate(event.sender, 'rag:query:progress', {
      stage: 'complete',
      result
    });
    
    return result;
  }

  async handleChannelIndex(event, channelId, options = {}) {
    const youtubeService = this.services.get('youtube');
    const embeddingService = this.services.get('embedding');
    
    // Start indexing process with progress updates
    const indexingJob = new IndexingJob(channelId, options, {
      onProgress: (progress) => {
        this.sendProgressUpdate(event.sender, 'channel:index:progress', progress);
      }
    });
    
    return await indexingJob.execute();
  }

  sendProgressUpdate(sender, channel, data) {
    if (sender && !sender.isDestroyed()) {
      sender.send(channel, data);
    }
  }
}
```

### Service Manager

```javascript
// src/main/services/service-manager.js
class ServiceManager {
  constructor() {
    this.services = new Map();
    this.config = new ConfigManager();
  }

  async initialize() {
    // Initialize core services
    await this.initializeRAGService();
    await this.initializeYouTubeService();
    await this.initializeEmbeddingService();
    await this.initializeVectorStoreService();
    await this.initializeChannelManager();
  }

  async initializeRAGService() {
    const ragService = new RAGService({
      vectorStore: this.services.get('vectorStore'),
      embeddingService: this.services.get('embedding'),
      config: this.config.get('rag')
    });
    
    await ragService.initialize();
    this.services.set('rag', ragService);
  }

  async initializeYouTubeService() {
    const youtubeService = new YouTubeService({
      apiKey: this.config.get('youtube.apiKey'),
      rateLimiting: this.config.get('youtube.rateLimiting')
    });
    
    this.services.set('youtube', youtubeService);
  }

  get(serviceName) {
    if (!this.services.has(serviceName)) {
      throw new Error(`Service not found: ${serviceName}`);
    }
    return this.services.get(serviceName);
  }
}
```

### Native Integrations

```javascript
// src/main/native/native-integrations.js
class NativeIntegrations {
  constructor() {
    this.tray = null;
    this.menu = null;
    this.notifications = new NotificationManager();
  }

  async initialize() {
    await this.setupSystemTray();
    await this.setupMenus();
    await this.setupGlobalShortcuts();
    await this.notifications.initialize();
  }

  async setupSystemTray() {
    this.tray = new Tray(this.getTrayIconPath());
    
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show RAGMaker', click: () => this.showMainWindow() },
      { type: 'separator' },
      { label: 'Quick Query', click: () => this.showQuickQuery() },
      { label: 'Index Channel', click: () => this.showChannelIndexer() },
      { type: 'separator' },
      { label: 'Settings', click: () => this.showSettings() },
      { label: 'Quit', click: () => app.quit() }
    ]);
    
    this.tray.setContextMenu(contextMenu);
    this.tray.setToolTip('RAGMaker - YouTube Channel RAG');
  }

  async setupMenus() {
    if (process.platform === 'darwin') {
      // macOS menu bar
      this.menu = Menu.buildFromTemplate([
        {
          label: 'RAGMaker',
          submenu: [
            { label: 'About RAGMaker', role: 'about' },
            { type: 'separator' },
            { label: 'Preferences', accelerator: 'Cmd+,', click: () => this.showSettings() },
            { type: 'separator' },
            { label: 'Hide RAGMaker', accelerator: 'Cmd+H', role: 'hide' },
            { label: 'Quit', accelerator: 'Cmd+Q', click: () => app.quit() }
          ]
        },
        {
          label: 'Edit',
          submenu: [
            { label: 'Undo', accelerator: 'Cmd+Z', role: 'undo' },
            { label: 'Redo', accelerator: 'Shift+Cmd+Z', role: 'redo' },
            { type: 'separator' },
            { label: 'Cut', accelerator: 'Cmd+X', role: 'cut' },
            { label: 'Copy', accelerator: 'Cmd+C', role: 'copy' },
            { label: 'Paste', accelerator: 'Cmd+V', role: 'paste' }
          ]
        }
      ]);
      
      Menu.setApplicationMenu(this.menu);
    }
  }

  async setupGlobalShortcuts() {
    // Global shortcut for quick query
    globalShortcut.register('Ctrl+Shift+R', () => {
      this.showQuickQuery();
    });
  }
}
```

## Error Handling and Logging

### Centralized Error Handler

```javascript
// src/main/error/error-handler.js
class ErrorHandler {
  constructor() {
    this.logger = new Logger('main-process');
  }

  setupGlobalHandlers() {
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception:', error);
      this.showErrorDialog('Application Error', error.message);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }

  async showErrorDialog(title, message) {
    const { dialog } = require('electron');
    await dialog.showErrorBox(title, message);
  }
}
```

## Configuration Management

```javascript
// src/main/config/config-manager.js
class ConfigManager {
  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'config.json');
    this.defaultConfig = {
      rag: {
        maxChunks: 10,
        chunkSize: 1000,
        overlap: 200
      },
      youtube: {
        rateLimiting: true,
        maxConcurrent: 3
      },
      ui: {
        theme: 'system',
        language: 'en'
      }
    };
    this.config = {};
  }

  async load() {
    try {
      if (await fs.pathExists(this.configPath)) {
        const data = await fs.readJSON(this.configPath);
        this.config = { ...this.defaultConfig, ...data };
      } else {
        this.config = { ...this.defaultConfig };
        await this.save();
      }
    } catch (error) {
      console.error('Error loading config:', error);
      this.config = { ...this.defaultConfig };
    }
  }

  async save() {
    try {
      await fs.writeJSON(this.configPath, this.config, { spaces: 2 });
    } catch (error) {
      console.error('Error saving config:', error);
    }
  }

  get(key) {
    return key.split('.').reduce((obj, k) => obj?.[k], this.config);
  }

  set(key, value) {
    const keys = key.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, k) => obj[k] = obj[k] || {}, this.config);
    target[lastKey] = value;
  }
}
```

This main process architecture provides a solid, secure, and scalable foundation for the RAGMaker Electron application, with proper separation of concerns, comprehensive error handling, and robust security measures.
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');

// Utilities
const ServiceManager = require('../utils/serviceManager');
const ErrorHandler = require('../utils/errorHandler');

// Security middleware
const { setupSecurity } = require('../middleware/security');
const { devFriendlyApiKey } = require('../middleware/dev-auth');

// Route modules
const indexingRoutes = require('./routes/indexing');
const projectRoutes = require('./routes/projects');
const ragRoutes = require('./routes/rag');
const channelRoutes = require('./routes/channels');
const publicRoutes = require('./routes/public');
const docsRoutes = require('./routes/docs');

// Auto-refresh utilities
const AutoRefreshManager = require('../utils/autoRefreshManager');

const app = express();

// Initialize service manager
const serviceManager = new ServiceManager();

// Security setup (must be first)
setupSecurity(app);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../../public')));

// Initialize services and attach to app
async function initializeApplication() {
  try {
    await serviceManager.initializeServices();
    serviceManager.attachToApp(app);
    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Documentation and health routes (no auth required)
app.use('/', docsRoutes);

// Apply API key authentication to all /api routes (dev-friendly)
app.use('/api', devFriendlyApiKey);

// API Routes
app.use('/api', publicRoutes);
app.use('/api', indexingRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', ragRoutes);
app.use('/api/channels', channelRoutes);

// Reset vector store endpoint
app.post('/api/reset', ErrorHandler.handleAsyncRoute(async (req, res) => {
  const vectorStore = req.app.locals.vectorStore;
  await vectorStore.deleteNamespace();
  
  // Reset any active indexing
  const IndexingController = require('../controllers/indexingController');
  const indexingController = new IndexingController();
  indexingController.resetStatus();
  
  res.json({ message: 'Vector store reset successfully' });
}));

// Auto-refresh manager
const autoRefreshManager = new AutoRefreshManager();

// Auto-refresh endpoints
app.get('/api/auto-refresh', (req, res) => {
  res.json(autoRefreshManager.getSettings());
});

app.post('/api/auto-refresh', ErrorHandler.handleAsyncRoute(async (req, res) => {
  const { enabled, interval } = req.body;
  
  await autoRefreshManager.updateSettings({ enabled, interval });
  
  if (enabled) {
    const channelManager = req.app.locals.channelManager;
    const youtubeService = req.app.locals.youtubeService;
    autoRefreshManager.startSchedule(channelManager, youtubeService);
  }
  
  res.json(autoRefreshManager.getSettings());
}));

app.post('/api/check-new-videos', ErrorHandler.handleAsyncRoute(async (req, res) => {
  const channelManager = req.app.locals.channelManager;
  const youtubeService = req.app.locals.youtubeService;
  
  await autoRefreshManager.checkForNewVideos(channelManager, youtubeService);
  res.json({ 
    message: 'Check completed', 
    lastCheck: autoRefreshManager.getSettings().lastCheck 
  });
}));

// Global error handler (should be last)
app.use(ErrorHandler.globalErrorHandler);

// Initialize and start server
async function startServer() {
  await initializeApplication();
  
  // Start auto-refresh if enabled
  const channelManager = app.locals.channelManager;
  const youtubeService = app.locals.youtubeService;
  autoRefreshManager.initialize(channelManager, youtubeService);
  
  const PORT = config.server.port;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer().catch(console.error);

module.exports = app;
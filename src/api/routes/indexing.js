const express = require('express');
const IndexingController = require('../../controllers/indexingController');
const BulkImportController = require('../../controllers/bulkImportController');
const ErrorHandler = require('../../utils/errorHandler');

const router = express.Router();

// Initialize controllers
const indexingController = new IndexingController();
const bulkImportController = new BulkImportController();

// Set up dependencies
bulkImportController.setIndexingController(indexingController);

// Middleware to inject services into controllers
router.use((req, res, next) => {
  const services = {
    youtubeService: req.app.locals.youtubeService,
    embeddingService: req.app.locals.embeddingService,
    vectorStore: req.app.locals.vectorStore,
    channelManager: req.app.locals.channelManager,
    upstashManager: req.app.locals.upstashManager,
    ragService: req.app.locals.ragService
  };
  
  indexingController.setServices(services);
  next();
});

// Index a YouTube channel
router.post('/index-channel', ErrorHandler.handleAsyncRoute(async (req, res) => {
  await indexingController.startIndexing(req, res);
}));

// Get indexing status
router.get('/index-status', (req, res) => {
  res.json(indexingController.getStatus());
});

// Cancel indexing
router.post('/cancel-indexing', ErrorHandler.handleAsyncRoute(async (req, res) => {
  await indexingController.cancelIndexing(req, res);
}));

// Force reset indexing status
router.post('/reset-indexing', (req, res) => {
  indexingController.resetStatus();
  res.json({ success: true, message: 'Indexing status forcefully reset' });
});

// Bulk channel import
router.post('/bulk-import', ErrorHandler.handleAsyncRoute(async (req, res) => {
  await bulkImportController.startBulkImport(req, res);
}));

// Get bulk import status
router.get('/bulk-import-status', (req, res) => {
  res.json(bulkImportController.getStatus());
});

// Get indexing logs
router.get('/logs', ErrorHandler.handleAsyncRoute(async (req, res) => {
  const logs = await indexingController.getLogs();
  res.json(logs);
}));

// Progress tracking endpoint
router.get('/indexing-progress/:channelId', (req, res) => {
  const { channelId } = req.params;
  const progress = indexingController.getProgress(channelId);
  res.json(progress);
});

module.exports = router;
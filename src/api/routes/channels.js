const express = require('express');
const validation = require('../../utils/validation');
const ErrorHandler = require('../../utils/errorHandler');

const router = express.Router();

// Get vector store stats + indexed channels
router.get('/stats', ErrorHandler.handleAsyncRoute(async (req, res) => {
  const vectorStore = req.app.locals.vectorStore;
  const upstashManager = req.app.locals.upstashManager;
  const channelManager = req.app.locals.channelManager;
  
  const stats = await vectorStore.getStats();
  const currentProject = upstashManager.getCurrentProject();
  const channels = channelManager.getAllChannels(currentProject?.id);
  const totalVideos = channelManager.getTotalVideos(currentProject?.id);
  
  res.json({
    ...stats,
    indexedChannels: Object.keys(channels).length,
    totalVideos,
    channels
  });
}));

// Get indexed channels with detailed info
router.get('/', (req, res) => {
  const upstashManager = req.app.locals.upstashManager;
  const channelManager = req.app.locals.channelManager;
  
  const currentProject = upstashManager.getCurrentProject();
  const channels = channelManager.getAllChannels(currentProject?.id);
  res.json(channels);
});

// Get detailed channel info with videos
router.get('/:channelId/videos', ErrorHandler.handleAsyncRoute(async (req, res) => {
  const { channelId } = req.params;
  const IndexingController = require('../../controllers/indexingController');
  const indexingController = new IndexingController();
  
  // Load logs to get channel video details
  const logs = await indexingController.getLogs();
  
  // Find the most recent log for this channel
  const channelLogs = logs.filter(log => log.channelId === channelId);
  const latestLog = channelLogs[channelLogs.length - 1];
  
  if (!latestLog) {
    return res.status(404).json({ error: 'Channel not found in logs' });
  }
  
  // Build failure categories summary
  const failureSummary = {};
  for (const f of latestLog.failedVideos || []) {
    const key = f.reason || 'UNKNOWN';
    failureSummary[key] = (failureSummary[key] || 0) + 1;
  }
  
  res.json({
    channelId,
    channelName: latestLog.channelName,
    successVideos: latestLog.successVideos,
    failedVideos: latestLog.failedVideos,
    totalIndexed: latestLog.successCount,
    totalFailed: latestLog.failedCount,
    failureSummary
  });
}));

// Delete a channel
router.delete('/:channelId', ErrorHandler.handleAsyncRoute(async (req, res) => {
  const channelId = validation.validateChannelId(req.params.channelId);
  const channelManager = req.app.locals.channelManager;
  
  await channelManager.removeChannel(channelId);
  res.json({ success: true, message: 'Channel removed successfully' });
}));

// Get YouTube API quota status
router.get('/quota', (req, res) => {
  try {
    const youtubeService = req.app.locals.youtubeService;
    const quotaStatus = youtubeService.getQuotaStatus();
    res.json(quotaStatus);
  } catch (error) {
    console.error('Error getting quota status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export knowledge base endpoint
router.get('/export', ErrorHandler.handleAsyncRoute(async (req, res) => {
  const upstashManager = req.app.locals.upstashManager;
  const channelManager = req.app.locals.channelManager;
  const vectorStore = req.app.locals.vectorStore;
  
  const IndexingController = require('../../controllers/indexingController');
  const indexingController = new IndexingController();
  const indexingLogs = await indexingController.getLogs();
  
  const currentProject = upstashManager.getCurrentProject();
  const channels = channelManager.getAllChannels(currentProject?.id);
  
  // Get all logs for indexed videos
  const channelLogs = {};
  for (const [channelId, channel] of Object.entries(channels)) {
    const logs = indexingLogs.filter(log => log.channelId === channelId);
    if (logs.length > 0) {
      channelLogs[channelId] = logs[logs.length - 1]; // Get latest log
    }
  }
  
  const exportData = {
    exportDate: new Date().toISOString(),
    project: currentProject,
    channels: channels,
    videoDetails: channelLogs,
    stats: await vectorStore.getStats()
  };
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="kb_export_${currentProject?.name || 'default'}_${Date.now()}.json"`);
  res.json(exportData);
}));

module.exports = router;
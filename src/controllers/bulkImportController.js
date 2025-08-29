const validation = require('../utils/validation');
const config = require('../config');

class BulkImportController {
  constructor() {
    this.bulkImportStatus = {
      inProgress: false,
      total: 0,
      processed: 0,
      successful: [],
      failed: [],
      currentChannel: null
    };
  }

  // Get bulk import status
  getStatus() {
    return this.bulkImportStatus;
  }

  // Start bulk import process
  async startBulkImport(req, res) {
    try {
      const rawChannels = validation.validateArray(req.body.channels, 50); // Max 50 channels
      const videoLimit = validation.validateVideoLimit(req.body.videoLimit);
      const excludeShorts = validation.validateBoolean(req.body.excludeShorts, false);
      
      // Validate each channel ID
      const channels = rawChannels.map(channel => validation.validateChannelId(channel));
      
      // Update global bulk import status
      this.bulkImportStatus = {
        inProgress: true,
        total: channels.length,
        processed: 0,
        successful: [],
        failed: [],
        currentChannel: null
      };
      
      res.json({ 
        message: 'Bulk import started', 
        totalChannels: channels.length 
      });
      
      // Process channels sequentially in background
      this.processBulkImport(channels, videoLimit, excludeShorts);
      
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }
  }

  // Process bulk import in background
  async processBulkImport(channels, videoLimit, excludeShorts) {
    for (const channelId of channels) {
      this.bulkImportStatus.currentChannel = channelId;
      
      try {
        // Check if already processing
        const indexingController = this.indexingController;
        if (indexingController.getStatus().isIndexing) {
          // Wait for current indexing to complete
          while (indexingController.getStatus().isIndexing) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        // Start indexing this channel
        const response = await fetch(`http://localhost:${config.server.port}/api/index-channel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId,
            videoLimit,
            excludeShorts,
            skipExisting: false
          })
        });
        
        if (response.ok) {
          // Wait for indexing to complete
          while (indexingController.getStatus().isIndexing) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          this.bulkImportStatus.successful.push(channelId);
        } else {
          this.bulkImportStatus.failed.push({ channelId, error: 'Failed to start indexing' });
        }
      } catch (error) {
        this.bulkImportStatus.failed.push({ channelId, error: error.message });
      }
      
      this.bulkImportStatus.processed++;
    }
    
    this.bulkImportStatus.inProgress = false;
    this.bulkImportStatus.currentChannel = null;
  }

  // Inject indexing controller dependency
  setIndexingController(indexingController) {
    this.indexingController = indexingController;
  }
}

module.exports = BulkImportController;
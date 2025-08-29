const fs = require('fs').promises;
const path = require('path');

class AutoRefreshManager {
  constructor() {
    this.settings = {
      enabled: false,
      interval: 24 * 60 * 60 * 1000, // 24 hours
      lastCheck: null
    };
    
    this.settingsFile = path.join(__dirname, '../../data/auto_refresh.json');
    this.timer = null;
    
    // Load settings on initialization
    this.loadSettings();
  }

  // Load auto-refresh settings from file
  async loadSettings() {
    try {
      const data = await fs.readFile(this.settingsFile, 'utf8');
      this.settings = JSON.parse(data);
    } catch (error) {
      // Use defaults if file doesn't exist
      console.log('Using default auto-refresh settings');
    }
  }

  // Save auto-refresh settings to file
  async saveSettings() {
    try {
      await fs.writeFile(this.settingsFile, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('Error saving auto-refresh settings:', error);
    }
  }

  // Get current settings
  getSettings() {
    return { ...this.settings };
  }

  // Update settings
  async updateSettings(newSettings) {
    this.settings.enabled = newSettings.enabled !== undefined ? newSettings.enabled : this.settings.enabled;
    this.settings.interval = newSettings.interval || this.settings.interval;
    
    await this.saveSettings();
    
    // Restart schedule if enabled
    if (this.settings.enabled && this.channelManager && this.youtubeService) {
      this.startSchedule(this.channelManager, this.youtubeService);
    } else if (!this.settings.enabled) {
      this.stopSchedule();
    }
  }

  // Initialize with services
  async initialize(channelManager, youtubeService) {
    this.channelManager = channelManager;
    this.youtubeService = youtubeService;
    
    await this.loadSettings();
    
    if (this.settings.enabled) {
      this.startSchedule(channelManager, youtubeService);
    }
  }

  // Start scheduled checking
  startSchedule(channelManager, youtubeService) {
    this.stopSchedule(); // Clear any existing timer
    
    this.channelManager = channelManager;
    this.youtubeService = youtubeService;
    
    if (this.settings.enabled) {
      console.log(`Starting auto-refresh schedule with ${this.settings.interval}ms interval`);
      this.timer = setInterval(() => {
        this.checkForNewVideos(channelManager, youtubeService);
      }, this.settings.interval);
    }
  }

  // Stop scheduled checking
  stopSchedule() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('Auto-refresh schedule stopped');
    }
  }

  // Check for new videos across all channels
  async checkForNewVideos(channelManager, youtubeService) {
    if (!this.settings.enabled) return;
    
    console.log('Checking for new videos...');
    const channels = channelManager.getAllChannels();
    
    for (const [channelId, channelInfo] of Object.entries(channels)) {
      try {
        // Get latest videos from YouTube
        const videos = await youtubeService.getChannelVideos(channelId);
        const existingVideoCount = channelInfo.videoCount || 0;
        
        if (videos.length > existingVideoCount) {
          console.log(`Found ${videos.length - existingVideoCount} new videos for ${channelInfo.channelName}`);
          // Note: This would trigger indexing for new videos only
          // Implementation depends on requirements
        }
      } catch (error) {
        console.error(`Error checking channel ${channelId}:`, error);
      }
    }
    
    this.settings.lastCheck = new Date().toISOString();
    await this.saveSettings();
  }
}

module.exports = AutoRefreshManager;
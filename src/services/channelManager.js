const fs = require('fs').promises;
const path = require('path');

class ChannelManager {
  constructor() {
    this.dataFile = path.join(__dirname, '../../data/channels.json');
    this.channels = {};
    this.initialized = this.loadChannels();
  }

  async loadChannels() {
    try {
      const data = await fs.readFile(this.dataFile, 'utf8');
      this.channels = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, create it
      this.channels = {};
      await this.saveChannels();
    }
  }

  async saveChannels() {
    const dir = path.dirname(this.dataFile);
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.dataFile, JSON.stringify(this.channels, null, 2));
    } catch (error) {
      console.error('Error saving channels:', error);
    }
  }

  async addChannel(channelId, channelInfo, projectId = null) {
    this.channels[channelId] = {
      ...channelInfo,
      indexedAt: new Date().toISOString(),
      videoCount: channelInfo.videoCount || 0,
      lastUpdated: new Date().toISOString(),
      projectId: projectId
    };
    await this.saveChannels();
  }

  async updateChannel(channelId, updates) {
    if (this.channels[channelId]) {
      this.channels[channelId] = {
        ...this.channels[channelId],
        ...updates,
        lastUpdated: new Date().toISOString()
      };
      await this.saveChannels();
    }
  }

  getChannel(channelId) {
    return this.channels[channelId];
  }

  getAllChannels(projectId = null) {
    if (!projectId) {
      return this.channels;
    }
    // Filter channels by project
    const filtered = {};
    for (const [id, channel] of Object.entries(this.channels)) {
      if (channel.projectId === projectId) {
        filtered[id] = channel;
      }
    }
    return filtered;
  }

  async removeChannel(channelId) {
    delete this.channels[channelId];
    await this.saveChannels();
  }

  isChannelIndexed(channelId) {
    return !!this.channels[channelId];
  }

  getTotalVideos(projectId = null) {
    const channels = projectId ? this.getAllChannels(projectId) : this.channels;
    return Object.values(channels).reduce((sum, channel) => sum + (channel.videoCount || 0), 0);
  }
}

module.exports = ChannelManager;
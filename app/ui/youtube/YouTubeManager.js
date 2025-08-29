/**
 * YouTube Manager UI Component
 * Provides interface for managing YouTube channels and operations in desktop app
 */
class YouTubeManager {
  constructor(container, ipcRenderer) {
    this.container = container;
    this.ipc = ipcRenderer;
    
    this.state = {
      channels: {},
      activeOperations: [],
      quota: null,
      cache: null,
      selectedProject: null
    };
    
    this.eventListeners = new Map();
    this.initialize();
  }

  /**
   * Initialize the YouTube Manager
   */
  async initialize() {
    try {
      // Setup UI
      this.createUI();
      this.setupEventListeners();
      
      // Initialize YouTube services
      const result = await this.ipc.invoke('youtube:initialize', {
        apiKey: process.env.YOUTUBE_API_KEY || localStorage.getItem('youtube-api-key')
      });
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      // Load initial data
      await this.loadData();
      
      console.log('YouTube Manager initialized');
      this.showStatus('YouTube services ready', 'success');
      
    } catch (error) {
      console.error('Failed to initialize YouTube Manager:', error);
      this.showStatus(`Error: ${error.message}`, 'error');
    }
  }

  /**
   * Create the user interface
   */
  createUI() {
    this.container.innerHTML = `
      <div class="youtube-manager">
        <div class="youtube-header">
          <h2>YouTube Channel Manager</h2>
          <div class="status-bar">
            <div class="quota-status"></div>
            <div class="cache-status"></div>
          </div>
        </div>

        <div class="youtube-controls">
          <div class="control-group">
            <label for="channel-input">Add Channel:</label>
            <input type="text" id="channel-input" placeholder="Channel URL, @username, or Channel ID" />
            <button id="add-channel-btn" class="btn primary">Add Channel</button>
          </div>
          
          <div class="control-group">
            <label for="bulk-input">Bulk Import:</label>
            <textarea id="bulk-input" placeholder="Enter multiple channels (one per line)"></textarea>
            <div class="bulk-options">
              <label>
                <input type="checkbox" id="exclude-shorts" checked />
                Exclude YouTube Shorts
              </label>
              <label>
                Video Limit: <input type="number" id="video-limit" placeholder="No limit" min="1" max="1000" />
              </label>
            </div>
            <button id="bulk-import-btn" class="btn secondary">Bulk Import</button>
          </div>
        </div>

        <div class="youtube-content">
          <div class="channels-section">
            <h3>Channels</h3>
            <div class="channels-grid" id="channels-grid">
              <!-- Channels will be populated here -->
            </div>
          </div>

          <div class="operations-section">
            <h3>Active Operations</h3>
            <div class="operations-list" id="operations-list">
              <!-- Operations will be populated here -->
            </div>
          </div>
        </div>

        <div class="status-message" id="status-message"></div>
      </div>
    `;

    this.setupStyles();
  }

  /**
   * Setup CSS styles
   */
  setupStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .youtube-manager {
        padding: 20px;
        max-width: 1200px;
        margin: 0 auto;
      }

      .youtube-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
        border-bottom: 1px solid #e0e0e0;
        padding-bottom: 15px;
      }

      .status-bar {
        display: flex;
        gap: 15px;
        font-size: 12px;
      }

      .quota-status, .cache-status {
        padding: 5px 10px;
        background: #f5f5f5;
        border-radius: 4px;
      }

      .youtube-controls {
        background: #f9f9f9;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 30px;
      }

      .control-group {
        margin-bottom: 20px;
      }

      .control-group:last-child {
        margin-bottom: 0;
      }

      .control-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
      }

      .control-group input[type="text"],
      .control-group textarea {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
      }

      .control-group textarea {
        height: 80px;
        resize: vertical;
      }

      .bulk-options {
        margin: 10px 0;
        display: flex;
        gap: 20px;
        align-items: center;
      }

      .btn {
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
      }

      .btn.primary {
        background: #4CAF50;
        color: white;
      }

      .btn.primary:hover {
        background: #45a049;
      }

      .btn.secondary {
        background: #2196F3;
        color: white;
      }

      .btn.secondary:hover {
        background: #0b7dda;
      }

      .btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .youtube-content {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 30px;
      }

      .channels-section,
      .operations-section {
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 20px;
      }

      .channels-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 15px;
        margin-top: 15px;
      }

      .channel-card {
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 15px;
        background: #fafafa;
      }

      .channel-header {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
      }

      .channel-thumbnail {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        margin-right: 15px;
      }

      .channel-info h4 {
        margin: 0 0 5px 0;
        font-size: 16px;
      }

      .channel-stats {
        font-size: 12px;
        color: #666;
        margin-top: 10px;
      }

      .channel-actions {
        margin-top: 15px;
        display: flex;
        gap: 10px;
      }

      .operations-list {
        margin-top: 15px;
      }

      .operation-item {
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        padding: 15px;
        margin-bottom: 10px;
        background: white;
      }

      .operation-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }

      .operation-progress {
        width: 100%;
        height: 8px;
        background: #f0f0f0;
        border-radius: 4px;
        overflow: hidden;
      }

      .operation-progress-bar {
        height: 100%;
        background: #4CAF50;
        transition: width 0.3s ease;
      }

      .status-message {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 4px;
        color: white;
        font-weight: bold;
        z-index: 1000;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease;
      }

      .status-message.show {
        opacity: 1;
        transform: translateY(0);
      }

      .status-message.success {
        background: #4CAF50;
      }

      .status-message.error {
        background: #f44336;
      }

      .status-message.warning {
        background: #ff9800;
      }

      @media (max-width: 768px) {
        .youtube-content {
          grid-template-columns: 1fr;
        }
        
        .bulk-options {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Add channel button
    document.getElementById('add-channel-btn').addEventListener('click', () => {
      this.addChannel();
    });

    // Bulk import button
    document.getElementById('bulk-import-btn').addEventListener('click', () => {
      this.bulkImportChannels();
    });

    // Channel input enter key
    document.getElementById('channel-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addChannel();
      }
    });

    // IPC event listeners
    this.ipc.on('youtube:channelProgress', (event, data) => {
      this.updateOperationProgress(data);
    });

    this.ipc.on('youtube:overallProgress', (event, data) => {
      this.updateOverallProgress(data);
    });

    this.ipc.on('youtube:bulkImportCompleted', (event, data) => {
      this.handleBulkImportCompleted(data);
    });

    this.ipc.on('youtube:quotaWarning', (event, data) => {
      this.showStatus(`Quota Warning: ${data.percentUsed}% used`, 'warning');
    });

    this.ipc.on('youtube:quotaCritical', (event, data) => {
      this.showStatus(`Quota Critical: ${data.percentUsed}% used`, 'error');
    });
  }

  /**
   * Load initial data
   */
  async loadData() {
    try {
      // Load channels
      const channelsResult = await this.ipc.invoke('youtube:getAllChannels');
      if (channelsResult.success) {
        this.state.channels = channelsResult.data;
        this.renderChannels();
      }

      // Load quota status
      const quotaResult = await this.ipc.invoke('youtube:getQuotaStatus');
      if (quotaResult.success) {
        this.state.quota = quotaResult.data;
        this.updateQuotaDisplay();
      }

      // Load cache stats
      const cacheResult = await this.ipc.invoke('youtube:getCacheStats');
      if (cacheResult.success) {
        this.state.cache = cacheResult.data;
        this.updateCacheDisplay();
      }

    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  /**
   * Add a single channel
   */
  async addChannel() {
    const input = document.getElementById('channel-input');
    const channelIdentifier = input.value.trim();

    if (!channelIdentifier) {
      this.showStatus('Please enter a channel URL, username, or ID', 'error');
      return;
    }

    const addBtn = document.getElementById('add-channel-btn');
    addBtn.disabled = true;
    addBtn.textContent = 'Adding...';

    try {
      const result = await this.ipc.invoke('youtube:addChannel', {
        channelIdentifier,
        projectId: this.state.selectedProject
      });

      if (result.success) {
        this.state.channels[result.data.id] = result.data;
        this.renderChannels();
        input.value = '';
        this.showStatus(`Channel "${result.data.name}" added successfully`, 'success');
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error('Error adding channel:', error);
      this.showStatus(`Error adding channel: ${error.message}`, 'error');
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = 'Add Channel';
    }
  }

  /**
   * Bulk import channels
   */
  async bulkImportChannels() {
    const textarea = document.getElementById('bulk-input');
    const excludeShorts = document.getElementById('exclude-shorts').checked;
    const videoLimit = parseInt(document.getElementById('video-limit').value) || null;

    const channelIdentifiers = textarea.value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (channelIdentifiers.length === 0) {
      this.showStatus('Please enter at least one channel', 'error');
      return;
    }

    const importBtn = document.getElementById('bulk-import-btn');
    importBtn.disabled = true;
    importBtn.textContent = `Importing ${channelIdentifiers.length} channels...`;

    try {
      const result = await this.ipc.invoke('youtube:bulkImportChannels', {
        channelIdentifiers,
        options: {
          projectId: this.state.selectedProject,
          excludeShorts,
          videoLimit
        }
      });

      if (result.success) {
        // Operation started, add to active operations
        this.addActiveOperation({
          id: result.data.operationId,
          type: 'bulk-import',
          totalChannels: channelIdentifiers.length,
          status: 'running'
        });

        textarea.value = '';
        this.showStatus(`Bulk import started for ${channelIdentifiers.length} channels`, 'success');
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error('Error starting bulk import:', error);
      this.showStatus(`Error starting bulk import: ${error.message}`, 'error');
    } finally {
      importBtn.disabled = false;
      importBtn.textContent = 'Bulk Import';
    }
  }

  /**
   * Render channels
   */
  renderChannels() {
    const grid = document.getElementById('channels-grid');
    const channels = Object.values(this.state.channels);

    if (channels.length === 0) {
      grid.innerHTML = '<p>No channels added yet. Add your first channel above.</p>';
      return;
    }

    grid.innerHTML = channels.map(channel => `
      <div class="channel-card">
        <div class="channel-header">
          ${channel.thumbnail ? `<img src="${channel.thumbnail}" alt="${channel.name}" class="channel-thumbnail" />` : ''}
          <div class="channel-info">
            <h4>${this.escapeHtml(channel.name)}</h4>
            <div class="channel-stats">
              <div>Videos: ${channel.videoCount || 0}</div>
              <div>Indexed: ${channel.indexedVideos ? channel.indexedVideos.length : 0}</div>
              <div>Status: ${channel.indexingProgress?.status || 'Unknown'}</div>
            </div>
          </div>
        </div>
        <div class="channel-actions">
          <button class="btn secondary" onclick="youtubeManager.refreshChannel('${channel.id}')">
            Refresh
          </button>
          <button class="btn" style="background: #ff4444; color: white;" onclick="youtubeManager.removeChannel('${channel.id}')">
            Remove
          </button>
        </div>
      </div>
    `).join('');
  }

  /**
   * Add active operation to UI
   */
  addActiveOperation(operation) {
    this.state.activeOperations.push(operation);
    this.renderOperations();
  }

  /**
   * Render active operations
   */
  renderOperations() {
    const list = document.getElementById('operations-list');
    
    if (this.state.activeOperations.length === 0) {
      list.innerHTML = '<p>No active operations</p>';
      return;
    }

    list.innerHTML = this.state.activeOperations.map(op => `
      <div class="operation-item" data-operation-id="${op.id}">
        <div class="operation-header">
          <strong>${op.type} (${op.totalChannels} channels)</strong>
          <span>${op.status}</span>
        </div>
        <div class="operation-progress">
          <div class="operation-progress-bar" style="width: 0%"></div>
        </div>
        <div class="operation-details">
          Processing...
        </div>
      </div>
    `).join('');
  }

  /**
   * Update operation progress
   */
  updateOperationProgress(data) {
    const operationEl = document.querySelector(`[data-operation-id="${data.operationId}"]`);
    if (!operationEl) return;

    const progressBar = operationEl.querySelector('.operation-progress-bar');
    const details = operationEl.querySelector('.operation-details');

    if (data.progress) {
      const percentage = ((data.progress.processed / data.progress.total) * 100).toFixed(1);
      progressBar.style.width = `${percentage}%`;
      details.textContent = `Channel: ${data.channelIdentifier} - ${data.progress.successful} successful, ${data.progress.failed} failed`;
    }
  }

  /**
   * Update overall progress
   */
  updateOverallProgress(data) {
    const operationEl = document.querySelector(`[data-operation-id="${data.operationId}"]`);
    if (!operationEl) return;

    const progressBar = operationEl.querySelector('.operation-progress-bar');
    const details = operationEl.querySelector('.operation-details');

    const percentage = ((data.processed / data.total) * 100).toFixed(1);
    progressBar.style.width = `${percentage}%`;
    details.textContent = `${data.processed}/${data.total} channels - ${data.successful} successful, ${data.failed} failed`;
  }

  /**
   * Handle bulk import completion
   */
  handleBulkImportCompleted(data) {
    // Remove from active operations
    this.state.activeOperations = this.state.activeOperations.filter(op => op.id !== data.operationId);
    this.renderOperations();

    // Reload channels
    this.loadData();

    // Show completion message
    const summary = data.operation.results.summary;
    this.showStatus(
      `Bulk import completed: ${summary.successfulChannels}/${summary.totalChannels} channels, ${summary.successfulVideos} videos indexed`,
      'success'
    );
  }

  /**
   * Remove a channel
   */
  async removeChannel(channelId) {
    if (!confirm('Are you sure you want to remove this channel?')) return;

    try {
      const result = await this.ipc.invoke('youtube:removeChannel', { channelId });
      
      if (result.success) {
        delete this.state.channels[channelId];
        this.renderChannels();
        this.showStatus('Channel removed successfully', 'success');
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error('Error removing channel:', error);
      this.showStatus(`Error removing channel: ${error.message}`, 'error');
    }
  }

  /**
   * Refresh a channel
   */
  async refreshChannel(channelId) {
    try {
      // This would trigger a re-index of the channel
      // Implementation depends on your specific requirements
      this.showStatus('Channel refresh started', 'success');
    } catch (error) {
      this.showStatus(`Error refreshing channel: ${error.message}`, 'error');
    }
  }

  /**
   * Update quota display
   */
  updateQuotaDisplay() {
    const quotaEl = document.querySelector('.quota-status');
    if (quotaEl && this.state.quota) {
      const status = this.state.quota.status;
      const percentage = this.state.quota.percentUsed;
      quotaEl.textContent = `Quota: ${percentage}% used (${status})`;
      quotaEl.className = `quota-status ${status}`;
    }
  }

  /**
   * Update cache display
   */
  updateCacheDisplay() {
    const cacheEl = document.querySelector('.cache-status');
    if (cacheEl && this.state.cache) {
      cacheEl.textContent = `Cache: ${this.state.cache.entries} entries, ${this.state.cache.sizeFormatted}`;
    }
  }

  /**
   * Show status message
   */
  showStatus(message, type = 'success') {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type} show`;
    
    setTimeout(() => {
      statusEl.classList.remove('show');
    }, 5000);
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Cleanup
   */
  cleanup() {
    // Remove IPC listeners
    this.ipc.removeAllListeners('youtube:channelProgress');
    this.ipc.removeAllListeners('youtube:overallProgress');
    this.ipc.removeAllListeners('youtube:bulkImportCompleted');
    this.ipc.removeAllListeners('youtube:quotaWarning');
    this.ipc.removeAllListeners('youtube:quotaCritical');
  }
}

// Make it available globally for inline event handlers
window.YouTubeManager = YouTubeManager;

module.exports = YouTubeManager;
/**
 * Database Management UI Components
 * Provides interface components for database administration
 */

class DatabaseManagerUI {
  constructor(databaseManager) {
    this.dbManager = databaseManager;
    this.maintenanceManager = null;
    this.backupService = null;
    this.dataExporter = null;
    
    this.initializeServices();
    this.createUI();
  }

  /**
   * Initialize database services
   */
  initializeServices() {
    if (this.dbManager) {
      this.maintenanceManager = new (require('../utils/maintenanceManager'))(this.dbManager.getDatabase());
      this.backupService = this.dbManager.getBackupService();
      this.dataExporter = new (require('../utils/dataExporter'))(this.dbManager.getDatabase());
    }
  }

  /**
   * Create the main database management interface
   */
  createUI() {
    const container = document.createElement('div');
    container.className = 'database-manager';
    container.innerHTML = `
      <div class="db-header">
        <h2>Database Management</h2>
        <div class="db-status">
          <span class="status-indicator" id="db-status-indicator"></span>
          <span id="db-status-text">Connecting...</span>
        </div>
      </div>

      <div class="db-tabs">
        <button class="tab-button active" data-tab="overview">Overview</button>
        <button class="tab-button" data-tab="maintenance">Maintenance</button>
        <button class="tab-button" data-tab="backup">Backup & Restore</button>
        <button class="tab-button" data-tab="export">Export Data</button>
        <button class="tab-button" data-tab="settings">Settings</button>
      </div>

      <div class="db-content">
        <div id="overview-tab" class="tab-content active">
          ${this.createOverviewTab()}
        </div>
        
        <div id="maintenance-tab" class="tab-content">
          ${this.createMaintenanceTab()}
        </div>
        
        <div id="backup-tab" class="tab-content">
          ${this.createBackupTab()}
        </div>
        
        <div id="export-tab" class="tab-content">
          ${this.createExportTab()}
        </div>
        
        <div id="settings-tab" class="tab-content">
          ${this.createSettingsTab()}
        </div>
      </div>

      <div id="db-modal" class="modal" style="display: none;">
        <div class="modal-content">
          <span class="close">&times;</span>
          <div id="modal-body"></div>
        </div>
      </div>
    `;

    this.container = container;
    this.setupEventHandlers();
    this.updateStatus();
    
    return container;
  }

  /**
   * Create overview tab content
   */
  createOverviewTab() {
    return `
      <div class="overview-grid">
        <div class="stats-card">
          <h3>Database Statistics</h3>
          <div id="db-stats">
            <div class="stat-item">
              <span class="stat-label">Projects:</span>
              <span class="stat-value" id="stat-projects">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Documents:</span>
              <span class="stat-value" id="stat-documents">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Text Chunks:</span>
              <span class="stat-value" id="stat-chunks">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Embeddings:</span>
              <span class="stat-value" id="stat-embeddings">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Database Size:</span>
              <span class="stat-value" id="stat-db-size">-</span>
            </div>
          </div>
          <button id="refresh-stats" class="btn btn-secondary">Refresh</button>
        </div>

        <div class="health-card">
          <h3>Database Health</h3>
          <div id="health-status" class="health-unknown">
            <div class="health-indicator"></div>
            <span id="health-text">Unknown</span>
          </div>
          <div id="health-issues" style="display: none;">
            <h4>Issues Found:</h4>
            <ul id="issues-list"></ul>
          </div>
          <div id="health-recommendations" style="display: none;">
            <h4>Recommendations:</h4>
            <ul id="recommendations-list"></ul>
          </div>
          <button id="run-health-check" class="btn btn-primary">Run Health Check</button>
        </div>

        <div class="activity-card">
          <h3>Recent Activity</h3>
          <div id="recent-activity">
            <p class="no-activity">No recent maintenance activities</p>
          </div>
        </div>

        <div class="quick-actions-card">
          <h3>Quick Actions</h3>
          <div class="action-buttons">
            <button id="quick-backup" class="btn btn-secondary">Create Backup</button>
            <button id="quick-vacuum" class="btn btn-secondary">Vacuum Database</button>
            <button id="quick-analyze" class="btn btn-secondary">Analyze Tables</button>
            <button id="quick-cleanup" class="btn btn-warning">Cleanup Orphans</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Create maintenance tab content
   */
  createMaintenanceTab() {
    return `
      <div class="maintenance-panel">
        <div class="maintenance-scheduler">
          <h3>Maintenance Scheduler</h3>
          <div class="scheduler-status">
            <span>Status: </span>
            <span id="scheduler-status" class="status-running">Running</span>
            <button id="toggle-scheduler" class="btn btn-secondary">Stop</button>
          </div>
          
          <div class="scheduled-tasks">
            <h4>Scheduled Tasks</h4>
            <div id="tasks-list">
              <div class="task-item">
                <span class="task-name">Daily Maintenance</span>
                <span class="task-schedule">Every day at 2:00 AM</span>
                <span class="task-next">Next: <span id="daily-next">-</span></span>
                <button class="btn btn-sm" onclick="runTask('daily_maintenance')">Run Now</button>
              </div>
              <div class="task-item">
                <span class="task-name">Weekly Maintenance</span>
                <span class="task-schedule">Sundays at 1:00 AM</span>
                <span class="task-next">Next: <span id="weekly-next">-</span></span>
                <button class="btn btn-sm" onclick="runTask('weekly_maintenance')">Run Now</button>
              </div>
              <div class="task-item">
                <span class="task-name">Monthly Optimization</span>
                <span class="task-schedule">1st of month at 12:00 AM</span>
                <span class="task-next">Next: <span id="monthly-next">-</span></span>
                <button class="btn btn-sm" onclick="runTask('monthly_optimization')">Run Now</button>
              </div>
            </div>
          </div>
        </div>

        <div class="manual-maintenance">
          <h3>Manual Maintenance</h3>
          <div class="maintenance-options">
            <div class="maintenance-option">
              <h4>Database Optimization</h4>
              <p>Reclaim unused space and optimize storage</p>
              <button id="run-vacuum" class="btn btn-primary">Run VACUUM</button>
            </div>
            
            <div class="maintenance-option">
              <h4>Statistics Update</h4>
              <p>Update query planner statistics for better performance</p>
              <button id="run-analyze" class="btn btn-primary">Run ANALYZE</button>
            </div>
            
            <div class="maintenance-option">
              <h4>Index Maintenance</h4>
              <p>Check and rebuild database indexes</p>
              <button id="rebuild-indexes" class="btn btn-primary">Rebuild Indexes</button>
            </div>
            
            <div class="maintenance-option">
              <h4>Cleanup Operations</h4>
              <p>Remove orphaned records and temporary data</p>
              <button id="cleanup-orphans" class="btn btn-warning">Cleanup Orphans</button>
            </div>
          </div>
        </div>

        <div class="maintenance-history">
          <h3>Maintenance History</h3>
          <div id="maintenance-log">
            <p class="no-history">No maintenance history available</p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Create backup tab content
   */
  createBackupTab() {
    return `
      <div class="backup-panel">
        <div class="backup-create">
          <h3>Create Backup</h3>
          <div class="backup-options">
            <div class="backup-type">
              <label>
                <input type="radio" name="backupType" value="full" checked>
                Full Backup (Complete database)
              </label>
              <label>
                <input type="radio" name="backupType" value="project">
                Project Backup (Specific projects)
              </label>
              <label>
                <input type="radio" name="backupType" value="incremental">
                Incremental Backup (Changes only)
              </label>
            </div>
            
            <div id="project-selection" style="display: none;">
              <h4>Select Projects</h4>
              <div id="project-checkboxes">
                <!-- Populated dynamically -->
              </div>
            </div>
            
            <div class="backup-settings">
              <label>
                <input type="checkbox" id="compress-backup" checked>
                Compress backup
              </label>
              <label>
                Custom Name: <input type="text" id="backup-name" placeholder="Optional">
              </label>
            </div>
            
            <button id="create-backup" class="btn btn-primary">Create Backup</button>
          </div>
        </div>

        <div class="backup-list">
          <h3>Available Backups</h3>
          <div class="backup-controls">
            <button id="refresh-backups" class="btn btn-secondary">Refresh</button>
            <button id="cleanup-backups" class="btn btn-warning">Cleanup Old</button>
          </div>
          <div id="backups-table">
            <table class="backups-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="backups-tbody">
                <!-- Populated dynamically -->
              </tbody>
            </table>
          </div>
        </div>

        <div class="restore-panel">
          <h3>Restore from Backup</h3>
          <div class="restore-options">
            <div class="file-upload">
              <input type="file" id="backup-file" accept=".db,.json,.gz">
              <label for="backup-file" class="btn btn-secondary">Choose Backup File</label>
              <span id="selected-file">No file selected</span>
            </div>
            
            <div class="restore-settings">
              <label>
                <input type="checkbox" id="overwrite-data">
                Overwrite existing data
              </label>
              <label>
                <input type="checkbox" id="create-new-db">
                Create new database file
              </label>
            </div>
            
            <button id="restore-backup" class="btn btn-danger" disabled>Restore Backup</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Create export tab content
   */
  createExportTab() {
    return `
      <div class="export-panel">
        <div class="export-options">
          <h3>Export Data</h3>
          
          <div class="export-type">
            <label>Export Type:</label>
            <select id="export-type">
              <option value="project">Project Data</option>
              <option value="search">Search Results</option>
              <option value="chat">Chat History</option>
            </select>
          </div>

          <div id="project-export-options" class="export-section">
            <h4>Project Selection</h4>
            <select id="export-project">
              <option value="">Select a project</option>
              <!-- Populated dynamically -->
            </select>
            
            <div class="export-filters">
              <label>
                <input type="checkbox" id="include-embeddings">
                Include embeddings
              </label>
              <label>
                <input type="checkbox" id="include-chat-logs" checked>
                Include chat logs
              </label>
              <label>
                <input type="checkbox" id="include-analytics">
                Include analytics
              </label>
            </div>
            
            <div class="date-range">
              <label>Date From: <input type="date" id="export-date-from"></label>
              <label>Date To: <input type="date" id="export-date-to"></label>
            </div>
          </div>

          <div id="search-export-options" class="export-section" style="display: none;">
            <h4>Search Query</h4>
            <input type="text" id="export-search-query" placeholder="Enter search query">
            <select id="search-project-filter">
              <option value="">All projects</option>
              <!-- Populated dynamically -->
            </select>
          </div>

          <div id="chat-export-options" class="export-section" style="display: none;">
            <h4>Chat History Options</h4>
            <select id="chat-project">
              <option value="">Select a project</option>
              <!-- Populated dynamically -->
            </select>
            <input type="text" id="chat-session-id" placeholder="Session ID (optional)">
          </div>

          <div class="export-format">
            <label>Format:</label>
            <select id="export-format">
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
              <option value="jsonl">JSONL</option>
              <option value="xml">XML</option>
              <option value="markdown">Markdown</option>
            </select>
          </div>

          <div class="export-settings">
            <label>
              <input type="checkbox" id="compress-export">
              Compress output
            </label>
          </div>

          <button id="start-export" class="btn btn-primary">Export Data</button>
        </div>

        <div class="export-history">
          <h3>Export History</h3>
          <div id="export-history-list">
            <p class="no-exports">No recent exports</p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Create settings tab content
   */
  createSettingsTab() {
    return `
      <div class="settings-panel">
        <div class="database-settings">
          <h3>Database Settings</h3>
          
          <div class="setting-group">
            <h4>Performance Settings</h4>
            <div class="setting-item">
              <label>Cache Size (KB):</label>
              <input type="number" id="cache-size" value="10000">
              <span class="setting-help">Amount of memory to use for caching</span>
            </div>
            
            <div class="setting-item">
              <label>Journal Mode:</label>
              <select id="journal-mode">
                <option value="WAL" selected>WAL (Recommended)</option>
                <option value="DELETE">DELETE</option>
                <option value="TRUNCATE">TRUNCATE</option>
              </select>
              <span class="setting-help">How database transactions are handled</span>
            </div>
            
            <div class="setting-item">
              <label>Synchronous Mode:</label>
              <select id="sync-mode">
                <option value="NORMAL" selected>NORMAL</option>
                <option value="FULL">FULL</option>
                <option value="OFF">OFF</option>
              </select>
              <span class="setting-help">Database durability vs performance trade-off</span>
            </div>
          </div>

          <div class="setting-group">
            <h4>Maintenance Settings</h4>
            <div class="setting-item">
              <label>
                <input type="checkbox" id="auto-maintenance" checked>
                Enable automatic maintenance
              </label>
              <span class="setting-help">Run scheduled maintenance tasks</span>
            </div>
            
            <div class="setting-item">
              <label>Backup Retention (days):</label>
              <input type="number" id="backup-retention" value="30" min="1" max="365">
              <span class="setting-help">How long to keep backup files</span>
            </div>
            
            <div class="setting-item">
              <label>Analytics Retention (days):</label>
              <input type="number" id="analytics-retention" value="90" min="7" max="365">
              <span class="setting-help">How long to keep usage analytics</span>
            </div>
          </div>

          <div class="setting-group">
            <h4>Vector Search Settings</h4>
            <div class="setting-item">
              <label>Default Similarity Threshold:</label>
              <input type="number" id="similarity-threshold" value="0.1" min="0" max="1" step="0.01">
              <span class="setting-help">Minimum similarity score for search results</span>
            </div>
            
            <div class="setting-item">
              <label>Max Search Results:</label>
              <input type="number" id="max-results" value="50" min="1" max="1000">
              <span class="setting-help">Maximum number of search results to return</span>
            </div>
          </div>

          <div class="settings-actions">
            <button id="save-settings" class="btn btn-primary">Save Settings</button>
            <button id="reset-settings" class="btn btn-secondary">Reset to Defaults</button>
          </div>
        </div>

        <div class="database-info">
          <h3>Database Information</h3>
          <div id="db-info">
            <div class="info-item">
              <span class="info-label">Database Path:</span>
              <span class="info-value" id="db-path">-</span>
            </div>
            <div class="info-item">
              <span class="info-label">Schema Version:</span>
              <span class="info-value" id="schema-version">-</span>
            </div>
            <div class="info-item">
              <span class="info-label">SQLite Version:</span>
              <span class="info-value" id="sqlite-version">-</span>
            </div>
            <div class="info-item">
              <span class="info-label">Page Size:</span>
              <span class="info-value" id="page-size">-</span>
            </div>
            <div class="info-item">
              <span class="info-label">Total Pages:</span>
              <span class="info-value" id="total-pages">-</span>
            </div>
            <div class="info-item">
              <span class="info-label">Free Pages:</span>
              <span class="info-value" id="free-pages">-</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Set up event handlers
   */
  setupEventHandlers() {
    // Tab switching
    this.container.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Modal handling
    const modal = this.container.querySelector('#db-modal');
    const closeBtn = modal.querySelector('.close');
    
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });

    // Overview tab handlers
    this.setupOverviewHandlers();
    
    // Maintenance tab handlers
    this.setupMaintenanceHandlers();
    
    // Backup tab handlers
    this.setupBackupHandlers();
    
    // Export tab handlers
    this.setupExportHandlers();
    
    // Settings tab handlers
    this.setupSettingsHandlers();
  }

  /**
   * Set up overview tab event handlers
   */
  setupOverviewHandlers() {
    const refreshBtn = this.container.querySelector('#refresh-stats');
    const healthCheckBtn = this.container.querySelector('#run-health-check');
    const quickActions = this.container.querySelectorAll('[id^="quick-"]');

    refreshBtn?.addEventListener('click', () => {
      this.updateStats();
    });

    healthCheckBtn?.addEventListener('click', () => {
      this.runHealthCheck();
    });

    quickActions.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.id.replace('quick-', '');
        this.executeQuickAction(action);
      });
    });
  }

  /**
   * Set up maintenance tab event handlers
   */
  setupMaintenanceHandlers() {
    // Implementation for maintenance handlers
    const toggleBtn = this.container.querySelector('#toggle-scheduler');
    toggleBtn?.addEventListener('click', () => {
      this.toggleScheduler();
    });

    // Add handlers for manual maintenance buttons
    const maintenanceButtons = [
      'run-vacuum',
      'run-analyze', 
      'rebuild-indexes',
      'cleanup-orphans'
    ];

    maintenanceButtons.forEach(id => {
      const btn = this.container.querySelector(`#${id}`);
      btn?.addEventListener('click', () => {
        const task = id.replace('run-', '').replace('rebuild-', '').replace('cleanup-', '');
        this.runMaintenanceTask(task);
      });
    });
  }

  /**
   * Set up backup tab event handlers
   */
  setupBackupHandlers() {
    // Implementation for backup handlers
    const createBtn = this.container.querySelector('#create-backup');
    const restoreBtn = this.container.querySelector('#restore-backup');
    
    createBtn?.addEventListener('click', () => {
      this.createBackup();
    });

    restoreBtn?.addEventListener('click', () => {
      this.restoreBackup();
    });

    // Backup type radio button handlers
    const backupTypeRadios = this.container.querySelectorAll('input[name="backupType"]');
    backupTypeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.handleBackupTypeChange(e.target.value);
      });
    });
  }

  /**
   * Set up export tab event handlers
   */
  setupExportHandlers() {
    const exportBtn = this.container.querySelector('#start-export');
    const exportTypeSelect = this.container.querySelector('#export-type');
    
    exportBtn?.addEventListener('click', () => {
      this.startExport();
    });

    exportTypeSelect?.addEventListener('change', (e) => {
      this.handleExportTypeChange(e.target.value);
    });
  }

  /**
   * Set up settings tab event handlers
   */
  setupSettingsHandlers() {
    const saveBtn = this.container.querySelector('#save-settings');
    const resetBtn = this.container.querySelector('#reset-settings');
    
    saveBtn?.addEventListener('click', () => {
      this.saveSettings();
    });

    resetBtn?.addEventListener('click', () => {
      this.resetSettings();
    });
  }

  /**
   * Switch between tabs
   */
  switchTab(tabName) {
    // Hide all tabs
    this.container.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.remove('active');
    });
    
    this.container.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.remove('active');
    });

    // Show selected tab
    const targetTab = this.container.querySelector(`#${tabName}-tab`);
    const targetButton = this.container.querySelector(`[data-tab="${tabName}"]`);
    
    if (targetTab && targetButton) {
      targetTab.classList.add('active');
      targetButton.classList.add('active');
      
      // Load tab-specific data
      this.loadTabData(tabName);
    }
  }

  /**
   * Load data for specific tab
   */
  async loadTabData(tabName) {
    switch (tabName) {
      case 'overview':
        await this.updateStats();
        await this.loadRecentActivity();
        break;
      case 'maintenance':
        await this.loadMaintenanceInfo();
        break;
      case 'backup':
        await this.loadBackupList();
        break;
      case 'export':
        await this.loadExportOptions();
        break;
      case 'settings':
        await this.loadSettings();
        break;
    }
  }

  /**
   * Update database status and statistics
   */
  async updateStatus() {
    try {
      const isHealthy = this.dbManager.checkIntegrity();
      const statusIndicator = this.container.querySelector('#db-status-indicator');
      const statusText = this.container.querySelector('#db-status-text');
      
      if (isHealthy) {
        statusIndicator.className = 'status-indicator status-healthy';
        statusText.textContent = 'Healthy';
      } else {
        statusIndicator.className = 'status-indicator status-warning';
        statusText.textContent = 'Issues Detected';
      }
    } catch (error) {
      const statusIndicator = this.container.querySelector('#db-status-indicator');
      const statusText = this.container.querySelector('#db-status-text');
      
      statusIndicator.className = 'status-indicator status-error';
      statusText.textContent = 'Connection Error';
    }
  }

  /**
   * Update database statistics
   */
  async updateStats() {
    try {
      const stats = this.dbManager.getStats();
      
      if (stats) {
        this.container.querySelector('#stat-projects').textContent = stats.projects || 0;
        this.container.querySelector('#stat-documents').textContent = stats.documents || 0;
        this.container.querySelector('#stat-chunks').textContent = stats.text_chunks || 0;
        this.container.querySelector('#stat-embeddings').textContent = stats.embeddings || 0;
        this.container.querySelector('#stat-db-size').textContent = this.formatFileSize(stats.database_size || 0);
      }
    } catch (error) {
      console.error('Failed to update stats:', error);
      this.showNotification('Failed to load database statistics', 'error');
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Show notification to user
   */
  showNotification(message, type = 'info') {
    // Create or update notification element
    let notification = document.querySelector('.db-notification');
    
    if (!notification) {
      notification = document.createElement('div');
      notification.className = 'db-notification';
      this.container.appendChild(notification);
    }
    
    notification.className = `db-notification ${type}`;
    notification.textContent = message;
    notification.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      notification.style.display = 'none';
    }, 5000);
  }

  /**
   * Show modal dialog
   */
  showModal(title, content) {
    const modal = this.container.querySelector('#db-modal');
    const modalBody = modal.querySelector('#modal-body');
    
    modalBody.innerHTML = `
      <h3>${title}</h3>
      <div>${content}</div>
    `;
    
    modal.style.display = 'block';
  }

  /**
   * Additional method stubs for full functionality
   * These would be implemented based on specific UI framework requirements
   */
  
  async runHealthCheck() {
    // Implementation for health check
    this.showNotification('Health check started...', 'info');
  }

  async executeQuickAction(action) {
    // Implementation for quick actions
    this.showNotification(`Executing ${action}...`, 'info');
  }

  async createBackup() {
    // Implementation for backup creation
    this.showNotification('Creating backup...', 'info');
  }

  async startExport() {
    // Implementation for data export
    this.showNotification('Starting export...', 'info');
  }

  async saveSettings() {
    // Implementation for saving settings
    this.showNotification('Settings saved', 'success');
  }

  // Additional helper methods...
}

// CSS styles for the database manager UI
const DATABASE_MANAGER_STYLES = `
  .database-manager {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .db-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 1px solid #e0e0e0;
  }

  .db-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
  }

  .status-healthy { background-color: #4caf50; }
  .status-warning { background-color: #ff9800; }
  .status-error { background-color: #f44336; }

  .db-tabs {
    display: flex;
    border-bottom: 1px solid #e0e0e0;
    margin-bottom: 20px;
  }

  .tab-button {
    padding: 12px 24px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 14px;
    color: #666;
    border-bottom: 2px solid transparent;
  }

  .tab-button.active,
  .tab-button:hover {
    color: #2196f3;
    border-bottom-color: #2196f3;
  }

  .tab-content {
    display: none;
  }

  .tab-content.active {
    display: block;
  }

  .overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
  }

  .stats-card,
  .health-card,
  .activity-card,
  .quick-actions-card {
    padding: 20px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background: white;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    margin: 4px;
  }

  .btn-primary { background: #2196f3; color: white; }
  .btn-secondary { background: #f5f5f5; color: #333; }
  .btn-warning { background: #ff9800; color: white; }
  .btn-danger { background: #f44336; color: white; }

  .modal {
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.4);
  }

  .modal-content {
    background-color: white;
    margin: 15% auto;
    padding: 20px;
    border-radius: 8px;
    width: 80%;
    max-width: 600px;
  }

  .close {
    color: #aaa;
    float: right;
    font-size: 28px;
    font-weight: bold;
    cursor: pointer;
  }

  .close:hover { color: black; }

  .db-notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: white;
    z-index: 1001;
  }

  .db-notification.info { background: #2196f3; }
  .db-notification.success { background: #4caf50; }
  .db-notification.warning { background: #ff9800; }
  .db-notification.error { background: #f44336; }

  /* Additional styles for specific components would go here */
`;

module.exports = { DatabaseManagerUI, DATABASE_MANAGER_STYLES };
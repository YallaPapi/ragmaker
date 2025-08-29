/**
 * Drag and Drop Handler for Desktop App
 * Handles file drag-and-drop operations with visual feedback
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const EventEmitter = require('events');

class DragDropHandler extends EventEmitter {
  constructor(windowManager, fileDialogService) {
    super();
    this.windowManager = windowManager;
    this.fileDialogService = fileDialogService;
    this.supportedTypes = [
      '.pdf', '.docx', '.doc', '.txt', '.md', '.rtf', '.odt',
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg',
      '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg',
      '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm',
      '.js', '.ts', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html', '.json', '.xml',
      '.xlsx', '.xls', '.csv', '.ods',
      '.pptx', '.ppt', '.odp',
      '.zip', '.rar', '.7z', '.tar', '.gz'
    ];

    this.dragOverlay = null;
    this.setupIPC();
  }

  /**
   * Initialize drag and drop functionality
   */
  initialize() {
    this.setupDragDropEvents();
    this.createDragOverlay();
  }

  /**
   * Setup IPC communication for drag and drop
   * @private
   */
  setupIPC() {
    // Handle file drop from renderer
    ipcMain.handle('drag-drop:process-files', async (event, filePaths) => {
      return await this.processDroppedFiles(filePaths);
    });

    // Handle drag over events
    ipcMain.on('drag-drop:drag-over', (event, data) => {
      this.handleDragOver(data);
    });

    // Handle drag leave events
    ipcMain.on('drag-drop:drag-leave', () => {
      this.handleDragLeave();
    });

    // Get supported file types
    ipcMain.handle('drag-drop:get-supported-types', () => {
      return this.supportedTypes;
    });

    // Enable/disable drag and drop
    ipcMain.handle('drag-drop:set-enabled', (event, enabled) => {
      this.setEnabled(enabled);
    });
  }

  /**
   * Setup drag and drop event handlers
   * @private
   */
  setupDragDropEvents() {
    if (this.windowManager && this.windowManager.mainWindow) {
      const mainWindow = this.windowManager.mainWindow;

      // Prevent default drag behavior
      mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (parsedUrl.protocol === 'file:') {
          event.preventDefault();
        }
      });

      // Handle dropped files
      mainWindow.webContents.on('dom-ready', () => {
        mainWindow.webContents.executeJavaScript(`
          // Prevent default drag behaviors
          document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
          });

          document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
          });

          // Setup drag and drop zones
          window.electronAPI.dragDrop.setupDragDropZones();
        `);
      });
    }
  }

  /**
   * Process dropped files
   * @param {Array} filePaths - Array of dropped file paths
   * @returns {Promise<Object>} Processing results
   */
  async processDroppedFiles(filePaths) {
    try {
      this.emit('dropStarted', { fileCount: filePaths.length });

      const results = {
        successful: [],
        failed: [],
        unsupported: [],
        totalFiles: filePaths.length
      };

      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        
        try {
          // Emit progress
          this.emit('dropProgress', {
            current: i + 1,
            total: filePaths.length,
            file: path.basename(filePath),
            progress: ((i + 1) / filePaths.length) * 100
          });

          const fileInfo = await this.validateAndProcessFile(filePath);
          
          if (fileInfo.supported) {
            results.successful.push(fileInfo);
            this.emit('fileProcessed', fileInfo);
          } else {
            results.unsupported.push({
              path: filePath,
              name: path.basename(filePath),
              reason: 'Unsupported file type'
            });
          }

        } catch (error) {
          results.failed.push({
            path: filePath,
            name: path.basename(filePath),
            error: error.message
          });
          this.emit('fileProcessError', { filePath, error });
        }
      }

      this.emit('dropCompleted', results);
      return results;

    } catch (error) {
      this.emit('dropError', error);
      throw error;
    }
  }

  /**
   * Validate and process a single dropped file
   * @param {string} filePath - Path to the dropped file
   * @returns {Promise<Object>} File information
   */
  async validateAndProcessFile(filePath) {
    const stats = await fs.stat(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);

    // Check if file type is supported
    const isSupported = this.supportedTypes.includes(extension);
    
    // Get file size in a readable format
    const fileSize = this.formatFileSize(stats.size);

    // Determine file category
    const category = this.categorizeFile(extension);

    const fileInfo = {
      path: filePath,
      name: fileName,
      extension: extension.slice(1),
      size: stats.size,
      sizeFormatted: fileSize,
      category,
      modified: stats.mtime,
      created: stats.birthtime,
      supported: isSupported,
      isDirectory: stats.isDirectory()
    };

    // Add content preview for supported text files
    if (isSupported && this.isTextFile(extension) && stats.size < 1024 * 1024) { // Max 1MB
      try {
        const content = await fs.readFile(filePath, 'utf8');
        fileInfo.preview = content.substring(0, 500);
        fileInfo.hasPreview = true;
      } catch (error) {
        fileInfo.hasPreview = false;
      }
    }

    return fileInfo;
  }

  /**
   * Handle drag over events
   * @param {Object} data - Drag data
   */
  handleDragOver(data) {
    this.showDragOverlay(data);
    this.emit('dragOver', data);
  }

  /**
   * Handle drag leave events
   */
  handleDragLeave() {
    this.hideDragOverlay();
    this.emit('dragLeave');
  }

  /**
   * Show drag overlay with visual feedback
   * @param {Object} data - Drag data
   * @private
   */
  showDragOverlay(data) {
    if (this.windowManager && this.windowManager.mainWindow) {
      this.windowManager.mainWindow.webContents.send('drag-drop:show-overlay', {
        fileCount: data.fileCount || 0,
        hasValidFiles: data.hasValidFiles || false
      });
    }
  }

  /**
   * Hide drag overlay
   * @private
   */
  hideDragOverlay() {
    if (this.windowManager && this.windowManager.mainWindow) {
      this.windowManager.mainWindow.webContents.send('drag-drop:hide-overlay');
    }
  }

  /**
   * Create drag overlay HTML structure
   * @private
   */
  createDragOverlay() {
    // This will be injected into the renderer process
    const overlayHTML = `
      <div id="drag-drop-overlay" class="drag-drop-overlay hidden">
        <div class="drag-drop-content">
          <div class="drag-drop-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
          </div>
          <h3 class="drag-drop-title">Drop files to import</h3>
          <p class="drag-drop-message">Release to process files</p>
          <div class="drag-drop-file-count"></div>
        </div>
      </div>
    `;

    const overlayCSS = `
      .drag-drop-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        transition: all 0.2s ease;
      }

      .drag-drop-overlay.hidden {
        opacity: 0;
        pointer-events: none;
      }

      .drag-drop-content {
        background: var(--bg-secondary, #ffffff);
        border: 2px dashed var(--accent-color, #007acc);
        border-radius: 12px;
        padding: 40px;
        text-align: center;
        max-width: 400px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
      }

      .drag-drop-icon {
        color: var(--accent-color, #007acc);
        margin-bottom: 20px;
      }

      .drag-drop-title {
        font-size: 24px;
        font-weight: 600;
        color: var(--text-primary, #333333);
        margin: 0 0 10px 0;
      }

      .drag-drop-message {
        font-size: 16px;
        color: var(--text-secondary, #666666);
        margin: 0 0 20px 0;
      }

      .drag-drop-file-count {
        font-size: 14px;
        color: var(--text-tertiary, #888888);
        font-weight: 500;
      }

      .drag-drop-overlay.drag-valid .drag-drop-content {
        border-color: var(--success-color, #28a745);
        background: var(--success-bg, rgba(40, 167, 69, 0.1));
      }

      .drag-drop-overlay.drag-invalid .drag-drop-content {
        border-color: var(--error-color, #dc3545);
        background: var(--error-bg, rgba(220, 53, 69, 0.1));
      }
    `;

    return { html: overlayHTML, css: overlayCSS };
  }

  /**
   * Format file size to human readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size
   * @private
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Categorize file by extension
   * @param {string} extension - File extension
   * @returns {string} File category
   * @private
   */
  categorizeFile(extension) {
    const categories = {
      documents: ['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf', '.odt'],
      images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'],
      audio: ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg'],
      video: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm'],
      code: ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html', '.json', '.xml'],
      spreadsheets: ['.xlsx', '.xls', '.csv', '.ods'],
      presentations: ['.pptx', '.ppt', '.odp'],
      archives: ['.zip', '.rar', '.7z', '.tar', '.gz']
    };

    for (const [category, extensions] of Object.entries(categories)) {
      if (extensions.includes(extension)) {
        return category;
      }
    }

    return 'unknown';
  }

  /**
   * Check if file is a text file
   * @param {string} extension - File extension
   * @returns {boolean} Is text file
   * @private
   */
  isTextFile(extension) {
    const textExtensions = ['.txt', '.md', '.json', '.xml', '.csv', '.js', '.ts', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html'];
    return textExtensions.includes(extension);
  }

  /**
   * Enable or disable drag and drop
   * @param {boolean} enabled - Enable state
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.windowManager && this.windowManager.mainWindow) {
      this.windowManager.mainWindow.webContents.send('drag-drop:set-enabled', enabled);
    }
  }

  /**
   * Get drop zones configuration
   * @returns {Array} Drop zone configs
   */
  getDropZones() {
    return [
      {
        id: 'main-drop-zone',
        selector: '.main-content',
        allowedTypes: this.supportedTypes,
        maxFiles: 100
      },
      {
        id: 'sidebar-drop-zone', 
        selector: '.sidebar',
        allowedTypes: ['.pdf', '.docx', '.doc', '.txt', '.md'],
        maxFiles: 10
      },
      {
        id: 'import-area-drop-zone',
        selector: '.import-area',
        allowedTypes: this.supportedTypes,
        maxFiles: 50
      }
    ];
  }

  /**
   * Cleanup drag and drop handler
   */
  destroy() {
    // Remove IPC handlers
    ipcMain.removeAllListeners('drag-drop:process-files');
    ipcMain.removeAllListeners('drag-drop:drag-over');
    ipcMain.removeAllListeners('drag-drop:drag-leave');
    ipcMain.removeAllListeners('drag-drop:get-supported-types');
    ipcMain.removeAllListeners('drag-drop:set-enabled');

    this.removeAllListeners();
  }
}

module.exports = DragDropHandler;
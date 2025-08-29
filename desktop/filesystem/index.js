/**
 * Comprehensive File System Integration
 * Main service that coordinates all filesystem components for the desktop app
 */

const { EventEmitter } = require('events');
const FileDialogService = require('./fileDialogService');
const DragDropHandler = require('./dragDropHandler');
const WatchFoldersService = require('./watchFoldersService');
const FileTypeDetector = require('./fileTypeDetector');
const BatchOperationsService = require('./batchOperations');
const FileManager = require('./fileManager');
const PreviewGenerator = require('./previewGenerator');
const VersionControl = require('./versionControl');
const FileSearch = require('./fileSearch');
const ContextMenuService = require('./contextMenu');

class FileSystemIntegration extends EventEmitter {
  constructor(windowManager) {
    super();
    this.windowManager = windowManager;
    this.initialized = false;
    this.services = {};

    // Initialize all services
    this.initializeServices();
    this.setupEventHandlers();
  }

  /**
   * Initialize all filesystem services
   * @private
   */
  initializeServices() {
    try {
      // Core services
      this.services.fileDialog = new FileDialogService();
      this.services.fileTypeDetector = new FileTypeDetector();
      this.services.previewGenerator = new PreviewGenerator();
      this.services.versionControl = new VersionControl();

      // Management services
      this.services.batchOperations = new BatchOperationsService(
        this.services.fileTypeDetector,
        this.services.fileDialog
      );

      this.services.fileManager = new FileManager(
        this.services.fileTypeDetector,
        this.services.batchOperations
      );

      this.services.fileSearch = new FileSearch(
        this.services.fileTypeDetector,
        this.services.fileManager
      );

      this.services.watchFolders = new WatchFoldersService(
        this.services.fileDialog
      );

      this.services.contextMenu = new ContextMenuService(
        this.services.fileManager,
        this.services.previewGenerator,
        this.services.versionControl
      );

      // UI interaction services
      this.services.dragDrop = new DragDropHandler(
        this.windowManager,
        this.services.fileDialog
      );

      this.emit('servicesInitialized', Object.keys(this.services));

    } catch (error) {
      this.emit('initializationError', error);
      throw new Error(`Failed to initialize filesystem services: ${error.message}`);
    }
  }

  /**
   * Setup cross-service event handlers
   * @private
   */
  setupEventHandlers() {
    // File dialog events
    this.services.fileDialog.on('fileSelected', (fileInfo) => {
      this.handleFileSelected(fileInfo);
    });

    this.services.fileDialog.on('multipleFilesSelected', (fileInfos) => {
      this.handleMultipleFilesSelected(fileInfos);
    });

    // Drag and drop events
    this.services.dragDrop.on('fileProcessed', (fileInfo) => {
      this.handleFileProcessed(fileInfo);
    });

    this.services.dragDrop.on('dropCompleted', (results) => {
      this.handleDropCompleted(results);
    });

    // Watch folders events
    this.services.watchFolders.on('fileAdded', ({ fileInfo }) => {
      this.handleWatchedFileAdded(fileInfo);
    });

    this.services.watchFolders.on('fileChanged', ({ fileInfo }) => {
      this.handleWatchedFileChanged(fileInfo);
    });

    // Version control events
    this.services.versionControl.on('versionCreated', (version) => {
      this.handleVersionCreated(version);
    });

    // File manager events
    this.services.fileManager.on('collectionCreated', (collection) => {
      this.emit('collectionCreated', collection);
    });

    this.services.fileManager.on('fileOrganized', (result) => {
      this.emit('fileOrganized', result);
    });

    // Search events
    this.services.fileSearch.on('searchCompleted', (result) => {
      this.emit('searchCompleted', result);
    });

    // Context menu events
    this.services.contextMenu.on('actionExecuted', (result) => {
      this.emit('contextMenuAction', result);
    });

    // Batch operations events
    this.services.batchOperations.on('operationCompleted', (result) => {
      this.emit('batchOperationCompleted', result);
    });

    // Preview generator events
    this.services.previewGenerator.on('thumbnailGenerated', (result) => {
      this.emit('thumbnailGenerated', result);
    });
  }

  /**
   * Initialize the filesystem integration
   * @param {Object} config - Configuration options
   * @returns {Promise<void>}
   */
  async initialize(config = {}) {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize drag and drop
      this.services.dragDrop.initialize();

      // Setup default file associations
      await this.setupDefaultAssociations();

      // Create default collections if requested
      if (config.createDefaultCollections) {
        await this.createDefaultCollections();
      }

      // Build initial search index if requested
      if (config.buildSearchIndex && config.indexPaths) {
        await this.services.fileSearch.buildIndex(config.indexPaths);
      }

      // Start watching default folders if specified
      if (config.watchFolders) {
        for (const folderConfig of config.watchFolders) {
          this.services.watchFolders.addWatchFolder(
            folderConfig.path,
            folderConfig.options
          );
        }
      }

      this.initialized = true;
      this.emit('initialized', config);

    } catch (error) {
      this.emit('initializationError', error);
      throw error;
    }
  }

  /**
   * Setup default file associations
   * @private
   */
  async setupDefaultAssociations() {
    const associations = [
      {
        extension: '.pdf',
        defaultApp: 'system',
        description: 'PDF Document',
        icon: 'pdf'
      },
      {
        extension: '.docx',
        defaultApp: 'system',
        description: 'Word Document',
        icon: 'document'
      },
      {
        extension: '.txt',
        defaultApp: 'system',
        description: 'Text Document',
        icon: 'text'
      },
      {
        extension: '.jpg',
        defaultApp: 'system',
        description: 'JPEG Image',
        icon: 'image'
      },
      {
        extension: '.png',
        defaultApp: 'system',
        description: 'PNG Image',
        icon: 'image'
      }
    ];

    for (const association of associations) {
      this.services.contextMenu.registerFileAssociation(
        association.extension,
        association
      );
    }
  }

  /**
   * Create default file collections
   * @private
   */
  async createDefaultCollections() {
    const defaultCollections = [
      {
        name: 'Documents',
        description: 'All document files',
        type: 'auto',
        rules: [
          {
            conditions: [
              { type: 'category', values: ['document'] }
            ],
            action: 'addToCollection'
          }
        ]
      },
      {
        name: 'Images',
        description: 'All image files',
        type: 'auto',
        rules: [
          {
            conditions: [
              { type: 'category', values: ['image'] }
            ],
            action: 'addToCollection'
          }
        ]
      },
      {
        name: 'Recent Files',
        description: 'Recently accessed files',
        type: 'smart'
      }
    ];

    for (const collection of defaultCollections) {
      this.services.fileManager.createCollection(collection.name, collection);
    }
  }

  /**
   * Handle file selection from dialog
   * @private
   */
  async handleFileSelected(fileInfo) {
    try {
      // Auto-detect file type if not already done
      if (!fileInfo.type) {
        const typeInfo = await this.services.fileTypeDetector.detectFileType(fileInfo.path);
        Object.assign(fileInfo, typeInfo);
      }

      // Update file metadata
      await this.services.fileManager.updateFileMetadata?.(fileInfo.path);

      // Start version tracking if enabled
      if (this.shouldTrackVersions(fileInfo)) {
        try {
          await this.services.versionControl.startTracking(fileInfo.path);
        } catch (error) {
          // Version tracking is optional, continue without it
        }
      }

      this.emit('fileSelected', fileInfo);

    } catch (error) {
      this.emit('fileProcessingError', { fileInfo, error });
    }
  }

  /**
   * Handle multiple file selection
   * @private
   */
  async handleMultipleFilesSelected(fileInfos) {
    try {
      // Process files in parallel
      const processedFiles = await Promise.all(
        fileInfos.map(async (fileInfo) => {
          try {
            // Detect file type
            const typeInfo = await this.services.fileTypeDetector.detectFileType(fileInfo.path);
            return { ...fileInfo, ...typeInfo, processed: true };
          } catch (error) {
            return { ...fileInfo, error: error.message, processed: false };
          }
        })
      );

      // Auto-organize if enabled
      const successfulFiles = processedFiles
        .filter(f => f.processed)
        .map(f => f.path);

      if (successfulFiles.length > 0) {
        await this.services.fileManager.organizeFiles(successfulFiles, {
          autoCreateCollections: true,
          autoTag: true
        });
      }

      this.emit('multipleFilesProcessed', { 
        total: fileInfos.length, 
        processed: processedFiles 
      });

    } catch (error) {
      this.emit('batchProcessingError', { fileInfos, error });
    }
  }

  /**
   * Handle processed dropped file
   * @private
   */
  async handleFileProcessed(fileInfo) {
    // Similar to handleFileSelected but for drag-drop
    await this.handleFileSelected(fileInfo);
  }

  /**
   * Handle completed drop operation
   * @private
   */
  async handleDropCompleted(results) {
    // Auto-organize successful files
    if (results.successful.length > 0) {
      const filePaths = results.successful.map(f => f.path);
      
      try {
        await this.services.fileManager.organizeFiles(filePaths, {
          autoCreateCollections: true,
          autoTag: true
        });
      } catch (error) {
        this.emit('organizationError', { filePaths, error });
      }
    }

    this.emit('dropProcessingCompleted', results);
  }

  /**
   * Handle watched file added
   * @private
   */
  async handleWatchedFileAdded(fileInfo) {
    try {
      // Process the new file
      const typeInfo = await this.services.fileTypeDetector.detectFileType(fileInfo.path);
      const enrichedInfo = { ...fileInfo, ...typeInfo };

      // Add to file manager
      await this.services.fileManager.updateFileMetadata?.(fileInfo.path);

      // Auto-organize
      await this.services.fileManager.organizeFiles([fileInfo.path], {
        autoCreateCollections: true,
        autoTag: true
      });

      this.emit('watchedFileAdded', enrichedInfo);

    } catch (error) {
      this.emit('watchedFileError', { fileInfo, error });
    }
  }

  /**
   * Handle watched file changed
   * @private
   */
  async handleWatchedFileChanged(fileInfo) {
    try {
      // Create version if tracking is enabled
      if (this.services.versionControl.watchedFiles?.has(fileInfo.path)) {
        await this.services.versionControl.createVersion(fileInfo.path, {
          type: 'auto',
          comment: 'Automatic version from file watcher'
        });
      }

      this.emit('watchedFileChanged', fileInfo);

    } catch (error) {
      this.emit('watchedFileError', { fileInfo, error });
    }
  }

  /**
   * Handle version created
   * @private
   */
  handleVersionCreated(version) {
    this.emit('versionCreated', version);
  }

  /**
   * Check if file should be version tracked
   * @private
   */
  shouldTrackVersions(fileInfo) {
    // Track important document types
    const trackableTypes = ['document', 'code', 'spreadsheet', 'presentation'];
    return trackableTypes.includes(fileInfo.category) && fileInfo.size < 50 * 1024 * 1024; // Max 50MB
  }

  /**
   * Public API methods
   */

  /**
   * Import files using dialog
   * @param {Object} options - Import options
   * @returns {Promise<Array>} Imported file info
   */
  async importFiles(options = {}) {
    const files = await this.services.fileDialog.showOpenMultipleDialog(options);
    return files || [];
  }

  /**
   * Import folder
   * @param {Object} options - Import options
   * @returns {Promise<string|null>} Selected folder path
   */
  async importFolder(options = {}) {
    return await this.services.fileDialog.showFolderDialog(options);
  }

  /**
   * Export data to file
   * @param {*} data - Data to export
   * @param {Object} options - Export options
   * @returns {Promise<string|null>} Export file path
   */
  async exportData(data, options = {}) {
    const savePath = await this.services.fileDialog.showSaveDialog(options);
    if (savePath) {
      await this.services.fileDialog.exportFile(savePath, data, options);
    }
    return savePath;
  }

  /**
   * Search files
   * @param {Object} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  async searchFiles(query, options = {}) {
    return await this.services.fileSearch.search(query, options);
  }

  /**
   * Generate file preview
   * @param {string} filePath - File path
   * @param {string} size - Preview size
   * @returns {Promise<Object>} Preview data
   */
  async generatePreview(filePath, size = 'medium') {
    return await this.services.previewGenerator.generatePreview(filePath, size);
  }

  /**
   * Generate file thumbnail
   * @param {string} filePath - File path
   * @param {string} size - Thumbnail size
   * @returns {Promise<Object>} Thumbnail data
   */
  async generateThumbnail(filePath, size = 'medium') {
    return await this.services.previewGenerator.generateThumbnail(filePath, size);
  }

  /**
   * Show context menu for files
   * @param {Array} filePaths - Selected files
   * @param {Object} options - Menu options
   */
  async showContextMenu(filePaths, options = {}) {
    await this.services.contextMenu.showContextMenu(filePaths, options);
  }

  /**
   * Add watch folder
   * @param {string} folderPath - Folder to watch
   * @param {Object} options - Watch options
   * @returns {string} Watch ID
   */
  addWatchFolder(folderPath, options = {}) {
    return this.services.watchFolders.addWatchFolder(folderPath, options);
  }

  /**
   * Remove watch folder
   * @param {string} watchId - Watch ID to remove
   * @returns {boolean} Success status
   */
  removeWatchFolder(watchId) {
    return this.services.watchFolders.removeWatchFolder(watchId);
  }

  /**
   * Create file collection
   * @param {string} name - Collection name
   * @param {Object} options - Collection options
   * @returns {string} Collection ID
   */
  createCollection(name, options = {}) {
    return this.services.fileManager.createCollection(name, options);
  }

  /**
   * Get all collections
   * @returns {Array} Collections
   */
  getAllCollections() {
    return this.services.fileManager.getAllCollections();
  }

  /**
   * Create file tag
   * @param {string} name - Tag name
   * @param {Object} options - Tag options
   * @returns {string} Tag ID
   */
  createTag(name, options = {}) {
    return this.services.fileManager.createTag(name, options);
  }

  /**
   * Get all tags
   * @returns {Array} Tags
   */
  getAllTags() {
    return this.services.fileManager.getAllTags();
  }

  /**
   * Start version tracking
   * @param {string} filePath - File to track
   * @param {Object} options - Tracking options
   * @returns {Promise<string>} Initial version ID
   */
  async startVersionTracking(filePath, options = {}) {
    return await this.services.versionControl.startTracking(filePath, options);
  }

  /**
   * Get file version history
   * @param {string} filePath - File path
   * @returns {Array} Version history
   */
  getFileVersionHistory(filePath) {
    return this.services.versionControl.getFileHistory(filePath);
  }

  /**
   * Get comprehensive filesystem statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      fileManager: this.services.fileManager.getStats(),
      search: this.services.fileSearch.getStats(),
      versionControl: this.services.versionControl.getStats(),
      watchFolders: this.services.watchFolders.getQueueStatus(),
      preview: this.services.previewGenerator.getCacheStats(),
      batchOperations: {
        activeOperations: this.services.batchOperations.getAllOperations().filter(op => op.status === 'processing').length,
        totalOperations: this.services.batchOperations.getAllOperations().length
      }
    };
  }

  /**
   * Export all filesystem data
   * @returns {Object} Export data
   */
  exportAllData() {
    return {
      fileManager: this.services.fileManager.exportData(),
      versionHistory: this.services.versionControl.exportHistory(),
      searchHistory: this.services.fileSearch.getSearchHistory(),
      watchedFolders: this.services.watchFolders.getWatchedFolders(),
      contextMenuConfig: this.services.contextMenu.getConfiguration(),
      exportTimestamp: new Date().toISOString()
    };
  }

  /**
   * Import filesystem data
   * @param {Object} data - Data to import
   */
  importAllData(data) {
    if (data.fileManager) {
      this.services.fileManager.importData(data.fileManager);
    }
    // Add other import handlers as needed
    
    this.emit('dataImported', data);
  }

  /**
   * Cleanup and destroy all services
   */
  destroy() {
    // Cleanup all services
    for (const [name, service] of Object.entries(this.services)) {
      if (service && typeof service.destroy === 'function') {
        try {
          service.destroy();
        } catch (error) {
          this.emit('cleanupError', { service: name, error });
        }
      }
    }

    this.services = {};
    this.initialized = false;
    this.removeAllListeners();

    this.emit('destroyed');
  }
}

module.exports = FileSystemIntegration;
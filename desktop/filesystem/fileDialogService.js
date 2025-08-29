/**
 * Native File Dialog Service for Desktop App
 * Handles file selection, import/export operations with native OS dialogs
 */

const { dialog, shell, app } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const EventEmitter = require('events');

class FileDialogService extends EventEmitter {
  constructor() {
    super();
    this.supportedFormats = {
      documents: {
        name: 'Documents',
        extensions: ['pdf', 'docx', 'doc', 'txt', 'md', 'rtf', 'odt']
      },
      images: {
        name: 'Images', 
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg']
      },
      audio: {
        name: 'Audio',
        extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg']
      },
      video: {
        name: 'Video',
        extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm']
      },
      code: {
        name: 'Code Files',
        extensions: ['js', 'ts', 'py', 'java', 'cpp', 'c', 'h', 'css', 'html', 'json', 'xml']
      },
      spreadsheets: {
        name: 'Spreadsheets',
        extensions: ['xlsx', 'xls', 'csv', 'ods']
      },
      presentations: {
        name: 'Presentations',
        extensions: ['pptx', 'ppt', 'odp']
      },
      archives: {
        name: 'Archives',
        extensions: ['zip', 'rar', '7z', 'tar', 'gz']
      }
    };

    this.recentFiles = [];
    this.maxRecentFiles = 20;
    this.defaultPath = app.getPath('documents');
  }

  /**
   * Show open file dialog for single file selection
   * @param {Object} options - Dialog options
   * @returns {Promise<Object>} Selected file info or null
   */
  async showOpenDialog(options = {}) {
    try {
      const defaultOptions = {
        title: 'Select File to Import',
        defaultPath: this.defaultPath,
        buttonLabel: 'Import',
        filters: this._buildFilters(options.fileTypes || ['documents']),
        properties: ['openFile']
      };

      const mergedOptions = { ...defaultOptions, ...options };
      const result = await dialog.showOpenDialog(mergedOptions);

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const filePath = result.filePaths[0];
      const fileInfo = await this._getFileInfo(filePath);
      
      this._addToRecentFiles(fileInfo);
      this.emit('fileSelected', fileInfo);

      return fileInfo;
    } catch (error) {
      this.emit('error', { type: 'dialog_error', error });
      throw new Error(`Failed to show open dialog: ${error.message}`);
    }
  }

  /**
   * Show open dialog for multiple file selection
   * @param {Object} options - Dialog options
   * @returns {Promise<Array>} Array of selected file info or empty array
   */
  async showOpenMultipleDialog(options = {}) {
    try {
      const defaultOptions = {
        title: 'Select Files to Import',
        defaultPath: this.defaultPath,
        buttonLabel: 'Import All',
        filters: this._buildFilters(options.fileTypes || ['documents']),
        properties: ['openFile', 'multiSelections']
      };

      const mergedOptions = { ...defaultOptions, ...options };
      const result = await dialog.showOpenDialog(mergedOptions);

      if (result.canceled || result.filePaths.length === 0) {
        return [];
      }

      const fileInfos = await Promise.all(
        result.filePaths.map(filePath => this._getFileInfo(filePath))
      );

      fileInfos.forEach(fileInfo => {
        this._addToRecentFiles(fileInfo);
      });

      this.emit('multipleFilesSelected', fileInfos);
      return fileInfos;
    } catch (error) {
      this.emit('error', { type: 'multi_dialog_error', error });
      throw new Error(`Failed to show multiple file dialog: ${error.message}`);
    }
  }

  /**
   * Show folder selection dialog
   * @param {Object} options - Dialog options
   * @returns {Promise<string>} Selected folder path or null
   */
  async showFolderDialog(options = {}) {
    try {
      const defaultOptions = {
        title: 'Select Folder',
        defaultPath: this.defaultPath,
        buttonLabel: 'Select',
        properties: ['openDirectory']
      };

      const mergedOptions = { ...defaultOptions, ...options };
      const result = await dialog.showOpenDialog(mergedOptions);

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const folderPath = result.filePaths[0];
      this.defaultPath = folderPath;
      this.emit('folderSelected', folderPath);

      return folderPath;
    } catch (error) {
      this.emit('error', { type: 'folder_dialog_error', error });
      throw new Error(`Failed to show folder dialog: ${error.message}`);
    }
  }

  /**
   * Show save dialog for file export
   * @param {Object} options - Dialog options
   * @returns {Promise<string>} Save path or null
   */
  async showSaveDialog(options = {}) {
    try {
      const defaultOptions = {
        title: 'Save File',
        defaultPath: path.join(this.defaultPath, options.defaultFileName || 'export'),
        buttonLabel: 'Save',
        filters: this._buildFilters(options.fileTypes || ['documents'])
      };

      const mergedOptions = { ...defaultOptions, ...options };
      const result = await dialog.showSaveDialog(mergedOptions);

      if (result.canceled || !result.filePath) {
        return null;
      }

      this.emit('saveLocationSelected', result.filePath);
      return result.filePath;
    } catch (error) {
      this.emit('error', { type: 'save_dialog_error', error });
      throw new Error(`Failed to show save dialog: ${error.message}`);
    }
  }

  /**
   * Import files with progress tracking
   * @param {Array} filePaths - Paths to import
   * @param {Object} options - Import options
   * @returns {Promise<Array>} Import results
   */
  async importFiles(filePaths, options = {}) {
    const results = [];
    const totalFiles = filePaths.length;

    this.emit('importStarted', { totalFiles });

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      
      try {
        this.emit('importProgress', {
          current: i + 1,
          total: totalFiles,
          file: path.basename(filePath),
          progress: ((i + 1) / totalFiles) * 100
        });

        const fileInfo = await this._processImportFile(filePath, options);
        results.push({ success: true, file: fileInfo });

      } catch (error) {
        results.push({ 
          success: false, 
          file: filePath, 
          error: error.message 
        });
        this.emit('importError', { file: filePath, error });
      }
    }

    this.emit('importCompleted', { results, totalFiles });
    return results;
  }

  /**
   * Export data to file
   * @param {string} filePath - Path to save file
   * @param {*} data - Data to export
   * @param {Object} options - Export options
   * @returns {Promise<boolean>} Success status
   */
  async exportFile(filePath, data, options = {}) {
    try {
      this.emit('exportStarted', { filePath });

      const extension = path.extname(filePath).toLowerCase();
      let content;

      switch (extension) {
        case '.json':
          content = JSON.stringify(data, null, 2);
          break;
        case '.csv':
          content = this._convertToCSV(data);
          break;
        case '.txt':
          content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
          break;
        default:
          content = JSON.stringify(data, null, 2);
      }

      await fs.writeFile(filePath, content, 'utf8');
      
      this.emit('exportCompleted', { filePath });
      return true;
    } catch (error) {
      this.emit('exportError', { filePath, error });
      throw new Error(`Failed to export file: ${error.message}`);
    }
  }

  /**
   * Show file in OS explorer
   * @param {string} filePath - Path to show
   */
  async showFileInExplorer(filePath) {
    try {
      await shell.showItemInFolder(filePath);
    } catch (error) {
      this.emit('error', { type: 'explorer_error', error });
    }
  }

  /**
   * Open file with default system application
   * @param {string} filePath - Path to open
   */
  async openFileExternal(filePath) {
    try {
      await shell.openPath(filePath);
    } catch (error) {
      this.emit('error', { type: 'external_open_error', error });
    }
  }

  /**
   * Get recent files
   * @returns {Array} Recent file list
   */
  getRecentFiles() {
    return [...this.recentFiles];
  }

  /**
   * Clear recent files
   */
  clearRecentFiles() {
    this.recentFiles = [];
    this.emit('recentFilesCleared');
  }

  /**
   * Set default path for dialogs
   * @param {string} path - Default path
   */
  setDefaultPath(path) {
    this.defaultPath = path;
  }

  /**
   * Build file filters for dialog
   * @private
   */
  _buildFilters(fileTypes) {
    const filters = [];
    
    // Add 'All Files' option
    filters.push({
      name: 'All Files',
      extensions: ['*']
    });

    // Add specific file type filters
    fileTypes.forEach(type => {
      if (this.supportedFormats[type]) {
        filters.push(this.supportedFormats[type]);
      }
    });

    return filters;
  }

  /**
   * Get detailed file information
   * @private
   */
  async _getFileInfo(filePath) {
    const stats = await fs.stat(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    return {
      path: filePath,
      name: path.basename(filePath),
      extension: extension.slice(1),
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime,
      type: this._getFileType(extension),
      isDirectory: stats.isDirectory()
    };
  }

  /**
   * Determine file type from extension
   * @private
   */
  _getFileType(extension) {
    for (const [type, config] of Object.entries(this.supportedFormats)) {
      if (config.extensions.includes(extension.slice(1))) {
        return type;
      }
    }
    return 'unknown';
  }

  /**
   * Process single file import
   * @private
   */
  async _processImportFile(filePath, options) {
    const fileInfo = await this._getFileInfo(filePath);
    
    // Add custom processing logic here based on file type
    if (options.processContent) {
      const content = await fs.readFile(filePath, 'utf8');
      fileInfo.content = content;
    }

    return fileInfo;
  }

  /**
   * Add file to recent files list
   * @private
   */
  _addToRecentFiles(fileInfo) {
    // Remove if already exists
    this.recentFiles = this.recentFiles.filter(f => f.path !== fileInfo.path);
    
    // Add to beginning
    this.recentFiles.unshift(fileInfo);
    
    // Limit size
    if (this.recentFiles.length > this.maxRecentFiles) {
      this.recentFiles = this.recentFiles.slice(0, this.maxRecentFiles);
    }

    this.emit('recentFilesUpdated', this.recentFiles);
  }

  /**
   * Convert data to CSV format
   * @private
   */
  _convertToCSV(data) {
    if (!Array.isArray(data)) {
      return '';
    }

    if (data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header] || '';
        return typeof value === 'string' && value.includes(',') 
          ? `"${value}"` 
          : value;
      });
      csvRows.push(values.join(','));
    });

    return csvRows.join('\n');
  }
}

module.exports = FileDialogService;
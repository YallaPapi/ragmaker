/**
 * Batch File Operations Service
 * Handles bulk file processing with progress tracking and error handling
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class BatchOperationsService extends EventEmitter {
  constructor(fileTypeDetector, fileDialogService) {
    super();
    this.fileTypeDetector = fileTypeDetector;
    this.fileDialogService = fileDialogService;
    this.operations = new Map(); // operationId -> operation info
    this.workerPool = [];
    this.maxConcurrentOperations = 5;
    this.defaultTimeout = 30000; // 30 seconds
    this.retryAttempts = 3;
  }

  /**
   * Process multiple files in batches
   * @param {Array} filePaths - Array of file paths to process
   * @param {Object} options - Processing options
   * @returns {Promise<string>} Operation ID
   */
  async processBatch(filePaths, options = {}) {
    const operationId = this.generateOperationId();
    
    const operation = {
      id: operationId,
      type: 'batch_process',
      status: 'initializing',
      totalFiles: filePaths.length,
      processedFiles: 0,
      successfulFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      startTime: new Date(),
      endTime: null,
      files: filePaths.map(filePath => ({
        path: filePath,
        name: path.basename(filePath),
        status: 'pending',
        result: null,
        error: null,
        attempts: 0,
        startTime: null,
        endTime: null
      })),
      options: {
        batchSize: options.batchSize || 10,
        skipErrors: options.skipErrors !== false,
        timeout: options.timeout || this.defaultTimeout,
        retryFailed: options.retryFailed !== false,
        validateTypes: options.validateTypes !== false,
        ...options
      },
      progress: {
        percentage: 0,
        currentFile: null,
        estimatedTimeRemaining: null,
        avgProcessingTime: 0
      }
    };

    this.operations.set(operationId, operation);

    // Start processing
    this.processOperationBatch(operation);

    return operationId;
  }

  /**
   * Copy multiple files to a destination
   * @param {Array} filePaths - Source file paths
   * @param {string} destinationPath - Destination directory
   * @param {Object} options - Copy options
   * @returns {Promise<string>} Operation ID
   */
  async copyBatch(filePaths, destinationPath, options = {}) {
    const operationId = this.generateOperationId();
    
    const operation = {
      id: operationId,
      type: 'batch_copy',
      status: 'initializing',
      totalFiles: filePaths.length,
      processedFiles: 0,
      successfulFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      startTime: new Date(),
      endTime: null,
      destinationPath,
      files: filePaths.map(filePath => ({
        path: filePath,
        name: path.basename(filePath),
        status: 'pending',
        destinationPath: path.join(destinationPath, path.basename(filePath)),
        result: null,
        error: null,
        attempts: 0
      })),
      options: {
        overwrite: options.overwrite || false,
        preserveTimestamps: options.preserveTimestamps !== false,
        createDirectories: options.createDirectories !== false,
        ...options
      }
    };

    this.operations.set(operationId, operation);
    
    // Ensure destination directory exists
    try {
      await fs.mkdir(destinationPath, { recursive: true });
    } catch (error) {
      operation.status = 'failed';
      operation.error = `Failed to create destination directory: ${error.message}`;
      this.emit('operationFailed', operation);
      return operationId;
    }

    this.processCopyBatch(operation);
    return operationId;
  }

  /**
   * Move multiple files to a destination
   * @param {Array} filePaths - Source file paths
   * @param {string} destinationPath - Destination directory
   * @param {Object} options - Move options
   * @returns {Promise<string>} Operation ID
   */
  async moveBatch(filePaths, destinationPath, options = {}) {
    const operationId = this.generateOperationId();
    
    const operation = {
      id: operationId,
      type: 'batch_move',
      status: 'initializing',
      totalFiles: filePaths.length,
      processedFiles: 0,
      successfulFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      startTime: new Date(),
      endTime: null,
      destinationPath,
      files: filePaths.map(filePath => ({
        path: filePath,
        name: path.basename(filePath),
        status: 'pending',
        destinationPath: path.join(destinationPath, path.basename(filePath)),
        result: null,
        error: null,
        attempts: 0
      })),
      options: {
        overwrite: options.overwrite || false,
        createDirectories: options.createDirectories !== false,
        ...options
      }
    };

    this.operations.set(operationId, operation);
    
    // Ensure destination directory exists
    try {
      await fs.mkdir(destinationPath, { recursive: true });
    } catch (error) {
      operation.status = 'failed';
      operation.error = `Failed to create destination directory: ${error.message}`;
      this.emit('operationFailed', operation);
      return operationId;
    }

    this.processMoveBatch(operation);
    return operationId;
  }

  /**
   * Delete multiple files
   * @param {Array} filePaths - File paths to delete
   * @param {Object} options - Delete options
   * @returns {Promise<string>} Operation ID
   */
  async deleteBatch(filePaths, options = {}) {
    const operationId = this.generateOperationId();
    
    const operation = {
      id: operationId,
      type: 'batch_delete',
      status: 'initializing',
      totalFiles: filePaths.length,
      processedFiles: 0,
      successfulFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      startTime: new Date(),
      endTime: null,
      files: filePaths.map(filePath => ({
        path: filePath,
        name: path.basename(filePath),
        status: 'pending',
        result: null,
        error: null,
        attempts: 0
      })),
      options: {
        moveToTrash: options.moveToTrash !== false,
        confirmEach: options.confirmEach || false,
        ...options
      }
    };

    this.operations.set(operationId, operation);
    this.processDeleteBatch(operation);
    return operationId;
  }

  /**
   * Rename multiple files with pattern
   * @param {Array} filePaths - File paths to rename
   * @param {string|Function} pattern - Rename pattern or function
   * @param {Object} options - Rename options
   * @returns {Promise<string>} Operation ID
   */
  async renameBatch(filePaths, pattern, options = {}) {
    const operationId = this.generateOperationId();
    
    const operation = {
      id: operationId,
      type: 'batch_rename',
      status: 'initializing',
      totalFiles: filePaths.length,
      processedFiles: 0,
      successfulFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      startTime: new Date(),
      endTime: null,
      pattern,
      files: filePaths.map((filePath, index) => {
        const newName = this.generateNewName(filePath, pattern, index, options);
        const newPath = path.join(path.dirname(filePath), newName);
        
        return {
          path: filePath,
          name: path.basename(filePath),
          newPath,
          newName,
          status: 'pending',
          result: null,
          error: null,
          attempts: 0
        };
      }),
      options: {
        overwrite: options.overwrite || false,
        preserveExtension: options.preserveExtension !== false,
        startIndex: options.startIndex || 1,
        ...options
      }
    };

    this.operations.set(operationId, operation);
    this.processRenameBatch(operation);
    return operationId;
  }

  /**
   * Process batch operation files
   * @private
   */
  async processOperationBatch(operation) {
    operation.status = 'processing';
    this.emit('operationStarted', operation);

    const startTime = Date.now();
    const processingTimes = [];

    try {
      const batchSize = operation.options.batchSize;
      
      for (let i = 0; i < operation.files.length; i += batchSize) {
        const batch = operation.files.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (file) => {
          const fileStartTime = Date.now();
          file.status = 'processing';
          file.startTime = new Date();
          
          operation.progress.currentFile = file.name;
          this.updateProgress(operation);

          try {
            // Process the file based on operation type
            const result = await this.processFile(file.path, operation.options);
            
            file.status = 'completed';
            file.result = result;
            file.endTime = new Date();
            operation.successfulFiles++;

            const processingTime = Date.now() - fileStartTime;
            processingTimes.push(processingTime);

          } catch (error) {
            file.error = error.message;
            
            if (operation.options.retryFailed && file.attempts < this.retryAttempts) {
              file.attempts++;
              file.status = 'retrying';
              
              // Retry after a short delay
              await this.delay(1000);
              return this.processFile(file.path, operation.options);
            } else {
              file.status = 'failed';
              if (operation.options.skipErrors) {
                operation.failedFiles++;
              } else {
                throw error;
              }
            }
          }

          operation.processedFiles++;
          this.updateProgress(operation, processingTimes);
        });

        await Promise.all(batchPromises);
      }

      operation.status = 'completed';
      operation.endTime = new Date();
      operation.progress.percentage = 100;
      
      this.emit('operationCompleted', operation);

    } catch (error) {
      operation.status = 'failed';
      operation.error = error.message;
      operation.endTime = new Date();
      
      this.emit('operationFailed', operation);
    }
  }

  /**
   * Process copy batch operation
   * @private
   */
  async processCopyBatch(operation) {
    operation.status = 'processing';
    this.emit('operationStarted', operation);

    try {
      for (const file of operation.files) {
        file.status = 'processing';
        file.startTime = new Date();
        
        operation.progress.currentFile = file.name;
        this.updateProgress(operation);

        try {
          // Check if destination exists and handle overwrite
          if (!operation.options.overwrite) {
            try {
              await fs.access(file.destinationPath);
              file.status = 'skipped';
              file.error = 'File already exists';
              operation.skippedFiles++;
              continue;
            } catch (error) {
              // File doesn't exist, proceed with copy
            }
          }

          // Copy the file
          await fs.copyFile(file.path, file.destinationPath);

          // Preserve timestamps if requested
          if (operation.options.preserveTimestamps) {
            const stats = await fs.stat(file.path);
            await fs.utimes(file.destinationPath, stats.atime, stats.mtime);
          }

          file.status = 'completed';
          file.endTime = new Date();
          operation.successfulFiles++;

        } catch (error) {
          file.status = 'failed';
          file.error = error.message;
          operation.failedFiles++;
        }

        operation.processedFiles++;
        this.updateProgress(operation);
      }

      operation.status = 'completed';
      operation.endTime = new Date();
      this.emit('operationCompleted', operation);

    } catch (error) {
      operation.status = 'failed';
      operation.error = error.message;
      operation.endTime = new Date();
      this.emit('operationFailed', operation);
    }
  }

  /**
   * Process move batch operation
   * @private
   */
  async processMoveBatch(operation) {
    operation.status = 'processing';
    this.emit('operationStarted', operation);

    try {
      for (const file of operation.files) {
        file.status = 'processing';
        operation.progress.currentFile = file.name;
        this.updateProgress(operation);

        try {
          // Check if destination exists and handle overwrite
          if (!operation.options.overwrite) {
            try {
              await fs.access(file.destinationPath);
              file.status = 'skipped';
              file.error = 'File already exists';
              operation.skippedFiles++;
              continue;
            } catch (error) {
              // File doesn't exist, proceed with move
            }
          }

          // Move the file
          await fs.rename(file.path, file.destinationPath);

          file.status = 'completed';
          operation.successfulFiles++;

        } catch (error) {
          file.status = 'failed';
          file.error = error.message;
          operation.failedFiles++;
        }

        operation.processedFiles++;
        this.updateProgress(operation);
      }

      operation.status = 'completed';
      operation.endTime = new Date();
      this.emit('operationCompleted', operation);

    } catch (error) {
      operation.status = 'failed';
      operation.error = error.message;
      operation.endTime = new Date();
      this.emit('operationFailed', operation);
    }
  }

  /**
   * Process delete batch operation
   * @private
   */
  async processDeleteBatch(operation) {
    operation.status = 'processing';
    this.emit('operationStarted', operation);

    try {
      for (const file of operation.files) {
        file.status = 'processing';
        operation.progress.currentFile = file.name;
        this.updateProgress(operation);

        try {
          // Delete the file
          await fs.unlink(file.path);

          file.status = 'completed';
          operation.successfulFiles++;

        } catch (error) {
          file.status = 'failed';
          file.error = error.message;
          operation.failedFiles++;
        }

        operation.processedFiles++;
        this.updateProgress(operation);
      }

      operation.status = 'completed';
      operation.endTime = new Date();
      this.emit('operationCompleted', operation);

    } catch (error) {
      operation.status = 'failed';
      operation.error = error.message;
      operation.endTime = new Date();
      this.emit('operationFailed', operation);
    }
  }

  /**
   * Process rename batch operation
   * @private
   */
  async processRenameBatch(operation) {
    operation.status = 'processing';
    this.emit('operationStarted', operation);

    try {
      for (const file of operation.files) {
        file.status = 'processing';
        operation.progress.currentFile = file.name;
        this.updateProgress(operation);

        try {
          // Check if destination exists and handle overwrite
          if (!operation.options.overwrite) {
            try {
              await fs.access(file.newPath);
              file.status = 'skipped';
              file.error = 'File with new name already exists';
              operation.skippedFiles++;
              continue;
            } catch (error) {
              // File doesn't exist, proceed with rename
            }
          }

          // Rename the file
          await fs.rename(file.path, file.newPath);

          file.status = 'completed';
          operation.successfulFiles++;

        } catch (error) {
          file.status = 'failed';
          file.error = error.message;
          operation.failedFiles++;
        }

        operation.processedFiles++;
        this.updateProgress(operation);
      }

      operation.status = 'completed';
      operation.endTime = new Date();
      this.emit('operationCompleted', operation);

    } catch (error) {
      operation.status = 'failed';
      operation.error = error.message;
      operation.endTime = new Date();
      this.emit('operationFailed', operation);
    }
  }

  /**
   * Process individual file
   * @private
   */
  async processFile(filePath, options) {
    if (options.validateTypes && this.fileTypeDetector) {
      const typeInfo = await this.fileTypeDetector.detectFileType(filePath);
      
      if (options.allowedTypes && !options.allowedTypes.includes(typeInfo.type)) {
        throw new Error(`File type ${typeInfo.type} not allowed`);
      }
    }

    // Add custom file processing logic here
    const stats = await fs.stat(filePath);
    
    return {
      path: filePath,
      size: stats.size,
      processed: true,
      timestamp: new Date()
    };
  }

  /**
   * Generate new name for rename operation
   * @private
   */
  generateNewName(filePath, pattern, index, options) {
    const originalName = path.basename(filePath, path.extname(filePath));
    const extension = path.extname(filePath);
    
    if (typeof pattern === 'function') {
      return pattern(originalName, index, options);
    }

    let newName = pattern;
    
    // Replace placeholders
    newName = newName.replace('{index}', (index + options.startIndex).toString().padStart(3, '0'));
    newName = newName.replace('{original}', originalName);
    newName = newName.replace('{timestamp}', Date.now().toString());
    newName = newName.replace('{date}', new Date().toISOString().split('T')[0]);
    
    // Add extension if preserve extension is enabled
    if (options.preserveExtension) {
      newName += extension;
    }

    return newName;
  }

  /**
   * Update operation progress
   * @private
   */
  updateProgress(operation, processingTimes = []) {
    operation.progress.percentage = (operation.processedFiles / operation.totalFiles) * 100;
    
    if (processingTimes.length > 0) {
      operation.progress.avgProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
      
      const remainingFiles = operation.totalFiles - operation.processedFiles;
      operation.progress.estimatedTimeRemaining = remainingFiles * operation.progress.avgProcessingTime;
    }

    this.emit('operationProgress', operation);
  }

  /**
   * Cancel an operation
   * @param {string} operationId - Operation ID to cancel
   * @returns {boolean} Success status
   */
  cancelOperation(operationId) {
    const operation = this.operations.get(operationId);
    
    if (operation && operation.status === 'processing') {
      operation.status = 'cancelled';
      operation.endTime = new Date();
      
      this.emit('operationCancelled', operation);
      return true;
    }
    
    return false;
  }

  /**
   * Get operation status
   * @param {string} operationId - Operation ID
   * @returns {Object|null} Operation info
   */
  getOperationStatus(operationId) {
    return this.operations.get(operationId) || null;
  }

  /**
   * Get all operations
   * @returns {Array} Array of operations
   */
  getAllOperations() {
    return Array.from(this.operations.values());
  }

  /**
   * Remove completed operations
   */
  cleanupOperations() {
    for (const [operationId, operation] of this.operations.entries()) {
      if (operation.status === 'completed' || operation.status === 'failed' || operation.status === 'cancelled') {
        this.operations.delete(operationId);
      }
    }
    
    this.emit('operationsCleanedUp');
  }

  /**
   * Generate unique operation ID
   * @private
   */
  generateOperationId() {
    return 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Delay utility
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup batch operations service
   */
  destroy() {
    // Cancel all running operations
    for (const operation of this.operations.values()) {
      if (operation.status === 'processing') {
        this.cancelOperation(operation.id);
      }
    }

    this.operations.clear();
    this.removeAllListeners();
  }
}

module.exports = BatchOperationsService;
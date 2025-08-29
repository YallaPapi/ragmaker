/**
 * File Organization and Management Service
 * Handles file organization, categorization, and management operations
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class FileManager extends EventEmitter {
  constructor(fileTypeDetector, batchOperations) {
    super();
    this.fileTypeDetector = fileTypeDetector;
    this.batchOperations = batchOperations;
    this.collections = new Map(); // collectionId -> collection info
    this.tags = new Map(); // tagId -> tag info
    this.fileMetadata = new Map(); // filePath -> metadata
    this.organizationRules = [];
    this.watchedDirectories = new Set();
  }

  /**
   * Create a new file collection
   * @param {string} name - Collection name
   * @param {Object} options - Collection options
   * @returns {string} Collection ID
   */
  createCollection(name, options = {}) {
    const collectionId = this.generateId();
    
    const collection = {
      id: collectionId,
      name,
      description: options.description || '',
      type: options.type || 'manual', // manual, auto, smart
      rules: options.rules || [],
      files: new Set(),
      tags: new Set(options.tags || []),
      created: new Date(),
      modified: new Date(),
      metadata: options.metadata || {}
    };

    this.collections.set(collectionId, collection);
    this.emit('collectionCreated', collection);
    
    return collectionId;
  }

  /**
   * Add files to collection
   * @param {string} collectionId - Collection ID
   * @param {Array} filePaths - Array of file paths
   * @returns {Promise<Object>} Operation result
   */
  async addFilesToCollection(collectionId, filePaths) {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      throw new Error('Collection not found');
    }

    const results = {
      added: [],
      skipped: [],
      failed: []
    };

    for (const filePath of filePaths) {
      try {
        // Verify file exists
        await fs.access(filePath);
        
        if (collection.files.has(filePath)) {
          results.skipped.push(filePath);
        } else {
          collection.files.add(filePath);
          results.added.push(filePath);
          
          // Update file metadata
          await this.updateFileMetadata(filePath);
        }
      } catch (error) {
        results.failed.push({ filePath, error: error.message });
      }
    }

    collection.modified = new Date();
    this.emit('collectionUpdated', collection);
    
    return results;
  }

  /**
   * Remove files from collection
   * @param {string} collectionId - Collection ID
   * @param {Array} filePaths - Array of file paths to remove
   */
  removeFilesFromCollection(collectionId, filePaths) {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      throw new Error('Collection not found');
    }

    filePaths.forEach(filePath => {
      collection.files.delete(filePath);
    });

    collection.modified = new Date();
    this.emit('collectionUpdated', collection);
  }

  /**
   * Get collection info
   * @param {string} collectionId - Collection ID
   * @returns {Object|null} Collection info
   */
  getCollection(collectionId) {
    const collection = this.collections.get(collectionId);
    if (!collection) return null;

    return {
      ...collection,
      files: Array.from(collection.files),
      tags: Array.from(collection.tags),
      fileCount: collection.files.size
    };
  }

  /**
   * Get all collections
   * @returns {Array} Array of collections
   */
  getAllCollections() {
    return Array.from(this.collections.values()).map(collection => ({
      ...collection,
      files: Array.from(collection.files),
      tags: Array.from(collection.tags),
      fileCount: collection.files.size
    }));
  }

  /**
   * Delete collection
   * @param {string} collectionId - Collection ID
   * @returns {boolean} Success status
   */
  deleteCollection(collectionId) {
    const collection = this.collections.get(collectionId);
    if (!collection) return false;

    this.collections.delete(collectionId);
    this.emit('collectionDeleted', collection);
    
    return true;
  }

  /**
   * Create a new tag
   * @param {string} name - Tag name
   * @param {Object} options - Tag options
   * @returns {string} Tag ID
   */
  createTag(name, options = {}) {
    const tagId = this.generateId();
    
    const tag = {
      id: tagId,
      name,
      description: options.description || '',
      color: options.color || '#007bff',
      icon: options.icon || 'tag',
      files: new Set(),
      created: new Date(),
      metadata: options.metadata || {}
    };

    this.tags.set(tagId, tag);
    this.emit('tagCreated', tag);
    
    return tagId;
  }

  /**
   * Add tag to files
   * @param {string} tagId - Tag ID
   * @param {Array} filePaths - Array of file paths
   */
  async addTagToFiles(tagId, filePaths) {
    const tag = this.tags.get(tagId);
    if (!tag) {
      throw new Error('Tag not found');
    }

    for (const filePath of filePaths) {
      tag.files.add(filePath);
      
      // Update file metadata
      const metadata = this.fileMetadata.get(filePath) || {};
      metadata.tags = metadata.tags || new Set();
      metadata.tags.add(tagId);
      this.fileMetadata.set(filePath, metadata);
    }

    this.emit('tagUpdated', tag);
  }

  /**
   * Remove tag from files
   * @param {string} tagId - Tag ID
   * @param {Array} filePaths - Array of file paths
   */
  removeTagFromFiles(tagId, filePaths) {
    const tag = this.tags.get(tagId);
    if (!tag) {
      throw new Error('Tag not found');
    }

    for (const filePath of filePaths) {
      tag.files.delete(filePath);
      
      // Update file metadata
      const metadata = this.fileMetadata.get(filePath);
      if (metadata && metadata.tags) {
        metadata.tags.delete(tagId);
      }
    }

    this.emit('tagUpdated', tag);
  }

  /**
   * Get all tags
   * @returns {Array} Array of tags
   */
  getAllTags() {
    return Array.from(this.tags.values()).map(tag => ({
      ...tag,
      files: Array.from(tag.files),
      fileCount: tag.files.size
    }));
  }

  /**
   * Delete tag
   * @param {string} tagId - Tag ID
   * @returns {boolean} Success status
   */
  deleteTag(tagId) {
    const tag = this.tags.get(tagId);
    if (!tag) return false;

    // Remove tag from all file metadata
    for (const filePath of tag.files) {
      const metadata = this.fileMetadata.get(filePath);
      if (metadata && metadata.tags) {
        metadata.tags.delete(tagId);
      }
    }

    this.tags.delete(tagId);
    this.emit('tagDeleted', tag);
    
    return true;
  }

  /**
   * Organize files automatically based on rules
   * @param {Array} filePaths - Files to organize
   * @param {Object} options - Organization options
   * @returns {Promise<Object>} Organization results
   */
  async organizeFiles(filePaths, options = {}) {
    const results = {
      organized: 0,
      skipped: 0,
      failed: 0,
      actions: []
    };

    this.emit('organizationStarted', { totalFiles: filePaths.length });

    for (const filePath of filePaths) {
      try {
        const actions = await this.analyzeFileForOrganization(filePath, options);
        
        if (actions.length > 0) {
          await this.executeOrganizationActions(filePath, actions);
          results.organized++;
          results.actions.push({ filePath, actions });
        } else {
          results.skipped++;
        }

        this.emit('fileOrganized', { filePath, actions });
        
      } catch (error) {
        results.failed++;
        this.emit('organizationError', { filePath, error: error.message });
      }
    }

    this.emit('organizationCompleted', results);
    return results;
  }

  /**
   * Analyze file for organization opportunities
   * @private
   */
  async analyzeFileForOrganization(filePath, options) {
    const actions = [];
    
    // Detect file type
    const typeInfo = await this.fileTypeDetector.detectFileType(filePath);
    
    // Apply organization rules
    for (const rule of this.organizationRules) {
      if (this.ruleMatches(rule, filePath, typeInfo)) {
        actions.push({
          type: rule.action,
          params: rule.params,
          rule: rule.name
        });
      }
    }

    // Auto-categorization based on file type
    if (options.autoCreateCollections) {
      const categoryCollection = this.findOrCreateCategoryCollection(typeInfo.category);
      actions.push({
        type: 'addToCollection',
        params: { collectionId: categoryCollection.id },
        rule: 'auto-categorize'
      });
    }

    // Auto-tagging based on file properties
    if (options.autoTag) {
      const suggestedTags = this.suggestTags(filePath, typeInfo);
      for (const tagName of suggestedTags) {
        const tag = this.findOrCreateTag(tagName);
        actions.push({
          type: 'addTag',
          params: { tagId: tag.id },
          rule: 'auto-tag'
        });
      }
    }

    return actions;
  }

  /**
   * Execute organization actions on a file
   * @private
   */
  async executeOrganizationActions(filePath, actions) {
    for (const action of actions) {
      switch (action.type) {
        case 'addToCollection':
          await this.addFilesToCollection(action.params.collectionId, [filePath]);
          break;
        
        case 'addTag':
          await this.addTagToFiles(action.params.tagId, [filePath]);
          break;
        
        case 'move':
          // Implement file moving logic
          break;
        
        case 'rename':
          // Implement file renaming logic
          break;
      }
    }
  }

  /**
   * Add organization rule
   * @param {Object} rule - Organization rule
   */
  addOrganizationRule(rule) {
    const ruleObj = {
      id: this.generateId(),
      name: rule.name,
      conditions: rule.conditions,
      action: rule.action,
      params: rule.params || {},
      enabled: rule.enabled !== false,
      created: new Date()
    };

    this.organizationRules.push(ruleObj);
    this.emit('ruleAdded', ruleObj);
    
    return ruleObj.id;
  }

  /**
   * Remove organization rule
   * @param {string} ruleId - Rule ID
   * @returns {boolean} Success status
   */
  removeOrganizationRule(ruleId) {
    const index = this.organizationRules.findIndex(rule => rule.id === ruleId);
    if (index === -1) return false;

    const rule = this.organizationRules.splice(index, 1)[0];
    this.emit('ruleRemoved', rule);
    
    return true;
  }

  /**
   * Get file metadata
   * @param {string} filePath - File path
   * @returns {Object|null} File metadata
   */
  getFileMetadata(filePath) {
    return this.fileMetadata.get(filePath) || null;
  }

  /**
   * Update file metadata
   * @private
   */
  async updateFileMetadata(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const typeInfo = await this.fileTypeDetector.detectFileType(filePath);
      
      const metadata = {
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
        type: typeInfo.type,
        category: typeInfo.category,
        mime: typeInfo.mime,
        extension: typeInfo.extension,
        tags: new Set(),
        collections: new Set(),
        lastScanned: new Date()
      };

      this.fileMetadata.set(filePath, metadata);
      return metadata;
      
    } catch (error) {
      this.emit('metadataError', { filePath, error: error.message });
      return null;
    }
  }

  /**
   * Find files by criteria
   * @param {Object} criteria - Search criteria
   * @returns {Array} Matching files
   */
  findFiles(criteria) {
    const results = [];

    for (const [filePath, metadata] of this.fileMetadata.entries()) {
      if (this.matchesCriteria(metadata, criteria)) {
        results.push({
          path: filePath,
          metadata,
          relevanceScore: this.calculateRelevanceScore(metadata, criteria)
        });
      }
    }

    // Sort by relevance score
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    return results;
  }

  /**
   * Check if rule matches file
   * @private
   */
  ruleMatches(rule, filePath, typeInfo) {
    for (const condition of rule.conditions) {
      switch (condition.type) {
        case 'extension':
          if (!condition.values.includes(typeInfo.extension)) return false;
          break;
        case 'category':
          if (!condition.values.includes(typeInfo.category)) return false;
          break;
        case 'path':
          if (!condition.pattern.test(filePath)) return false;
          break;
        case 'size':
          const stats = fs.statSync(filePath);
          if (!this.matchesSizeCondition(stats.size, condition)) return false;
          break;
      }
    }
    return true;
  }

  /**
   * Find or create category collection
   * @private
   */
  findOrCreateCategoryCollection(category) {
    // Look for existing category collection
    for (const collection of this.collections.values()) {
      if (collection.type === 'auto' && collection.metadata.category === category) {
        return collection;
      }
    }

    // Create new category collection
    const collectionId = this.createCollection(`${category.charAt(0).toUpperCase() + category.slice(1)} Files`, {
      type: 'auto',
      description: `Automatically organized ${category} files`,
      metadata: { category }
    });

    return this.collections.get(collectionId);
  }

  /**
   * Find or create tag
   * @private
   */
  findOrCreateTag(tagName) {
    // Look for existing tag
    for (const tag of this.tags.values()) {
      if (tag.name.toLowerCase() === tagName.toLowerCase()) {
        return tag;
      }
    }

    // Create new tag
    const tagId = this.createTag(tagName, {
      description: `Auto-created tag for ${tagName}`
    });

    return this.tags.get(tagId);
  }

  /**
   * Suggest tags based on file properties
   * @private
   */
  suggestTags(filePath, typeInfo) {
    const tags = [];
    
    // Add category tag
    tags.push(typeInfo.category);
    
    // Add extension tag
    if (typeInfo.extension) {
      tags.push(typeInfo.extension);
    }

    // Add directory-based tags
    const dirs = path.dirname(filePath).split(path.sep);
    const lastDir = dirs[dirs.length - 1];
    if (lastDir && lastDir !== '.' && lastDir !== '..') {
      tags.push(lastDir);
    }

    return tags;
  }

  /**
   * Check if metadata matches criteria
   * @private
   */
  matchesCriteria(metadata, criteria) {
    if (criteria.type && metadata.type !== criteria.type) return false;
    if (criteria.category && metadata.category !== criteria.category) return false;
    if (criteria.extension && metadata.extension !== criteria.extension) return false;
    if (criteria.tags && !criteria.tags.some(tag => metadata.tags.has(tag))) return false;
    if (criteria.collections && !criteria.collections.some(col => metadata.collections.has(col))) return false;
    if (criteria.name && !metadata.name.toLowerCase().includes(criteria.name.toLowerCase())) return false;

    return true;
  }

  /**
   * Calculate relevance score for search results
   * @private
   */
  calculateRelevanceScore(metadata, criteria) {
    let score = 0;

    if (criteria.name) {
      const name = metadata.name.toLowerCase();
      const query = criteria.name.toLowerCase();
      if (name.includes(query)) {
        score += name.indexOf(query) === 0 ? 10 : 5; // Higher score for prefix match
      }
    }

    if (criteria.tags) {
      const matchingTags = criteria.tags.filter(tag => metadata.tags.has(tag));
      score += matchingTags.length * 3;
    }

    return score;
  }

  /**
   * Check if file size matches condition
   * @private
   */
  matchesSizeCondition(fileSize, condition) {
    switch (condition.operator) {
      case '>': return fileSize > condition.value;
      case '<': return fileSize < condition.value;
      case '>=': return fileSize >= condition.value;
      case '<=': return fileSize <= condition.value;
      case '=': return fileSize === condition.value;
      default: return false;
    }
  }

  /**
   * Generate unique ID
   * @private
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Get organization statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      collections: this.collections.size,
      tags: this.tags.size,
      trackedFiles: this.fileMetadata.size,
      organizationRules: this.organizationRules.length
    };
  }

  /**
   * Export organization data
   * @returns {Object} Exportable data
   */
  exportData() {
    return {
      collections: Array.from(this.collections.entries()),
      tags: Array.from(this.tags.entries()),
      fileMetadata: Array.from(this.fileMetadata.entries()),
      organizationRules: this.organizationRules,
      exportDate: new Date()
    };
  }

  /**
   * Import organization data
   * @param {Object} data - Data to import
   */
  importData(data) {
    try {
      if (data.collections) {
        this.collections = new Map(data.collections);
      }
      if (data.tags) {
        this.tags = new Map(data.tags);
      }
      if (data.fileMetadata) {
        this.fileMetadata = new Map(data.fileMetadata);
      }
      if (data.organizationRules) {
        this.organizationRules = data.organizationRules;
      }

      this.emit('dataImported', data);
    } catch (error) {
      this.emit('importError', error);
      throw error;
    }
  }

  /**
   * Cleanup file manager
   */
  destroy() {
    this.collections.clear();
    this.tags.clear();
    this.fileMetadata.clear();
    this.organizationRules = [];
    this.removeAllListeners();
  }
}

module.exports = FileManager;
/**
 * File Search and Filtering Service
 * Advanced file search with multiple criteria, indexing, and performance optimization
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class FileSearch extends EventEmitter {
  constructor(fileTypeDetector, fileManager) {
    super();
    this.fileTypeDetector = fileTypeDetector;
    this.fileManager = fileManager;
    this.searchIndex = new Map(); // fileName -> file paths
    this.contentIndex = new Map(); // word -> file paths with positions
    this.metadataIndex = new Map(); // metadata key -> values -> file paths
    this.searchHistory = [];
    this.maxHistorySize = 100;
    this.indexVersion = 0;
    this.indexingInProgress = false;
    this.searchCache = new Map(); // query hash -> results
    this.cacheSize = 0;
    this.maxCacheSize = 10000;
    this.stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'among', 'under'
    ]);
  }

  /**
   * Search files by multiple criteria
   * @param {Object} query - Search query object
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  async search(query, options = {}) {
    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey(query, options);
      
      // Check cache first
      if (!options.skipCache && this.searchCache.has(cacheKey)) {
        const cached = this.searchCache.get(cacheKey);
        this.emit('cacheHit', { query, resultCount: cached.length });
        return cached;
      }

      const startTime = Date.now();
      let results = [];

      // Start with all files if no specific criteria
      const allFiles = this.getAllIndexedFiles();
      
      // Apply different search strategies based on query
      if (query.text) {
        results = await this.searchByText(query.text, allFiles, options);
      } else if (query.filename) {
        results = await this.searchByFilename(query.filename, allFiles, options);
      } else if (query.advanced) {
        results = await this.advancedSearch(query.advanced, allFiles, options);
      } else {
        results = await this.filterFiles(allFiles, query, options);
      }

      // Apply additional filters
      if (query.filters) {
        results = this.applyFilters(results, query.filters);
      }

      // Sort results
      results = this.sortResults(results, options.sortBy || 'relevance');

      // Limit results
      const limit = options.limit || 1000;
      if (results.length > limit) {
        results = results.slice(0, limit);
      }

      // Add to cache
      this.addToCache(cacheKey, results);

      // Add to search history
      this.addToHistory(query, results.length);

      const searchTime = Date.now() - startTime;
      
      this.emit('searchCompleted', {
        query,
        resultCount: results.length,
        searchTime,
        cached: false
      });

      return results;

    } catch (error) {
      this.emit('searchError', { query, error: error.message });
      throw error;
    }
  }

  /**
   * Search files by text content
   * @private
   */
  async searchByText(searchText, files, options) {
    const results = [];
    const terms = this.tokenizeSearch(searchText);
    const searchMode = options.searchMode || 'contains'; // exact, contains, fuzzy

    for (const filePath of files) {
      try {
        const fileData = await this.getFileData(filePath);
        const score = this.calculateTextScore(fileData, terms, searchMode);
        
        if (score > 0) {
          results.push({
            path: filePath,
            score,
            highlights: this.getTextHighlights(fileData, terms),
            metadata: this.getFileMetadata(filePath)
          });
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    return results;
  }

  /**
   * Search files by filename
   * @private
   */
  async searchByFilename(filenameQuery, files, options) {
    const results = [];
    const searchMode = options.searchMode || 'contains';
    const caseSensitive = options.caseSensitive || false;
    
    const query = caseSensitive ? filenameQuery : filenameQuery.toLowerCase();

    for (const filePath of files) {
      const filename = path.basename(filePath);
      const searchName = caseSensitive ? filename : filename.toLowerCase();
      
      let matches = false;
      let score = 0;

      switch (searchMode) {
        case 'exact':
          matches = searchName === query;
          score = matches ? 100 : 0;
          break;
        
        case 'starts':
          matches = searchName.startsWith(query);
          score = matches ? 90 : 0;
          break;
        
        case 'ends':
          matches = searchName.endsWith(query);
          score = matches ? 80 : 0;
          break;
        
        case 'contains':
          matches = searchName.includes(query);
          if (matches) {
            score = searchName.indexOf(query) === 0 ? 90 : 70;
          }
          break;
        
        case 'fuzzy':
          const fuzzyResult = this.fuzzyMatch(query, searchName);
          matches = fuzzyResult.score > 0.6;
          score = fuzzyResult.score * 100;
          break;
        
        case 'regex':
          try {
            const regex = new RegExp(query, caseSensitive ? '' : 'i');
            matches = regex.test(searchName);
            score = matches ? 85 : 0;
          } catch (error) {
            // Invalid regex, skip
            continue;
          }
          break;
      }

      if (matches) {
        results.push({
          path: filePath,
          score,
          filename,
          metadata: this.getFileMetadata(filePath)
        });
      }
    }

    return results;
  }

  /**
   * Advanced search with complex criteria
   * @private
   */
  async advancedSearch(criteria, files, options) {
    let results = files.map(filePath => ({
      path: filePath,
      score: 0,
      metadata: this.getFileMetadata(filePath),
      matches: []
    }));

    // Apply each criteria
    for (const criterion of criteria) {
      results = await this.applyCriterion(results, criterion);
    }

    // Filter out results with score 0
    return results.filter(result => result.score > 0);
  }

  /**
   * Apply search criterion
   * @private
   */
  async applyCriterion(results, criterion) {
    const { field, operator, value, weight = 1 } = criterion;

    for (const result of results) {
      const filePath = result.path;
      let fieldValue;
      let matches = false;
      let score = 0;

      // Get field value
      switch (field) {
        case 'filename':
          fieldValue = path.basename(filePath);
          break;
        case 'extension':
          fieldValue = path.extname(filePath).slice(1);
          break;
        case 'size':
          fieldValue = result.metadata?.size || 0;
          break;
        case 'modified':
          fieldValue = result.metadata?.modified || new Date(0);
          break;
        case 'created':
          fieldValue = result.metadata?.created || new Date(0);
          break;
        case 'type':
          fieldValue = result.metadata?.type || '';
          break;
        case 'category':
          fieldValue = result.metadata?.category || '';
          break;
        case 'content':
          try {
            const fileData = await this.getFileData(filePath);
            fieldValue = fileData.content || '';
          } catch (error) {
            fieldValue = '';
          }
          break;
        default:
          continue;
      }

      // Apply operator
      switch (operator) {
        case 'equals':
          matches = fieldValue === value;
          score = matches ? 10 : 0;
          break;
        
        case 'contains':
          matches = fieldValue.toString().toLowerCase().includes(value.toLowerCase());
          score = matches ? 8 : 0;
          break;
        
        case 'starts':
          matches = fieldValue.toString().toLowerCase().startsWith(value.toLowerCase());
          score = matches ? 9 : 0;
          break;
        
        case 'ends':
          matches = fieldValue.toString().toLowerCase().endsWith(value.toLowerCase());
          score = matches ? 9 : 0;
          break;
        
        case 'regex':
          try {
            const regex = new RegExp(value, 'i');
            matches = regex.test(fieldValue.toString());
            score = matches ? 8 : 0;
          } catch (error) {
            matches = false;
          }
          break;
        
        case 'greater':
          matches = Number(fieldValue) > Number(value);
          score = matches ? 7 : 0;
          break;
        
        case 'less':
          matches = Number(fieldValue) < Number(value);
          score = matches ? 7 : 0;
          break;
        
        case 'between':
          const [min, max] = Array.isArray(value) ? value : [value.min, value.max];
          const numValue = Number(fieldValue);
          matches = numValue >= min && numValue <= max;
          score = matches ? 7 : 0;
          break;
        
        case 'in':
          const values = Array.isArray(value) ? value : [value];
          matches = values.includes(fieldValue);
          score = matches ? 8 : 0;
          break;
      }

      if (matches) {
        result.score += score * weight;
        result.matches.push({
          field,
          operator,
          value,
          fieldValue,
          score: score * weight
        });
      }
    }

    return results;
  }

  /**
   * Apply filters to results
   * @private
   */
  applyFilters(results, filters) {
    return results.filter(result => {
      const metadata = result.metadata;

      // File type filter
      if (filters.types && !filters.types.includes(metadata?.type)) {
        return false;
      }

      // Category filter
      if (filters.categories && !filters.categories.includes(metadata?.category)) {
        return false;
      }

      // Size filter
      if (filters.sizeMin && metadata?.size < filters.sizeMin) {
        return false;
      }
      if (filters.sizeMax && metadata?.size > filters.sizeMax) {
        return false;
      }

      // Date filters
      if (filters.modifiedAfter && metadata?.modified < filters.modifiedAfter) {
        return false;
      }
      if (filters.modifiedBefore && metadata?.modified > filters.modifiedBefore) {
        return false;
      }

      // Path filter
      if (filters.paths && !filters.paths.some(filterPath => result.path.includes(filterPath))) {
        return false;
      }

      // Custom filter function
      if (filters.custom && !filters.custom(result)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Sort search results
   * @private
   */
  sortResults(results, sortBy) {
    const sortFunctions = {
      relevance: (a, b) => (b.score || 0) - (a.score || 0),
      name: (a, b) => path.basename(a.path).localeCompare(path.basename(b.path)),
      size: (a, b) => (b.metadata?.size || 0) - (a.metadata?.size || 0),
      modified: (a, b) => {
        const aTime = a.metadata?.modified || new Date(0);
        const bTime = b.metadata?.modified || new Date(0);
        return bTime.getTime() - aTime.getTime();
      },
      type: (a, b) => (a.metadata?.type || '').localeCompare(b.metadata?.type || ''),
      path: (a, b) => a.path.localeCompare(b.path)
    };

    const sortFunction = sortFunctions[sortBy] || sortFunctions.relevance;
    return results.sort(sortFunction);
  }

  /**
   * Build search index from files
   * @param {Array} filePaths - Files to index
   * @returns {Promise<void>}
   */
  async buildIndex(filePaths) {
    if (this.indexingInProgress) {
      throw new Error('Indexing already in progress');
    }

    this.indexingInProgress = true;
    this.emit('indexingStarted', { totalFiles: filePaths.length });

    try {
      // Clear existing indexes
      this.searchIndex.clear();
      this.contentIndex.clear();
      this.metadataIndex.clear();

      let processedFiles = 0;

      for (const filePath of filePaths) {
        try {
          await this.indexFile(filePath);
          processedFiles++;

          if (processedFiles % 100 === 0) {
            this.emit('indexingProgress', {
              processed: processedFiles,
              total: filePaths.length,
              progress: (processedFiles / filePaths.length) * 100
            });
          }
        } catch (error) {
          this.emit('indexingError', { filePath, error: error.message });
          continue;
        }
      }

      this.indexVersion++;
      this.indexingInProgress = false;

      this.emit('indexingCompleted', {
        totalFiles: processedFiles,
        indexVersion: this.indexVersion
      });

    } catch (error) {
      this.indexingInProgress = false;
      this.emit('indexingFailed', { error: error.message });
      throw error;
    }
  }

  /**
   * Index a single file
   * @private
   */
  async indexFile(filePath) {
    // Index filename
    const filename = path.basename(filePath);
    const filenameKey = filename.toLowerCase();
    
    if (!this.searchIndex.has(filenameKey)) {
      this.searchIndex.set(filenameKey, new Set());
    }
    this.searchIndex.get(filenameKey).add(filePath);

    // Get file metadata
    const metadata = this.getFileMetadata(filePath);
    
    // Index metadata
    if (metadata) {
      this.indexMetadata(filePath, metadata);
    }

    // Index content for text files
    if (this.isTextFile(filePath)) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        await this.indexContent(filePath, content);
      } catch (error) {
        // Skip if can't read file
      }
    }
  }

  /**
   * Index file metadata
   * @private
   */
  indexMetadata(filePath, metadata) {
    const metadataFields = ['type', 'category', 'extension', 'mime'];
    
    for (const field of metadataFields) {
      if (metadata[field]) {
        const value = metadata[field].toLowerCase();
        
        if (!this.metadataIndex.has(field)) {
          this.metadataIndex.set(field, new Map());
        }
        
        const fieldIndex = this.metadataIndex.get(field);
        if (!fieldIndex.has(value)) {
          fieldIndex.set(value, new Set());
        }
        
        fieldIndex.get(value).add(filePath);
      }
    }
  }

  /**
   * Index file content
   * @private
   */
  async indexContent(filePath, content) {
    const words = this.tokenizeContent(content);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase();
      
      // Skip stop words and very short words
      if (this.stopWords.has(word) || word.length < 2) {
        continue;
      }
      
      if (!this.contentIndex.has(word)) {
        this.contentIndex.set(word, new Map());
      }
      
      const wordIndex = this.contentIndex.get(word);
      if (!wordIndex.has(filePath)) {
        wordIndex.set(filePath, []);
      }
      
      wordIndex.get(filePath).push(i);
    }
  }

  /**
   * Filter files based on criteria
   * @private
   */
  async filterFiles(files, query, options) {
    const results = [];

    for (const filePath of files) {
      const metadata = this.getFileMetadata(filePath);
      let score = 1; // Base score

      // Apply query criteria
      let matches = true;

      if (query.type && metadata?.type !== query.type) {
        matches = false;
      }

      if (query.category && metadata?.category !== query.category) {
        matches = false;
      }

      if (query.extension && metadata?.extension !== query.extension) {
        matches = false;
      }

      if (matches) {
        results.push({
          path: filePath,
          score,
          metadata
        });
      }
    }

    return results;
  }

  /**
   * Get all indexed files
   * @private
   */
  getAllIndexedFiles() {
    const files = new Set();
    
    // Collect from search index
    for (const filePaths of this.searchIndex.values()) {
      for (const filePath of filePaths) {
        files.add(filePath);
      }
    }
    
    // Also get from file manager if available
    if (this.fileManager) {
      const managedFiles = Array.from(this.fileManager.fileMetadata.keys());
      managedFiles.forEach(file => files.add(file));
    }
    
    return Array.from(files);
  }

  /**
   * Get file data for search
   * @private
   */
  async getFileData(filePath) {
    const stats = await fs.stat(filePath);
    let content = '';
    
    if (this.isTextFile(filePath) && stats.size < 1024 * 1024) { // Max 1MB
      try {
        content = await fs.readFile(filePath, 'utf8');
      } catch (error) {
        // Continue without content
      }
    }

    return {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      modified: stats.mtime,
      content
    };
  }

  /**
   * Get file metadata
   * @private
   */
  getFileMetadata(filePath) {
    if (this.fileManager) {
      return this.fileManager.getFileMetadata(filePath);
    }
    
    return null;
  }

  /**
   * Calculate text search score
   * @private
   */
  calculateTextScore(fileData, terms, searchMode) {
    const content = (fileData.content || '').toLowerCase();
    const filename = fileData.name.toLowerCase();
    
    let score = 0;

    for (const term of terms) {
      const termLower = term.toLowerCase();
      
      // Filename matches get higher score
      if (filename.includes(termLower)) {
        score += filename.indexOf(termLower) === 0 ? 20 : 15;
      }
      
      // Content matches
      if (content.includes(termLower)) {
        const occurrences = (content.match(new RegExp(termLower, 'g')) || []).length;
        score += Math.min(occurrences * 5, 30); // Max 30 points per term
      }
    }

    return score;
  }

  /**
   * Get text highlights for search results
   * @private
   */
  getTextHighlights(fileData, terms) {
    const content = fileData.content || '';
    const highlights = [];
    
    for (const term of terms) {
      const regex = new RegExp(term, 'gi');
      let match;
      
      while ((match = regex.exec(content)) !== null) {
        const start = Math.max(0, match.index - 50);
        const end = Math.min(content.length, match.index + term.length + 50);
        
        highlights.push({
          term,
          snippet: content.slice(start, end),
          position: match.index
        });
        
        if (highlights.length >= 5) break; // Max 5 highlights per term
      }
    }

    return highlights;
  }

  /**
   * Tokenize search query
   * @private
   */
  tokenizeSearch(text) {
    return text
      .toLowerCase()
      .split(/[\s\-_.,;:!?()[\]{}'"]+/)
      .filter(token => token.length > 0);
  }

  /**
   * Tokenize content for indexing
   * @private
   */
  tokenizeContent(content) {
    return content
      .toLowerCase()
      .split(/[\s\-_.,;:!?()[\]{}'"]+/)
      .filter(token => token.length > 0);
  }

  /**
   * Fuzzy string matching
   * @private
   */
  fuzzyMatch(pattern, text) {
    const patternLength = pattern.length;
    const textLength = text.length;
    
    if (patternLength === 0) return { score: 0, matches: [] };
    if (textLength === 0) return { score: 0, matches: [] };
    
    let score = 0;
    let matches = [];
    let textIndex = 0;
    
    for (let i = 0; i < patternLength; i++) {
      const char = pattern[i];
      
      while (textIndex < textLength) {
        if (text[textIndex] === char) {
          score += 1;
          matches.push(textIndex);
          textIndex++;
          break;
        }
        textIndex++;
      }
    }
    
    const finalScore = score / Math.max(patternLength, textLength);
    
    return { score: finalScore, matches };
  }

  /**
   * Check if file is text-based
   * @private
   */
  isTextFile(filePath) {
    const textExtensions = [
      '.txt', '.md', '.json', '.xml', '.html', '.css', '.js', '.ts',
      '.py', '.java', '.cpp', '.c', '.h', '.csv', '.log', '.yml', '.yaml'
    ];
    
    const extension = path.extname(filePath).toLowerCase();
    return textExtensions.includes(extension);
  }

  /**
   * Generate cache key
   * @private
   */
  generateCacheKey(query, options) {
    const key = JSON.stringify({ query, options });
    return require('crypto').createHash('md5').update(key).digest('hex');
  }

  /**
   * Add result to cache
   * @private
   */
  addToCache(key, results) {
    if (this.cacheSize >= this.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = this.searchCache.keys().next().value;
      this.searchCache.delete(oldestKey);
      this.cacheSize--;
    }

    this.searchCache.set(key, results);
    this.cacheSize++;
  }

  /**
   * Add search to history
   * @private
   */
  addToHistory(query, resultCount) {
    const historyEntry = {
      query,
      resultCount,
      timestamp: new Date()
    };

    this.searchHistory.unshift(historyEntry);
    
    if (this.searchHistory.length > this.maxHistorySize) {
      this.searchHistory = this.searchHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get search history
   * @returns {Array} Search history
   */
  getSearchHistory() {
    return this.searchHistory.slice();
  }

  /**
   * Clear search history
   */
  clearSearchHistory() {
    this.searchHistory = [];
    this.emit('historyCleared');
  }

  /**
   * Clear search cache
   */
  clearCache() {
    this.searchCache.clear();
    this.cacheSize = 0;
    this.emit('cacheCleared');
  }

  /**
   * Get search statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      indexVersion: this.indexVersion,
      indexedFiles: this.searchIndex.size,
      indexedWords: this.contentIndex.size,
      cacheSize: this.cacheSize,
      historySize: this.searchHistory.length,
      isIndexing: this.indexingInProgress
    };
  }

  /**
   * Cleanup file search
   */
  destroy() {
    this.searchIndex.clear();
    this.contentIndex.clear();
    this.metadataIndex.clear();
    this.searchCache.clear();
    this.searchHistory = [];
    this.removeAllListeners();
  }
}

module.exports = FileSearch;
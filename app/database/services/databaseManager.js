/**
 * Database Manager - Main database service for standalone desktop app
 * Provides unified interface for all database operations
 */

const path = require('path');
const fs = require('fs').promises;
const Database = require('better-sqlite3');
const MigrationManager = require('../migrations/migrationManager');
const VectorStore = require('./vectorStore');
const SearchService = require('./searchService');
const BackupService = require('./backupService');

class DatabaseManager {
  constructor(options = {}) {
    this.options = {
      dbPath: options.dbPath || path.join(process.cwd(), 'data', 'ragmaker.db'),
      enableWAL: options.enableWAL !== false,
      enableForeignKeys: options.enableForeignKeys !== false,
      timeout: options.timeout || 5000,
      ...options
    };

    this.db = null;
    this.migrationManager = null;
    this.vectorStore = null;
    this.searchService = null;
    this.backupService = null;
    this.isInitialized = false;
    this.preparedStatements = new Map();
  }

  /**
   * Initialize database and all services
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('Initializing database manager...');
      
      // Initialize migration manager and run migrations
      this.migrationManager = new MigrationManager(this.options.dbPath);
      await this.migrationManager.connect();
      await this.migrationManager.migrate();

      // Get database instance
      this.db = this.migrationManager.db;

      // Configure database
      this.configurePragmas();

      // Initialize services
      this.vectorStore = new VectorStore(this.db);
      this.searchService = new SearchService(this.db);
      this.backupService = new BackupService(this.options.dbPath, this.db);

      // Prepare commonly used statements
      this.prepareStatements();

      // Start maintenance tasks
      this.startMaintenanceTasks();

      this.isInitialized = true;
      console.log('Database manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database manager:', error);
      throw error;
    }
  }

  /**
   * Configure database pragmas
   */
  configurePragmas() {
    if (!this.db) return;

    // Enable WAL mode for better concurrency
    if (this.options.enableWAL) {
      this.db.pragma('journal_mode = WAL');
    }

    // Enable foreign keys
    if (this.options.enableForeignKeys) {
      this.db.pragma('foreign_keys = ON');
    }

    // Performance settings
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 268435456'); // 256MB
    this.db.pragma('page_size = 4096');
    
    // Set timeout
    this.db.timeout(this.options.timeout);
  }

  /**
   * Prepare commonly used SQL statements
   */
  prepareStatements() {
    const statements = {
      // Projects
      insertProject: 'INSERT OR REPLACE INTO projects (id, name, description, slug, type, settings, is_favorite) VALUES (?, ?, ?, ?, ?, ?, ?)',
      getProject: 'SELECT * FROM projects WHERE id = ?',
      getProjectBySlug: 'SELECT * FROM projects WHERE slug = ?',
      listProjects: 'SELECT * FROM projects ORDER BY updated_at DESC',
      deleteProject: 'DELETE FROM projects WHERE id = ?',
      updateProjectStats: 'UPDATE projects SET view_count = ?, chat_count = ?, last_accessed = CURRENT_TIMESTAMP WHERE id = ?',

      // Documents
      insertDocument: 'INSERT OR REPLACE INTO documents (id, project_id, type, title, url, file_path, content_hash, metadata, word_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      getDocument: 'SELECT * FROM documents WHERE id = ?',
      listDocuments: 'SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC',
      deleteDocument: 'DELETE FROM documents WHERE id = ?',
      getDocumentsByHash: 'SELECT * FROM documents WHERE content_hash = ?',

      // Text chunks
      insertChunk: 'INSERT INTO text_chunks (id, document_id, project_id, content, chunk_index, start_position, end_position, word_count, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      getChunk: 'SELECT * FROM text_chunks WHERE id = ?',
      listChunks: 'SELECT * FROM text_chunks WHERE document_id = ? ORDER BY chunk_index',
      deleteChunks: 'DELETE FROM text_chunks WHERE document_id = ?',
      countChunks: 'SELECT COUNT(*) as count FROM text_chunks WHERE project_id = ?',

      // Chat logs
      insertChatLog: 'INSERT INTO chat_logs (project_id, session_id, question, answer, sources, response_style, model_used, processing_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      getChatHistory: 'SELECT * FROM chat_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?',
      getChatsBySession: 'SELECT * FROM chat_logs WHERE session_id = ? ORDER BY created_at',
      deleteChatHistory: 'DELETE FROM chat_logs WHERE project_id = ?',

      // Channels
      insertChannel: 'INSERT OR REPLACE INTO channels (project_id, channel_id, channel_name, channel_url, video_count, total_chunks, indexed_videos) VALUES (?, ?, ?, ?, ?, ?, ?)',
      getChannels: 'SELECT * FROM channels WHERE project_id = ?',
      deleteChannels: 'DELETE FROM channels WHERE project_id = ?',

      // System settings
      getSetting: 'SELECT value FROM system_settings WHERE key = ?',
      setSetting: 'INSERT OR REPLACE INTO system_settings (key, value, category, description) VALUES (?, ?, ?, ?)',
      getSettings: 'SELECT * FROM system_settings WHERE category = ? ORDER BY key',

      // Analytics
      insertAnalytics: 'INSERT INTO analytics (event_type, project_id, metadata, duration, success, error_message) VALUES (?, ?, ?, ?, ?, ?)',
      getAnalytics: 'SELECT * FROM analytics WHERE event_type = ? AND created_at >= datetime("now", "-30 days") ORDER BY created_at DESC',

      // Tags
      insertTag: 'INSERT OR IGNORE INTO tags (name, color, description) VALUES (?, ?, ?)',
      getTags: 'SELECT * FROM tags ORDER BY name',
      tagDocument: 'INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)',
      untagDocument: 'DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?',
      getDocumentTags: 'SELECT t.* FROM tags t JOIN document_tags dt ON t.id = dt.tag_id WHERE dt.document_id = ?'
    };

    for (const [name, sql] of Object.entries(statements)) {
      this.preparedStatements.set(name, this.db.prepare(sql));
    }
  }

  /**
   * Start maintenance tasks
   */
  startMaintenanceTasks() {
    // Vacuum database weekly
    setInterval(() => {
      try {
        this.migrationManager.vacuum();
      } catch (error) {
        console.warn('Vacuum failed:', error);
      }
    }, 7 * 24 * 60 * 60 * 1000); // 7 days

    // Analyze database daily
    setInterval(() => {
      try {
        this.migrationManager.analyze();
      } catch (error) {
        console.warn('Analyze failed:', error);
      }
    }, 24 * 60 * 60 * 1000); // 1 day

    // Cleanup old analytics data
    setInterval(() => {
      try {
        this.db.prepare('DELETE FROM analytics WHERE created_at < datetime("now", "-90 days")').run();
      } catch (error) {
        console.warn('Analytics cleanup failed:', error);
      }
    }, 24 * 60 * 60 * 1000); // 1 day
  }

  /**
   * Execute prepared statement
   */
  exec(statementName, ...params) {
    const stmt = this.preparedStatements.get(statementName);
    if (!stmt) {
      throw new Error(`Prepared statement not found: ${statementName}`);
    }
    return stmt.run(...params);
  }

  /**
   * Get single row from prepared statement
   */
  get(statementName, ...params) {
    const stmt = this.preparedStatements.get(statementName);
    if (!stmt) {
      throw new Error(`Prepared statement not found: ${statementName}`);
    }
    return stmt.get(...params);
  }

  /**
   * Get all rows from prepared statement
   */
  all(statementName, ...params) {
    const stmt = this.preparedStatements.get(statementName);
    if (!stmt) {
      throw new Error(`Prepared statement not found: ${statementName}`);
    }
    return stmt.all(...params);
  }

  /**
   * Execute transaction
   */
  transaction(callback) {
    const transaction = this.db.transaction(callback);
    return transaction();
  }

  // === PROJECT OPERATIONS ===

  async createProject(projectData) {
    const id = projectData.id || this.generateId();
    const settings = JSON.stringify(projectData.settings || {});
    
    const result = this.exec('insertProject', 
      id, 
      projectData.name, 
      projectData.description || null,
      projectData.slug || null,
      projectData.type || 'mixed',
      settings,
      projectData.is_favorite || false
    );

    await this.logAnalytics('project_created', id, { name: projectData.name });
    return { id, ...projectData };
  }

  getProject(projectId) {
    return this.get('getProject', projectId);
  }

  getProjectBySlug(slug) {
    return this.get('getProjectBySlug', slug);
  }

  listProjects() {
    return this.all('listProjects');
  }

  async deleteProject(projectId) {
    const transaction = this.db.transaction(() => {
      // Delete project (cascading will handle related records)
      const result = this.exec('deleteProject', projectId);
      
      // Clean up vector embeddings
      this.vectorStore.deleteProjectEmbeddings(projectId);
      
      return result;
    });

    const result = transaction();
    await this.logAnalytics('project_deleted', projectId);
    return result;
  }

  updateProjectAccess(projectId) {
    const project = this.get('getProject', projectId);
    if (project) {
      this.exec('updateProjectStats', project.view_count + 1, project.chat_count, projectId);
    }
  }

  // === DOCUMENT OPERATIONS ===

  async createDocument(documentData) {
    const id = documentData.id || this.generateId();
    const metadata = JSON.stringify(documentData.metadata || {});
    
    const result = this.exec('insertDocument',
      id,
      documentData.project_id,
      documentData.type,
      documentData.title,
      documentData.url || null,
      documentData.file_path || null,
      documentData.content_hash || null,
      metadata,
      documentData.word_count || 0
    );

    await this.logAnalytics('document_created', documentData.project_id, { type: documentData.type });
    return { id, ...documentData };
  }

  getDocument(documentId) {
    return this.get('getDocument', documentId);
  }

  listDocuments(projectId) {
    return this.all('listDocuments', projectId);
  }

  async deleteDocument(documentId) {
    const document = this.getDocument(documentId);
    if (!document) return null;

    const transaction = this.db.transaction(() => {
      // Delete document (cascading will handle chunks and embeddings)
      const result = this.exec('deleteDocument', documentId);
      
      // Clean up vector embeddings
      this.vectorStore.deleteDocumentEmbeddings(documentId);
      
      return result;
    });

    const result = transaction();
    await this.logAnalytics('document_deleted', document.project_id);
    return result;
  }

  findDuplicateDocuments(contentHash) {
    return this.all('getDocumentsByHash', contentHash);
  }

  // === TEXT CHUNK OPERATIONS ===

  async createTextChunk(chunkData) {
    const id = chunkData.id || this.generateId();
    const metadata = JSON.stringify(chunkData.metadata || {});
    
    const result = this.exec('insertChunk',
      id,
      chunkData.document_id,
      chunkData.project_id,
      chunkData.content,
      chunkData.chunk_index,
      chunkData.start_position || 0,
      chunkData.end_position || 0,
      chunkData.word_count || 0,
      metadata
    );

    return { id, ...chunkData };
  }

  getTextChunk(chunkId) {
    return this.get('getChunk', chunkId);
  }

  listTextChunks(documentId) {
    return this.all('listChunks', documentId);
  }

  deleteTextChunks(documentId) {
    return this.exec('deleteChunks', documentId);
  }

  // === CHAT LOG OPERATIONS ===

  async logChat(chatData) {
    const sources = JSON.stringify(chatData.sources || []);
    
    const result = this.exec('insertChatLog',
      chatData.project_id,
      chatData.session_id || null,
      chatData.question,
      chatData.answer,
      sources,
      chatData.response_style || 'professional',
      chatData.model_used || null,
      chatData.processing_time || null
    );

    // Update project chat count
    const project = this.getProject(chatData.project_id);
    if (project) {
      this.exec('updateProjectStats', project.view_count, project.chat_count + 1, chatData.project_id);
    }

    await this.logAnalytics('chat', chatData.project_id, { 
      response_style: chatData.response_style,
      processing_time: chatData.processing_time 
    });
    
    return result;
  }

  getChatHistory(projectId, limit = 50) {
    return this.all('getChatHistory', projectId, limit);
  }

  getChatsBySession(sessionId) {
    return this.all('getChatsBySession', sessionId);
  }

  deleteChatHistory(projectId) {
    return this.exec('deleteChatHistory', projectId);
  }

  // === SETTINGS OPERATIONS ===

  getSetting(key) {
    const result = this.get('getSetting', key);
    return result ? result.value : null;
  }

  setSetting(key, value, category = 'general', description = null) {
    return this.exec('setSetting', key, value, category, description);
  }

  getSettingsByCategory(category) {
    return this.all('getSettings', category);
  }

  // === ANALYTICS OPERATIONS ===

  async logAnalytics(eventType, projectId, metadata = {}, duration = null, success = true, error = null) {
    try {
      const metadataJson = JSON.stringify(metadata);
      this.exec('insertAnalytics', eventType, projectId, metadataJson, duration, success, error);
    } catch (error) {
      console.warn('Failed to log analytics:', error);
    }
  }

  getAnalytics(eventType) {
    return this.all('getAnalytics', eventType);
  }

  // === UTILITY METHODS ===

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getStats() {
    if (!this.migrationManager) return null;
    return this.migrationManager.getStats();
  }

  checkIntegrity() {
    if (!this.migrationManager) return false;
    return this.migrationManager.checkIntegrity();
  }

  async backup(options = {}) {
    if (!this.backupService) return null;
    return await this.backupService.createBackup(options);
  }

  async restore(backupPath) {
    if (!this.backupService) return false;
    return await this.backupService.restoreBackup(backupPath);
  }

  // === SERVICE GETTERS ===

  getVectorStore() {
    return this.vectorStore;
  }

  getSearchService() {
    return this.searchService;
  }

  getBackupService() {
    return this.backupService;
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.migrationManager) {
      this.migrationManager.close();
    }
    this.isInitialized = false;
    console.log('Database manager closed');
  }

  /**
   * Get database instance (for advanced operations)
   */
  getDatabase() {
    return this.db;
  }
}

module.exports = DatabaseManager;
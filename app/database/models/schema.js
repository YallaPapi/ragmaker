/**
 * Database Schema Definition for Standalone Desktop App
 * Optimized for local SQLite storage with vector search capabilities
 */

const SCHEMA_VERSION = '1.0.0';

const TABLES = {
  // Projects table - Core project management
  projects: `
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      slug TEXT UNIQUE,
      type TEXT DEFAULT 'youtube', -- youtube, document, mixed
      settings TEXT DEFAULT '{}', -- JSON settings
      is_favorite BOOLEAN DEFAULT 0,
      view_count INTEGER DEFAULT 0,
      chat_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
      storage_size INTEGER DEFAULT 0, -- bytes
      vector_count INTEGER DEFAULT 0,
      embedding_model TEXT DEFAULT 'text-embedding-3-small'
    )
  `,

  // Documents table - All document types (videos, PDFs, text, etc.)
  documents: `
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL, -- 'youtube_video', 'pdf', 'text', 'web_page', 'markdown'
      title TEXT NOT NULL,
      url TEXT,
      file_path TEXT,
      content_hash TEXT, -- SHA-256 hash for deduplication
      metadata TEXT DEFAULT '{}', -- JSON metadata (duration, author, etc.)
      word_count INTEGER DEFAULT 0,
      processed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `,

  // Text chunks table - Chunked content for embeddings
  text_chunks: `
    CREATE TABLE IF NOT EXISTS text_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      start_position INTEGER DEFAULT 0,
      end_position INTEGER DEFAULT 0,
      word_count INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}', -- JSON metadata (timestamp, speaker, etc.)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `,

  // Embeddings table - Vector embeddings storage
  embeddings: `
    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      chunk_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      embedding BLOB NOT NULL, -- Serialized vector
      model_name TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      norm REAL, -- Vector norm for optimization
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chunk_id) REFERENCES text_chunks(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `,

  // Channels table - YouTube channel information
  channels: `
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT,
      channel_url TEXT,
      video_count INTEGER DEFAULT 0,
      total_chunks INTEGER DEFAULT 0,
      indexed_videos TEXT DEFAULT '[]', -- JSON array
      last_sync_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, channel_id)
    )
  `,

  // Chat logs table - Conversation history
  chat_logs: `
    CREATE TABLE IF NOT EXISTS chat_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      session_id TEXT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      sources TEXT DEFAULT '[]', -- JSON array of source references
      response_style TEXT DEFAULT 'professional',
      model_used TEXT,
      processing_time INTEGER, -- milliseconds
      user_rating INTEGER, -- 1-5 star rating
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `,

  // Full-text search index table
  search_index: `
    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      content,
      title,
      document_id,
      project_id,
      metadata,
      tokenize='porter'
    )
  `,

  // Tags table - Flexible tagging system
  tags: `
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#3b82f6',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // Document tags junction table
  document_tags: `
    CREATE TABLE IF NOT EXISTS document_tags (
      document_id TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (document_id, tag_id),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `,

  // System settings table
  system_settings: `
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // Backup metadata table
  backup_metadata: `
    CREATE TABLE IF NOT EXISTS backup_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      backup_type TEXT DEFAULT 'full', -- full, incremental, project
      project_ids TEXT DEFAULT '[]', -- JSON array for project-specific backups
      file_size INTEGER,
      compressed_size INTEGER,
      checksum TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // Analytics table - Usage and performance metrics
  analytics: `
    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL, -- 'query', 'import', 'export', 'backup'
      project_id TEXT,
      metadata TEXT DEFAULT '{}', -- JSON event data
      duration INTEGER, -- milliseconds
      success BOOLEAN DEFAULT 1,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    )
  `
};

const INDEXES = {
  // Performance indexes
  idx_documents_project: 'CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id)',
  idx_documents_type: 'CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type)',
  idx_documents_hash: 'CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(content_hash)',
  idx_chunks_document: 'CREATE INDEX IF NOT EXISTS idx_chunks_document ON text_chunks(document_id)',
  idx_chunks_project: 'CREATE INDEX IF NOT EXISTS idx_chunks_project ON text_chunks(project_id)',
  idx_embeddings_chunk: 'CREATE INDEX IF NOT EXISTS idx_embeddings_chunk ON embeddings(chunk_id)',
  idx_embeddings_project: 'CREATE INDEX IF NOT EXISTS idx_embeddings_project ON embeddings(project_id)',
  idx_embeddings_model: 'CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(model_name)',
  idx_channels_project: 'CREATE INDEX IF NOT EXISTS idx_channels_project ON channels(project_id)',
  idx_chat_logs_project: 'CREATE INDEX IF NOT EXISTS idx_chat_logs_project ON chat_logs(project_id)',
  idx_chat_logs_session: 'CREATE INDEX IF NOT EXISTS idx_chat_logs_session ON chat_logs(session_id)',
  idx_chat_logs_created: 'CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs(created_at)',
  idx_projects_slug: 'CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug)',
  idx_projects_type: 'CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type)',
  idx_projects_favorite: 'CREATE INDEX IF NOT EXISTS idx_projects_favorite ON projects(is_favorite)',
  idx_projects_updated: 'CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at)',
  idx_analytics_type: 'CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics(event_type)',
  idx_analytics_project: 'CREATE INDEX IF NOT EXISTS idx_analytics_project ON analytics(project_id)',
  idx_analytics_created: 'CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics(created_at)'
};

const TRIGGERS = {
  // Update timestamps automatically
  update_projects_timestamp: `
    CREATE TRIGGER IF NOT EXISTS update_projects_timestamp
    AFTER UPDATE ON projects
    FOR EACH ROW
    BEGIN
      UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `,

  update_documents_timestamp: `
    CREATE TRIGGER IF NOT EXISTS update_documents_timestamp
    AFTER UPDATE ON documents
    FOR EACH ROW
    BEGIN
      UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `,

  update_channels_timestamp: `
    CREATE TRIGGER IF NOT EXISTS update_channels_timestamp
    AFTER UPDATE ON channels
    FOR EACH ROW
    BEGIN
      UPDATE channels SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `,

  // Update project statistics
  update_project_vector_count: `
    CREATE TRIGGER IF NOT EXISTS update_project_vector_count
    AFTER INSERT ON embeddings
    FOR EACH ROW
    BEGIN
      UPDATE projects SET vector_count = (
        SELECT COUNT(*) FROM embeddings WHERE project_id = NEW.project_id
      ) WHERE id = NEW.project_id;
    END
  `,

  delete_project_vector_count: `
    CREATE TRIGGER IF NOT EXISTS delete_project_vector_count
    AFTER DELETE ON embeddings
    FOR EACH ROW
    BEGIN
      UPDATE projects SET vector_count = (
        SELECT COUNT(*) FROM embeddings WHERE project_id = OLD.project_id
      ) WHERE id = OLD.project_id;
    END
  `,

  // Maintain search index
  insert_search_index: `
    CREATE TRIGGER IF NOT EXISTS insert_search_index
    AFTER INSERT ON text_chunks
    FOR EACH ROW
    BEGIN
      INSERT INTO search_index (content, title, document_id, project_id, metadata)
      SELECT NEW.content, d.title, NEW.document_id, NEW.project_id, NEW.metadata
      FROM documents d WHERE d.id = NEW.document_id;
    END
  `,

  update_search_index: `
    CREATE TRIGGER IF NOT EXISTS update_search_index
    AFTER UPDATE ON text_chunks
    FOR EACH ROW
    BEGIN
      UPDATE search_index SET 
        content = NEW.content,
        metadata = NEW.metadata
      WHERE document_id = NEW.document_id AND rowid = (
        SELECT rowid FROM search_index WHERE document_id = NEW.document_id LIMIT 1
      );
    END
  `,

  delete_search_index: `
    CREATE TRIGGER IF NOT EXISTS delete_search_index
    AFTER DELETE ON text_chunks
    FOR EACH ROW
    BEGIN
      DELETE FROM search_index WHERE document_id = OLD.document_id;
    END
  `
};

const VIEWS = {
  // Project summary view
  project_summary: `
    CREATE VIEW IF NOT EXISTS project_summary AS
    SELECT 
      p.*,
      COUNT(DISTINCT d.id) as document_count,
      COUNT(DISTINCT tc.id) as chunk_count,
      COUNT(DISTINCT e.id) as embedding_count,
      COUNT(DISTINCT c.id) as channel_count,
      MAX(d.updated_at) as last_document_update
    FROM projects p
    LEFT JOIN documents d ON p.id = d.project_id
    LEFT JOIN text_chunks tc ON p.id = tc.project_id
    LEFT JOIN embeddings e ON p.id = e.project_id
    LEFT JOIN channels c ON p.id = c.project_id
    GROUP BY p.id
  `,

  // Document summary view
  document_summary: `
    CREATE VIEW IF NOT EXISTS document_summary AS
    SELECT 
      d.*,
      COUNT(tc.id) as chunk_count,
      COUNT(e.id) as embedding_count,
      AVG(tc.word_count) as avg_chunk_size,
      GROUP_CONCAT(t.name) as tags
    FROM documents d
    LEFT JOIN text_chunks tc ON d.id = tc.document_id
    LEFT JOIN embeddings e ON d.id = e.document_id
    LEFT JOIN document_tags dt ON d.id = dt.document_id
    LEFT JOIN tags t ON dt.tag_id = t.id
    GROUP BY d.id
  `,

  // Recent activity view
  recent_activity: `
    CREATE VIEW IF NOT EXISTS recent_activity AS
    SELECT 'project' as type, name as title, id, created_at FROM projects
    UNION ALL
    SELECT 'document' as type, title, id, created_at FROM documents
    UNION ALL
    SELECT 'chat' as type, SUBSTR(question, 1, 50) as title, CAST(id as TEXT), created_at FROM chat_logs
    ORDER BY created_at DESC
    LIMIT 100
  `
};

const INITIAL_DATA = {
  system_settings: [
    { key: 'schema_version', value: SCHEMA_VERSION, category: 'system', description: 'Database schema version' },
    { key: 'app_version', value: '1.0.0', category: 'system', description: 'Application version' },
    { key: 'default_embedding_model', value: 'text-embedding-3-small', category: 'ai', description: 'Default embedding model' },
    { key: 'max_chunk_size', value: '1000', category: 'processing', description: 'Maximum text chunk size in tokens' },
    { key: 'chunk_overlap', value: '200', category: 'processing', description: 'Overlap between chunks in tokens' },
    { key: 'backup_retention_days', value: '30', category: 'backup', description: 'Days to retain backups' },
    { key: 'auto_backup_enabled', value: 'true', category: 'backup', description: 'Enable automatic backups' },
    { key: 'analytics_enabled', value: 'true', category: 'privacy', description: 'Enable usage analytics' }
  ],

  tags: [
    { name: 'Important', color: '#ef4444', description: 'High priority content' },
    { name: 'Tutorial', color: '#10b981', description: 'Educational content' },
    { name: 'Research', color: '#8b5cf6', description: 'Research materials' },
    { name: 'Reference', color: '#f59e0b', description: 'Reference documents' },
    { name: 'Archive', color: '#6b7280', description: 'Archived content' }
  ]
};

module.exports = {
  SCHEMA_VERSION,
  TABLES,
  INDEXES,
  TRIGGERS,
  VIEWS,
  INITIAL_DATA
};
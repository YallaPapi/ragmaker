# Data Persistence and Project Management Specification

## Overview

The Data Persistence and Project Management system provides comprehensive data storage, organization, and project lifecycle management for the standalone RAGMaker desktop application. It ensures data integrity, efficient access patterns, and seamless project management workflows.

## Database Architecture

```
Data Persistence Layer
├── SQLite Main Database (app.db)
│   ├── Core Tables
│   │   ├── projects
│   │   ├── channels  
│   │   ├── documents
│   │   ├── embeddings_metadata
│   │   └── chat_history
│   ├── Index Tables
│   │   ├── search_index
│   │   ├── content_index
│   │   └── temporal_index
│   └── System Tables
│       ├── migrations
│       ├── settings
│       └── audit_log
├── Vector Database (Qdrant)
│   ├── Project Collections
│   ├── Global Collections
│   ├── Metadata Storage
│   └── Index Management
├── File System Storage
│   ├── Project Directories
│   ├── Document Storage
│   ├── Cache Management
│   └── Backup System
└── In-Memory Cache
    ├── Query Cache
    ├── Model Cache
    ├── Session Cache
    └── UI Cache
```

## SQLite Database Schema

```sql
-- Main database schema for standalone RAGMaker

-- Projects table - core project management
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Project settings
    settings JSON DEFAULT '{}',
    rag_profile TEXT DEFAULT 'balanced',
    embedding_model TEXT DEFAULT 'nomic-embed-text',
    chat_model TEXT DEFAULT 'llama2:7b-chat',
    
    -- Project state
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    is_favorite BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    total_documents INTEGER DEFAULT 0,
    total_channels INTEGER DEFAULT 0,
    total_embeddings INTEGER DEFAULT 0,
    total_chat_messages INTEGER DEFAULT 0,
    
    -- Storage information
    storage_size_bytes INTEGER DEFAULT 0,
    local_path TEXT,
    
    -- Sync information
    sync_enabled BOOLEAN DEFAULT FALSE,
    sync_provider TEXT,
    sync_status TEXT DEFAULT 'local',
    last_sync_at DATETIME,
    
    UNIQUE(name)
);

-- Channels table - YouTube channel management
CREATE TABLE channels (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Channel identity
    channel_id TEXT NOT NULL,
    channel_name TEXT,
    channel_description TEXT,
    channel_url TEXT,
    
    -- Channel metadata
    subscriber_count INTEGER,
    video_count INTEGER DEFAULT 0,
    indexed_video_count INTEGER DEFAULT 0,
    
    -- Processing information
    indexed_at DATETIME,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    processing_status TEXT DEFAULT 'pending' CHECK (
        processing_status IN ('pending', 'processing', 'completed', 'failed', 'paused')
    ),
    
    -- Settings
    auto_update BOOLEAN DEFAULT FALSE,
    exclude_shorts BOOLEAN DEFAULT FALSE,
    max_videos INTEGER,
    
    -- Statistics
    total_chunks INTEGER DEFAULT 0,
    total_duration_seconds INTEGER DEFAULT 0,
    average_video_length INTEGER,
    
    -- Storage
    local_cache_path TEXT,
    
    UNIQUE(project_id, channel_id),
    INDEX idx_channels_project_id (project_id),
    INDEX idx_channels_status (processing_status),
    INDEX idx_channels_updated (last_updated)
);

-- Videos table - individual video tracking
CREATE TABLE videos (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Video identity
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    video_url TEXT,
    
    -- Video metadata
    duration_seconds INTEGER,
    view_count INTEGER,
    like_count INTEGER,
    published_at DATETIME,
    upload_date DATETIME,
    
    -- Processing status
    transcript_status TEXT DEFAULT 'pending' CHECK (
        transcript_status IN ('pending', 'processing', 'completed', 'failed', 'no_transcript')
    ),
    embedding_status TEXT DEFAULT 'pending' CHECK (
        embedding_status IN ('pending', 'processing', 'completed', 'failed')
    ),
    
    -- Content information
    transcript_language TEXT,
    transcript_quality_score REAL,
    chunk_count INTEGER DEFAULT 0,
    
    -- Processing timestamps
    transcript_processed_at DATETIME,
    embeddings_processed_at DATETIME,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Storage
    transcript_file_path TEXT,
    chunks_file_path TEXT,
    thumbnail_path TEXT,
    
    UNIQUE(project_id, video_id),
    INDEX idx_videos_channel (channel_id),
    INDEX idx_videos_project (project_id),
    INDEX idx_videos_status (transcript_status, embedding_status),
    INDEX idx_videos_published (published_at),
    INDEX idx_videos_updated (last_updated)
);

-- Documents table - imported document management
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Document identity
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    
    -- Document metadata
    file_type TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    mime_type TEXT,
    
    -- Content information
    text_content TEXT,
    content_preview TEXT, -- First 500 chars
    word_count INTEGER,
    character_count INTEGER,
    
    -- Processing status
    processing_status TEXT DEFAULT 'pending' CHECK (
        processing_status IN ('pending', 'processing', 'completed', 'failed')
    ),
    chunk_count INTEGER DEFAULT 0,
    embedding_count INTEGER DEFAULT 0,
    
    -- Timestamps
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Storage
    chunks_file_path TEXT,
    
    INDEX idx_documents_project (project_id),
    INDEX idx_documents_type (file_type),
    INDEX idx_documents_status (processing_status),
    INDEX idx_documents_hash (content_hash),
    INDEX idx_documents_imported (imported_at)
);

-- Chat history table - conversation management
CREATE TABLE chat_history (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Message content
    user_message TEXT NOT NULL,
    assistant_response TEXT NOT NULL,
    
    -- Context information
    context_chunks JSON, -- Array of relevant chunk IDs and scores
    sources JSON, -- Source documents/videos referenced
    
    -- Generation metadata
    model_used TEXT NOT NULL,
    tokens_used INTEGER,
    generation_time_ms INTEGER,
    confidence_score REAL,
    
    -- Quality metrics
    user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
    user_feedback TEXT,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Session information
    session_id TEXT,
    conversation_turn INTEGER,
    
    INDEX idx_chat_project (project_id),
    INDEX idx_chat_created (created_at),
    INDEX idx_chat_session (session_id),
    INDEX idx_chat_model (model_used),
    INDEX idx_chat_rating (user_rating)
);

-- Embeddings metadata table - vector tracking
CREATE TABLE embeddings_metadata (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Source tracking
    source_type TEXT NOT NULL CHECK (source_type IN ('video', 'document', 'manual')),
    source_id TEXT NOT NULL, -- References videos.id or documents.id
    chunk_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    
    -- Vector information
    vector_id TEXT NOT NULL, -- ID in vector database
    embedding_model TEXT NOT NULL,
    embedding_dimensions INTEGER NOT NULL,
    
    -- Content metadata
    content_preview TEXT, -- First 200 chars of chunk
    content_hash TEXT,
    chunk_size INTEGER,
    
    -- Processing information
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processing_time_ms INTEGER,
    
    -- Quality metrics
    coherence_score REAL,
    relevance_score REAL,
    
    UNIQUE(project_id, chunk_id),
    INDEX idx_embeddings_project (project_id),
    INDEX idx_embeddings_source (source_type, source_id),
    INDEX idx_embeddings_model (embedding_model),
    INDEX idx_embeddings_created (created_at)
);

-- Search index table - full-text search
CREATE VIRTUAL TABLE search_index USING fts5(
    content,
    title,
    source_type,
    source_id,
    project_id UNINDEXED,
    created_at UNINDEXED,
    content='',
    contentless_delete=1
);

-- Settings table - application configuration
CREATE TABLE settings (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    value_type TEXT DEFAULT 'string' CHECK (value_type IN ('string', 'integer', 'float', 'boolean', 'json')),
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(category, key),
    INDEX idx_settings_category (category)
);

-- Migrations table - schema version tracking
CREATE TABLE migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL UNIQUE,
    description TEXT,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    checksum TEXT NOT NULL
);

-- Audit log table - change tracking
CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Action tracking
    action_type TEXT NOT NULL CHECK (action_type IN (
        'create', 'update', 'delete', 'import', 'export', 'process', 'sync'
    )),
    entity_type TEXT NOT NULL CHECK (entity_type IN (
        'project', 'channel', 'video', 'document', 'embedding', 'chat'
    )),
    entity_id TEXT NOT NULL,
    
    -- Change details
    old_values JSON,
    new_values JSON,
    
    -- Metadata
    user_action BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    
    INDEX idx_audit_project (project_id),
    INDEX idx_audit_action (action_type),
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_created (created_at)
);

-- Performance monitoring table
CREATE TABLE performance_metrics (
    id TEXT PRIMARY KEY,
    metric_type TEXT NOT NULL CHECK (metric_type IN (
        'query_time', 'embedding_time', 'indexing_time', 'model_load_time', 'memory_usage'
    )),
    value REAL NOT NULL,
    context JSON, -- Additional context like model name, query type, etc.
    project_id TEXT REFERENCES projects(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_metrics_type (metric_type),
    INDEX idx_metrics_project (project_id),
    INDEX idx_metrics_created (created_at)
);

-- Triggers for maintaining metadata and audit logs
CREATE TRIGGER projects_updated_at
    AFTER UPDATE ON projects
    BEGIN
        UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER channels_updated_at
    AFTER UPDATE ON channels
    BEGIN
        UPDATE channels SET last_updated = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER videos_updated_at
    AFTER UPDATE ON videos
    BEGIN
        UPDATE videos SET last_updated = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER documents_updated_at
    AFTER UPDATE ON documents
    BEGIN
        UPDATE documents SET last_updated = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Audit triggers
CREATE TRIGGER audit_projects_insert
    AFTER INSERT ON projects
    BEGIN
        INSERT INTO audit_log (id, project_id, action_type, entity_type, entity_id, new_values)
        VALUES (hex(randomblob(16)), NEW.id, 'create', 'project', NEW.id, json_object(
            'name', NEW.name,
            'description', NEW.description,
            'settings', NEW.settings
        ));
    END;

CREATE TRIGGER audit_projects_update
    AFTER UPDATE ON projects
    BEGIN
        INSERT INTO audit_log (id, project_id, action_type, entity_type, entity_id, old_values, new_values)
        VALUES (hex(randomblob(16)), NEW.id, 'update', 'project', NEW.id,
            json_object('name', OLD.name, 'description', OLD.description, 'settings', OLD.settings),
            json_object('name', NEW.name, 'description', NEW.description, 'settings', NEW.settings)
        );
    END;

-- Full-text search triggers
CREATE TRIGGER search_index_videos_insert
    AFTER INSERT ON videos
    BEGIN
        INSERT INTO search_index (rowid, content, title, source_type, source_id, project_id, created_at)
        VALUES (NEW.rowid, NEW.description, NEW.title, 'video', NEW.id, NEW.project_id, NEW.last_updated);
    END;

CREATE TRIGGER search_index_documents_insert
    AFTER INSERT ON documents
    BEGIN
        INSERT INTO search_index (rowid, content, title, source_type, source_id, project_id, created_at)
        VALUES (NEW.rowid, NEW.text_content, NEW.title, 'document', NEW.id, NEW.project_id, NEW.imported_at);
    END;
```

## Project Management System

```rust
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use serde::{Serialize, Deserialize};
use sqlx::{SqlitePool, Row};
use uuid::Uuid;

pub struct ProjectManager {
    db_pool: Arc<SqlitePool>,
    file_manager: Arc<FileSystemManager>,
    vector_db: Arc<LocalVectorDatabase>,
    audit_logger: AuditLogger,
    project_cache: Arc<RwLock<HashMap<String, Project>>>,
}

impl ProjectManager {
    pub async fn new(
        db_pool: Arc<SqlitePool>,
        file_manager: Arc<FileSystemManager>,
        vector_db: Arc<LocalVectorDatabase>,
    ) -> Result<Self, ProjectError> {
        let audit_logger = AuditLogger::new(Arc::clone(&db_pool));
        
        let manager = Self {
            db_pool,
            file_manager,
            vector_db,
            audit_logger,
            project_cache: Arc::new(RwLock::new(HashMap::new())),
        };

        // Initialize database
        manager.initialize_database().await?;
        
        // Load existing projects into cache
        manager.load_projects_into_cache().await?;

        Ok(manager)
    }

    async fn initialize_database(&self) -> Result<(), ProjectError> {
        // Run database migrations
        let migration_files = self.get_migration_files()?;
        
        for migration_file in migration_files {
            let migration_sql = std::fs::read_to_string(&migration_file)?;
            let checksum = self.calculate_checksum(&migration_sql);
            
            // Check if migration already applied
            let existing = sqlx::query!(
                "SELECT checksum FROM migrations WHERE version = ?",
                migration_file.file_stem().unwrap().to_str()
            )
            .fetch_optional(&*self.db_pool)
            .await?;
            
            if let Some(existing_migration) = existing {
                if existing_migration.checksum != checksum {
                    return Err(ProjectError::MigrationChecksumMismatch);
                }
                continue; // Already applied
            }
            
            // Apply migration
            sqlx::query(&migration_sql)
                .execute(&*self.db_pool)
                .await?;
            
            // Record migration
            sqlx::query!(
                "INSERT INTO migrations (version, description, checksum) VALUES (?, ?, ?)",
                migration_file.file_stem().unwrap().to_str(),
                format!("Migration from {}", migration_file.display()),
                checksum
            )
            .execute(&*self.db_pool)
            .await?;
        }

        // Initialize default settings
        self.initialize_default_settings().await?;

        Ok(())
    }

    pub async fn create_project(&self, request: CreateProjectRequest) -> Result<Project, ProjectError> {
        let project_id = Uuid::new_v4().to_string();
        
        // Create project directory structure
        let project_paths = self.file_manager
            .create_project_structure(&project_id)
            .await?;

        // Create vector collection for project
        self.vector_db
            .create_collection(&project_id, 384) // Default embedding dimensions
            .await?;

        // Create project record
        let project = Project {
            id: project_id.clone(),
            name: request.name.clone(),
            description: request.description.clone(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            last_accessed_at: chrono::Utc::now(),
            settings: request.settings.unwrap_or_default(),
            rag_profile: request.rag_profile.unwrap_or("balanced".to_string()),
            embedding_model: request.embedding_model.unwrap_or("nomic-embed-text".to_string()),
            chat_model: request.chat_model.unwrap_or("llama2:7b-chat".to_string()),
            status: ProjectStatus::Active,
            is_favorite: false,
            total_documents: 0,
            total_channels: 0,
            total_embeddings: 0,
            total_chat_messages: 0,
            storage_size_bytes: 0,
            local_path: project_paths.root.to_string_lossy().to_string(),
            sync_enabled: false,
            sync_provider: None,
            sync_status: SyncStatus::Local,
            last_sync_at: None,
        };

        // Insert into database
        sqlx::query!(
            r#"
            INSERT INTO projects (
                id, name, description, settings, rag_profile, 
                embedding_model, chat_model, local_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
            project.id,
            project.name,
            project.description,
            serde_json::to_string(&project.settings)?,
            project.rag_profile,
            project.embedding_model,
            project.chat_model,
            project.local_path
        )
        .execute(&*self.db_pool)
        .await?;

        // Add to cache
        self.project_cache.write().await.insert(project_id.clone(), project.clone());

        // Log creation
        self.audit_logger.log_project_created(&project).await?;

        Ok(project)
    }

    pub async fn get_project(&self, project_id: &str) -> Result<Option<Project>, ProjectError> {
        // Check cache first
        {
            let cache = self.project_cache.read().await;
            if let Some(project) = cache.get(project_id) {
                return Ok(Some(project.clone()));
            }
        }

        // Load from database
        let row = sqlx::query!(
            r#"
            SELECT id, name, description, created_at, updated_at, last_accessed_at,
                   settings, rag_profile, embedding_model, chat_model, status,
                   is_favorite, total_documents, total_channels, total_embeddings,
                   total_chat_messages, storage_size_bytes, local_path,
                   sync_enabled, sync_provider, sync_status, last_sync_at
            FROM projects WHERE id = ?
            "#,
            project_id
        )
        .fetch_optional(&*self.db_pool)
        .await?;

        match row {
            Some(row) => {
                let project = Project {
                    id: row.id,
                    name: row.name,
                    description: row.description,
                    created_at: chrono::DateTime::parse_from_rfc3339(&row.created_at)
                        .unwrap()
                        .with_timezone(&chrono::Utc),
                    updated_at: chrono::DateTime::parse_from_rfc3339(&row.updated_at)
                        .unwrap()
                        .with_timezone(&chrono::Utc),
                    last_accessed_at: chrono::DateTime::parse_from_rfc3339(&row.last_accessed_at)
                        .unwrap()
                        .with_timezone(&chrono::Utc),
                    settings: serde_json::from_str(&row.settings).unwrap_or_default(),
                    rag_profile: row.rag_profile,
                    embedding_model: row.embedding_model,
                    chat_model: row.chat_model,
                    status: ProjectStatus::from_str(&row.status),
                    is_favorite: row.is_favorite,
                    total_documents: row.total_documents as usize,
                    total_channels: row.total_channels as usize,
                    total_embeddings: row.total_embeddings as usize,
                    total_chat_messages: row.total_chat_messages as usize,
                    storage_size_bytes: row.storage_size_bytes as u64,
                    local_path: row.local_path,
                    sync_enabled: row.sync_enabled,
                    sync_provider: row.sync_provider,
                    sync_status: SyncStatus::from_str(&row.sync_status),
                    last_sync_at: row.last_sync_at.map(|s| {
                        chrono::DateTime::parse_from_rfc3339(&s)
                            .unwrap()
                            .with_timezone(&chrono::Utc)
                    }),
                };

                // Add to cache
                self.project_cache.write().await.insert(project_id.to_string(), project.clone());

                Ok(Some(project))
            },
            None => Ok(None),
        }
    }

    pub async fn update_project(
        &self,
        project_id: &str,
        updates: UpdateProjectRequest,
    ) -> Result<Project, ProjectError> {
        // Get current project
        let current_project = self.get_project(project_id)
            .await?
            .ok_or(ProjectError::ProjectNotFound)?;

        // Apply updates
        let mut updated_project = current_project.clone();
        
        if let Some(name) = updates.name {
            updated_project.name = name;
        }
        if let Some(description) = updates.description {
            updated_project.description = description;
        }
        if let Some(settings) = updates.settings {
            updated_project.settings = settings;
        }
        if let Some(rag_profile) = updates.rag_profile {
            updated_project.rag_profile = rag_profile;
        }
        if let Some(embedding_model) = updates.embedding_model {
            updated_project.embedding_model = embedding_model;
        }
        if let Some(chat_model) = updates.chat_model {
            updated_project.chat_model = chat_model;
        }
        if let Some(is_favorite) = updates.is_favorite {
            updated_project.is_favorite = is_favorite;
        }

        updated_project.updated_at = chrono::Utc::now();

        // Update database
        sqlx::query!(
            r#"
            UPDATE projects SET
                name = ?, description = ?, settings = ?, rag_profile = ?,
                embedding_model = ?, chat_model = ?, is_favorite = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            "#,
            updated_project.name,
            updated_project.description,
            serde_json::to_string(&updated_project.settings)?,
            updated_project.rag_profile,
            updated_project.embedding_model,
            updated_project.chat_model,
            updated_project.is_favorite,
            project_id
        )
        .execute(&*self.db_pool)
        .await?;

        // Update cache
        self.project_cache.write().await.insert(project_id.to_string(), updated_project.clone());

        // Log update
        self.audit_logger.log_project_updated(&current_project, &updated_project).await?;

        Ok(updated_project)
    }

    pub async fn delete_project(&self, project_id: &str) -> Result<(), ProjectError> {
        let project = self.get_project(project_id)
            .await?
            .ok_or(ProjectError::ProjectNotFound)?;

        // Delete vector collection
        self.vector_db.delete_collection(project_id).await?;

        // Delete project directory
        if let Ok(project_path) = PathBuf::from(&project.local_path).canonicalize() {
            tokio::fs::remove_dir_all(&project_path).await?;
        }

        // Delete from database (cascades to related tables)
        sqlx::query!("DELETE FROM projects WHERE id = ?", project_id)
            .execute(&*self.db_pool)
            .await?;

        // Remove from cache
        self.project_cache.write().await.remove(project_id);

        // Log deletion
        self.audit_logger.log_project_deleted(&project).await?;

        Ok(())
    }

    pub async fn get_all_projects(&self) -> Result<Vec<Project>, ProjectError> {
        let rows = sqlx::query!(
            r#"
            SELECT id, name, description, created_at, updated_at, last_accessed_at,
                   settings, rag_profile, embedding_model, chat_model, status,
                   is_favorite, total_documents, total_channels, total_embeddings,
                   total_chat_messages, storage_size_bytes, local_path,
                   sync_enabled, sync_provider, sync_status, last_sync_at
            FROM projects 
            WHERE status != 'deleted'
            ORDER BY last_accessed_at DESC, is_favorite DESC, created_at DESC
            "#
        )
        .fetch_all(&*self.db_pool)
        .await?;

        let mut projects = Vec::new();
        for row in rows {
            let project = Project {
                id: row.id,
                name: row.name,
                description: row.description,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.created_at)
                    .unwrap()
                    .with_timezone(&chrono::Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.updated_at)
                    .unwrap()
                    .with_timezone(&chrono::Utc),
                last_accessed_at: chrono::DateTime::parse_from_rfc3339(&row.last_accessed_at)
                    .unwrap()
                    .with_timezone(&chrono::Utc),
                settings: serde_json::from_str(&row.settings).unwrap_or_default(),
                rag_profile: row.rag_profile,
                embedding_model: row.embedding_model,
                chat_model: row.chat_model,
                status: ProjectStatus::from_str(&row.status),
                is_favorite: row.is_favorite,
                total_documents: row.total_documents as usize,
                total_channels: row.total_channels as usize,
                total_embeddings: row.total_embeddings as usize,
                total_chat_messages: row.total_chat_messages as usize,
                storage_size_bytes: row.storage_size_bytes as u64,
                local_path: row.local_path,
                sync_enabled: row.sync_enabled,
                sync_provider: row.sync_provider,
                sync_status: SyncStatus::from_str(&row.sync_status),
                last_sync_at: row.last_sync_at.map(|s| {
                    chrono::DateTime::parse_from_rfc3339(&s)
                        .unwrap()
                        .with_timezone(&chrono::Utc)
                }),
            };
            projects.push(project);
        }

        // Update cache with all projects
        {
            let mut cache = self.project_cache.write().await;
            for project in &projects {
                cache.insert(project.id.clone(), project.clone());
            }
        }

        Ok(projects)
    }

    pub async fn get_project_statistics(&self, project_id: &str) -> Result<ProjectStatistics, ProjectError> {
        let stats_row = sqlx::query!(
            r#"
            SELECT 
                (SELECT COUNT(*) FROM channels WHERE project_id = ?) as channel_count,
                (SELECT COUNT(*) FROM videos WHERE project_id = ?) as video_count,
                (SELECT COUNT(*) FROM documents WHERE project_id = ?) as document_count,
                (SELECT COUNT(*) FROM embeddings_metadata WHERE project_id = ?) as embedding_count,
                (SELECT COUNT(*) FROM chat_history WHERE project_id = ?) as chat_count,
                (SELECT SUM(file_size_bytes) FROM documents WHERE project_id = ?) as total_document_size,
                (SELECT AVG(confidence_score) FROM chat_history WHERE project_id = ? AND confidence_score IS NOT NULL) as avg_confidence,
                (SELECT COUNT(*) FROM chat_history WHERE project_id = ? AND user_rating >= 4) as positive_ratings
            "#,
            project_id, project_id, project_id, project_id, project_id, project_id, project_id, project_id
        )
        .fetch_one(&*self.db_pool)
        .await?;

        let recent_activity = sqlx::query!(
            r#"
            SELECT action_type, entity_type, created_at, COUNT(*) as count
            FROM audit_log 
            WHERE project_id = ? AND created_at >= datetime('now', '-7 days')
            GROUP BY action_type, entity_type, date(created_at)
            ORDER BY created_at DESC
            LIMIT 50
            "#,
            project_id
        )
        .fetch_all(&*self.db_pool)
        .await?;

        let activity_timeline: Vec<ActivitySummary> = recent_activity.into_iter().map(|row| {
            ActivitySummary {
                action_type: row.action_type,
                entity_type: row.entity_type,
                count: row.count as usize,
                date: chrono::DateTime::parse_from_rfc3339(&row.created_at)
                    .unwrap()
                    .with_timezone(&chrono::Utc),
            }
        }).collect();

        Ok(ProjectStatistics {
            project_id: project_id.to_string(),
            channel_count: stats_row.channel_count as usize,
            video_count: stats_row.video_count as usize,
            document_count: stats_row.document_count as usize,
            embedding_count: stats_row.embedding_count as usize,
            chat_message_count: stats_row.chat_count as usize,
            total_storage_bytes: stats_row.total_document_size.unwrap_or(0) as u64,
            average_confidence_score: stats_row.avg_confidence,
            positive_rating_count: stats_row.positive_ratings as usize,
            recent_activity: activity_timeline,
            generated_at: chrono::Utc::now(),
        })
    }

    pub async fn search_projects(&self, query: SearchProjectsRequest) -> Result<Vec<Project>, ProjectError> {
        let mut where_clauses = vec!["status != 'deleted'".to_string()];
        let mut params = Vec::new();

        if let Some(text_query) = query.text_query {
            where_clauses.push("(name LIKE ? OR description LIKE ?)".to_string());
            let search_pattern = format!("%{}%", text_query);
            params.push(search_pattern.clone());
            params.push(search_pattern);
        }

        if let Some(status) = query.status {
            where_clauses.push("status = ?".to_string());
            params.push(status.to_string());
        }

        if query.favorites_only {
            where_clauses.push("is_favorite = TRUE".to_string());
        }

        let where_clause = where_clauses.join(" AND ");
        
        let order_clause = match query.sort_by {
            Some(SortBy::Name) => "ORDER BY name ASC",
            Some(SortBy::CreatedAt) => "ORDER BY created_at DESC",
            Some(SortBy::UpdatedAt) => "ORDER BY updated_at DESC",
            Some(SortBy::LastAccessed) => "ORDER BY last_accessed_at DESC",
            None => "ORDER BY last_accessed_at DESC, is_favorite DESC",
        };

        let limit_clause = if let Some(limit) = query.limit {
            format!("LIMIT {}", limit)
        } else {
            String::new()
        };

        let sql = format!(
            r#"
            SELECT id, name, description, created_at, updated_at, last_accessed_at,
                   settings, rag_profile, embedding_model, chat_model, status,
                   is_favorite, total_documents, total_channels, total_embeddings,
                   total_chat_messages, storage_size_bytes, local_path,
                   sync_enabled, sync_provider, sync_status, last_sync_at
            FROM projects 
            WHERE {} 
            {} {}
            "#,
            where_clause, order_clause, limit_clause
        );

        // This is simplified - in practice you'd use a proper query builder
        // or parameterized queries to avoid SQL injection
        let rows = sqlx::query(&sql)
            .fetch_all(&*self.db_pool)
            .await?;

        let mut projects = Vec::new();
        for row in rows {
            // Convert row to Project struct (similar to get_all_projects implementation)
            // ... (implementation details omitted for brevity)
        }

        Ok(projects)
    }

    pub async fn calculate_storage_usage(&self, project_id: &str) -> Result<StorageUsage, ProjectError> {
        let project_path = self.get_project(project_id)
            .await?
            .ok_or(ProjectError::ProjectNotFound)?
            .local_path;

        let storage_usage = self.calculate_directory_size(Path::new(&project_path)).await?;

        // Update project storage size
        sqlx::query!(
            "UPDATE projects SET storage_size_bytes = ? WHERE id = ?",
            storage_usage.total_bytes,
            project_id
        )
        .execute(&*self.db_pool)
        .await?;

        Ok(storage_usage)
    }

    async fn calculate_directory_size(&self, dir: &Path) -> Result<StorageUsage, ProjectError> {
        let mut usage = StorageUsage::default();
        let mut entries = tokio::fs::read_dir(dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let metadata = entry.metadata().await?;
            let path = entry.path();

            if metadata.is_file() {
                usage.total_bytes += metadata.len();
                
                // Categorize by file type
                if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
                    match extension {
                        "json" => usage.metadata_bytes += metadata.len(),
                        "txt" => usage.documents_bytes += metadata.len(),
                        "bin" => usage.embeddings_bytes += metadata.len(),
                        "log" => usage.logs_bytes += metadata.len(),
                        _ => usage.other_bytes += metadata.len(),
                    }
                }
            } else if metadata.is_dir() {
                let subdir_usage = self.calculate_directory_size(&path).await?;
                usage.total_bytes += subdir_usage.total_bytes;
                usage.metadata_bytes += subdir_usage.metadata_bytes;
                usage.documents_bytes += subdir_usage.documents_bytes;
                usage.embeddings_bytes += subdir_usage.embeddings_bytes;
                usage.logs_bytes += subdir_usage.logs_bytes;
                usage.other_bytes += subdir_usage.other_bytes;
            }
        }

        Ok(usage)
    }
}

// Supporting Data Structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub last_accessed_at: chrono::DateTime<chrono::Utc>,
    
    // Settings
    pub settings: ProjectSettings,
    pub rag_profile: String,
    pub embedding_model: String,
    pub chat_model: String,
    
    // Status
    pub status: ProjectStatus,
    pub is_favorite: bool,
    
    // Statistics
    pub total_documents: usize,
    pub total_channels: usize,
    pub total_embeddings: usize,
    pub total_chat_messages: usize,
    pub storage_size_bytes: u64,
    
    // Storage
    pub local_path: String,
    
    // Sync
    pub sync_enabled: bool,
    pub sync_provider: Option<String>,
    pub sync_status: SyncStatus,
    pub last_sync_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectSettings {
    pub chunk_size: Option<usize>,
    pub chunk_overlap: Option<usize>,
    pub max_results: Option<usize>,
    pub temperature: Option<f32>,
    pub response_style: Option<String>,
    pub enable_citations: Option<bool>,
    pub auto_backup: Option<bool>,
    pub custom_prompts: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProjectStatus {
    Active,
    Archived,
    Deleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncStatus {
    Local,
    Syncing,
    Synced,
    Error,
}
```

This Data Persistence and Project Management specification provides a comprehensive foundation for managing all data storage, project lifecycles, and system state in the standalone RAGMaker desktop application.
# Local File System Integration Specification

## Overview

The Local File System Integration provides secure, efficient, and cross-platform file management for the standalone RAGMaker desktop application, handling all document storage, caching, and data organization.

## File System Architecture

```
RAGMaker/
├── Application/                    # Application binaries and core files
│   ├── ragmaker(.exe)             # Main executable
│   ├── libs/                      # Native libraries (Ollama, Qdrant, etc.)
│   ├── models/                    # AI model binaries
│   └── resources/                 # Application resources
│
├── Data/                          # User data directory
│   ├── projects/                  # Project-specific data
│   │   ├── {project-id}/
│   │   │   ├── project.json       # Project metadata
│   │   │   ├── channels/          # YouTube channel data
│   │   │   ├── documents/         # Imported documents
│   │   │   ├── embeddings/        # Vector embeddings
│   │   │   ├── cache/             # Temporary and cache files
│   │   │   └── exports/           # Export files
│   │   └── ...
│   │
│   ├── database/                  # Application databases
│   │   ├── app.db                 # Main SQLite database
│   │   ├── vector-db/             # Qdrant vector database
│   │   └── indexes/               # Search indexes
│   │
│   ├── models/                    # Downloaded AI models
│   │   ├── embeddings/            # Embedding models
│   │   ├── chat/                  # Chat models
│   │   └── registry.json          # Model registry
│   │
│   ├── config/                    # Configuration files
│   │   ├── app-config.json        # Application settings
│   │   ├── user-preferences.json  # User preferences
│   │   └── sync-config.json       # Cloud sync settings
│   │
│   ├── logs/                      # Application logs
│   │   ├── application.log        # Main application log
│   │   ├── indexing.log          # Indexing operations log
│   │   └── errors.log            # Error logs
│   │
│   └── cache/                     # Global cache
│       ├── thumbnails/           # Video thumbnails
│       ├── transcripts/          # Cached transcripts
│       └── temp/                 # Temporary files
│
└── Backups/                       # Automated backups
    ├── daily/                     # Daily backups
    ├── weekly/                    # Weekly backups
    └── manual/                    # Manual backups
```

## Core File System Manager

```rust
use std::path::{Path, PathBuf};
use std::fs;
use tokio::fs as async_fs;
use serde::{Serialize, Deserialize};
use uuid::Uuid;

pub struct FileSystemManager {
    app_dir: PathBuf,
    data_dir: PathBuf,
    cache_dir: PathBuf,
    backup_dir: PathBuf,
    permissions: FilePermissions,
}

impl FileSystemManager {
    pub async fn new() -> Result<Self, FileSystemError> {
        let app_dir = Self::get_app_directory()?;
        let data_dir = Self::get_data_directory()?;
        let cache_dir = Self::get_cache_directory()?;
        let backup_dir = Self::get_backup_directory()?;

        // Create required directories
        for dir in [&app_dir, &data_dir, &cache_dir, &backup_dir] {
            Self::ensure_directory_exists(dir).await?;
        }

        // Set appropriate permissions
        let permissions = FilePermissions::new();
        permissions.secure_directory(&data_dir).await?;

        Ok(Self {
            app_dir,
            data_dir,
            cache_dir,
            backup_dir,
            permissions,
        })
    }

    // Platform-specific directory resolution
    fn get_app_directory() -> Result<PathBuf, FileSystemError> {
        #[cfg(target_os = "windows")]
        {
            Ok(std::env::current_exe()?
                .parent()
                .ok_or(FileSystemError::InvalidPath)?
                .to_path_buf())
        }

        #[cfg(target_os = "macos")]
        {
            Ok(dirs::home_dir()
                .ok_or(FileSystemError::InvalidPath)?
                .join("Applications")
                .join("RAGMaker.app")
                .join("Contents")
                .join("MacOS"))
        }

        #[cfg(target_os = "linux")]
        {
            Ok(dirs::home_dir()
                .ok_or(FileSystemError::InvalidPath)?
                .join(".local")
                .join("share")
                .join("ragmaker"))
        }
    }

    fn get_data_directory() -> Result<PathBuf, FileSystemError> {
        #[cfg(target_os = "windows")]
        {
            Ok(dirs::data_local_dir()
                .ok_or(FileSystemError::InvalidPath)?
                .join("RAGMaker"))
        }

        #[cfg(target_os = "macos")]
        {
            Ok(dirs::home_dir()
                .ok_or(FileSystemError::InvalidPath)?
                .join("Library")
                .join("Application Support")
                .join("RAGMaker"))
        }

        #[cfg(target_os = "linux")]
        {
            Ok(dirs::data_dir()
                .ok_or(FileSystemError::InvalidPath)?
                .join("ragmaker"))
        }
    }

    pub async fn create_project_structure(&self, project_id: &str) -> Result<ProjectPaths, FileSystemError> {
        let project_dir = self.data_dir.join("projects").join(project_id);
        
        let subdirs = [
            "channels",
            "documents", 
            "embeddings",
            "cache",
            "exports",
        ];

        // Create project directory and subdirectories
        Self::ensure_directory_exists(&project_dir).await?;
        
        for subdir in subdirs {
            Self::ensure_directory_exists(&project_dir.join(subdir)).await?;
        }

        // Create project metadata file
        let project_file = project_dir.join("project.json");
        let initial_metadata = ProjectMetadata {
            id: project_id.to_string(),
            created_at: chrono::Utc::now(),
            version: "1.0.0".to_string(),
            structure_version: 1,
        };
        
        self.write_json_file(&project_file, &initial_metadata).await?;

        Ok(ProjectPaths {
            root: project_dir.clone(),
            channels: project_dir.join("channels"),
            documents: project_dir.join("documents"),
            embeddings: project_dir.join("embeddings"),
            cache: project_dir.join("cache"),
            exports: project_dir.join("exports"),
        })
    }

    pub async fn store_channel_data(
        &self,
        project_id: &str,
        channel_id: &str,
        channel_data: &ChannelData,
    ) -> Result<PathBuf, FileSystemError> {
        let channel_dir = self.data_dir
            .join("projects")
            .join(project_id)
            .join("channels")
            .join(channel_id);

        Self::ensure_directory_exists(&channel_dir).await?;

        // Store channel metadata
        let metadata_file = channel_dir.join("metadata.json");
        self.write_json_file(&metadata_file, &channel_data.metadata).await?;

        // Store video transcripts
        let transcripts_dir = channel_dir.join("transcripts");
        Self::ensure_directory_exists(&transcripts_dir).await?;

        for video in &channel_data.videos {
            let video_file = transcripts_dir.join(format!("{}.json", video.id));
            self.write_json_file(&video_file, video).await?;
        }

        // Store processed chunks
        let chunks_dir = channel_dir.join("chunks");
        Self::ensure_directory_exists(&chunks_dir).await?;

        for chunk in &channel_data.chunks {
            let chunk_file = chunks_dir.join(format!("{}.json", chunk.id));
            self.write_json_file(&chunk_file, chunk).await?;
        }

        Ok(channel_dir)
    }

    pub async fn import_document(
        &self,
        project_id: &str,
        file_path: &Path,
        import_options: ImportOptions,
    ) -> Result<ImportResult, FileSystemError> {
        let project_docs_dir = self.data_dir
            .join("projects")
            .join(project_id)
            .join("documents");

        // Validate file
        self.validate_import_file(file_path, &import_options).await?;

        // Generate unique document ID
        let document_id = Uuid::new_v4().to_string();
        let file_extension = file_path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("unknown");

        // Create document directory
        let doc_dir = project_docs_dir.join(&document_id);
        Self::ensure_directory_exists(&doc_dir).await?;

        // Copy original file
        let stored_file_path = doc_dir.join(format!("original.{}", file_extension));
        async_fs::copy(file_path, &stored_file_path).await?;

        // Extract and store text content
        let text_content = self.extract_text_content(file_path, file_extension).await?;
        let text_file_path = doc_dir.join("content.txt");
        async_fs::write(&text_file_path, &text_content).await?;

        // Create document metadata
        let metadata = DocumentMetadata {
            id: document_id.clone(),
            original_filename: file_path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("unknown")
                .to_string(),
            file_type: file_extension.to_string(),
            file_size: async_fs::metadata(file_path).await?.len(),
            imported_at: chrono::Utc::now(),
            content_hash: self.calculate_content_hash(&text_content).await?,
            processing_status: ProcessingStatus::Pending,
        };

        let metadata_file = doc_dir.join("metadata.json");
        self.write_json_file(&metadata_file, &metadata).await?;

        Ok(ImportResult {
            document_id,
            stored_path: stored_file_path,
            text_content_path: text_file_path,
            metadata,
        })
    }

    async fn extract_text_content(&self, file_path: &Path, file_extension: &str) -> Result<String, FileSystemError> {
        match file_extension.to_lowercase().as_str() {
            "txt" => {
                Ok(async_fs::read_to_string(file_path).await?)
            },
            "pdf" => {
                self.extract_pdf_text(file_path).await
            },
            "docx" => {
                self.extract_docx_text(file_path).await
            },
            "md" | "markdown" => {
                Ok(async_fs::read_to_string(file_path).await?)
            },
            "html" | "htm" => {
                self.extract_html_text(file_path).await
            },
            _ => {
                Err(FileSystemError::UnsupportedFileType(file_extension.to_string()))
            }
        }
    }

    async fn extract_pdf_text(&self, file_path: &Path) -> Result<String, FileSystemError> {
        // Use pdf-extract or similar library
        use pdf_extract::extract_text;
        
        let text = extract_text(file_path)
            .map_err(|e| FileSystemError::ContentExtractionFailed(e.to_string()))?;
        
        Ok(text)
    }

    async fn extract_docx_text(&self, file_path: &Path) -> Result<String, FileSystemError> {
        // Use docx-rs or similar library
        use docx_rs::*;
        
        let docx = read_docx(file_path)
            .map_err(|e| FileSystemError::ContentExtractionFailed(e.to_string()))?;
        
        let text = extract_text_from_docx(docx)?;
        Ok(text)
    }

    async fn extract_html_text(&self, file_path: &Path) -> Result<String, FileSystemError> {
        use scraper::{Html, Selector};
        
        let html_content = async_fs::read_to_string(file_path).await?;
        let document = Html::parse_document(&html_content);
        
        // Remove script and style tags
        let selector = Selector::parse("script, style").unwrap();
        let mut cleaned_html = html_content;
        
        for element in document.select(&selector) {
            cleaned_html = cleaned_html.replace(&element.html(), "");
        }
        
        // Extract text content
        let text_selector = Selector::parse("body").unwrap();
        let text = document.select(&text_selector)
            .next()
            .map(|element| element.text().collect::<Vec<_>>().join(" "))
            .unwrap_or_default();
        
        Ok(text)
    }

    pub async fn cache_embeddings(
        &self,
        project_id: &str,
        embeddings: &[EmbeddingData],
    ) -> Result<PathBuf, FileSystemError> {
        let embeddings_dir = self.data_dir
            .join("projects")
            .join(project_id)
            .join("embeddings");

        Self::ensure_directory_exists(&embeddings_dir).await?;

        // Create embedding batch file
        let batch_id = Uuid::new_v4().to_string();
        let batch_file = embeddings_dir.join(format!("batch_{}.json", batch_id));

        let embedding_batch = EmbeddingBatch {
            id: batch_id,
            created_at: chrono::Utc::now(),
            embeddings: embeddings.to_vec(),
        };

        self.write_json_file(&batch_file, &embedding_batch).await?;

        // Also store in binary format for faster loading
        let binary_file = embeddings_dir.join(format!("batch_{}.bin", embedding_batch.id));
        self.write_binary_embeddings(&binary_file, embeddings).await?;

        Ok(batch_file)
    }

    async fn write_binary_embeddings(
        &self,
        file_path: &Path,
        embeddings: &[EmbeddingData],
    ) -> Result<(), FileSystemError> {
        use byteorder::{LittleEndian, WriteBytesExt};
        
        let mut buffer = Vec::new();
        
        // Write header
        buffer.write_u32::<LittleEndian>(embeddings.len() as u32)?;
        
        // Write embeddings
        for embedding in embeddings {
            // Write ID length and ID
            buffer.write_u32::<LittleEndian>(embedding.id.len() as u32)?;
            buffer.extend_from_slice(embedding.id.as_bytes());
            
            // Write vector length and vector
            buffer.write_u32::<LittleEndian>(embedding.vector.len() as u32)?;
            for value in &embedding.vector {
                buffer.write_f32::<LittleEndian>(*value)?;
            }
            
            // Write metadata
            let metadata_json = serde_json::to_string(&embedding.metadata)?;
            buffer.write_u32::<LittleEndian>(metadata_json.len() as u32)?;
            buffer.extend_from_slice(metadata_json.as_bytes());
        }
        
        async_fs::write(file_path, &buffer).await?;
        Ok(())
    }

    pub async fn export_project_data(
        &self,
        project_id: &str,
        export_options: ExportOptions,
    ) -> Result<PathBuf, FileSystemError> {
        let project_dir = self.data_dir.join("projects").join(project_id);
        let exports_dir = project_dir.join("exports");
        Self::ensure_directory_exists(&exports_dir).await?;

        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let export_filename = format!("export_{}_{}.tar.gz", project_id, timestamp);
        let export_path = exports_dir.join(&export_filename);

        // Create tar.gz archive
        let file = std::fs::File::create(&export_path)?;
        let enc = flate2::write::GzEncoder::new(file, flate2::Compression::default());
        let mut tar = tar::Builder::new(enc);

        // Add project files to archive
        if export_options.include_metadata {
            tar.append_path_with_name(&project_dir.join("project.json"), "project.json")?;
        }

        if export_options.include_channels {
            let channels_dir = project_dir.join("channels");
            if channels_dir.exists() {
                tar.append_dir_all("channels", &channels_dir)?;
            }
        }

        if export_options.include_documents {
            let documents_dir = project_dir.join("documents");
            if documents_dir.exists() {
                tar.append_dir_all("documents", &documents_dir)?;
            }
        }

        if export_options.include_embeddings {
            let embeddings_dir = project_dir.join("embeddings");
            if embeddings_dir.exists() {
                tar.append_dir_all("embeddings", &embeddings_dir)?;
            }
        }

        tar.finish()?;

        Ok(export_path)
    }

    pub async fn cleanup_cache(&self, cleanup_options: CleanupOptions) -> Result<CleanupResult, FileSystemError> {
        let mut cleanup_result = CleanupResult::default();
        let cache_dir = &self.cache_dir;

        // Clean temporary files
        if cleanup_options.clean_temp {
            let temp_dir = cache_dir.join("temp");
            if temp_dir.exists() {
                let cleaned_size = self.clean_directory_contents(&temp_dir).await?;
                cleanup_result.temp_files_cleaned += cleaned_size;
            }
        }

        // Clean old thumbnails
        if cleanup_options.clean_thumbnails {
            let thumbnails_dir = cache_dir.join("thumbnails");
            if thumbnails_dir.exists() {
                let cutoff_date = chrono::Utc::now() - chrono::Duration::days(cleanup_options.thumbnail_retention_days);
                let cleaned_size = self.clean_files_older_than(&thumbnails_dir, cutoff_date).await?;
                cleanup_result.thumbnails_cleaned += cleaned_size;
            }
        }

        // Clean cached transcripts
        if cleanup_options.clean_transcripts {
            let transcripts_dir = cache_dir.join("transcripts");
            if transcripts_dir.exists() {
                let cutoff_date = chrono::Utc::now() - chrono::Duration::days(cleanup_options.transcript_retention_days);
                let cleaned_size = self.clean_files_older_than(&transcripts_dir, cutoff_date).await?;
                cleanup_result.transcripts_cleaned += cleaned_size;
            }
        }

        // Clean old logs
        if cleanup_options.clean_logs {
            let logs_dir = self.data_dir.join("logs");
            if logs_dir.exists() {
                let cutoff_date = chrono::Utc::now() - chrono::Duration::days(cleanup_options.log_retention_days);
                let cleaned_size = self.clean_files_older_than(&logs_dir, cutoff_date).await?;
                cleanup_result.logs_cleaned += cleaned_size;
            }
        }

        Ok(cleanup_result)
    }

    async fn clean_files_older_than(&self, dir: &Path, cutoff_date: chrono::DateTime<chrono::Utc>) -> Result<u64, FileSystemError> {
        let mut total_size_cleaned = 0u64;
        let mut entries = async_fs::read_dir(dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let metadata = entry.metadata().await?;
            if metadata.is_file() {
                let modified_time = metadata.modified()?;
                let modified_datetime: chrono::DateTime<chrono::Utc> = modified_time.into();

                if modified_datetime < cutoff_date {
                    total_size_cleaned += metadata.len();
                    async_fs::remove_file(entry.path()).await?;
                }
            }
        }

        Ok(total_size_cleaned)
    }

    pub async fn create_backup(&self, backup_type: BackupType) -> Result<PathBuf, FileSystemError> {
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let backup_filename = format!("ragmaker_backup_{}_{}.tar.gz", 
                                    backup_type.to_string().to_lowercase(), 
                                    timestamp);
        
        let backup_dir = match backup_type {
            BackupType::Daily => self.backup_dir.join("daily"),
            BackupType::Weekly => self.backup_dir.join("weekly"),
            BackupType::Manual => self.backup_dir.join("manual"),
        };

        Self::ensure_directory_exists(&backup_dir).await?;
        let backup_path = backup_dir.join(&backup_filename);

        // Create compressed backup
        let file = std::fs::File::create(&backup_path)?;
        let enc = flate2::write::GzEncoder::new(file, flate2::Compression::default());
        let mut tar = tar::Builder::new(enc);

        // Backup essential directories
        let backup_dirs = [
            ("projects", self.data_dir.join("projects")),
            ("database", self.data_dir.join("database")),
            ("config", self.data_dir.join("config")),
        ];

        for (name, path) in backup_dirs {
            if path.exists() {
                tar.append_dir_all(name, &path)?;
            }
        }

        tar.finish()?;

        // Clean old backups
        self.cleanup_old_backups(&backup_dir, backup_type).await?;

        Ok(backup_path)
    }

    async fn cleanup_old_backups(&self, backup_dir: &Path, backup_type: BackupType) -> Result<(), FileSystemError> {
        let retention_count = match backup_type {
            BackupType::Daily => 7,   // Keep 7 daily backups
            BackupType::Weekly => 4,  // Keep 4 weekly backups
            BackupType::Manual => 10, // Keep 10 manual backups
        };

        let mut entries: Vec<_> = async_fs::read_dir(backup_dir)
            .await?
            .collect::<Result<Vec<_>, _>>()
            .await?;

        // Sort by creation time (newest first)
        entries.sort_by_key(|entry| {
            entry.metadata()
                .and_then(|m| m.created())
                .unwrap_or(std::time::UNIX_EPOCH)
        });
        entries.reverse();

        // Remove old backups
        for entry in entries.into_iter().skip(retention_count) {
            async_fs::remove_file(entry.path()).await?;
        }

        Ok(())
    }
}

// Supporting Data Structures
#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectMetadata {
    pub id: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub version: String,
    pub structure_version: u32,
}

#[derive(Debug)]
pub struct ProjectPaths {
    pub root: PathBuf,
    pub channels: PathBuf,
    pub documents: PathBuf,
    pub embeddings: PathBuf,
    pub cache: PathBuf,
    pub exports: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub id: String,
    pub original_filename: String,
    pub file_type: String,
    pub file_size: u64,
    pub imported_at: chrono::DateTime<chrono::Utc>,
    pub content_hash: String,
    pub processing_status: ProcessingStatus,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ProcessingStatus {
    Pending,
    Processing,
    Completed,
    Failed(String),
}

pub struct ImportOptions {
    pub max_file_size: u64,
    pub allowed_extensions: Vec<String>,
    pub extract_metadata: bool,
}

pub struct ImportResult {
    pub document_id: String,
    pub stored_path: PathBuf,
    pub text_content_path: PathBuf,
    pub metadata: DocumentMetadata,
}

pub struct ExportOptions {
    pub include_metadata: bool,
    pub include_channels: bool,
    pub include_documents: bool,
    pub include_embeddings: bool,
}

#[derive(Debug)]
pub enum BackupType {
    Daily,
    Weekly,
    Manual,
}

impl std::fmt::Display for BackupType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BackupType::Daily => write!(f, "Daily"),
            BackupType::Weekly => write!(f, "Weekly"),
            BackupType::Manual => write!(f, "Manual"),
        }
    }
}

pub struct CleanupOptions {
    pub clean_temp: bool,
    pub clean_thumbnails: bool,
    pub clean_transcripts: bool,
    pub clean_logs: bool,
    pub thumbnail_retention_days: i64,
    pub transcript_retention_days: i64,
    pub log_retention_days: i64,
}

#[derive(Default)]
pub struct CleanupResult {
    pub temp_files_cleaned: u64,
    pub thumbnails_cleaned: u64,
    pub transcripts_cleaned: u64,
    pub logs_cleaned: u64,
}
```

This Local File System Integration specification provides a comprehensive solution for managing all file operations in the standalone RAGMaker desktop application, ensuring data integrity, efficient storage, and cross-platform compatibility.
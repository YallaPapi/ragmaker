# Offline-First Functionality with Cloud Sync Architecture

## Overview

The Offline-First Cloud Sync system enables RAGMaker to operate completely offline while providing optional cloud synchronization capabilities. This ensures users can work without internet connectivity while maintaining the ability to backup, share, and synchronize their data across devices.

## Architecture Principles

### Offline-First Design
1. **Complete Local Functionality**: All features work without internet connection
2. **Local Data Authority**: Local data is the primary source of truth
3. **Graceful Degradation**: Internet-dependent features fail gracefully
4. **Conflict Resolution**: Intelligent handling of data conflicts during sync
5. **Incremental Sync**: Only changed data is synchronized

### Cloud Sync Strategy
1. **Optional Integration**: Cloud sync is completely optional
2. **Provider Agnostic**: Support for multiple cloud storage providers
3. **End-to-End Encryption**: User data is encrypted before leaving the device
4. **Conflict Resolution**: Automatic and manual conflict resolution strategies
5. **Bandwidth Optimization**: Efficient data transfer and compression

## System Architecture

```
Offline-First Cloud Sync Architecture
├── Local Data Layer
│   ├── SQLite Database
│   ├── Vector Store (Qdrant)
│   ├── File System Storage
│   └── Local Cache
├── Sync Engine
│   ├── Change Detection
│   ├── Conflict Resolution
│   ├── Data Serialization
│   └── Progress Tracking
├── Cloud Adapters
│   ├── Google Drive Adapter
│   ├── Dropbox Adapter
│   ├── OneDrive Adapter
│   ├── AWS S3 Adapter
│   └── Custom Provider Adapter
├── Encryption Layer
│   ├── Key Management
│   ├── Data Encryption
│   ├── Metadata Protection
│   └── Secure Storage
└── Conflict Resolution
    ├── Automatic Resolution
    ├── User-Guided Resolution
    ├── Version Management
    └── Rollback Capabilities
```

## Core Sync Engine

```rust
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};

pub struct SyncEngine {
    local_storage: Arc<LocalStorage>,
    cloud_adapters: HashMap<String, Box<dyn CloudAdapter>>,
    encryption: Arc<EncryptionManager>,
    conflict_resolver: Arc<ConflictResolver>,
    sync_state: Arc<RwLock<SyncState>>,
    change_detector: ChangeDetector,
    progress_tracker: Arc<Mutex<SyncProgressTracker>>,
}

impl SyncEngine {
    pub async fn new(
        local_storage: Arc<LocalStorage>,
        encryption: Arc<EncryptionManager>,
    ) -> Result<Self, SyncError> {
        let mut cloud_adapters: HashMap<String, Box<dyn CloudAdapter>> = HashMap::new();
        
        // Initialize available cloud adapters
        cloud_adapters.insert("googledrive".to_string(), Box::new(GoogleDriveAdapter::new()));
        cloud_adapters.insert("dropbox".to_string(), Box::new(DropboxAdapter::new()));
        cloud_adapters.insert("onedrive".to_string(), Box::new(OneDriveAdapter::new()));
        cloud_adapters.insert("s3".to_string(), Box::new(S3Adapter::new()));

        Ok(Self {
            local_storage,
            cloud_adapters,
            encryption,
            conflict_resolver: Arc::new(ConflictResolver::new()),
            sync_state: Arc::new(RwLock::new(SyncState::default())),
            change_detector: ChangeDetector::new(),
            progress_tracker: Arc::new(Mutex::new(SyncProgressTracker::new())),
        })
    }

    pub async fn enable_sync(&self, config: SyncConfiguration) -> Result<(), SyncError> {
        // Validate configuration
        self.validate_sync_config(&config).await?;

        // Test connection to cloud provider
        let adapter = self.get_cloud_adapter(&config.provider)?;
        adapter.test_connection(&config.credentials).await?;

        // Initialize cloud storage structure
        self.initialize_cloud_structure(&config).await?;

        // Update sync state
        {
            let mut state = self.sync_state.write().await;
            state.enabled = true;
            state.provider = Some(config.provider.clone());
            state.config = Some(config);
            state.last_sync_attempt = None;
            state.last_successful_sync = None;
        }

        // Perform initial sync
        self.perform_initial_sync().await?;

        Ok(())
    }

    pub async fn sync_project(&self, project_id: &str) -> Result<SyncResult, SyncError> {
        let sync_session_id = uuid::Uuid::new_v4().to_string();
        
        // Initialize progress tracking
        {
            let mut tracker = self.progress_tracker.lock().await;
            tracker.start_session(sync_session_id.clone(), project_id.to_string());
        }

        // Get sync configuration
        let sync_config = {
            let state = self.sync_state.read().await;
            state.config.clone().ok_or(SyncError::NotConfigured)?
        };

        let cloud_adapter = self.get_cloud_adapter(&sync_config.provider)?;

        // Phase 1: Detect local changes
        self.update_progress(&sync_session_id, SyncPhase::DetectingChanges, 10).await;
        let local_changes = self.change_detector.detect_changes(project_id).await?;

        // Phase 2: Fetch remote changes
        self.update_progress(&sync_session_id, SyncPhase::FetchingRemoteChanges, 20).await;
        let remote_changes = cloud_adapter.get_changes_since(
            project_id,
            self.get_last_sync_timestamp(project_id).await?
        ).await?;

        // Phase 3: Resolve conflicts
        self.update_progress(&sync_session_id, SyncPhase::ResolvingConflicts, 40).await;
        let resolution_plan = self.conflict_resolver
            .resolve_conflicts(local_changes, remote_changes)
            .await?;

        // Phase 4: Apply remote changes locally
        self.update_progress(&sync_session_id, SyncPhase::ApplyingRemoteChanges, 60).await;
        self.apply_remote_changes(project_id, &resolution_plan.remote_to_local).await?;

        // Phase 5: Upload local changes
        self.update_progress(&sync_session_id, SyncPhase::UploadingLocalChanges, 80).await;
        self.upload_local_changes(project_id, &resolution_plan.local_to_remote, cloud_adapter.as_ref()).await?;

        // Phase 6: Update sync metadata
        self.update_progress(&sync_session_id, SyncPhase::FinalizingSync, 95).await;
        self.update_sync_metadata(project_id).await?;

        // Phase 7: Complete
        self.update_progress(&sync_session_id, SyncPhase::Complete, 100).await;

        let sync_result = SyncResult {
            session_id: sync_session_id,
            project_id: project_id.to_string(),
            sync_type: SyncType::Incremental,
            conflicts_resolved: resolution_plan.conflicts.len(),
            items_uploaded: resolution_plan.local_to_remote.len(),
            items_downloaded: resolution_plan.remote_to_local.len(),
            bytes_transferred: resolution_plan.total_bytes_transferred,
            duration: std::time::Instant::now().elapsed(),
            status: SyncStatus::Success,
            errors: Vec::new(),
        };

        Ok(sync_result)
    }

    async fn apply_remote_changes(
        &self,
        project_id: &str,
        remote_changes: &[RemoteChange]
    ) -> Result<(), SyncError> {
        for change in remote_changes {
            match change.change_type {
                ChangeType::Create => {
                    self.apply_remote_create(project_id, change).await?;
                },
                ChangeType::Update => {
                    self.apply_remote_update(project_id, change).await?;
                },
                ChangeType::Delete => {
                    self.apply_remote_delete(project_id, change).await?;
                },
            }
        }
        Ok(())
    }

    async fn apply_remote_create(&self, project_id: &str, change: &RemoteChange) -> Result<(), SyncError> {
        match change.entity_type {
            EntityType::Project => {
                let decrypted_data = self.encryption.decrypt(&change.data).await?;
                let project_data: ProjectData = serde_json::from_slice(&decrypted_data)?;
                self.local_storage.create_project_from_sync(project_data).await?;
            },
            EntityType::Channel => {
                let decrypted_data = self.encryption.decrypt(&change.data).await?;
                let channel_data: ChannelData = serde_json::from_slice(&decrypted_data)?;
                self.local_storage.create_channel_from_sync(project_id, channel_data).await?;
            },
            EntityType::Document => {
                let decrypted_data = self.encryption.decrypt(&change.data).await?;
                let document_data: DocumentData = serde_json::from_slice(&decrypted_data)?;
                self.local_storage.create_document_from_sync(project_id, document_data).await?;
            },
            EntityType::Embedding => {
                let decrypted_data = self.encryption.decrypt(&change.data).await?;
                let embedding_data: EmbeddingData = serde_json::from_slice(&decrypted_data)?;
                self.local_storage.create_embedding_from_sync(project_id, embedding_data).await?;
            },
        }
        Ok(())
    }

    async fn upload_local_changes(
        &self,
        project_id: &str,
        local_changes: &[LocalChange],
        cloud_adapter: &dyn CloudAdapter
    ) -> Result<(), SyncError> {
        for change in local_changes {
            let encrypted_data = self.encryption.encrypt(&change.data).await?;
            
            let cloud_change = CloudChange {
                id: change.id.clone(),
                entity_type: change.entity_type,
                change_type: change.change_type,
                data: encrypted_data,
                checksum: self.calculate_checksum(&change.data),
                timestamp: change.timestamp,
                metadata: change.metadata.clone(),
            };

            cloud_adapter.upload_change(project_id, cloud_change).await?;
        }
        Ok(())
    }

    pub async fn resolve_conflicts_interactively(
        &self,
        project_id: &str,
        conflicts: Vec<Conflict>
    ) -> Result<Vec<ConflictResolution>, SyncError> {
        let mut resolutions = Vec::new();

        for conflict in conflicts {
            let resolution = match conflict.resolution_strategy {
                ResolutionStrategy::Automatic => {
                    self.resolve_conflict_automatically(&conflict).await?
                },
                ResolutionStrategy::UserInput => {
                    self.request_user_resolution(&conflict).await?
                },
                ResolutionStrategy::KeepBoth => {
                    self.resolve_keep_both(&conflict).await?
                },
            };
            
            resolutions.push(resolution);
        }

        Ok(resolutions)
    }

    async fn resolve_conflict_automatically(&self, conflict: &Conflict) -> Result<ConflictResolution, SyncError> {
        match conflict.conflict_type {
            ConflictType::TimestampMismatch => {
                // Use most recent timestamp
                if conflict.local_timestamp > conflict.remote_timestamp {
                    Ok(ConflictResolution::UseLocal)
                } else {
                    Ok(ConflictResolution::UseRemote)
                }
            },
            ConflictType::ContentMismatch => {
                // Use larger file size (assumes more complete data)
                if conflict.local_size > conflict.remote_size {
                    Ok(ConflictResolution::UseLocal)
                } else {
                    Ok(ConflictResolution::UseRemote)
                }
            },
            ConflictType::StructuralConflict => {
                // Always prefer local for structural changes
                Ok(ConflictResolution::UseLocal)
            },
        }
    }

    pub async fn export_project_for_sync(&self, project_id: &str) -> Result<SyncPackage, SyncError> {
        // Gather all project data
        let project_data = self.local_storage.export_project_data(project_id).await?;
        
        // Create sync package
        let mut sync_package = SyncPackage {
            project_id: project_id.to_string(),
            created_at: Utc::now(),
            format_version: "1.0".to_string(),
            items: Vec::new(),
        };

        // Add project metadata
        sync_package.items.push(SyncItem {
            id: project_id.to_string(),
            entity_type: EntityType::Project,
            data: self.encryption.encrypt(&serde_json::to_vec(&project_data.metadata)?).await?,
            checksum: self.calculate_checksum(&serde_json::to_vec(&project_data.metadata)?),
            size: serde_json::to_vec(&project_data.metadata)?.len() as u64,
        });

        // Add channels
        for channel in project_data.channels {
            sync_package.items.push(SyncItem {
                id: channel.id.clone(),
                entity_type: EntityType::Channel,
                data: self.encryption.encrypt(&serde_json::to_vec(&channel)?).await?,
                checksum: self.calculate_checksum(&serde_json::to_vec(&channel)?),
                size: serde_json::to_vec(&channel)?.len() as u64,
            });
        }

        // Add documents
        for document in project_data.documents {
            sync_package.items.push(SyncItem {
                id: document.id.clone(),
                entity_type: EntityType::Document,
                data: self.encryption.encrypt(&serde_json::to_vec(&document)?).await?,
                checksum: self.calculate_checksum(&serde_json::to_vec(&document)?),
                size: serde_json::to_vec(&document)?.len() as u64,
            });
        }

        // Add embeddings in batches to manage size
        for embedding_batch in project_data.embeddings.chunks(1000) {
            let batch_id = uuid::Uuid::new_v4().to_string();
            sync_package.items.push(SyncItem {
                id: batch_id,
                entity_type: EntityType::Embedding,
                data: self.encryption.encrypt(&serde_json::to_vec(&embedding_batch)?).await?,
                checksum: self.calculate_checksum(&serde_json::to_vec(&embedding_batch)?),
                size: serde_json::to_vec(&embedding_batch)?.len() as u64,
            });
        }

        Ok(sync_package)
    }

    pub async fn import_project_from_sync(&self, sync_package: SyncPackage) -> Result<String, SyncError> {
        // Validate package
        self.validate_sync_package(&sync_package).await?;

        // Create new project ID if importing
        let new_project_id = uuid::Uuid::new_v4().to_string();

        // Process each item in the package
        for item in sync_package.items {
            let decrypted_data = self.encryption.decrypt(&item.data).await?;
            
            // Verify checksum
            let actual_checksum = self.calculate_checksum(&decrypted_data);
            if actual_checksum != item.checksum {
                return Err(SyncError::ChecksumMismatch);
            }

            match item.entity_type {
                EntityType::Project => {
                    let project_data: ProjectData = serde_json::from_slice(&decrypted_data)?;
                    self.local_storage.import_project_data(&new_project_id, project_data).await?;
                },
                EntityType::Channel => {
                    let channel_data: ChannelData = serde_json::from_slice(&decrypted_data)?;
                    self.local_storage.import_channel_data(&new_project_id, channel_data).await?;
                },
                EntityType::Document => {
                    let document_data: DocumentData = serde_json::from_slice(&decrypted_data)?;
                    self.local_storage.import_document_data(&new_project_id, document_data).await?;
                },
                EntityType::Embedding => {
                    let embedding_data: Vec<EmbeddingData> = serde_json::from_slice(&decrypted_data)?;
                    self.local_storage.import_embedding_data(&new_project_id, embedding_data).await?;
                },
            }
        }

        Ok(new_project_id)
    }

    async fn update_progress(&self, session_id: &str, phase: SyncPhase, progress: u8) {
        let mut tracker = self.progress_tracker.lock().await;
        tracker.update_progress(session_id.to_string(), phase, progress);
    }
}

// Cloud Storage Adapters
#[async_trait]
pub trait CloudAdapter: Send + Sync {
    fn name(&self) -> &str;
    async fn test_connection(&self, credentials: &CloudCredentials) -> Result<(), CloudError>;
    async fn upload_file(&self, path: &str, data: Vec<u8>) -> Result<CloudFile, CloudError>;
    async fn download_file(&self, path: &str) -> Result<Vec<u8>, CloudError>;
    async fn list_files(&self, path: &str) -> Result<Vec<CloudFile>, CloudError>;
    async fn delete_file(&self, path: &str) -> Result<(), CloudError>;
    async fn get_changes_since(&self, project_id: &str, since: DateTime<Utc>) -> Result<Vec<RemoteChange>, CloudError>;
    async fn upload_change(&self, project_id: &str, change: CloudChange) -> Result<(), CloudError>;
}

pub struct GoogleDriveAdapter {
    client: Option<google_drive3::DriveHub>,
}

#[async_trait]
impl CloudAdapter for GoogleDriveAdapter {
    fn name(&self) -> &str {
        "Google Drive"
    }

    async fn test_connection(&self, credentials: &CloudCredentials) -> Result<(), CloudError> {
        // Implement Google Drive authentication test
        let auth = self.authenticate(credentials).await?;
        
        // Test by listing the root directory
        let drive_hub = google_drive3::DriveHub::new(
            hyper::Client::builder().build(
                hyper_rustls::HttpsConnectorBuilder::new()
                    .with_native_roots()
                    .https_or_http()
                    .enable_http1()
                    .build()
            ),
            auth
        );

        let result = drive_hub.files()
            .list()
            .param("pageSize", "1")
            .doit()
            .await;

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(CloudError::AuthenticationFailed(e.to_string())),
        }
    }

    async fn upload_file(&self, path: &str, data: Vec<u8>) -> Result<CloudFile, CloudError> {
        let client = self.client.as_ref().ok_or(CloudError::NotInitialized)?;
        
        // Create file metadata
        let file_metadata = google_drive3::api::File {
            name: Some(path.split('/').last().unwrap_or(path).to_string()),
            parents: Some(vec![self.get_folder_id_from_path(path).await?]),
            ..Default::default()
        };

        // Upload file
        let result = client.files()
            .create(file_metadata)
            .upload_resumable(
                std::io::Cursor::new(data.clone()),
                "application/octet-stream".parse().unwrap()
            )
            .await;

        match result {
            Ok((_, file)) => {
                Ok(CloudFile {
                    id: file.id.unwrap_or_default(),
                    name: file.name.unwrap_or_default(),
                    size: file.size.map(|s| s as u64).unwrap_or(data.len() as u64),
                    modified_time: file.modified_time.and_then(|t| {
                        DateTime::parse_from_rfc3339(&t).ok().map(|dt| dt.with_timezone(&Utc))
                    }),
                    path: path.to_string(),
                })
            },
            Err(e) => Err(CloudError::UploadFailed(e.to_string())),
        }
    }

    async fn download_file(&self, path: &str) -> Result<Vec<u8>, CloudError> {
        let client = self.client.as_ref().ok_or(CloudError::NotInitialized)?;
        
        // Find file by path
        let file_id = self.find_file_id_by_path(path).await?;
        
        // Download file content
        let result = client.files()
            .get(&file_id)
            .param("alt", "media")
            .doit()
            .await;

        match result {
            Ok((response, _)) => {
                let mut body = Vec::new();
                use futures::StreamExt;
                let mut stream = response.into_body();
                while let Some(chunk) = stream.next().await {
                    let chunk = chunk.map_err(|e| CloudError::DownloadFailed(e.to_string()))?;
                    body.extend_from_slice(&chunk);
                }
                Ok(body)
            },
            Err(e) => Err(CloudError::DownloadFailed(e.to_string())),
        }
    }

    async fn list_files(&self, path: &str) -> Result<Vec<CloudFile>, CloudError> {
        let client = self.client.as_ref().ok_or(CloudError::NotInitialized)?;
        
        let folder_id = self.get_folder_id_from_path(path).await?;
        
        let result = client.files()
            .list()
            .param("q", &format!("'{}' in parents", folder_id))
            .doit()
            .await;

        match result {
            Ok((_, file_list)) => {
                let mut cloud_files = Vec::new();
                
                if let Some(files) = file_list.files {
                    for file in files {
                        cloud_files.push(CloudFile {
                            id: file.id.unwrap_or_default(),
                            name: file.name.unwrap_or_default(),
                            size: file.size.map(|s| s as u64).unwrap_or(0),
                            modified_time: file.modified_time.and_then(|t| {
                                DateTime::parse_from_rfc3339(&t).ok().map(|dt| dt.with_timezone(&Utc))
                            }),
                            path: format!("{}/{}", path, file.name.unwrap_or_default()),
                        });
                    }
                }
                
                Ok(cloud_files)
            },
            Err(e) => Err(CloudError::ListFailed(e.to_string())),
        }
    }

    async fn delete_file(&self, path: &str) -> Result<(), CloudError> {
        let client = self.client.as_ref().ok_or(CloudError::NotInitialized)?;
        
        let file_id = self.find_file_id_by_path(path).await?;
        
        let result = client.files()
            .delete(&file_id)
            .doit()
            .await;

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(CloudError::DeleteFailed(e.to_string())),
        }
    }

    async fn get_changes_since(&self, project_id: &str, since: DateTime<Utc>) -> Result<Vec<RemoteChange>, CloudError> {
        // Implement change detection logic for Google Drive
        // This would involve listing files and comparing modification times
        let project_folder_path = format!("ragmaker/{}", project_id);
        let files = self.list_files(&project_folder_path).await?;
        
        let mut changes = Vec::new();
        
        for file in files {
            if let Some(modified_time) = file.modified_time {
                if modified_time > since {
                    // Determine change type by comparing with local state
                    let change_type = self.determine_change_type(&file).await?;
                    
                    changes.push(RemoteChange {
                        id: file.id.clone(),
                        entity_type: self.determine_entity_type(&file.name)?,
                        change_type,
                        data: self.download_file(&file.path).await?,
                        timestamp: modified_time,
                        checksum: None, // Would need to be stored in metadata
                        metadata: HashMap::new(),
                    });
                }
            }
        }
        
        Ok(changes)
    }

    async fn upload_change(&self, project_id: &str, change: CloudChange) -> Result<(), CloudError> {
        let file_path = format!("ragmaker/{}/{}/{}", project_id, change.entity_type.to_string(), change.id);
        self.upload_file(&file_path, change.data).await?;
        Ok(())
    }
}

// Encryption Manager
pub struct EncryptionManager {
    master_key: Arc<Mutex<Option<[u8; 32]>>>,
    key_derivation: KeyDerivation,
}

impl EncryptionManager {
    pub async fn new() -> Result<Self, EncryptionError> {
        Ok(Self {
            master_key: Arc::new(Mutex::new(None)),
            key_derivation: KeyDerivation::new(),
        })
    }

    pub async fn set_master_key(&self, password: &str) -> Result<(), EncryptionError> {
        let key = self.key_derivation.derive_key(password.as_bytes())?;
        *self.master_key.lock().await = Some(key);
        Ok(())
    }

    pub async fn encrypt(&self, data: &[u8]) -> Result<Vec<u8>, EncryptionError> {
        let master_key = self.master_key.lock().await;
        let key = master_key.as_ref().ok_or(EncryptionError::KeyNotSet)?;
        
        use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
        use aes_gcm::aead::{Aead, OsRng, generic_array::GenericArray};
        
        let cipher = Aes256Gcm::new(GenericArray::from_slice(key));
        let nonce = Nonce::from_slice(&rand::random::<[u8; 12]>());
        
        let ciphertext = cipher.encrypt(nonce, data)
            .map_err(|e| EncryptionError::EncryptionFailed(e.to_string()))?;
        
        // Prepend nonce to ciphertext
        let mut result = Vec::new();
        result.extend_from_slice(nonce.as_slice());
        result.extend_from_slice(&ciphertext);
        
        Ok(result)
    }

    pub async fn decrypt(&self, encrypted_data: &[u8]) -> Result<Vec<u8>, EncryptionError> {
        if encrypted_data.len() < 12 {
            return Err(EncryptionError::InvalidData);
        }

        let master_key = self.master_key.lock().await;
        let key = master_key.as_ref().ok_or(EncryptionError::KeyNotSet)?;
        
        use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
        use aes_gcm::aead::{Aead, generic_array::GenericArray};
        
        let cipher = Aes256Gcm::new(GenericArray::from_slice(key));
        let nonce = Nonce::from_slice(&encrypted_data[0..12]);
        let ciphertext = &encrypted_data[12..];
        
        let plaintext = cipher.decrypt(nonce, ciphertext)
            .map_err(|e| EncryptionError::DecryptionFailed(e.to_string()))?;
        
        Ok(plaintext)
    }
}

// Supporting Data Structures
#[derive(Debug, Clone)]
pub struct SyncConfiguration {
    pub provider: String,
    pub credentials: CloudCredentials,
    pub encryption_enabled: bool,
    pub auto_sync: bool,
    pub sync_interval_minutes: u32,
    pub bandwidth_limit_mbps: Option<f32>,
    pub conflict_resolution: ConflictResolutionStrategy,
}

#[derive(Debug, Clone)]
pub enum ConflictResolutionStrategy {
    AutomaticLocal,
    AutomaticRemote,
    AutomaticTimestamp,
    Manual,
    KeepBoth,
}

#[derive(Debug)]
pub struct SyncResult {
    pub session_id: String,
    pub project_id: String,
    pub sync_type: SyncType,
    pub conflicts_resolved: usize,
    pub items_uploaded: usize,
    pub items_downloaded: usize,
    pub bytes_transferred: u64,
    pub duration: std::time::Duration,
    pub status: SyncStatus,
    pub errors: Vec<SyncError>,
}

#[derive(Debug)]
pub enum SyncType {
    Initial,
    Incremental,
    FullSync,
}

#[derive(Debug)]
pub enum SyncStatus {
    Success,
    PartialSuccess,
    Failed,
}

#[derive(Debug)]
pub enum SyncPhase {
    DetectingChanges,
    FetchingRemoteChanges,
    ResolvingConflicts,
    ApplyingRemoteChanges,
    UploadingLocalChanges,
    FinalizingSync,
    Complete,
}
```

This Offline-First Cloud Sync specification provides a comprehensive framework for maintaining full offline functionality while enabling optional cloud synchronization with strong encryption and conflict resolution capabilities.
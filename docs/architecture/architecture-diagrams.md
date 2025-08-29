# RAGMaker Standalone Desktop - Architecture Diagrams

## System Overview Architecture

```mermaid
graph TB
    subgraph "User Interface Layer"
        UI[Desktop UI - Tauri + React]
        TrayIcon[System Tray]
        Notifications[Native Notifications]
    end
    
    subgraph "Application Layer"
        AppCore[Application Core]
        ProjectMgr[Project Manager]
        ContentMgr[Content Manager]
        ModelMgr[Model Manager]
        SyncMgr[Sync Manager]
    end
    
    subgraph "Business Logic Layer"
        RAGEngine[Local RAG Engine]
        YouTubeProcessor[YouTube Processor]
        EmbeddingGen[Embedding Generator]
        ConflictResolver[Conflict Resolver]
    end
    
    subgraph "Data Layer"
        SQLite[(SQLite Database)]
        VectorDB[(Qdrant Vector DB)]
        FileSystem[File System Storage]
        Cache[Local Cache]
    end
    
    subgraph "AI Models Layer"
        OllamaServer[Ollama Server]
        ChatModels[Chat Models]
        EmbedModels[Embedding Models]
        ModelRegistry[Model Registry]
    end
    
    subgraph "External Integration"
        CloudSync[Cloud Storage Adapters]
        Encryption[Encryption Layer]
    end
    
    UI --> AppCore
    TrayIcon --> AppCore
    Notifications --> AppCore
    
    AppCore --> ProjectMgr
    AppCore --> ContentMgr
    AppCore --> ModelMgr
    AppCore --> SyncMgr
    
    ProjectMgr --> RAGEngine
    ContentMgr --> YouTubeProcessor
    ModelMgr --> EmbeddingGen
    SyncMgr --> ConflictResolver
    
    RAGEngine --> SQLite
    RAGEngine --> VectorDB
    YouTubeProcessor --> FileSystem
    EmbeddingGen --> Cache
    
    RAGEngine --> OllamaServer
    EmbeddingGen --> ChatModels
    EmbeddingGen --> EmbedModels
    ModelMgr --> ModelRegistry
    
    SyncMgr --> CloudSync
    SyncMgr --> Encryption
```

## Component Interaction Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Desktop UI
    participant App as Application Core
    participant RAG as RAG Engine
    participant Models as AI Models
    participant DB as Local Database
    participant FS as File System
    
    User->>UI: Query Request
    UI->>App: Process Query
    App->>RAG: Execute RAG Query
    
    RAG->>DB: Search Vector Database
    DB-->>RAG: Relevant Chunks
    
    RAG->>Models: Generate Response
    Models-->>RAG: LLM Response
    
    RAG->>DB: Log Chat History
    RAG-->>App: Final Response
    App-->>UI: Display Result
    UI-->>User: Show Response
```

## YouTube Content Processing Pipeline

```mermaid
flowchart TD
    Start([User Adds Channel]) --> Validate{Validate Channel}
    Validate -->|Invalid| Error[Show Error]
    Validate -->|Valid| FetchVideos[Fetch Video List]
    
    FetchVideos --> FilterVideos{Apply Filters}
    FilterVideos -->|Exclude Shorts| FilterShorts[Remove Short Videos]
    FilterVideos -->|Include All| ProcessAll[Process All Videos]
    FilterShorts --> ProcessFiltered[Process Filtered Videos]
    
    ProcessAll --> ExtractTranscripts[Extract Transcripts]
    ProcessFiltered --> ExtractTranscripts
    
    ExtractTranscripts --> ChunkContent[Chunk Content]
    ChunkContent --> GenerateEmbeddings[Generate Embeddings]
    GenerateEmbeddings --> StoreVectors[Store in Vector DB]
    StoreVectors --> UpdateMetadata[Update Database]
    UpdateMetadata --> Complete([Indexing Complete])
    
    ExtractTranscripts -->|No Transcript| SkipVideo[Skip Video]
    SkipVideo --> LogFailure[Log Failure Reason]
    LogFailure --> NextVideo{More Videos?}
    NextVideo -->|Yes| ExtractTranscripts
    NextVideo -->|No| Complete
```

## Local RAG Query Processing

```mermaid
flowchart LR
    subgraph "Query Processing"
        Query[User Query] --> Embed[Generate Query Embedding]
        Embed --> Search[Vector Similarity Search]
    end
    
    subgraph "Context Building"
        Search --> Retrieve[Retrieve Top-K Chunks]
        Retrieve --> Filter[Apply Relevance Filters]
        Filter --> Rank[Re-rank Results]
        Rank --> Context[Build Context Window]
    end
    
    subgraph "Response Generation"
        Context --> Template[Apply Prompt Template]
        Template --> LLM[Local LLM Generation]
        LLM --> PostProcess[Post-process Response]
        PostProcess --> Response[Final Response]
    end
    
    subgraph "Storage & Learning"
        Response --> Store[Store Chat History]
        Store --> UpdateStats[Update Performance Metrics]
        UpdateStats --> Cache[Update Cache]
    end
```

## Data Storage Architecture

```mermaid
erDiagram
    PROJECTS {
        string id PK
        string name
        string description
        datetime created_at
        datetime updated_at
        json settings
        string rag_profile
        string embedding_model
        string chat_model
        string status
        boolean is_favorite
        integer total_documents
        integer total_channels
        string local_path
    }
    
    CHANNELS {
        string id PK
        string project_id FK
        string channel_id
        string channel_name
        string channel_url
        integer video_count
        integer indexed_video_count
        datetime indexed_at
        string processing_status
        boolean auto_update
    }
    
    VIDEOS {
        string id PK
        string channel_id FK
        string project_id FK
        string video_id
        string title
        text description
        integer duration_seconds
        datetime published_at
        string transcript_status
        string embedding_status
        integer chunk_count
        string transcript_file_path
    }
    
    DOCUMENTS {
        string id PK
        string project_id FK
        string title
        string filename
        string file_path
        string content_hash
        string file_type
        integer file_size_bytes
        text text_content
        string processing_status
        integer chunk_count
        datetime imported_at
    }
    
    EMBEDDINGS_METADATA {
        string id PK
        string project_id FK
        string source_type
        string source_id FK
        string chunk_id
        integer chunk_index
        string vector_id
        string embedding_model
        integer embedding_dimensions
        text content_preview
        datetime created_at
    }
    
    CHAT_HISTORY {
        string id PK
        string project_id FK
        text user_message
        text assistant_response
        json context_chunks
        json sources
        string model_used
        integer tokens_used
        integer generation_time_ms
        real confidence_score
        integer user_rating
        datetime created_at
    }
    
    PROJECTS ||--o{ CHANNELS : contains
    PROJECTS ||--o{ DOCUMENTS : contains
    PROJECTS ||--o{ EMBEDDINGS_METADATA : contains
    PROJECTS ||--o{ CHAT_HISTORY : contains
    CHANNELS ||--o{ VIDEOS : contains
    VIDEOS ||--o{ EMBEDDINGS_METADATA : source
    DOCUMENTS ||--o{ EMBEDDINGS_METADATA : source
```

## File System Organization

```mermaid
graph TD
    subgraph "Application Directory"
        App[ragmaker.exe] --> Libs[libs/]
        App --> Resources[resources/]
        App --> Models[models/]
    end
    
    subgraph "Data Directory"
        Data[Data/] --> Projects[projects/]
        Data --> Database[database/]
        Data --> Config[config/]
        Data --> Logs[logs/]
        Data --> Cache[cache/]
        
        Projects --> Project1[project-1/]
        Projects --> Project2[project-2/]
        
        Project1 --> Channels1[channels/]
        Project1 --> Documents1[documents/]
        Project1 --> Embeddings1[embeddings/]
        Project1 --> Exports1[exports/]
        
        Database --> AppDB[(app.db)]
        Database --> VectorDB[vector-db/]
        Database --> Indexes[indexes/]
        
        Config --> AppConfig[app-config.json]
        Config --> UserPrefs[user-preferences.json]
        Config --> SyncConfig[sync-config.json]
    end
    
    subgraph "Backup Directory"
        Backups[Backups/] --> Daily[daily/]
        Backups --> Weekly[weekly/]
        Backups --> Manual[manual/]
    end
```

## Model Management Flow

```mermaid
stateDiagram-v2
    [*] --> Detecting: System Startup
    Detecting --> Installing: Models Missing
    Detecting --> Loading: Models Available
    
    Installing --> Downloading: Start Download
    Downloading --> Verifying: Download Complete
    Verifying --> Installing: Verification Success
    Verifying --> Failed: Verification Failed
    Installing --> Loading: Installation Success
    
    Loading --> Ready: All Models Loaded
    Loading --> PartialReady: Some Models Loaded
    
    Ready --> Processing: Handle Request
    Processing --> Ready: Request Complete
    
    PartialReady --> Loading: Load Additional Models
    PartialReady --> Processing: Use Available Models
    
    Ready --> Unloading: Memory Pressure
    Unloading --> Standby: Models Unloaded
    Standby --> Loading: New Request
    
    Failed --> Installing: Retry Installation
    Failed --> [*]: Give Up
```

## Cloud Sync Process Flow

```mermaid
flowchart TD
    Start([Sync Triggered]) --> CheckConfig{Sync Configured?}
    CheckConfig -->|No| Disabled[Sync Disabled]
    CheckConfig -->|Yes| DetectChanges[Detect Local Changes]
    
    DetectChanges --> FetchRemote[Fetch Remote Changes]
    FetchRemote --> CompareChanges{Changes Conflict?}
    
    CompareChanges -->|No Conflicts| ApplyChanges[Apply Changes]
    CompareChanges -->|Conflicts Detected| ResolveConflicts[Resolve Conflicts]
    
    ResolveConflicts --> AutoResolve{Auto Resolve?}
    AutoResolve -->|Yes| ApplyResolution[Apply Auto Resolution]
    AutoResolve -->|No| UserResolve[Request User Input]
    
    UserResolve --> ApplyResolution
    ApplyResolution --> ApplyChanges
    
    ApplyChanges --> UploadLocal[Upload Local Changes]
    UploadLocal --> DownloadRemote[Download Remote Changes]
    DownloadRemote --> UpdateMetadata[Update Sync Metadata]
    UpdateMetadata --> Encrypt[Encrypt Data]
    Encrypt --> Complete([Sync Complete])
    
    DetectChanges -->|Error| SyncError[Sync Error]
    FetchRemote -->|Error| SyncError
    UploadLocal -->|Error| SyncError
    DownloadRemote -->|Error| SyncError
    SyncError --> Retry{Retry?}
    Retry -->|Yes| DetectChanges
    Retry -->|No| Failed([Sync Failed])
```

## Performance Monitoring Dashboard

```mermaid
graph LR
    subgraph "Performance Metrics"
        CPU[CPU Usage] --> Monitor[Performance Monitor]
        Memory[Memory Usage] --> Monitor
        Disk[Disk I/O] --> Monitor
        Network[Network Usage] --> Monitor
    end
    
    subgraph "Model Metrics"
        EmbedTime[Embedding Generation Time] --> ModelMonitor[Model Performance]
        QueryTime[Query Response Time] --> ModelMonitor
        ModelLoad[Model Load Time] --> ModelMonitor
        Accuracy[Response Accuracy] --> ModelMonitor
    end
    
    subgraph "System Health"
        Monitor --> Optimizer[Performance Optimizer]
        ModelMonitor --> Optimizer
        
        Optimizer --> MemoryCleanup[Memory Cleanup]
        Optimizer --> ModelSwapping[Model Swapping]
        Optimizer --> CacheOptimization[Cache Optimization]
        Optimizer --> ResourceAllocation[Resource Allocation]
    end
    
    subgraph "User Interface"
        Optimizer --> Dashboard[Performance Dashboard]
        Dashboard --> Recommendations[Optimization Recommendations]
        Dashboard --> Metrics[Real-time Metrics]
        Dashboard --> Alerts[Performance Alerts]
    end
```

## Security Architecture

```mermaid
graph TB
    subgraph "Input Validation"
        UserInput[User Input] --> Sanitize[Input Sanitization]
        FileInput[File Input] --> Validate[File Validation]
    end
    
    subgraph "Authentication & Authorization"
        Sanitize --> AuthCheck[Authentication Check]
        Validate --> AuthCheck
        AuthCheck --> PermCheck[Permission Check]
    end
    
    subgraph "Data Protection"
        PermCheck --> Encrypt[Encryption Layer]
        Encrypt --> Store[Secure Storage]
        Store --> Audit[Audit Logging]
    end
    
    subgraph "Communication Security"
        CloudSync[Cloud Sync] --> TLS[TLS Encryption]
        TLS --> CertValidation[Certificate Validation]
        CertValidation --> SecureChannel[Secure Channel]
    end
    
    subgraph "System Security"
        SecureChannel --> Sandboxing[Process Sandboxing]
        Sandboxing --> Permissions[File Permissions]
        Permissions --> Updates[Security Updates]
    end
    
    Audit --> Monitoring[Security Monitoring]
    Updates --> Monitoring
    Monitoring --> Alerts[Security Alerts]
```

## Deployment Architecture

```mermaid
graph TD
    subgraph "Development"
        Source[Source Code] --> Build[Tauri Build]
        Build --> Package[Package Application]
    end
    
    subgraph "Platform Builds"
        Package --> Windows[Windows Build]
        Package --> macOS[macOS Build]
        Package --> Linux[Linux Build]
    end
    
    subgraph "Distribution"
        Windows --> MSI[MSI Installer]
        Windows --> Portable[Portable Exe]
        
        macOS --> DMG[DMG Image]
        macOS --> AppStore[App Store Package]
        
        Linux --> AppImage[AppImage]
        Linux --> DEB[Debian Package]
        Linux --> RPM[RPM Package]
    end
    
    subgraph "Auto-Updates"
        MSI --> UpdateServer[Update Server]
        DMG --> UpdateServer
        AppImage --> UpdateServer
        
        UpdateServer --> VersionCheck[Version Check]
        VersionCheck --> Download[Download Update]
        Download --> Install[Install Update]
    end
    
    subgraph "Telemetry"
        Install --> Analytics[Usage Analytics]
        Analytics --> Metrics[Performance Metrics]
        Metrics --> Feedback[User Feedback]
    end
```

These comprehensive architecture diagrams provide visual representations of all major components and interactions in the standalone RAGMaker desktop application, from high-level system overview to detailed implementation flows.
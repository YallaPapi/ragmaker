# File System Integration

Comprehensive file system integration for the RagMaker desktop application providing advanced file management, organization, and processing capabilities.

## Components

### Core Services

1. **FileDialogService** (`fileDialogService.js`)
   - Native OS file dialogs for import/export
   - Multiple file selection support
   - Recent files tracking
   - Format filtering and validation

2. **DragDropHandler** (`dragDropHandler.js`)
   - Advanced drag-and-drop file handling
   - Visual feedback and overlays
   - Batch file processing
   - File validation and preview

3. **FileTypeDetector** (`fileTypeDetector.js`)
   - Magic number-based file type detection
   - Content analysis for text files
   - Metadata extraction
   - Confidence scoring

4. **BatchOperationsService** (`batchOperations.js`)
   - Bulk file operations (copy, move, rename, delete)
   - Progress tracking and reporting
   - Error handling and retry logic
   - Queue management

### Management Services

5. **FileManager** (`fileManager.js`)
   - File collections and tagging
   - Auto-organization rules
   - Smart categorization
   - Metadata management

6. **WatchFoldersService** (`watchFoldersService.js`)
   - Automatic folder monitoring
   - Real-time file change detection
   - Batch processing of new files
   - Configurable file filters

7. **VersionControl** (`versionControl.js`)
   - File version history tracking
   - Content-based change detection
   - Version comparison and diff
   - Rollback capabilities

### Search and Discovery

8. **FileSearch** (`fileSearch.js`)
   - Advanced multi-criteria search
   - Full-text content indexing
   - Fuzzy matching algorithms
   - Search history and caching

9. **PreviewGenerator** (`previewGenerator.js`)
   - Thumbnail generation for various formats
   - File preview rendering
   - Content analysis for text files
   - Caching and performance optimization

### User Interface

10. **ContextMenuService** (`contextMenu.js`)
    - File association management
    - Context menu integration
    - Custom action registration
    - System integration

## Features

### File Import/Export
- Native file dialogs with format filtering
- Drag-and-drop support with visual feedback
- Batch file processing with progress tracking
- Multiple format support (documents, images, audio, video, code)

### File Organization
- Automatic categorization by file type
- Tag-based organization system
- Smart collections with rules
- Customizable organization workflows

### Version Control
- Automatic version tracking for important files
- Content-based change detection
- Version history with comments and metadata
- Rollback and comparison capabilities

### Search and Discovery
- Full-text search with indexing
- Advanced filtering by metadata
- Fuzzy matching for filenames
- Search history and suggestions

### File Management
- Bulk operations (copy, move, rename, delete)
- File metadata tracking
- Preview and thumbnail generation
- Watch folder automation

## Usage

```javascript
const FileSystemIntegration = require('./filesystem');

// Initialize filesystem services
const fileSystem = new FileSystemIntegration(windowManager);

await fileSystem.initialize({
  createDefaultCollections: true,
  buildSearchIndex: true,
  indexPaths: ['/path/to/documents'],
  watchFolders: [{
    path: '/path/to/watch',
    options: { recursive: true, autoProcess: true }
  }]
});

// Import files
const files = await fileSystem.importFiles({
  fileTypes: ['documents', 'images'],
  multiSelect: true
});

// Search files
const results = await fileSystem.searchFiles({
  text: 'important document',
  filters: {
    types: ['pdf', 'docx'],
    modifiedAfter: new Date('2024-01-01')
  }
});

// Generate previews
const preview = await fileSystem.generatePreview(filePath);
const thumbnail = await fileSystem.generateThumbnail(filePath, 'large');

// Create collections
const collectionId = fileSystem.createCollection('Research Papers', {
  description: 'Academic research papers',
  autoTag: true
});

// Version tracking
await fileSystem.startVersionTracking(filePath);
const history = fileSystem.getFileVersionHistory(filePath);
```

## Events

The filesystem integration emits various events for UI integration:

```javascript
fileSystem.on('fileSelected', (fileInfo) => {
  // Handle file selection
});

fileSystem.on('dropCompleted', (results) => {
  // Handle drag-drop completion
});

fileSystem.on('searchCompleted', (results) => {
  // Handle search results
});

fileSystem.on('versionCreated', (version) => {
  // Handle new version
});

fileSystem.on('collectionCreated', (collection) => {
  // Handle new collection
});
```

## Configuration

### File Type Support

The system supports automatic detection and processing of:

- **Documents**: PDF, DOC/DOCX, TXT, MD, RTF, ODT
- **Images**: JPG, PNG, GIF, BMP, WEBP, SVG, TIFF
- **Audio**: MP3, WAV, FLAC, AAC, OGG, M4A
- **Video**: MP4, AVI, MKV, MOV, WMV, WEBM
- **Code**: JS, TS, PY, JAVA, CPP, C, H, CSS, HTML, JSON, XML
- **Spreadsheets**: XLSX, XLS, CSV, ODS
- **Presentations**: PPTX, PPT, ODP
- **Archives**: ZIP, RAR, 7Z, TAR, GZ

### Performance Settings

- **Search Index**: Configurable indexing for fast text search
- **Preview Cache**: LRU cache for generated previews and thumbnails
- **Version Storage**: Compressed storage with size limits
- **Batch Processing**: Configurable concurrency limits

### Security Features

- **File Validation**: Magic number verification for file types
- **Safe Operations**: Trash support instead of permanent deletion
- **Permission Checks**: Proper file system permission handling
- **Sandboxing**: Isolated processing for untrusted files

## Dependencies

Required Node.js packages:
- `chokidar` - File system watching
- `sharp` - Image processing
- `canvas` - Canvas-based thumbnail generation

## Integration

The filesystem services integrate with:
- Electron main process for native dialogs
- Renderer process for drag-and-drop UI
- IPC communication for cross-process messaging
- Native OS file associations and context menus

## Architecture

```
FileSystemIntegration
├── Core Services
│   ├── FileDialogService
│   ├── DragDropHandler
│   └── FileTypeDetector
├── Management Services
│   ├── FileManager
│   ├── BatchOperationsService
│   └── WatchFoldersService
├── Advanced Features
│   ├── VersionControl
│   ├── FileSearch
│   └── PreviewGenerator
└── UI Integration
    └── ContextMenuService
```

Each service is designed to be:
- **Modular**: Can be used independently
- **Event-driven**: Emits events for UI integration
- **Performant**: Optimized for large file operations
- **Extensible**: Pluggable architecture for custom features
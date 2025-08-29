// Desktop Drag & Drop Manager
class DragDropManager {
    constructor() {
        this.overlay = null;
        this.isActive = false;
        this.supportedTypes = {
            'text/plain': 'text',
            'application/json': 'json',
            'text/csv': 'csv',
            'application/pdf': 'pdf',
            'text/markdown': 'markdown',
            'image/png': 'image',
            'image/jpeg': 'image',
            'image/gif': 'image',
            'image/webp': 'image',
            'video/mp4': 'video',
            'video/webm': 'video'
        };
        
        this.dropZones = new Map();
        this.globalHandlers = new Map();
        
        this.init();
    }

    init() {
        this.createOverlay();
        this.setupGlobalListeners();
        this.registerGlobalHandlers();
    }

    createOverlay() {
        this.overlay = document.getElementById('dragDropOverlay');
        if (!this.overlay) {
            console.warn('Drag drop overlay not found in DOM');
        }
    }

    setupGlobalListeners() {
        // Prevent default drag behaviors on the entire document
        document.addEventListener('dragenter', this.handleDragEnter.bind(this));
        document.addEventListener('dragover', this.handleDragOver.bind(this));
        document.addEventListener('dragleave', this.handleDragLeave.bind(this));
        document.addEventListener('drop', this.handleDrop.bind(this));
        
        // Prevent default file drag behaviors
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());
    }

    handleDragEnter(event) {
        event.preventDefault();
        
        // Only activate for external drags (files from OS)
        if (this.isExternalDrag(event)) {
            this.activateOverlay(event);
        }
    }

    handleDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        
        if (this.isExternalDrag(event)) {
            this.updateOverlayState(event);
        }
    }

    handleDragLeave(event) {
        event.preventDefault();
        
        // Only deactivate when leaving the window entirely
        if (!event.relatedTarget || event.relatedTarget === document.documentElement) {
            this.deactivateOverlay();
        }
    }

    async handleDrop(event) {
        event.preventDefault();
        this.deactivateOverlay();
        
        if (this.isExternalDrag(event)) {
            await this.processDrop(event);
        }
    }

    isExternalDrag(event) {
        // Check if drag contains files or external data
        return event.dataTransfer.types.includes('Files') ||
               event.dataTransfer.effectAllowed === 'all' ||
               event.dataTransfer.effectAllowed === 'copy';
    }

    activateOverlay(event) {
        if (this.overlay && !this.isActive) {
            this.isActive = true;
            this.overlay.classList.add('active');
            this.updateOverlayContent(event);
        }
    }

    deactivateOverlay() {
        if (this.overlay && this.isActive) {
            this.isActive = false;
            this.overlay.classList.remove('active');
        }
    }

    updateOverlayState(event) {
        if (!this.overlay || !this.isActive) return;
        
        // Update overlay based on what's being dragged
        this.updateOverlayContent(event);
        
        // Check if over a specific drop zone
        const dropZone = this.getDropZoneAt(event.clientX, event.clientY);
        if (dropZone) {
            this.overlay.classList.add('over-zone');
            this.updateOverlayForZone(dropZone);
        } else {
            this.overlay.classList.remove('over-zone');
        }
    }

    updateOverlayContent(event) {
        if (!this.overlay) return;
        
        const types = Array.from(event.dataTransfer.types);
        const fileCount = event.dataTransfer.files?.length || 0;
        
        let icon = '📁';
        let text = 'Drop files here';
        let description = '';
        
        if (fileCount > 0) {
            const files = Array.from(event.dataTransfer.files);
            const fileTypes = files.map(f => this.getFileType(f));
            
            if (fileCount === 1) {
                const file = files[0];
                const type = this.getFileType(file);
                
                switch (type) {
                    case 'image':
                        icon = '🖼️';
                        text = 'Drop image to import';
                        break;
                    case 'video':
                        icon = '🎥';
                        text = 'Drop video to analyze';
                        break;
                    case 'pdf':
                        icon = '📄';
                        text = 'Drop PDF to index';
                        break;
                    case 'csv':
                        icon = '📊';
                        text = 'Drop CSV to import';
                        break;
                    case 'json':
                        icon = '📋';
                        text = 'Drop JSON to import';
                        break;
                    default:
                        icon = '📄';
                        text = 'Drop file to import';
                }
                
                description = `${file.name} (${this.formatFileSize(file.size)})`;
            } else {
                icon = '📁';
                text = `Drop ${fileCount} files to import`;
                description = this.getFileTypesSummary(fileTypes);
            }
        } else if (types.includes('text/plain')) {
            icon = '📝';
            text = 'Drop text content';
        } else if (types.includes('text/uri-list')) {
            icon = '🔗';
            text = 'Drop URL to analyze';
        }
        
        const iconEl = this.overlay.querySelector('.drag-drop-icon');
        const textEl = this.overlay.querySelector('.drag-drop-text');
        const descEl = this.overlay.querySelector('.drag-drop-description');
        
        if (iconEl) iconEl.textContent = icon;
        if (textEl) textEl.textContent = text;
        
        if (descEl) {
            descEl.textContent = description;
            descEl.style.display = description ? 'block' : 'none';
        } else if (description) {
            const newDescEl = document.createElement('div');
            newDescEl.className = 'drag-drop-description';
            newDescEl.textContent = description;
            this.overlay.querySelector('.drag-drop-content').appendChild(newDescEl);
        }
    }

    updateOverlayForZone(dropZone) {
        const config = this.dropZones.get(dropZone);
        if (config && config.overlayText) {
            const textEl = this.overlay.querySelector('.drag-drop-text');
            if (textEl) {
                textEl.textContent = config.overlayText;
            }
        }
    }

    async processDrop(event) {
        const dropZone = this.getDropZoneAt(event.clientX, event.clientY);
        
        try {
            if (dropZone) {
                await this.handleZoneDrop(dropZone, event);
            } else {
                await this.handleGlobalDrop(event);
            }
        } catch (error) {
            console.error('Drop processing error:', error);
            this.showDropError('Failed to process dropped content');
        }
    }

    async handleZoneDrop(dropZone, event) {
        const config = this.dropZones.get(dropZone);
        if (config && config.handler) {
            await config.handler(event, dropZone);
        }
    }

    async handleGlobalDrop(event) {
        const files = Array.from(event.dataTransfer.files);
        const textData = event.dataTransfer.getData('text/plain');
        const urlData = event.dataTransfer.getData('text/uri-list');
        
        if (files.length > 0) {
            await this.processFiles(files);
        } else if (urlData) {
            await this.processURL(urlData);
        } else if (textData) {
            await this.processText(textData);
        }
    }

    async processFiles(files) {
        const processedFiles = {
            images: [],
            documents: [],
            data: [],
            others: []
        };
        
        // Categorize files
        for (const file of files) {
            const type = this.getFileType(file);
            
            switch (type) {
                case 'image':
                    processedFiles.images.push(file);
                    break;
                case 'pdf':
                case 'markdown':
                    processedFiles.documents.push(file);
                    break;
                case 'json':
                case 'csv':
                    processedFiles.data.push(file);
                    break;
                default:
                    processedFiles.others.push(file);
            }
        }
        
        // Process each category
        if (processedFiles.images.length > 0) {
            await this.processImages(processedFiles.images);
        }
        
        if (processedFiles.documents.length > 0) {
            await this.processDocuments(processedFiles.documents);
        }
        
        if (processedFiles.data.length > 0) {
            await this.processDataFiles(processedFiles.data);
        }
        
        if (processedFiles.others.length > 0) {
            await this.processOtherFiles(processedFiles.others);
        }
        
        this.showDropSuccess(`Processed ${files.length} file(s)`);
    }

    async processImages(images) {
        // Handle image files - could be used for avatar uploads, project images, etc.
        for (const image of images) {
            console.log('Processing image:', image.name);
            // TODO: Implement image processing
        }
    }

    async processDocuments(documents) {
        // Handle document files - index them into the knowledge base
        for (const doc of documents) {
            console.log('Processing document:', doc.name);
            // TODO: Implement document indexing
            if (window.knowledgeManager) {
                await window.knowledgeManager.indexDocument(doc);
            }
        }
    }

    async processDataFiles(dataFiles) {
        // Handle structured data files - import as channel data, project data, etc.
        for (const file of dataFiles) {
            console.log('Processing data file:', file.name);
            
            if (file.type === 'application/json') {
                const content = await this.readFileAsText(file);
                try {
                    const data = JSON.parse(content);
                    await this.processJSONData(data, file.name);
                } catch (error) {
                    console.error('Invalid JSON file:', error);
                }
            } else if (file.type === 'text/csv') {
                const content = await this.readFileAsText(file);
                await this.processCSVData(content, file.name);
            }
        }
    }

    async processOtherFiles(others) {
        // Handle other file types - try to process as text
        for (const file of others) {
            console.log('Processing other file:', file.name);
            try {
                const content = await this.readFileAsText(file);
                await this.processText(content, file.name);
            } catch (error) {
                console.warn('Could not process file as text:', file.name);
            }
        }
    }

    async processURL(url) {
        console.log('Processing URL:', url);
        
        // Check if it's a YouTube URL
        if (this.isYouTubeURL(url)) {
            if (window.channelManager) {
                await window.channelManager.addFromURL(url);
            }
        } else {
            // Generic URL processing
            if (window.knowledgeManager) {
                await window.knowledgeManager.indexURL(url);
            }
        }
    }

    async processText(text, filename = null) {
        console.log('Processing text:', text.substring(0, 100) + '...');
        
        // Try to detect what kind of text this is
        if (this.isJSON(text)) {
            try {
                const data = JSON.parse(text);
                await this.processJSONData(data, filename);
            } catch (error) {
                // Treat as plain text
                await this.addTextToKnowledgeBase(text, filename);
            }
        } else if (this.isURL(text)) {
            await this.processURL(text);
        } else {
            await this.addTextToKnowledgeBase(text, filename);
        }
    }

    async processJSONData(data, filename) {
        // Detect JSON data type and process accordingly
        if (data.channels && Array.isArray(data.channels)) {
            // Looks like channel export data
            if (window.channelManager) {
                await window.channelManager.importChannels(data.channels);
            }
        } else if (data.projects && Array.isArray(data.projects)) {
            // Looks like project data
            if (window.projectManager) {
                await window.projectManager.importProjects(data.projects);
            }
        } else if (data.messages && Array.isArray(data.messages)) {
            // Looks like chat history
            if (window.chatManager) {
                await window.chatManager.importChatHistory(data.messages);
            }
        } else {
            // Generic JSON data
            await this.addTextToKnowledgeBase(JSON.stringify(data, null, 2), filename);
        }
    }

    async processCSVData(csvContent, filename) {
        // Process CSV data - could be channel lists, analytics data, etc.
        console.log('Processing CSV data from:', filename);
        
        if (window.dataImporter) {
            await window.dataImporter.importCSV(csvContent, filename);
        }
    }

    async addTextToKnowledgeBase(text, filename) {
        if (window.knowledgeManager) {
            await window.knowledgeManager.addText(text, filename);
        }
    }

    // Drop zone management
    registerDropZone(element, options = {}) {
        const config = {
            handler: options.handler || null,
            accept: options.accept || '*',
            overlayText: options.overlayText || null,
            className: options.className || 'drop-zone-active'
        };
        
        this.dropZones.set(element, config);
        
        // Add visual feedback
        element.addEventListener('dragenter', (e) => {
            if (this.shouldAcceptDrop(e, config.accept)) {
                element.classList.add(config.className);
            }
        });
        
        element.addEventListener('dragleave', (e) => {
            element.classList.remove(config.className);
        });
        
        element.addEventListener('drop', (e) => {
            element.classList.remove(config.className);
        });
    }

    unregisterDropZone(element) {
        return this.dropZones.delete(element);
    }

    getDropZoneAt(x, y) {
        const elements = document.elementsFromPoint(x, y);
        for (const element of elements) {
            if (this.dropZones.has(element)) {
                return element;
            }
        }
        return null;
    }

    shouldAcceptDrop(event, acceptTypes) {
        if (acceptTypes === '*') return true;
        
        const types = Array.isArray(acceptTypes) ? acceptTypes : [acceptTypes];
        const dragTypes = Array.from(event.dataTransfer.types);
        
        return types.some(type => dragTypes.includes(type));
    }

    // Utility methods
    getFileType(file) {
        return this.supportedTypes[file.type] || 'unknown';
    }

    formatFileSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    getFileTypesSummary(types) {
        const counts = {};
        types.forEach(type => {
            counts[type] = (counts[type] || 0) + 1;
        });
        
        return Object.entries(counts)
            .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
            .join(', ');
    }

    isYouTubeURL(url) {
        return /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/.test(url);
    }

    isJSON(text) {
        try {
            JSON.parse(text);
            return true;
        } catch {
            return false;
        }
    }

    isURL(text) {
        try {
            new URL(text);
            return true;
        } catch {
            return false;
        }
    }

    async readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    showDropSuccess(message) {
        if (window.notificationManager) {
            window.notificationManager.show(message, 'success');
        } else {
            console.log('Drop success:', message);
        }
    }

    showDropError(message) {
        if (window.notificationManager) {
            window.notificationManager.show(message, 'error');
        } else {
            console.error('Drop error:', message);
        }
    }

    // Global drop handlers
    registerGlobalHandlers() {
        // Register default handlers for common operations
        this.globalHandlers.set('channel-import', async (files) => {
            // Handle channel data imports
            for (const file of files) {
                if (file.type === 'application/json') {
                    const content = await this.readFileAsText(file);
                    try {
                        const data = JSON.parse(content);
                        if (data.channels) {
                            if (window.channelManager) {
                                await window.channelManager.importChannels(data.channels);
                            }
                        }
                    } catch (error) {
                        console.error('Error importing channels:', error);
                    }
                }
            }
        });
        
        this.globalHandlers.set('project-import', async (files) => {
            // Handle project data imports
            for (const file of files) {
                if (file.type === 'application/json') {
                    const content = await this.readFileAsText(file);
                    try {
                        const data = JSON.parse(content);
                        if (data.projects) {
                            if (window.projectManager) {
                                await window.projectManager.importProjects(data.projects);
                            }
                        }
                    } catch (error) {
                        console.error('Error importing projects:', error);
                    }
                }
            }
        });
    }
}

// Initialize drag & drop when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dragDropManager = new DragDropManager();
});

// CSS for drag & drop overlay and zones
const dragDropStyles = `
<style>
.drag-drop-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(102, 126, 234, 0.9);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    opacity: 0;
    visibility: hidden;
    transition: all 0.2s var(--easing-standard);
}

.drag-drop-overlay.active {
    opacity: 1;
    visibility: visible;
}

.drag-drop-overlay.over-zone {
    background: rgba(40, 167, 69, 0.9);
}

.drag-drop-content {
    text-align: center;
    color: white;
    max-width: 400px;
    padding: var(--spacing-2xl);
}

.drag-drop-icon {
    font-size: 4rem;
    margin-bottom: var(--spacing-lg);
    animation: bounce 1s ease-in-out infinite;
}

.drag-drop-text {
    font-size: var(--font-size-2xl);
    font-weight: 600;
    margin-bottom: var(--spacing-md);
}

.drag-drop-description {
    font-size: var(--font-size-lg);
    opacity: 0.9;
    display: none;
}

@keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
}

.drop-zone-active {
    border: 2px dashed var(--color-primary) !important;
    background-color: rgba(102, 126, 234, 0.05) !important;
    transform: scale(1.02);
    transition: all 0.2s var(--easing-standard);
}

.drop-zone-hover {
    border-color: var(--color-success) !important;
    background-color: rgba(40, 167, 69, 0.05) !important;
}

/* Specific drop zones */
.chat-input-container.drop-zone-active {
    border-radius: var(--radius-lg);
}

.channels-grid.drop-zone-active {
    border-radius: var(--radius-lg);
}

.knowledge-browser.drop-zone-active {
    border-radius: var(--radius-lg);
}
</style>
`;

document.head.insertAdjacentHTML('beforeend', dragDropStyles);
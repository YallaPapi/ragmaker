// Documents Component - RAGMaker Desktop

import apiService from '../services/api.js';
import notificationService from '../services/notification.js';
import { 
    DOCUMENT_TYPES, 
    EVENTS, 
    APP_CONFIG,
    ERROR_CODES 
} from '../utils/constants.js';
import { 
    generateId, 
    validateFile, 
    formatFileSize, 
    formatRelativeTime,
    getFileType,
    getFileExtension
} from '../utils/helpers.js';

class DocumentsComponent {
    constructor() {
        this.documents = [];
        this.isUploading = false;
        this.uploadProgress = 0;
        
        this.elements = {
            container: null,
            grid: null,
            uploadButton: null,
            refreshButton: null,
            uploadModal: null,
            uploadZone: null,
            fileInput: null,
            uploadProgress: null,
            progressFill: null,
            progressText: null
        };
        
        this.init();
    }
    
    /**
     * Initialize documents component
     */
    init() {
        this.bindElements();
        this.bindEvents();
        this.loadDocuments();
    }
    
    /**
     * Bind DOM elements
     */
    bindElements() {
        this.elements.container = document.getElementById('documents-view');
        this.elements.grid = document.getElementById('documentsGrid');
        this.elements.uploadButton = document.getElementById('uploadDocuments');
        this.elements.refreshButton = document.getElementById('refreshDocuments');
        this.elements.uploadModal = document.getElementById('uploadModal');
        this.elements.uploadZone = document.getElementById('uploadZone');
        this.elements.fileInput = document.getElementById('fileInput');
        this.elements.uploadProgress = document.getElementById('uploadProgress');
        this.elements.progressFill = document.getElementById('progressFill');
        this.elements.progressText = document.getElementById('progressText');
        
        if (!this.elements.container) {
            console.warn('Documents container not found');
            return;
        }
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Upload button
        if (this.elements.uploadButton) {
            this.elements.uploadButton.addEventListener('click', () => {
                this.showUploadModal();
            });
        }
        
        // Refresh button
        if (this.elements.refreshButton) {
            this.elements.refreshButton.addEventListener('click', () => {
                this.loadDocuments();
            });
        }
        
        // Upload zone events
        if (this.elements.uploadZone) {
            // Click to select files
            this.elements.uploadZone.addEventListener('click', () => {
                if (this.elements.fileInput) {
                    this.elements.fileInput.click();
                }
            });
            
            // Drag and drop events
            this.elements.uploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.elements.uploadZone.classList.add('drag-over');
            });
            
            this.elements.uploadZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                this.elements.uploadZone.classList.remove('drag-over');
            });
            
            this.elements.uploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
                this.elements.uploadZone.classList.remove('drag-over');
                const files = Array.from(e.dataTransfer.files);
                this.handleFileSelection(files);
            });
        }
        
        // File input change
        if (this.elements.fileInput) {
            this.elements.fileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                this.handleFileSelection(files);
            });
        }
        
        // Modal close events
        const closeButton = document.getElementById('closeUploadModal');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.hideUploadModal();
            });
        }
        
        if (this.elements.uploadModal) {
            this.elements.uploadModal.addEventListener('click', (e) => {
                if (e.target === this.elements.uploadModal) {
                    this.hideUploadModal();
                }
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.elements.uploadModal?.classList.contains('hidden')) {
                this.hideUploadModal();
            }
        });
    }
    
    /**
     * Show upload modal
     */
    showUploadModal() {
        if (this.elements.uploadModal) {
            this.elements.uploadModal.classList.remove('hidden');
            
            // Reset form state
            if (this.elements.fileInput) {
                this.elements.fileInput.value = '';
            }
            
            this.hideUploadProgress();
        }
    }
    
    /**
     * Hide upload modal
     */
    hideUploadModal() {
        if (this.elements.uploadModal) {
            this.elements.uploadModal.classList.add('hidden');
        }
    }
    
    /**
     * Show upload progress
     */
    showUploadProgress() {
        if (this.elements.uploadProgress) {
            this.elements.uploadProgress.classList.remove('hidden');
        }
        
        if (this.elements.uploadZone) {
            this.elements.uploadZone.style.display = 'none';
        }
    }
    
    /**
     * Hide upload progress
     */
    hideUploadProgress() {
        if (this.elements.uploadProgress) {
            this.elements.uploadProgress.classList.add('hidden');
        }
        
        if (this.elements.uploadZone) {
            this.elements.uploadZone.style.display = 'block';
        }
        
        this.updateUploadProgress(0, 'Ready to upload...');
    }
    
    /**
     * Update upload progress
     */
    updateUploadProgress(percentage, text = null) {
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = `${percentage}%`;
        }
        
        if (this.elements.progressText && text) {
            this.elements.progressText.textContent = text;
        }
        
        this.uploadProgress = percentage;
    }
    
    /**
     * Handle file selection
     */
    handleFileSelection(files) {
        if (!files || files.length === 0) return;
        
        // Validate files
        const validFiles = [];
        const errors = [];
        
        for (const file of files) {
            const validation = validateFile(
                file, 
                APP_CONFIG.SUPPORTED_FILE_TYPES, 
                APP_CONFIG.MAX_FILE_SIZE
            );
            
            if (validation.valid) {
                validFiles.push(file);
            } else {
                errors.push(`${file.name}: ${validation.error}`);
            }
        }
        
        // Show validation errors
        if (errors.length > 0) {
            notificationService.error(`Some files couldn't be uploaded:\n${errors.join('\n')}`);
        }
        
        // Upload valid files
        if (validFiles.length > 0) {
            this.uploadFiles(validFiles);
        }
    }
    
    /**
     * Upload files
     */
    async uploadFiles(files) {
        if (this.isUploading) return;
        
        this.isUploading = true;
        this.showUploadProgress();
        
        try {
            const totalSize = files.reduce((sum, file) => sum + file.size, 0);
            
            this.updateUploadProgress(0, 'Starting upload...');
            
            const response = await apiService.uploadFiles(files, (percentage, loaded, total) => {
                this.updateUploadProgress(
                    percentage, 
                    `Uploading... ${formatFileSize(loaded)} / ${formatFileSize(total)}`
                );
            });
            
            // Handle success
            this.updateUploadProgress(100, 'Upload complete!');
            
            setTimeout(() => {
                this.hideUploadModal();
                this.loadDocuments(); // Refresh documents list
                
                notificationService.success(
                    `Successfully uploaded ${files.length} file${files.length > 1 ? 's' : ''}`
                );
            }, 1500);
            
            // Dispatch event
            window.dispatchEvent(new CustomEvent(EVENTS.DOCUMENT_UPLOADED, {
                detail: { files, response }
            }));
            
        } catch (error) {
            console.error('Upload error:', error);
            
            this.updateUploadProgress(0, 'Upload failed');
            this.hideUploadProgress();
            
            const errorMessage = error.message || 'Failed to upload files';
            notificationService.error(errorMessage);
            
        } finally {
            this.isUploading = false;
        }
    }
    
    /**
     * Load documents from API
     */
    async loadDocuments() {
        try {
            // Show loading state
            this.showLoadingState();
            
            // Note: This endpoint doesn't exist in the current API
            // This is a placeholder for when document management is implemented
            const response = await apiService.get('/api/documents');
            
            this.documents = response.documents || [];
            this.renderDocuments();
            
        } catch (error) {
            console.error('Failed to load documents:', error);
            
            // For now, show empty state since document API doesn't exist
            this.documents = [];
            this.renderDocuments();
            
            // Only show error if it's not a 404 (endpoint not found)
            if (error.details?.status !== 404) {
                notificationService.error('Failed to load documents');
            }
        }
    }
    
    /**
     * Show loading state
     */
    showLoadingState() {
        if (!this.elements.grid) return;
        
        this.elements.grid.innerHTML = `
            <div class="empty-state">
                <div class="loading-spinner">
                    <div class="spinner"></div>
                </div>
                <h3>Loading documents...</h3>
            </div>
        `;
    }
    
    /**
     * Render documents grid
     */
    renderDocuments() {
        if (!this.elements.grid) return;
        
        if (this.documents.length === 0) {
            this.renderEmptyState();
            return;
        }
        
        const documentsHTML = this.documents.map(doc => this.renderDocumentCard(doc)).join('');
        this.elements.grid.innerHTML = documentsHTML;
        
        // Bind document card events
        this.bindDocumentEvents();
    }
    
    /**
     * Render empty state
     */
    renderEmptyState() {
        this.elements.grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg width="64" height="64" viewBox="0 0 64 64">
                        <rect x="12" y="8" width="40" height="48" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
                        <path d="M20 20h24M20 28h24M20 36h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                <h3>No documents yet</h3>
                <p>Upload documents to start building your knowledge base.</p>
                <button class="btn btn-primary" onclick="document.getElementById('uploadDocuments').click()">
                    Upload Your First Document
                </button>
            </div>
        `;
    }
    
    /**
     * Render document card
     */
    renderDocumentCard(document) {
        const fileType = getFileType(document.filename || document.name);
        const iconSVG = this.getDocumentIcon(fileType);
        const fileSize = document.size ? formatFileSize(document.size) : 'Unknown size';
        const uploadDate = document.createdAt ? formatRelativeTime(document.createdAt) : 'Unknown date';
        
        return `
            <div class="document-card" data-document-id="${document.id}">
                <div class="document-icon">
                    ${iconSVG}
                </div>
                <div class="document-info">
                    <h3 class="document-title" title="${document.filename || document.name}">
                        ${this.truncateFilename(document.filename || document.name)}
                    </h3>
                    <div class="document-meta">
                        <span class="file-type">${fileType.toUpperCase()}</span>
                        <span class="file-size">${fileSize}</span>
                        <span class="upload-date">${uploadDate}</span>
                    </div>
                </div>
                <div class="document-actions">
                    <button class="btn btn-sm btn-secondary" data-action="preview" title="Preview">
                        <svg width="16" height="16" viewBox="0 0 16 16">
                            <path d="M8 2C4.5 2 1.5 4.5 0 8c1.5 3.5 4.5 6 8 6s6.5-2.5 8-6c-1.5-3.5-4.5-6-8-6z" fill="none" stroke="currentColor" stroke-width="2"/>
                            <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="2"/>
                        </svg>
                    </button>
                    <button class="btn btn-sm btn-secondary" data-action="download" title="Download">
                        <svg width="16" height="16" viewBox="0 0 16 16">
                            <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M3 12h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                    <button class="btn btn-sm btn-danger" data-action="delete" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 16 16">
                            <path d="M3 6h10l-1 8H4L3 6zM5 3h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            <path d="M7 9v3M9 9v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Get document icon based on file type
     */
    getDocumentIcon(fileType) {
        const icons = {
            [DOCUMENT_TYPES.TEXT]: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
            </svg>`,
            [DOCUMENT_TYPES.PDF]: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
                <text x="12" y="16" text-anchor="middle" font-size="6" fill="white">PDF</text>
            </svg>`,
            [DOCUMENT_TYPES.WORD]: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
                <text x="12" y="16" text-anchor="middle" font-size="6" fill="white">DOC</text>
            </svg>`,
            [DOCUMENT_TYPES.MARKDOWN]: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
                <text x="12" y="16" text-anchor="middle" font-size="6" fill="white">MD</text>
            </svg>`,
            [DOCUMENT_TYPES.HTML]: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
                <text x="12" y="16" text-anchor="middle" font-size="6" fill="white">HTML</text>
            </svg>`
        };
        
        return icons[fileType] || icons[DOCUMENT_TYPES.TEXT];
    }
    
    /**
     * Truncate filename for display
     */
    truncateFilename(filename, maxLength = 30) {
        if (filename.length <= maxLength) return filename;
        
        const extension = getFileExtension(filename);
        const nameWithoutExt = filename.slice(0, filename.lastIndexOf('.'));
        const truncatedName = nameWithoutExt.slice(0, maxLength - extension.length - 4);
        
        return `${truncatedName}...${extension}`;
    }
    
    /**
     * Bind document card events
     */
    bindDocumentEvents() {
        const cards = document.querySelectorAll('.document-card');
        
        cards.forEach(card => {
            // Card click (preview)
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.document-actions')) {
                    const documentId = card.getAttribute('data-document-id');
                    this.previewDocument(documentId);
                }
            });
            
            // Action buttons
            const actionButtons = card.querySelectorAll('[data-action]');
            actionButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = button.getAttribute('data-action');
                    const documentId = card.getAttribute('data-document-id');
                    this.handleDocumentAction(action, documentId);
                });
            });
        });
    }
    
    /**
     * Handle document actions
     */
    handleDocumentAction(action, documentId) {
        const document = this.documents.find(doc => doc.id === documentId);
        if (!document) return;
        
        switch (action) {
            case 'preview':
                this.previewDocument(documentId);
                break;
                
            case 'download':
                this.downloadDocument(documentId);
                break;
                
            case 'delete':
                this.deleteDocument(documentId);
                break;
        }
    }
    
    /**
     * Preview document
     */
    previewDocument(documentId) {
        const document = this.documents.find(doc => doc.id === documentId);
        if (!document) return;
        
        // For now, just show a notification
        notificationService.info(`Preview for "${document.filename || document.name}" - Feature coming soon!`);
        
        // TODO: Implement document preview modal
    }
    
    /**
     * Download document
     */
    async downloadDocument(documentId) {
        try {
            const document = this.documents.find(doc => doc.id === documentId);
            if (!document) return;
            
            // TODO: Implement document download
            notificationService.info(`Download for "${document.filename || document.name}" - Feature coming soon!`);
            
        } catch (error) {
            console.error('Download error:', error);
            notificationService.error('Failed to download document');
        }
    }
    
    /**
     * Delete document
     */
    deleteDocument(documentId) {
        const document = this.documents.find(doc => doc.id === documentId);
        if (!document) return;
        
        // Show confirmation
        notificationService.confirm(
            `Are you sure you want to delete "${document.filename || document.name}"?`,
            async () => {
                try {
                    // TODO: Implement document deletion API call
                    await apiService.delete(`/api/documents/${documentId}`);
                    
                    // Remove from local array
                    this.documents = this.documents.filter(doc => doc.id !== documentId);
                    this.renderDocuments();
                    
                    notificationService.success('Document deleted');
                    
                    // Dispatch event
                    window.dispatchEvent(new CustomEvent(EVENTS.DOCUMENT_DELETED, {
                        detail: { documentId, document }
                    }));
                    
                } catch (error) {
                    console.error('Delete error:', error);
                    notificationService.error('Failed to delete document');
                }
            }
        );
    }
    
    /**
     * Get component state
     */
    getState() {
        return {
            documents: this.documents,
            isUploading: this.isUploading,
            uploadProgress: this.uploadProgress
        };
    }
    
    /**
     * Search documents
     */
    searchDocuments(query) {
        if (!query) {
            this.renderDocuments();
            return;
        }
        
        const filtered = this.documents.filter(doc => 
            (doc.filename || doc.name).toLowerCase().includes(query.toLowerCase()) ||
            (doc.content || '').toLowerCase().includes(query.toLowerCase())
        );
        
        // Render filtered results
        const documentsHTML = filtered.map(doc => this.renderDocumentCard(doc)).join('');
        this.elements.grid.innerHTML = documentsHTML || `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg width="64" height="64" viewBox="0 0 64 64">
                        <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-width="2" fill="none"/>
                        <path d="M32 20v24M20 32h24" stroke="currentColor" stroke-width="2"/>
                    </svg>
                </div>
                <h3>No documents found</h3>
                <p>Try adjusting your search terms.</p>
            </div>
        `;
        
        this.bindDocumentEvents();
    }
    
    /**
     * Destroy component
     */
    destroy() {
        // Clean up any ongoing uploads
        this.isUploading = false;
    }
}

// Export class
export default DocumentsComponent;
// Utility functions for RAGMaker Desktop App
window.RAGHelper = {
    // Debounce function
    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // Format file size
    formatFileSize: function(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    // Format timestamp
    formatTimestamp: function(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' minutes ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' hours ago';
        return date.toLocaleDateString();
    },
    
    // Sanitize HTML
    sanitizeHTML: function(str) {
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    },
    
    // Generate unique ID
    generateId: function() {
        return 'id_' + Math.random().toString(36).substr(2, 9);
    },
    
    // Validate file type
    validateFileType: function(file) {
        return window.RAGMAKER_CONSTANTS.UPLOAD.ALLOWED_TYPES.includes(file.type);
    },
    
    // Validate file size
    validateFileSize: function(file) {
        return file.size <= window.RAGMAKER_CONSTANTS.UPLOAD.MAX_FILE_SIZE;
    },
    
    // Copy to clipboard
    copyToClipboard: async function(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            return false;
        }
    },
    
    // Show loading state
    showLoading: function(element, text = 'Loading...') {
        element.classList.add('loading');
        element.setAttribute('data-loading-text', text);
    },
    
    // Hide loading state
    hideLoading: function(element) {
        element.classList.remove('loading');
        element.removeAttribute('data-loading-text');
    }
};

console.log('✅ Helpers loaded');
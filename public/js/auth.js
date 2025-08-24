// Simple authentication utility for RAGMaker frontend

class AuthManager {
    constructor() {
        this.apiKey = null;
        this.loadFromStorage();
    }

    loadFromStorage() {
        this.apiKey = localStorage.getItem('ragmaker_api_key');
    }

    saveToStorage() {
        if (this.apiKey) {
            localStorage.setItem('ragmaker_api_key', this.apiKey);
        } else {
            localStorage.removeItem('ragmaker_api_key');
        }
    }

    setApiKey(key) {
        this.apiKey = key;
        this.saveToStorage();
    }

    getApiKey() {
        return this.apiKey;
    }

    hasApiKey() {
        return !!this.apiKey;
    }

    clearApiKey() {
        this.apiKey = null;
        this.saveToStorage();
    }

    // Enhanced fetch with automatic API key inclusion
    async fetch(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Add API key if available
        if (this.apiKey) {
            headers['x-api-key'] = this.apiKey;
        }

        const fetchOptions = {
            ...options,
            headers
        };

        try {
            const response = await fetch(url, fetchOptions);
            
            // Handle authentication errors
            if (response.status === 401 && !this.apiKey) {
                this.promptForApiKey();
                return null;
            }

            return response;
        } catch (error) {
            console.error('Fetch error:', error);
            throw error;
        }
    }

    promptForApiKey() {
        const key = prompt(`
🔐 API Key Required

This RAGMaker instance requires authentication.
Enter your API key (or leave empty for development mode):
        `.trim());
        
        if (key) {
            this.setApiKey(key);
            location.reload(); // Reload to retry with key
        }
    }

    showAuthStatus() {
        const statusDiv = document.createElement('div');
        statusDiv.id = 'auth-status';
        statusDiv.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: ${this.hasApiKey() ? '#10b981' : '#f59e0b'};
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            z-index: 1000;
            cursor: pointer;
        `;
        
        statusDiv.innerHTML = this.hasApiKey() ? 
            '🔐 Authenticated' : 
            '🔓 Development Mode';
        
        statusDiv.onclick = () => {
            if (this.hasApiKey()) {
                if (confirm('Clear API key?')) {
                    this.clearApiKey();
                    location.reload();
                }
            } else {
                this.promptForApiKey();
            }
        };

        // Remove existing status
        const existing = document.getElementById('auth-status');
        if (existing) existing.remove();
        
        document.body.appendChild(statusDiv);
    }
}

// Create global auth manager
window.authManager = new AuthManager();

// Override global fetch for seamless integration
const originalFetch = window.fetch;
window.fetch = async (url, options) => {
    // Only intercept API calls
    if (typeof url === 'string' && url.startsWith('/api/')) {
        return await window.authManager.fetch(url, options);
    }
    return originalFetch(url, options);
};

// Show auth status when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.authManager.showAuthStatus();
});
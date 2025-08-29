// Browser-compatible API Service for RAGMaker Desktop

class APIService {
    constructor() {
        this.baseURL = window.ragAPI?.baseURL || 'http://localhost:3001/api';
        this.isOnline = true;
        this.setupNetworkMonitoring();
    }

    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.dispatchEvent('connection:online');
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.dispatchEvent('connection:offline');
        });
        
        this.isOnline = navigator.onLine;
    }

    dispatchEvent(eventName, detail = {}) {
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }

    async request(url, options = {}) {
        const fullUrl = url.startsWith('http') ? url : this.baseURL + url;
        
        const config = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };
        
        if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
            config.body = JSON.stringify(config.body);
        }
        
        try {
            if (!this.isOnline) {
                throw new Error('No internet connection');
            }
            
            const response = await fetch(fullUrl, config);
            
            if (!response.ok) {
                const errorData = await this.parseErrorResponse(response);
                throw new Error(errorData.message || `HTTP ${response.status}`);
            }
            
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            
            if (contentType && contentType.includes('text/')) {
                return await response.text();
            }
            
            return await response.blob();
            
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }

    async parseErrorResponse(response) {
        try {
            const text = await response.text();
            return text ? JSON.parse(text) : {};
        } catch {
            return { message: `HTTP ${response.status} Error` };
        }
    }

    async get(url, params = {}, options = {}) {
        const searchParams = new URLSearchParams(params);
        const fullUrl = searchParams.toString() ? `${url}?${searchParams}` : url;
        
        return this.request(fullUrl, {
            method: 'GET',
            ...options
        });
    }

    async post(url, data = null, options = {}) {
        return this.request(url, {
            method: 'POST',
            body: data,
            ...options
        });
    }

    async put(url, data = null, options = {}) {
        return this.request(url, {
            method: 'PUT',
            body: data,
            ...options
        });
    }

    async delete(url, options = {}) {
        return this.request(url, {
            method: 'DELETE',
            ...options
        });
    }

    // RAG API Methods
    async queryRAG(question, profileId = 'default') {
        return this.post('/query', {
            question,
            profileId
        });
    }

    async getHealth() {
        return this.get('/health');
    }

    async isAvailable() {
        try {
            const response = await this.getHealth();
            return response.status === 'ok';
        } catch (error) {
            return false;
        }
    }
}

// Create global instance
window.apiService = new APIService();
console.log('✅ API Service loaded');
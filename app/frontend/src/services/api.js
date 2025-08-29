// API Service - RAGMaker Desktop

import { 
    API_BASE_URL, 
    API_ENDPOINTS, 
    ERROR_CODES, 
    EVENTS 
} from '../utils/constants.js';
import { createError, retry, isOnline } from '../utils/helpers.js';

class ApiService {
    constructor() {
        this.baseURL = API_BASE_URL;
        this.isOnline = true;
        this.requestQueue = [];
        this.retryQueue = [];
        
        // Setup network status monitoring
        this.setupNetworkMonitoring();
        
        // Setup request interceptors
        this.setupInterceptors();
    }
    
    /**
     * Setup network status monitoring
     */
    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.processRetryQueue();
            this.dispatchEvent(EVENTS.CONNECTION_ONLINE);
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.dispatchEvent(EVENTS.CONNECTION_OFFLINE);
        });
        
        this.isOnline = isOnline();
    }
    
    /**
     * Setup request/response interceptors
     */
    setupInterceptors() {
        // Could be extended with auth tokens, logging, etc.
    }
    
    /**
     * Dispatch custom events
     */
    dispatchEvent(eventName, detail = {}) {
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
    
    /**
     * Make HTTP request with error handling
     */
    async request(url, options = {}) {
        const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;
        
        const config = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };
        
        // Add body for POST/PUT requests
        if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
            config.body = JSON.stringify(config.body);
        }
        
        try {
            if (!this.isOnline) {
                throw createError('No internet connection', ERROR_CODES.NETWORK_ERROR);
            }
            
            const response = await fetch(fullUrl, config);
            
            if (!response.ok) {
                const errorData = await this.parseErrorResponse(response);
                throw createError(
                    errorData.message || `HTTP ${response.status}`,
                    ERROR_CODES.API_ERROR,
                    { status: response.status, data: errorData }
                );
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
            // Add to retry queue for network errors
            if (error.code === ERROR_CODES.NETWORK_ERROR && options.retry !== false) {
                this.addToRetryQueue({ url, options });
            }
            
            throw error;
        }
    }
    
    /**
     * Parse error response
     */
    async parseErrorResponse(response) {
        try {
            const text = await response.text();
            return text ? JSON.parse(text) : {};
        } catch {
            return { message: `HTTP ${response.status} Error` };
        }
    }
    
    /**
     * Add failed request to retry queue
     */
    addToRetryQueue(requestData) {
        this.retryQueue.push({
            ...requestData,
            timestamp: Date.now()
        });
    }
    
    /**
     * Process retry queue when back online
     */
    async processRetryQueue() {
        const queue = [...this.retryQueue];
        this.retryQueue = [];
        
        for (const request of queue) {
            try {
                await this.request(request.url, { ...request.options, retry: false });
            } catch (error) {
                console.warn('Retry failed:', error);
            }
        }
    }
    
    /**
     * GET request
     */
    async get(url, params = {}, options = {}) {
        const searchParams = new URLSearchParams(params);
        const fullUrl = searchParams.toString() ? `${url}?${searchParams}` : url;
        
        return this.request(fullUrl, {
            method: 'GET',
            ...options
        });
    }
    
    /**
     * POST request
     */
    async post(url, data = null, options = {}) {
        return this.request(url, {
            method: 'POST',
            body: data,
            ...options
        });
    }
    
    /**
     * PUT request
     */
    async put(url, data = null, options = {}) {
        return this.request(url, {
            method: 'PUT',
            body: data,
            ...options
        });
    }
    
    /**
     * DELETE request
     */
    async delete(url, options = {}) {
        return this.request(url, {
            method: 'DELETE',
            ...options
        });
    }
    
    // RAG API Methods
    
    /**
     * Query RAG system
     */
    async queryRAG(question, profileId = 'default') {
        return this.post(API_ENDPOINTS.RAG_QUERY, {
            question,
            profileId
        });
    }
    
    /**
     * Chat with RAG system
     */
    async chatRAG(question, profileId = 'default', customInstructions = null, projectId = null, messages = []) {
        return this.post(API_ENDPOINTS.RAG_CHAT, {
            question,
            profileId,
            customInstructions,
            projectId,
            messages
        });
    }
    
    // Document API Methods
    
    /**
     * Get API health status
     */
    async getHealth() {
        return this.get(API_ENDPOINTS.DOCS_HEALTH);
    }
    
    /**
     * Get API information
     */
    async getInfo() {
        return this.get(API_ENDPOINTS.DOCS_INFO);
    }
    
    /**
     * Get OpenAPI specification
     */
    async getApiSpec() {
        return this.get(API_ENDPOINTS.DOCS_SPEC);
    }
    
    // Project API Methods
    
    /**
     * Get all projects
     */
    async getProjects() {
        return this.get(API_ENDPOINTS.PROJECTS_LIST);
    }
    
    /**
     * Create new project
     */
    async createProject(projectData) {
        return this.post(API_ENDPOINTS.PROJECTS_CREATE, projectData);
    }
    
    /**
     * Switch to project
     */
    async switchProject(projectId) {
        return this.post(API_ENDPOINTS.PROJECTS_SWITCH(projectId));
    }
    
    /**
     * Update project
     */
    async updateProject(projectId, projectData) {
        return this.put(API_ENDPOINTS.PROJECTS_UPDATE(projectId), projectData);
    }
    
    /**
     * Delete project
     */
    async deleteProject(projectId) {
        return this.delete(API_ENDPOINTS.PROJECTS_DELETE(projectId));
    }
    
    // Channel API Methods
    
    /**
     * Get all channels
     */
    async getChannels() {
        return this.get(API_ENDPOINTS.CHANNELS_LIST);
    }
    
    /**
     * Get channel statistics
     */
    async getChannelStats() {
        return this.get(API_ENDPOINTS.CHANNELS_STATS);
    }
    
    /**
     * Get channel videos
     */
    async getChannelVideos(channelId) {
        return this.get(API_ENDPOINTS.CHANNELS_VIDEOS(channelId));
    }
    
    /**
     * Delete channel
     */
    async deleteChannel(channelId) {
        return this.delete(API_ENDPOINTS.CHANNELS_DELETE(channelId));
    }
    
    /**
     * Get YouTube API quota status
     */
    async getYouTubeQuota() {
        return this.get(API_ENDPOINTS.CHANNELS_QUOTA);
    }
    
    /**
     * Export knowledge base
     */
    async exportKnowledgeBase() {
        return this.get(API_ENDPOINTS.CHANNELS_EXPORT, {}, {
            headers: {
                'Accept': 'application/json'
            }
        });
    }
    
    // Indexing API Methods
    
    /**
     * Bulk import channels
     */
    async bulkImportChannels(channels) {
        return this.post(API_ENDPOINTS.INDEXING_BULK, { channels });
    }
    
    /**
     * Index single video
     */
    async indexVideo(videoUrl) {
        return this.post(API_ENDPOINTS.INDEXING_VIDEO, { videoUrl });
    }
    
    /**
     * Index channel
     */
    async indexChannel(channelUrl) {
        return this.post(API_ENDPOINTS.INDEXING_CHANNEL, { channelUrl });
    }
    
    /**
     * Get indexing logs
     */
    async getIndexingLogs() {
        return this.get(API_ENDPOINTS.INDEXING_LOGS);
    }
    
    /**
     * Get indexing progress
     */
    async getIndexingProgress() {
        return this.get(API_ENDPOINTS.INDEXING_PROGRESS);
    }
    
    /**
     * Reindex all content
     */
    async reindexAll() {
        return this.post(API_ENDPOINTS.INDEXING_REINDEX);
    }
    
    /**
     * Stop indexing process
     */
    async stopIndexing() {
        return this.post(API_ENDPOINTS.INDEXING_STOP);
    }
    
    // File Upload Methods
    
    /**
     * Upload files
     */
    async uploadFiles(files, onProgress = null) {
        const formData = new FormData();
        
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            if (onProgress) {
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const percentComplete = (event.loaded / event.total) * 100;
                        onProgress(percentComplete, event.loaded, event.total);
                    }
                });
            }
            
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (error) {
                        resolve(xhr.responseText);
                    }
                } else {
                    reject(createError(
                        `Upload failed: HTTP ${xhr.status}`,
                        ERROR_CODES.API_ERROR,
                        { status: xhr.status }
                    ));
                }
            });
            
            xhr.addEventListener('error', () => {
                reject(createError(
                    'Upload failed: Network error',
                    ERROR_CODES.NETWORK_ERROR
                ));
            });
            
            xhr.open('POST', `${this.baseURL}/api/upload`);
            xhr.send(formData);
        });
    }
    
    /**
     * Stream data from endpoint
     */
    async stream(url, options = {}) {
        const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;
        
        const response = await fetch(fullUrl, {
            method: 'GET',
            ...options
        });
        
        if (!response.ok) {
            throw createError(
                `Stream failed: HTTP ${response.status}`,
                ERROR_CODES.API_ERROR,
                { status: response.status }
            );
        }
        
        return response.body;
    }
    
    /**
     * Set base URL
     */
    setBaseURL(url) {
        this.baseURL = url;
    }
    
    /**
     * Get base URL
     */
    getBaseURL() {
        return this.baseURL;
    }
    
    /**
     * Check if API is available
     */
    async isAvailable() {
        try {
            const response = await this.getHealth();
            return response.success === true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            online: this.isOnline,
            baseURL: this.baseURL,
            retryQueueLength: this.retryQueue.length
        };
    }
}

// Create singleton instance
const apiService = new ApiService();

// Export singleton and class
export default apiService;
export { ApiService };
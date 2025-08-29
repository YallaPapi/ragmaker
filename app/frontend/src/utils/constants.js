// Constants for RAGMaker Desktop App
window.RAGMAKER_CONSTANTS = {
    // API Configuration
    API: {
        BASE_URL: '/api',
        WEBSOCKET_URL: 'ws://localhost:4001',
        TIMEOUT: 30000,
        RETRY_ATTEMPTS: 3
    },
    
    // Chat Configuration
    CHAT: {
        MAX_MESSAGE_LENGTH: 2000,
        TYPING_DELAY: 1000,
        MAX_HISTORY: 100
    },
    
    // File Upload Configuration
    UPLOAD: {
        MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
        ALLOWED_TYPES: [
            'text/plain',
            'text/markdown',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ],
        CHUNK_SIZE: 1024 * 1024 // 1MB chunks
    },
    
    // UI Configuration
    UI: {
        ANIMATION_DURATION: 200,
        DEBOUNCE_DELAY: 300,
        NOTIFICATION_TIMEOUT: 5000
    },
    
    // Profiles
    PROFILES: {
        DEFAULT: 'default',
        TECHNICAL: 'technical',
        CREATIVE: 'creative',
        ANALYTICAL: 'analytical'
    }
};

console.log('✅ Constants loaded');
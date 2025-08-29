// Main Desktop Application Entry Point
class RAGMakerDesktop {
    constructor() {
        this.isInitialized = false;
        this.components = {};
        this.config = {};
        
        this.init();
    }

    async init() {
        try {
            console.log('🚀 Initializing RAGMaker Desktop...');
            
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }

            // Initialize core components
            await this.initializeComponents();
            
            // Setup application
            this.setupApplication();
            
            // Load initial data
            await this.loadInitialData();
            
            // Mark as initialized
            this.isInitialized = true;
            
            console.log('✅ RAGMaker Desktop initialized successfully');
            
            // Show ready notification
            if (window.notificationManager) {
                window.notificationManager.success('RAGMaker Desktop is ready', {
                    duration: 3000
                });
            }
            
        } catch (error) {
            console.error('❌ Failed to initialize RAGMaker Desktop:', error);
            this.handleInitializationError(error);
        }
    }

    async initializeComponents() {
        // Core managers are already initialized by their respective scripts
        // We'll reference them here and ensure they're ready
        
        this.components = {
            ui: window.desktopUI,
            notifications: window.notificationManager,
            keyboard: window.keyboardShortcuts,
            dragDrop: window.dragDropManager,
            // Additional components will be added as they're created
            chat: null,
            channels: null,
            projects: null,
            knowledge: null,
            analytics: null,
            settings: null
        };
        
        // Initialize additional components
        await this.initializeChatManager();
        await this.initializeChannelManager();
        await this.initializeProjectManager();
        await this.initializeKnowledgeManager();
        await this.initializeAnalyticsManager();
        await this.initializeSettingsManager();
    }

    async initializeChatManager() {
        // Chat manager for handling conversations
        this.components.chat = {
            messages: [],
            currentProject: null,
            responseStyle: 'professional',
            
            async sendMessage(message) {
                try {
                    const response = await this.makeAPICall('/api/chat', {
                        message,
                        project: this.currentProject,
                        style: this.responseStyle
                    });
                    
                    this.addMessage('user', message);
                    this.addMessage('assistant', response.answer);
                    
                    return response;
                } catch (error) {
                    console.error('Chat error:', error);
                    if (window.notificationManager) {
                        window.notificationManager.error('Failed to send message');
                    }
                    throw error;
                }
            },
            
            addMessage(role, content) {
                const message = {
                    id: Date.now(),
                    role,
                    content,
                    timestamp: new Date()
                };
                
                this.messages.push(message);
                this.displayMessage(message);
                
                return message;
            },
            
            displayMessage(message) {
                const messagesContainer = document.getElementById('messagesContainer');
                if (!messagesContainer) return;
                
                // Remove welcome message if it exists
                const welcomeMessage = messagesContainer.querySelector('.welcome-message');
                if (welcomeMessage) {
                    welcomeMessage.remove();
                }
                
                const messageElement = document.createElement('div');
                messageElement.className = `message ${message.role}`;
                messageElement.innerHTML = `
                    <div class="message-content">
                        ${this.formatMessageContent(message.content)}
                    </div>
                `;
                
                messagesContainer.appendChild(messageElement);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            },
            
            formatMessageContent(content) {
                // Basic markdown-like formatting
                return content
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/`(.*?)`/g, '<code>$1</code>')
                    .replace(/\n/g, '<br>');
            },
            
            clearMessages() {
                this.messages = [];
                const messagesContainer = document.getElementById('messagesContainer');
                if (messagesContainer) {
                    messagesContainer.innerHTML = `
                        <div class="welcome-message">
                            <h2>Chat Cleared</h2>
                            <p>Start a new conversation.</p>
                        </div>
                    `;
                }
            }
        };
        
        window.chatManager = this.components.chat;
        this.setupChatForm();
    }

    setupChatForm() {
        const chatForm = document.getElementById('chatForm');
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        
        if (!chatForm || !messageInput || !sendBtn) return;
        
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const message = messageInput.value.trim();
            if (!message) return;
            
            // Disable input during processing
            messageInput.disabled = true;
            sendBtn.disabled = true;
            sendBtn.textContent = 'Sending...';
            
            try {
                await this.components.chat.sendMessage(message);
                messageInput.value = '';
            } catch (error) {
                console.error('Failed to send message:', error);
            } finally {
                messageInput.disabled = false;
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send';
                messageInput.focus();
            }
        });
        
        // Handle Enter key (but not Shift+Enter)
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatForm.dispatchEvent(new Event('submit'));
            }
        });
        
        // Setup quick action buttons
        document.querySelectorAll('.quick-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const question = btn.getAttribute('data-question');
                if (question) {
                    messageInput.value = question;
                    chatForm.dispatchEvent(new Event('submit'));
                }
            });
        });
    }

    async initializeChannelManager() {
        this.components.channels = {
            channels: [],
            
            async loadChannels() {
                try {
                    const response = await this.makeAPICall('/api/channels');
                    this.channels = response.channels || [];
                    return this.channels;
                } catch (error) {
                    console.error('Failed to load channels:', error);
                    return [];
                }
            },
            
            async addChannel(channelUrl) {
                try {
                    const response = await this.makeAPICall('/api/channels', {
                        method: 'POST',
                        body: { url: channelUrl }
                    });
                    
                    this.channels.push(response.channel);
                    
                    if (window.notificationManager) {
                        window.notificationManager.channelAdded(response.channel.name);
                    }
                    
                    return response.channel;
                } catch (error) {
                    console.error('Failed to add channel:', error);
                    if (window.notificationManager) {
                        window.notificationManager.error('Failed to add channel');
                    }
                    throw error;
                }
            },
            
            async refreshChannel(channelId) {
                try {
                    const notificationId = window.notificationManager?.progress(`Refreshing channel...`);
                    
                    const response = await this.makeAPICall(`/api/channels/${channelId}/refresh`, {
                        method: 'POST'
                    });
                    
                    if (notificationId) {
                        window.notificationManager.completeProgress(notificationId, 'Channel refreshed');
                    }
                    
                    return response;
                } catch (error) {
                    console.error('Failed to refresh channel:', error);
                    throw error;
                }
            }
        };
        
        window.channelManager = this.components.channels;
    }

    async initializeProjectManager() {
        this.components.projects = {
            projects: [],
            currentProject: null,
            
            async loadProjects() {
                try {
                    const response = await this.makeAPICall('/api/projects');
                    this.projects = response.projects || [];
                    return this.projects;
                } catch (error) {
                    console.error('Failed to load projects:', error);
                    return [];
                }
            },
            
            async createProject(projectData) {
                try {
                    const response = await this.makeAPICall('/api/projects', {
                        method: 'POST',
                        body: projectData
                    });
                    
                    this.projects.push(response.project);
                    
                    if (window.notificationManager) {
                        window.notificationManager.projectCreated(response.project.name);
                    }
                    
                    return response.project;
                } catch (error) {
                    console.error('Failed to create project:', error);
                    throw error;
                }
            },
            
            switchProject(projectId) {
                const project = this.projects.find(p => p.id === projectId);
                if (project) {
                    this.currentProject = project;
                    
                    // Update UI
                    const currentProjectTitle = document.getElementById('currentProjectTitle');
                    if (currentProjectTitle) {
                        currentProjectTitle.textContent = project.name;
                    }
                    
                    // Update chat context
                    if (this.components.chat) {
                        this.components.chat.currentProject = project.id;
                    }
                    
                    return project;
                }
                return null;
            }
        };
        
        window.projectManager = this.components.projects;
    }

    async initializeKnowledgeManager() {
        this.components.knowledge = {
            async getStats() {
                try {
                    const response = await this.makeAPICall('/api/knowledge/stats');
                    return response.stats;
                } catch (error) {
                    console.error('Failed to get knowledge stats:', error);
                    return {
                        videos: 0,
                        chunks: 0,
                        channels: 0,
                        size: 0
                    };
                }
            },
            
            async search(query) {
                try {
                    const response = await this.makeAPICall('/api/knowledge/search', {
                        method: 'POST',
                        body: { query }
                    });
                    return response.results;
                } catch (error) {
                    console.error('Knowledge search failed:', error);
                    return [];
                }
            },
            
            async indexDocument(file) {
                try {
                    const formData = new FormData();
                    formData.append('document', file);
                    
                    const response = await fetch('/api/knowledge/documents', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    
                    const result = await response.json();
                    
                    if (window.notificationManager) {
                        window.notificationManager.success(`Document "${file.name}" indexed successfully`);
                    }
                    
                    return result;
                } catch (error) {
                    console.error('Document indexing failed:', error);
                    if (window.notificationManager) {
                        window.notificationManager.error(`Failed to index "${file.name}"`);
                    }
                    throw error;
                }
            }
        };
        
        window.knowledgeManager = this.components.knowledge;
    }

    async initializeAnalyticsManager() {
        this.components.analytics = {
            async getUsageStats(timeframe = '7d') {
                try {
                    const response = await this.makeAPICall(`/api/analytics/usage?timeframe=${timeframe}`);
                    return response.stats;
                } catch (error) {
                    console.error('Failed to get analytics:', error);
                    return {};
                }
            },
            
            async getPopularContent(limit = 10) {
                try {
                    const response = await this.makeAPICall(`/api/analytics/popular?limit=${limit}`);
                    return response.content;
                } catch (error) {
                    console.error('Failed to get popular content:', error);
                    return [];
                }
            }
        };
        
        window.analyticsManager = this.components.analytics;
    }

    async initializeSettingsManager() {
        this.components.settings = {
            settings: {},
            
            async loadSettings() {
                try {
                    const response = await this.makeAPICall('/api/settings');
                    this.settings = response.settings || {};
                    this.applySettings();
                    return this.settings;
                } catch (error) {
                    console.error('Failed to load settings:', error);
                    return {};
                }
            },
            
            async updateSetting(key, value) {
                try {
                    this.settings[key] = value;
                    
                    await this.makeAPICall('/api/settings', {
                        method: 'PATCH',
                        body: { [key]: value }
                    });
                    
                    this.applySettings();
                } catch (error) {
                    console.error('Failed to update setting:', error);
                    throw error;
                }
            },
            
            applySettings() {
                // Apply UI settings
                if (this.settings.theme && window.desktopUI) {
                    window.desktopUI.setTheme(this.settings.theme);
                }
                
                if (this.settings.sidebarCollapsed !== undefined && window.desktopUI) {
                    window.desktopUI.setSidebarCollapsed(this.settings.sidebarCollapsed);
                }
                
                // Apply notification settings
                if (this.settings.notificationPosition && window.notificationManager) {
                    window.notificationManager.setPosition(this.settings.notificationPosition);
                }
            }
        };
        
        window.settingsManager = this.components.settings;
    }

    setupApplication() {
        // Setup global error handling
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
            if (window.notificationManager) {
                window.notificationManager.error('An unexpected error occurred');
            }
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            if (window.notificationManager) {
                window.notificationManager.error('An unexpected error occurred');
            }
        });

        // Setup periodic tasks
        this.setupPeriodicTasks();
        
        // Setup window lifecycle
        this.setupWindowLifecycle();
        
        // Setup accessibility
        this.setupAccessibility();
        
        // Setup drag and drop zones
        this.setupDragDropZones();
    }

    setupPeriodicTasks() {
        // Refresh connection status every 30 seconds
        setInterval(async () => {
            await this.checkConnectionStatus();
        }, 30000);
        
        // Save user state every 5 minutes
        setInterval(() => {
            this.saveUserState();
        }, 300000);
    }

    setupWindowLifecycle() {
        // Handle window focus/blur
        window.addEventListener('focus', () => {
            console.log('Window focused');
            // Refresh data when window gains focus
            this.refreshCurrentTabData();
        });

        window.addEventListener('blur', () => {
            console.log('Window blurred');
            // Save state when window loses focus
            this.saveUserState();
        });

        // Handle before unload
        window.addEventListener('beforeunload', (event) => {
            this.saveUserState();
            
            // Show confirmation if there are unsaved changes
            if (this.hasUnsavedChanges()) {
                event.preventDefault();
                event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return event.returnValue;
            }
        });
    }

    setupAccessibility() {
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            // Skip if keyboard shortcuts are handling it
            if (window.keyboardShortcuts && !window.keyboardShortcuts.isEnabled) {
                return;
            }
            
            // Handle tab navigation
            if (e.key === 'Tab') {
                this.handleTabNavigation(e);
            }
            
            // Handle escape key for modals/dialogs
            if (e.key === 'Escape') {
                this.handleEscapeKey(e);
            }
        });

        // Announce dynamic content changes to screen readers
        this.setupScreenReaderAnnouncements();
        
        // Setup high contrast mode detection
        this.setupHighContrastMode();
    }

    setupScreenReaderAnnouncements() {
        // Create live regions for announcements
        const announcer = document.createElement('div');
        announcer.id = 'screen-reader-announcer';
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        announcer.style.cssText = `
            position: absolute;
            left: -10000px;
            width: 1px;
            height: 1px;
            overflow: hidden;
        `;
        document.body.appendChild(announcer);

        // Global announcement function
        window.announceToScreenReader = (message) => {
            announcer.textContent = message;
            setTimeout(() => {
                announcer.textContent = '';
            }, 1000);
        };
    }

    setupHighContrastMode() {
        // Detect high contrast mode
        const isHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
        if (isHighContrast) {
            document.documentElement.setAttribute('data-high-contrast', 'true');
        }

        // Listen for changes
        window.matchMedia('(prefers-contrast: high)').addEventListener('change', (e) => {
            if (e.matches) {
                document.documentElement.setAttribute('data-high-contrast', 'true');
            } else {
                document.documentElement.removeAttribute('data-high-contrast');
            }
        });
    }

    setupDragDropZones() {
        if (!window.dragDropManager) return;

        // Chat input area
        const chatInputContainer = document.querySelector('.chat-input-container');
        if (chatInputContainer) {
            window.dragDropManager.registerDropZone(chatInputContainer, {
                accept: ['Files', 'text/plain'],
                overlayText: 'Drop files or text to attach to message',
                handler: async (event, zone) => {
                    // Handle file/text drop in chat
                    console.log('Files dropped in chat area');
                }
            });
        }

        // Channels grid
        const channelsGrid = document.getElementById('channelsGrid');
        if (channelsGrid) {
            window.dragDropManager.registerDropZone(channelsGrid, {
                accept: ['text/uri-list', 'Files'],
                overlayText: 'Drop YouTube URLs or channel data files',
                handler: async (event, zone) => {
                    // Handle channel imports
                    console.log('Channel data dropped');
                }
            });
        }
    }

    async loadInitialData() {
        try {
            // Load user settings first
            if (this.components.settings) {
                await this.components.settings.loadSettings();
            }

            // Load projects
            if (this.components.projects) {
                await this.components.projects.loadProjects();
            }

            // Set default project or prompt user to create one
            await this.handleInitialProject();

        } catch (error) {
            console.error('Failed to load initial data:', error);
        }
    }

    async handleInitialProject() {
        const projects = this.components.projects?.projects || [];
        
        if (projects.length === 0) {
            // No projects exist, show welcome flow
            this.showWelcomeFlow();
        } else {
            // Select the last used project or the first one
            const lastProjectId = localStorage.getItem('ragmaker-last-project');
            const project = projects.find(p => p.id === lastProjectId) || projects[0];
            
            if (project && this.components.projects) {
                this.components.projects.switchProject(project.id);
            }
        }
    }

    showWelcomeFlow() {
        // Create welcome dialog
        if (window.desktopUI) {
            window.desktopUI.showNewProjectDialog();
        }
    }

    async checkConnectionStatus() {
        try {
            const response = await fetch('/api/health', { 
                method: 'HEAD',
                cache: 'no-cache'
            });
            
            const isConnected = response.ok;
            this.updateConnectionStatus(isConnected);
            
        } catch (error) {
            this.updateConnectionStatus(false);
        }
    }

    updateConnectionStatus(isConnected) {
        const statusIndicator = document.getElementById('connectionStatus');
        const statusText = document.getElementById('connectionText');
        
        if (statusIndicator && statusText) {
            if (isConnected) {
                statusIndicator.className = 'status-indicator';
                statusText.textContent = 'Connected';
            } else {
                statusIndicator.className = 'status-indicator disconnected';
                statusText.textContent = 'Disconnected';
                
                if (window.notificationManager) {
                    window.notificationManager.connectionError();
                }
            }
        }
    }

    refreshCurrentTabData() {
        if (!window.desktopUI) return;
        
        const currentTab = window.desktopUI.currentTab;
        window.desktopUI.initializeTab(currentTab);
    }

    saveUserState() {
        const state = {
            theme: window.desktopUI?.theme,
            currentTab: window.desktopUI?.currentTab,
            sidebarCollapsed: window.desktopUI?.sidebarCollapsed,
            currentProject: this.components.projects?.currentProject?.id,
            timestamp: Date.now()
        };
        
        localStorage.setItem('ragmaker-user-state', JSON.stringify(state));
    }

    hasUnsavedChanges() {
        // Check if there are any unsaved changes
        // This would be implemented based on specific app logic
        return false;
    }

    handleTabNavigation(event) {
        // Custom tab navigation logic if needed
        // Currently letting browser handle default tab behavior
    }

    handleEscapeKey(event) {
        // Close modals, dialogs, or other overlay elements
        const modals = document.querySelectorAll('.modal-overlay');
        if (modals.length > 0) {
            const topModal = modals[modals.length - 1];
            topModal.remove();
            event.preventDefault();
        }
    }

    handleInitializationError(error) {
        // Show error state
        document.body.innerHTML = `
            <div class="error-screen">
                <div class="error-content">
                    <h1>❌ Initialization Failed</h1>
                    <p>RAGMaker Desktop failed to start properly.</p>
                    <details>
                        <summary>Error Details</summary>
                        <pre>${error.stack || error.message}</pre>
                    </details>
                    <button onclick="window.location.reload()" class="btn btn-primary">
                        Try Again
                    </button>
                </div>
            </div>
        `;
    }

    // Utility method for API calls
    async makeAPICall(endpoint, options = {}) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const config = { ...defaultOptions, ...options };
        
        if (config.body && config.method !== 'GET') {
            config.body = JSON.stringify(config.body);
        }

        const response = await fetch(endpoint, config);
        
        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    // Public API
    getComponent(name) {
        return this.components[name];
    }

    isReady() {
        return this.isInitialized;
    }

    // Cleanup
    destroy() {
        this.saveUserState();
        
        // Cleanup components
        Object.values(this.components).forEach(component => {
            if (component && typeof component.destroy === 'function') {
                component.destroy();
            }
        });
    }
}

// Initialize the application
window.ragmakerApp = new RAGMakerDesktop();

// Global error handling styles
const errorStyles = `
<style>
.error-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: var(--color-bg-primary, #ffffff);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.error-content {
    text-align: center;
    max-width: 500px;
    padding: 2rem;
}

.error-content h1 {
    color: var(--color-error, #dc3545);
    margin-bottom: 1rem;
}

.error-content p {
    color: var(--color-text-secondary, #6c757d);
    margin-bottom: 1rem;
}

.error-content details {
    text-align: left;
    margin: 1rem 0;
    padding: 1rem;
    background: var(--color-bg-secondary, #f8f9fa);
    border-radius: 8px;
}

.error-content pre {
    font-size: 12px;
    overflow: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
}

.error-content .btn {
    display: inline-block;
    padding: 10px 20px;
    background: var(--color-primary, #007bff);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    text-decoration: none;
}

.error-content .btn:hover {
    background: var(--color-primary-dark, #0056b3);
}
</style>
`;

document.head.insertAdjacentHTML('beforeend', errorStyles);
// Browser-compatible Main Application for RAGMaker Desktop

class RAGMakerApp {
    constructor() {
        this.currentView = 'chat';
        this.sidebarCollapsed = false;
        this.platform = this.getPlatform();
        this.isElectron = window.electronAPI !== undefined;
        
        // DOM elements
        this.elements = {};
        
        // Initialize
        this.init();
    }
    
    async init() {
        try {
            console.log('🚀 Initializing RAGMaker Desktop...');
            
            // Show loading screen
            this.showLoadingScreen();
            
            // Setup platform-specific styles
            this.setupPlatform();
            
            // Bind DOM elements
            this.bindElements();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Setup keyboard shortcuts
            this.setupKeyboardShortcuts();
            
            // Load user preferences
            this.loadPreferences();
            
            // Initialize navigation
            this.initializeNavigation();
            
            // Check API connectivity
            await this.checkApiConnectivity();
            
            // Hide loading screen and show app
            this.hideLoadingScreen();
            
            // Dispatch app ready event
            window.dispatchEvent(new CustomEvent('app:ready'));
            
            console.log('✅ RAGMaker Desktop initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize app:', error);
            this.handleInitializationError(error);
        }
    }
    
    showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
        }
    }
    
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        const app = document.getElementById('app');
        
        if (loadingScreen) {
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
                if (app) {
                    app.classList.remove('hidden');
                }
            }, 500);
        }
    }
    
    setupPlatform() {
        document.body.setAttribute('data-os', this.platform);
        
        // Setup Electron integration
        if (this.isElectron && window.electronAPI) {
            this.setupElectronIntegration();
        }
    }
    
    setupElectronIntegration() {
        // Title bar controls
        const titleButtons = document.querySelectorAll('.title-button');
        titleButtons.forEach(button => {
            const action = button.classList.contains('minimize') ? 'minimize' :
                          button.classList.contains('maximize') ? 'maximize' :
                          button.classList.contains('close') ? 'close' : null;
            
            if (action && window.electronAPI[action]) {
                button.addEventListener('click', () => {
                    window.electronAPI[action]();
                });
            }
        });
        
        // Setup menu integration
        if (window.electronAPI.onMenuAction) {
            window.electronAPI.onMenuAction((action, data) => {
                this.handleMenuAction(action, data);
            });
        }
    }
    
    handleMenuAction(action, data) {
        switch (action) {
            case 'menu:new-project':
                this.switchView('documents');
                const uploadButton = document.getElementById('uploadDocuments');
                if (uploadButton) uploadButton.click();
                break;
                
            case 'menu:open-project':
                // Handle project opening
                break;
                
            case 'menu:index-documents':
                this.switchView('documents');
                break;
                
            case 'menu:search':
                this.switchView('search');
                break;
                
            case 'menu:add-youtube-channel':
                this.switchView('channels');
                break;
                
            case 'menu:bulk-import-youtube':
                this.switchView('channels');
                break;
        }
    }
    
    bindElements() {
        this.elements.app = document.getElementById('app');
        this.elements.loadingScreen = document.getElementById('loading-screen');
        this.elements.sidebar = document.getElementById('sidebar');
        this.elements.sidebarToggle = document.getElementById('sidebarToggle');
        this.elements.navLinks = document.querySelectorAll('.nav-link');
        this.elements.views = document.querySelectorAll('.view');
        this.elements.titleButtons = document.querySelectorAll('.title-button');
    }
    
    setupEventListeners() {
        // Sidebar toggle
        if (this.elements.sidebarToggle) {
            this.elements.sidebarToggle.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }
        
        // Navigation links
        this.elements.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const view = link.getAttribute('data-view');
                if (view) {
                    this.switchView(view);
                }
            });
        });
        
        // Window resize handler
        window.addEventListener('resize', this.debounce(() => {
            this.handleResize();
        }, 250));
        
        // Online/offline status
        window.addEventListener('online', () => {
            notificationService.success('Connection restored');
            this.checkApiConnectivity();
        });
        
        window.addEventListener('offline', () => {
            notificationService.warning('Connection lost - working offline');
        });
        
        // Prevent default drag and drop on window
        window.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        window.addEventListener('drop', (e) => {
            e.preventDefault();
        });
        
        // Handle beforeunload
        window.addEventListener('beforeunload', (e) => {
            this.handleBeforeUnload(e);
        });
    }
    
    setupKeyboardShortcuts() {
        const shortcuts = [
            { key: 'ctrl+b', action: () => this.toggleSidebar() },
            { key: 'ctrl+n', action: () => this.triggerDocumentUpload() }
        ];
        
        document.addEventListener('keydown', (e) => {
            shortcuts.forEach(({ key, action }) => {
                if (this.matchesShortcut(e, key)) {
                    e.preventDefault();
                    action();
                }
            });
        });
    }
    
    matchesShortcut(event, shortcut) {
        const keys = shortcut.toLowerCase().split('+');
        const modifiers = {
            ctrl: keys.includes('ctrl'),
            shift: keys.includes('shift'),
            alt: keys.includes('alt'),
            meta: keys.includes('meta') || keys.includes('cmd')
        };
        
        const key = keys.find(k => !['ctrl', 'shift', 'alt', 'meta', 'cmd'].includes(k));
        
        return (
            event.ctrlKey === modifiers.ctrl &&
            event.shiftKey === modifiers.shift &&
            event.altKey === modifiers.alt &&
            event.metaKey === modifiers.meta &&
            event.key.toLowerCase() === key
        );
    }
    
    loadPreferences() {
        // Load sidebar state
        const sidebarCollapsed = this.getStorageItem('ragmaker_sidebar_collapsed', false);
        if (sidebarCollapsed) {
            this.toggleSidebar();
        }
    }
    
    initializeNavigation() {
        // Set initial view
        const savedView = this.getStorageItem('ragmaker_current_view', 'chat');
        this.switchView(savedView);
    }
    
    async checkApiConnectivity() {
        try {
            const isAvailable = await apiService.isAvailable();
            
            if (isAvailable) {
                notificationService.success('Connected to RAGMaker API', { duration: 2000 });
            } else {
                notificationService.warning('API is not responding - some features may be limited');
            }
        } catch (error) {
            console.error('API connectivity check failed:', error);
            notificationService.error('Failed to connect to API - working in offline mode');
        }
    }
    
    handleInitializationError(error) {
        console.error('App initialization failed:', error);
        
        // Hide loading screen
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.innerHTML = `
                <div class="loading-container">
                    <div class="error-icon" style="color: #ef4444; margin-bottom: 1rem;">
                        <svg width="64" height="64" viewBox="0 0 64 64">
                            <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-width="2" fill="none"/>
                            <path d="M32 16v16M32 40h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                        </svg>
                    </div>
                    <h2>Failed to Initialize</h2>
                    <p>RAGMaker encountered an error during startup.</p>
                    <button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #2563eb; color: white; border: none; border-radius: 0.5rem; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
        
        // Dispatch error event
        window.dispatchEvent(new CustomEvent('app:error', {
            detail: { error }
        }));
    }
    
    switchView(viewName) {
        const validViews = ['chat', 'documents', 'projects', 'search', 'channels', 'settings'];
        
        if (!validViews.includes(viewName)) {
            console.warn(`Invalid view: ${viewName}`);
            return;
        }
        
        // Hide all views
        this.elements.views.forEach(view => {
            view.classList.add('hidden');
        });
        
        // Show target view
        const targetView = document.getElementById(`${viewName}-view`);
        if (targetView) {
            targetView.classList.remove('hidden');
        }
        
        // Update navigation
        this.elements.navLinks.forEach(link => {
            const linkView = link.getAttribute('data-view');
            const navItem = link.closest('.nav-item');
            
            if (linkView === viewName) {
                navItem.classList.add('active');
            } else {
                navItem.classList.remove('active');
            }
        });
        
        // Update current view
        this.currentView = viewName;
        this.setStorageItem('ragmaker_current_view', viewName);
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent('view:changed', {
            detail: { view: viewName }
        }));
        
        console.log(`Switched to view: ${viewName}`);
    }
    
    toggleSidebar() {
        if (!this.elements.sidebar) return;
        
        this.sidebarCollapsed = !this.sidebarCollapsed;
        this.elements.sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
        
        // Save state
        this.setStorageItem('ragmaker_sidebar_collapsed', this.sidebarCollapsed);
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent('sidebar:toggled', {
            detail: { collapsed: this.sidebarCollapsed }
        }));
    }
    
    handleResize() {
        const width = window.innerWidth;
        
        // Auto-collapse sidebar on small screens
        if (width < 768 && !this.sidebarCollapsed) {
            this.toggleSidebar();
        }
        
        // Auto-expand sidebar on large screens
        if (width >= 1024 && this.sidebarCollapsed) {
            this.toggleSidebar();
        }
    }
    
    triggerDocumentUpload() {
        this.switchView('documents');
        setTimeout(() => {
            const uploadButton = document.getElementById('uploadDocuments');
            if (uploadButton) {
                uploadButton.click();
            }
        }, 100);
    }
    
    handleBeforeUnload(event) {
        // Save any unsaved data
        this.saveApplicationState();
    }
    
    saveApplicationState() {
        const state = {
            currentView: this.currentView,
            sidebarCollapsed: this.sidebarCollapsed,
            timestamp: new Date().toISOString()
        };
        
        this.setStorageItem('ragmaker_app_state', state);
    }
    
    // Utility methods
    getPlatform() {
        const platform = navigator.platform.toLowerCase();
        if (platform.includes('win')) return 'win32';
        if (platform.includes('mac')) return 'darwin';
        if (platform.includes('linux')) return 'linux';
        return 'unknown';
    }
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    getStorageItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error(`Error reading from localStorage for key: ${key}`, error);
            return defaultValue;
        }
    }
    
    setStorageItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Error writing to localStorage for key: ${key}`, error);
            return false;
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.ragmakerApp = new RAGMakerApp();
});

console.log('✅ RAGMaker App loaded');
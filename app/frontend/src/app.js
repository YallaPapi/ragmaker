// Main Application - RAGMaker Desktop

import apiService from './services/api.js';
import notificationService from './services/notification.js';
import themeService from './services/theme.js';
import ChatComponent from './components/chat.js';
import DocumentsComponent from './components/documents.js';

import { 
    VIEWS, 
    EVENTS, 
    KEYBOARD_SHORTCUTS, 
    STORAGE_KEYS,
    APP_CONFIG,
    PLATFORM
} from './utils/constants.js';
import { 
    storage, 
    getPlatform, 
    isElectron, 
    createShortcutChecker,
    debounce
} from './utils/helpers.js';

class RAGMakerApp {
    constructor() {
        this.currentView = VIEWS.CHAT;
        this.sidebarCollapsed = false;
        this.platform = getPlatform();
        this.isElectron = isElectron();
        
        // Components
        this.components = {
            chat: null,
            documents: null,
            projects: null,
            search: null,
            channels: null,
            settings: null
        };
        
        // DOM elements
        this.elements = {
            app: null,
            loadingScreen: null,
            sidebar: null,
            sidebarToggle: null,
            navLinks: null,
            views: null,
            titleButtons: null
        };
        
        // Initialize
        this.init();
    }
    
    /**
     * Initialize application
     */
    async init() {
        try {
            // Show loading screen
            this.showLoadingScreen();
            
            // Setup platform-specific styles
            this.setupPlatform();
            
            // Bind DOM elements
            this.bindElements();
            
            // Setup services
            await this.setupServices();
            
            // Initialize components
            this.initializeComponents();
            
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
            window.dispatchEvent(new CustomEvent(EVENTS.APP_READY));
            
            console.log('RAGMaker Desktop initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.handleInitializationError(error);
        }
    }
    
    /**
     * Show loading screen
     */
    showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
        }
    }
    
    /**
     * Hide loading screen
     */
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        const app = document.getElementById('app');
        
        if (loadingScreen) {
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
                if (app) {
                    app.classList.remove('hidden');
                }
            }, 500); // Small delay for smooth transition
        }
    }
    
    /**
     * Setup platform-specific features
     */
    setupPlatform() {
        document.body.setAttribute('data-os', this.platform);
        
        // Setup Electron integration
        if (this.isElectron && window.electronAPI) {
            this.setupElectronIntegration();
        }
        
        // Platform-specific adjustments
        switch (this.platform) {
            case PLATFORM.MACOS:
                document.body.classList.add('platform-mac');
                break;
            case PLATFORM.WINDOWS:
                document.body.classList.add('platform-windows');
                break;
            case PLATFORM.LINUX:
                document.body.classList.add('platform-linux');
                break;
        }
    }
    
    /**
     * Setup Electron integration
     */
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
        
        // Handle window events
        if (window.electronAPI.onWindowEvent) {
            window.electronAPI.onWindowEvent((event, data) => {
                this.handleWindowEvent(event, data);
            });
        }
        
        // Setup menu integration
        if (window.electronAPI.onMenuAction) {
            window.electronAPI.onMenuAction((action, data) => {
                this.handleMenuAction(action, data);
            });
        }
    }
    
    /**
     * Handle Electron window events
     */
    handleWindowEvent(event, data) {
        switch (event) {
            case 'focus':
                document.body.classList.add('window-focused');
                break;
            case 'blur':
                document.body.classList.remove('window-focused');
                break;
            case 'maximize':
                document.body.classList.add('window-maximized');
                break;
            case 'unmaximize':
                document.body.classList.remove('window-maximized');
                break;
        }
    }
    
    /**
     * Handle Electron menu actions
     */
    handleMenuAction(action, data) {
        switch (action) {
            case 'new-document':
                this.switchView(VIEWS.DOCUMENTS);
                // Trigger document upload
                const uploadButton = document.getElementById('uploadDocuments');
                if (uploadButton) uploadButton.click();
                break;
                
            case 'toggle-sidebar':
                this.toggleSidebar();
                break;
                
            case 'switch-view':
                if (data.view) {
                    this.switchView(data.view);
                }
                break;
                
            case 'toggle-theme':
                themeService.toggleTheme();
                break;
                
            case 'show-settings':
                this.switchView(VIEWS.SETTINGS);
                break;
        }
    }
    
    /**
     * Bind DOM elements
     */
    bindElements() {
        this.elements.app = document.getElementById('app');
        this.elements.loadingScreen = document.getElementById('loading-screen');
        this.elements.sidebar = document.getElementById('sidebar');
        this.elements.sidebarToggle = document.getElementById('sidebarToggle');
        this.elements.navLinks = document.querySelectorAll('.nav-link');
        this.elements.views = document.querySelectorAll('.view');
        this.elements.titleButtons = document.querySelectorAll('.title-button');
    }
    
    /**
     * Setup services
     */
    async setupServices() {
        // API service is already initialized
        
        // Theme service is already initialized
        
        // Notification service is already initialized
        
        // Wait for theme to be applied
        await themeService.waitForTheme();
    }
    
    /**
     * Initialize components
     */
    initializeComponents() {
        // Initialize chat component
        this.components.chat = new ChatComponent();
        
        // Initialize documents component
        this.components.documents = new DocumentsComponent();
        
        // TODO: Initialize other components
        // this.components.projects = new ProjectsComponent();
        // this.components.search = new SearchComponent();
        // this.components.channels = new ChannelsComponent();
        // this.components.settings = new SettingsComponent();
    }
    
    /**
     * Setup event listeners
     */
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
        window.addEventListener('resize', debounce(() => {
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
        
        // App-specific events
        window.addEventListener(EVENTS.THEME_CHANGED, (e) => {
            this.handleThemeChange(e.detail);
        });
        
        window.addEventListener(EVENTS.CONNECTION_ONLINE, () => {
            this.handleConnectionChange(true);
        });
        
        window.addEventListener(EVENTS.CONNECTION_OFFLINE, () => {
            this.handleConnectionChange(false);
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
    
    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        const shortcuts = [
            { key: KEYBOARD_SHORTCUTS.TOGGLE_SIDEBAR, action: () => this.toggleSidebar() },
            { key: KEYBOARD_SHORTCUTS.TOGGLE_THEME, action: () => themeService.toggleTheme() },
            { key: KEYBOARD_SHORTCUTS.OPEN_SETTINGS, action: () => this.switchView(VIEWS.SETTINGS) },
            { key: KEYBOARD_SHORTCUTS.NEW_DOCUMENT, action: () => this.triggerDocumentUpload() }
        ];
        
        document.addEventListener('keydown', (e) => {
            shortcuts.forEach(({ key, action }) => {
                const checker = createShortcutChecker(key);
                if (checker(e)) {
                    e.preventDefault();
                    action();
                }
            });
        });
    }
    
    /**
     * Load user preferences
     */
    loadPreferences() {
        // Load sidebar state
        const sidebarCollapsed = storage.get(STORAGE_KEYS.SIDEBAR_COLLAPSED, false);
        if (sidebarCollapsed) {
            this.toggleSidebar();
        }
        
        // Load other preferences
        const preferences = storage.get(STORAGE_KEYS.USER_PREFERENCES, {});
        this.applyPreferences(preferences);
    }
    
    /**
     * Apply user preferences
     */
    applyPreferences(preferences) {
        // Apply any custom preferences
        if (preferences.compactMode) {
            document.body.classList.add('compact-mode');
        }
        
        if (preferences.highContrast) {
            document.body.classList.add('high-contrast');
        }
    }
    
    /**
     * Initialize navigation
     */
    initializeNavigation() {
        // Set initial view
        const savedView = storage.get('ragmaker_current_view', VIEWS.CHAT);
        this.switchView(savedView);
    }
    
    /**
     * Check API connectivity
     */
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
    
    /**
     * Handle initialization error
     */
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
        window.dispatchEvent(new CustomEvent(EVENTS.APP_ERROR, {
            detail: { error }
        }));
    }
    
    /**
     * Switch view
     */
    switchView(viewName) {
        if (!Object.values(VIEWS).includes(viewName)) {
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
        storage.set('ragmaker_current_view', viewName);
        
        // Focus appropriate component
        this.focusCurrentView();
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent(EVENTS.VIEW_CHANGED, {
            detail: { view: viewName }
        }));
        
        console.log(`Switched to view: ${viewName}`);
    }
    
    /**
     * Focus current view
     */
    focusCurrentView() {
        switch (this.currentView) {
            case VIEWS.CHAT:
                if (this.components.chat) {
                    this.components.chat.focusInput();
                }
                break;
                
            case VIEWS.DOCUMENTS:
                // Focus could be implemented in documents component
                break;
                
            // Add focus logic for other views as needed
        }
    }
    
    /**
     * Toggle sidebar
     */
    toggleSidebar() {
        if (!this.elements.sidebar) return;
        
        this.sidebarCollapsed = !this.sidebarCollapsed;
        this.elements.sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
        
        // Save state
        storage.set(STORAGE_KEYS.SIDEBAR_COLLAPSED, this.sidebarCollapsed);
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent(EVENTS.SIDEBAR_TOGGLED, {
            detail: { collapsed: this.sidebarCollapsed }
        }));
    }
    
    /**
     * Handle window resize
     */
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
    
    /**
     * Handle theme change
     */
    handleThemeChange(detail) {
        // Update any theme-dependent UI elements
        console.log(`Theme changed to: ${detail.theme}`);
    }
    
    /**
     * Handle connection change
     */
    handleConnectionChange(isOnline) {
        document.body.setAttribute('data-online', isOnline.toString());
        
        if (!isOnline) {
            // Handle offline mode
            console.log('App is now offline');
        } else {
            // Handle online mode
            console.log('App is now online');
            this.checkApiConnectivity();
        }
    }
    
    /**
     * Trigger document upload
     */
    triggerDocumentUpload() {
        this.switchView(VIEWS.DOCUMENTS);
        setTimeout(() => {
            const uploadButton = document.getElementById('uploadDocuments');
            if (uploadButton) {
                uploadButton.click();
            }
        }, 100);
    }
    
    /**
     * Handle before unload
     */
    handleBeforeUnload(event) {
        // Save any unsaved data
        this.saveApplicationState();
        
        // Check if there are ongoing operations
        if (this.components.documents?.isUploading) {
            event.preventDefault();
            event.returnValue = 'File upload is in progress. Are you sure you want to leave?';
            return event.returnValue;
        }
    }
    
    /**
     * Save application state
     */
    saveApplicationState() {
        const state = {
            currentView: this.currentView,
            sidebarCollapsed: this.sidebarCollapsed,
            timestamp: new Date().toISOString()
        };
        
        storage.set('ragmaker_app_state', state);
    }
    
    /**
     * Get application state
     */
    getState() {
        return {
            currentView: this.currentView,
            sidebarCollapsed: this.sidebarCollapsed,
            platform: this.platform,
            isElectron: this.isElectron,
            components: Object.keys(this.components).reduce((acc, key) => {
                if (this.components[key]?.getState) {
                    acc[key] = this.components[key].getState();
                }
                return acc;
            }, {})
        };
    }
    
    /**
     * Destroy application
     */
    destroy() {
        // Clean up components
        Object.values(this.components).forEach(component => {
            if (component?.destroy) {
                component.destroy();
            }
        });
        
        // Save final state
        this.saveApplicationState();
        
        console.log('RAGMaker Desktop destroyed');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.ragmakerApp = new RAGMakerApp();
});

// Handle app cleanup on unload
window.addEventListener('unload', () => {
    if (window.ragmakerApp) {
        window.ragmakerApp.destroy();
    }
});

// Export for potential external use
export default RAGMakerApp;
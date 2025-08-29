// Desktop UI Manager - Main UI controller for desktop-specific features
class DesktopUI {
    constructor() {
        this.sidebar = null;
        this.currentTab = 'chat';
        this.theme = 'light';
        this.isMaximized = false;
        this.sidebarCollapsed = false;
        
        this.init();
    }

    init() {
        this.initElements();
        this.setupEventListeners();
        this.setupTheme();
        this.setupTabs();
        this.setupSidebar();
        this.setupToolbar();
        this.setupWindowControls();
        this.setupSearch();
        this.loadUserPreferences();
    }

    initElements() {
        this.sidebar = document.getElementById('sidebar');
        this.mainContent = document.querySelector('.main-content');
        this.tabContentContainer = document.querySelector('.tab-content-container');
        this.globalSearch = document.getElementById('globalSearch');
        this.currentProjectTitle = document.getElementById('currentProjectTitle');
    }

    setupEventListeners() {
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }

        // Chat sidebar toggle
        const chatSidebarToggle = document.getElementById('chatSidebarToggle');
        if (chatSidebarToggle) {
            chatSidebarToggle.addEventListener('click', () => this.toggleChatSidebar());
        }

        // Theme toggle
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Project selector
        const quickProjectSelect = document.getElementById('quickProjectSelect');
        if (quickProjectSelect) {
            quickProjectSelect.addEventListener('change', (e) => this.switchProject(e.target.value));
        }

        // Window controls
        this.setupWindowControlListeners();

        // Responsive behavior
        window.addEventListener('resize', () => this.handleResize());
    }

    setupWindowControlListeners() {
        const minimizeBtn = document.getElementById('minimizeBtn');
        const maximizeBtn = document.getElementById('maximizeBtn');
        const closeBtn = document.getElementById('closeBtn');

        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => this.minimizeWindow());
        }

        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', () => this.toggleMaximize());
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeWindow());
        }
    }

    setupTheme() {
        // Load saved theme
        const savedTheme = localStorage.getItem('ragmaker-theme') || 'light';
        this.setTheme(savedTheme);
    }

    setTheme(theme) {
        this.theme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('ragmaker-theme', theme);

        // Update theme toggle icon
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const icon = themeToggle.querySelector('.btn-icon');
            if (icon) {
                icon.textContent = theme === 'dark' ? '☀️' : '🌙';
            }
        }

        // Notify Electron main process if available
        if (window.electronAPI) {
            window.electronAPI.setTheme(theme);
        }
    }

    toggleTheme() {
        const newTheme = this.theme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    setupTabs() {
        const navItems = document.querySelectorAll('.nav-item[data-tab]');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = item.getAttribute('data-tab');
                this.switchTab(tab);
            });
        });

        // Set initial active tab
        this.switchTab('chat');
    }

    switchTab(tabName) {
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeNavItem = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeNavItem) {
            activeNavItem.classList.add('active');
        }

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        const activeContent = document.getElementById(`${tabName}-content`);
        if (activeContent) {
            activeContent.classList.add('active');
        }

        this.currentTab = tabName;
        this.updateToolbarForTab(tabName);
        
        // Initialize tab-specific features
        this.initializeTab(tabName);
    }

    updateToolbarForTab(tabName) {
        // Show/hide toolbar buttons based on active tab
        const toolbarBtns = document.querySelectorAll('.toolbar-btn');
        
        // Basic visibility rules
        const btnVisibility = {
            'chat': ['newProjectBtn', 'exportBtn', 'themeToggle', 'helpBtn'],
            'channels': ['newProjectBtn', 'importBtn', 'exportBtn', 'themeToggle', 'helpBtn'],
            'knowledge': ['newProjectBtn', 'importBtn', 'exportBtn', 'themeToggle', 'helpBtn'],
            'analytics': ['exportBtn', 'themeToggle', 'helpBtn'],
            'projects': ['newProjectBtn', 'importBtn', 'exportBtn', 'themeToggle', 'helpBtn'],
            'settings': ['themeToggle', 'helpBtn']
        };

        const visibleBtns = btnVisibility[tabName] || [];
        
        toolbarBtns.forEach(btn => {
            if (visibleBtns.includes(btn.id)) {
                btn.style.display = 'flex';
            } else if (btn.id !== 'userMenuBtn') { // Always show user menu
                btn.style.display = 'none';
            }
        });
    }

    initializeTab(tabName) {
        switch (tabName) {
            case 'chat':
                this.initializeChatTab();
                break;
            case 'channels':
                this.initializeChannelsTab();
                break;
            case 'knowledge':
                this.initializeKnowledgeTab();
                break;
            case 'analytics':
                this.initializeAnalyticsTab();
                break;
            case 'projects':
                this.initializeProjectsTab();
                break;
            case 'settings':
                this.initializeSettingsTab();
                break;
        }
    }

    initializeChatTab() {
        // Setup chat-specific UI elements
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            this.setupAutoResize(messageInput);
        }
    }

    initializeChannelsTab() {
        // Load and display channels
        this.loadChannels();
    }

    initializeKnowledgeTab() {
        // Load knowledge base stats
        this.loadKnowledgeStats();
    }

    initializeAnalyticsTab() {
        // Load analytics dashboard
        this.loadAnalytics();
    }

    initializeProjectsTab() {
        // Load projects
        this.loadProjects();
    }

    initializeSettingsTab() {
        // Setup settings panels
        this.setupSettings();
    }

    setupAutoResize(textarea) {
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        });
    }

    setupSidebar() {
        // Load sidebar state
        const collapsed = localStorage.getItem('ragmaker-sidebar-collapsed') === 'true';
        if (collapsed) {
            this.setSidebarCollapsed(true);
        }
    }

    toggleSidebar() {
        this.setSidebarCollapsed(!this.sidebarCollapsed);
    }

    setSidebarCollapsed(collapsed) {
        this.sidebarCollapsed = collapsed;
        
        if (this.sidebar) {
            if (collapsed) {
                this.sidebar.classList.add('collapsed');
            } else {
                this.sidebar.classList.remove('collapsed');
            }
        }

        localStorage.setItem('ragmaker-sidebar-collapsed', collapsed.toString());
    }

    toggleChatSidebar() {
        const chatSidebar = document.getElementById('chatSidebar');
        if (chatSidebar) {
            chatSidebar.classList.toggle('collapsed');
        }
    }

    setupToolbar() {
        // New project button
        const newProjectBtn = document.getElementById('newProjectBtn');
        if (newProjectBtn) {
            newProjectBtn.addEventListener('click', () => this.showNewProjectDialog());
        }

        // Import button
        const importBtn = document.getElementById('importBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.showImportDialog());
        }

        // Export button
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.showExportDialog());
        }

        // Help button
        const helpBtn = document.getElementById('helpBtn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => this.showHelpDialog());
        }
    }

    setupSearch() {
        if (!this.globalSearch) return;

        // Search functionality
        this.globalSearch.addEventListener('input', (e) => {
            this.handleGlobalSearch(e.target.value);
        });

        this.globalSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.executeGlobalSearch(e.target.value);
            }
        });

        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.executeGlobalSearch(this.globalSearch.value);
            });
        }
    }

    handleGlobalSearch(query) {
        // Implement live search suggestions
        if (query.length < 2) return;
        
        // Debounce search
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.performSearch(query, true); // true for suggestions only
        }, 300);
    }

    executeGlobalSearch(query) {
        if (!query.trim()) return;
        
        this.performSearch(query, false);
        
        // Switch to appropriate tab based on search results
        this.switchTab('knowledge'); // or 'chat' for Q&A
    }

    performSearch(query, suggestionsOnly = false) {
        // Implement search across all content
        console.log('Searching for:', query, suggestionsOnly ? '(suggestions)' : '(full search)');
        
        if (window.searchManager) {
            window.searchManager.search(query, suggestionsOnly);
        }
    }

    // Window controls
    minimizeWindow() {
        if (window.electronAPI) {
            window.electronAPI.minimize();
        }
    }

    toggleMaximize() {
        if (window.electronAPI) {
            window.electronAPI.toggleMaximize();
        }
        
        this.isMaximized = !this.isMaximized;
        this.updateMaximizeButton();
    }

    updateMaximizeButton() {
        const maximizeBtn = document.getElementById('maximizeBtn');
        if (maximizeBtn) {
            maximizeBtn.textContent = this.isMaximized ? '❐' : '□';
            maximizeBtn.title = this.isMaximized ? 'Restore (Ctrl+Shift+M)' : 'Maximize (Ctrl+Shift+M)';
        }
    }

    closeWindow() {
        if (window.electronAPI) {
            window.electronAPI.close();
        }
    }

    // Project management
    switchProject(projectId) {
        if (!projectId) return;
        
        console.log('Switching to project:', projectId);
        
        if (this.currentProjectTitle) {
            this.currentProjectTitle.textContent = projectId;
        }
        
        // Notify other components
        if (window.projectManager) {
            window.projectManager.switchProject(projectId);
        }
        
        // Refresh current tab
        this.initializeTab(this.currentTab);
    }

    // Dialog management
    showNewProjectDialog() {
        const dialog = this.createDialog('Create New Project', `
            <div class="form-group">
                <label for="projectName">Project Name</label>
                <input type="text" id="projectName" placeholder="Enter project name" required>
            </div>
            <div class="form-group">
                <label for="projectDescription">Description (optional)</label>
                <textarea id="projectDescription" placeholder="Project description"></textarea>
            </div>
        `, [
            {
                label: 'Cancel',
                secondary: true,
                handler: () => dialog.close()
            },
            {
                label: 'Create Project',
                primary: true,
                handler: () => this.createProject(dialog)
            }
        ]);
        
        dialog.show();
    }

    showImportDialog() {
        const dialog = this.createDialog('Import Data', `
            <div class="import-options">
                <div class="import-option" data-type="channels">
                    <div class="import-icon">📺</div>
                    <div class="import-label">Import Channels</div>
                    <div class="import-desc">Import channel data from JSON file</div>
                </div>
                <div class="import-option" data-type="projects">
                    <div class="import-icon">📁</div>
                    <div class="import-label">Import Projects</div>
                    <div class="import-desc">Import project data from backup</div>
                </div>
                <div class="import-option" data-type="knowledge">
                    <div class="import-icon">🧠</div>
                    <div class="import-label">Import Knowledge</div>
                    <div class="import-desc">Import documents or text files</div>
                </div>
                <div class="import-option" data-type="file">
                    <div class="import-icon">📄</div>
                    <div class="import-label">Select Files</div>
                    <div class="import-desc">Choose files from computer</div>
                </div>
            </div>
        `, [
            {
                label: 'Close',
                secondary: true,
                handler: () => dialog.close()
            }
        ]);
        
        dialog.element.addEventListener('click', (e) => {
            const option = e.target.closest('.import-option');
            if (option) {
                this.handleImportOption(option.dataset.type);
                dialog.close();
            }
        });
        
        dialog.show();
    }

    showExportDialog() {
        const dialog = this.createDialog('Export Data', `
            <div class="export-options">
                <div class="export-option" data-type="current-project">
                    <input type="checkbox" id="export-current" checked>
                    <label for="export-current">Current Project Data</label>
                </div>
                <div class="export-option" data-type="channels">
                    <input type="checkbox" id="export-channels" checked>
                    <label for="export-channels">Channel Information</label>
                </div>
                <div class="export-option" data-type="knowledge">
                    <input type="checkbox" id="export-knowledge">
                    <label for="export-knowledge">Knowledge Base (Large file)</label>
                </div>
                <div class="export-option" data-type="settings">
                    <input type="checkbox" id="export-settings">
                    <label for="export-settings">Application Settings</label>
                </div>
            </div>
            <div class="form-group">
                <label for="exportFormat">Export Format</label>
                <select id="exportFormat">
                    <option value="json">JSON</option>
                    <option value="csv">CSV (where applicable)</option>
                </select>
            </div>
        `, [
            {
                label: 'Cancel',
                secondary: true,
                handler: () => dialog.close()
            },
            {
                label: 'Export',
                primary: true,
                handler: () => this.performExport(dialog)
            }
        ]);
        
        dialog.show();
    }

    showHelpDialog() {
        const dialog = this.createDialog('Help & Support', `
            <div class="help-sections">
                <div class="help-section">
                    <h3>Quick Start</h3>
                    <ul>
                        <li>Add YouTube channels to build your knowledge base</li>
                        <li>Ask questions about your indexed content</li>
                        <li>Manage projects to organize different topics</li>
                    </ul>
                </div>
                <div class="help-section">
                    <h3>Keyboard Shortcuts</h3>
                    <button class="help-link" onclick="window.keyboardShortcuts?.showShortcutList()">
                        View All Shortcuts
                    </button>
                </div>
                <div class="help-section">
                    <h3>Support</h3>
                    <div class="help-links">
                        <button class="help-link" onclick="window.electronAPI?.openExternal('https://github.com/ragmaker/issues')">
                            Report Issues
                        </button>
                        <button class="help-link" onclick="window.electronAPI?.openExternal('https://ragmaker.com/docs')">
                            Documentation
                        </button>
                    </div>
                </div>
            </div>
        `, [
            {
                label: 'Close',
                primary: true,
                handler: () => dialog.close()
            }
        ]);
        
        dialog.show();
    }

    createDialog(title, content, buttons = []) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'modal-content';
        
        modal.innerHTML = `
            <div class="modal-header">
                <h2>${title}</h2>
                <button class="modal-close">×</button>
            </div>
            <div class="modal-body">
                ${content}
            </div>
            ${buttons.length > 0 ? `
                <div class="modal-footer">
                    ${buttons.map(btn => `
                        <button class="btn ${btn.primary ? 'btn-primary' : 'btn-secondary'}" data-action="${btn.label}">
                            ${btn.label}
                        </button>
                    `).join('')}
                </div>
            ` : ''}
        `;
        
        overlay.appendChild(modal);
        
        // Event handlers
        const closeBtn = modal.querySelector('.modal-close');
        closeBtn.addEventListener('click', () => overlay.remove());
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
        
        buttons.forEach(btn => {
            const btnElement = modal.querySelector(`[data-action="${btn.label}"]`);
            if (btnElement) {
                btnElement.addEventListener('click', btn.handler);
            }
        });
        
        return {
            element: overlay,
            show: () => document.body.appendChild(overlay),
            close: () => overlay.remove()
        };
    }

    // Content loading methods
    async loadChannels() {
        const channelsGrid = document.getElementById('channelsGrid');
        if (!channelsGrid) return;
        
        try {
            // Show loading state
            channelsGrid.innerHTML = '<div class="loading-state">Loading channels...</div>';
            
            // Load channels data
            const channels = await this.fetchChannels();
            
            if (channels.length === 0) {
                channelsGrid.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📺</div>
                        <h3>No Channels Added</h3>
                        <p>Add YouTube channels to build your knowledge base</p>
                        <button class="btn btn-primary" id="addFirstChannel">Add Channel</button>
                    </div>
                `;
                
                const addBtn = channelsGrid.querySelector('#addFirstChannel');
                if (addBtn) {
                    addBtn.addEventListener('click', () => this.showAddChannelDialog());
                }
            } else {
                channelsGrid.innerHTML = channels.map(channel => this.createChannelCard(channel)).join('');
            }
        } catch (error) {
            channelsGrid.innerHTML = '<div class="error-state">Failed to load channels</div>';
        }
    }

    async loadKnowledgeStats() {
        const knowledgeStats = document.getElementById('knowledgeStats');
        if (!knowledgeStats) return;
        
        try {
            const stats = await this.fetchKnowledgeStats();
            
            knowledgeStats.innerHTML = `
                <div class="knowledge-stat">
                    <span class="knowledge-stat-number">${stats.videos || 0}</span>
                    <span class="knowledge-stat-label">Videos Indexed</span>
                </div>
                <div class="knowledge-stat">
                    <span class="knowledge-stat-number">${stats.chunks || 0}</span>
                    <span class="knowledge-stat-label">Knowledge Chunks</span>
                </div>
                <div class="knowledge-stat">
                    <span class="knowledge-stat-number">${stats.channels || 0}</span>
                    <span class="knowledge-stat-label">Channels</span>
                </div>
                <div class="knowledge-stat">
                    <span class="knowledge-stat-number">${this.formatBytes(stats.size || 0)}</span>
                    <span class="knowledge-stat-label">Total Size</span>
                </div>
            `;
        } catch (error) {
            knowledgeStats.innerHTML = '<div class="error-state">Failed to load statistics</div>';
        }
    }

    async loadProjects() {
        const projectsGrid = document.getElementById('projectsGrid');
        if (!projectsGrid) return;
        
        try {
            const projects = await this.fetchProjects();
            
            if (projects.length === 0) {
                projectsGrid.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📁</div>
                        <h3>No Projects Created</h3>
                        <p>Create projects to organize your knowledge base</p>
                        <button class="btn btn-primary" id="createFirstProject">Create Project</button>
                    </div>
                `;
            } else {
                projectsGrid.innerHTML = projects.map(project => this.createProjectCard(project)).join('');
            }
        } catch (error) {
            projectsGrid.innerHTML = '<div class="error-state">Failed to load projects</div>';
        }
    }

    // Utility methods
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    handleResize() {
        const width = window.innerWidth;
        
        // Auto-collapse sidebar on small screens
        if (width < 900 && !this.sidebarCollapsed) {
            this.setSidebarCollapsed(true);
        } else if (width >= 1200 && this.sidebarCollapsed) {
            this.setSidebarCollapsed(false);
        }
    }

    loadUserPreferences() {
        // Load user preferences from storage
        const preferences = JSON.parse(localStorage.getItem('ragmaker-preferences') || '{}');
        
        // Apply preferences
        if (preferences.sidebarCollapsed !== undefined) {
            this.setSidebarCollapsed(preferences.sidebarCollapsed);
        }
        
        if (preferences.theme) {
            this.setTheme(preferences.theme);
        }
    }

    saveUserPreferences() {
        const preferences = {
            theme: this.theme,
            sidebarCollapsed: this.sidebarCollapsed,
            currentTab: this.currentTab
        };
        
        localStorage.setItem('ragmaker-preferences', JSON.stringify(preferences));
    }

    // Placeholder methods for data fetching (to be implemented with actual API calls)
    async fetchChannels() {
        // TODO: Implement actual API call
        return [];
    }

    async fetchKnowledgeStats() {
        // TODO: Implement actual API call
        return {
            videos: 0,
            chunks: 0,
            channels: 0,
            size: 0
        };
    }

    async fetchProjects() {
        // TODO: Implement actual API call
        return [];
    }

    createChannelCard(channel) {
        return `
            <div class="channel-card">
                <img src="${channel.avatar || '/assets/default-channel.png'}" alt="${channel.name}" class="channel-avatar">
                <div class="channel-name">${channel.name}</div>
                <div class="channel-stats">
                    <span class="channel-stat">📹 ${channel.videoCount || 0}</span>
                    <span class="channel-stat">👁️ ${channel.viewCount || 0}</span>
                </div>
                <div class="channel-actions">
                    <button class="channel-action-btn" title="Refresh">🔄</button>
                    <button class="channel-action-btn" title="Settings">⚙️</button>
                    <button class="channel-action-btn" title="Remove">🗑️</button>
                </div>
            </div>
        `;
    }

    createProjectCard(project) {
        return `
            <div class="project-card">
                <div class="project-header">
                    <div class="project-title">${project.name}</div>
                </div>
                <div class="project-description">${project.description || 'No description'}</div>
                <div class="project-meta">
                    <span class="project-date">${new Date(project.created).toLocaleDateString()}</span>
                    <span class="project-status ${project.status}">${project.status}</span>
                </div>
            </div>
        `;
    }

    // Cleanup
    destroy() {
        this.saveUserPreferences();
    }
}

// Initialize Desktop UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.desktopUI = new DesktopUI();
});

// Save preferences before unload
window.addEventListener('beforeunload', () => {
    if (window.desktopUI) {
        window.desktopUI.saveUserPreferences();
    }
});
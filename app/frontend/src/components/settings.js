// Settings Component - RAGMaker Desktop

import themeService from '../services/theme.js';
import notificationService from '../services/notification.js';
import apiService from '../services/api.js';
import { 
    THEMES, 
    ACCENT_COLORS, 
    RAG_PROFILES, 
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    EVENTS 
} from '../utils/constants.js';
import { 
    storage,
    getPlatform,
    isElectron
} from '../utils/helpers.js';

class SettingsComponent {
    constructor() {
        this.settings = { ...DEFAULT_SETTINGS };
        this.isDirty = false;
        
        this.elements = {
            container: null,
            themeSelector: null,
            accentSelector: null,
            profileSelector: null,
            apiUrlInput: null,
            notificationsToggle: null,
            saveButton: null,
            resetButton: null,
            exportButton: null,
            importButton: null
        };
        
        this.init();
    }
    
    /**
     * Initialize settings component
     */
    init() {
        this.bindElements();
        this.loadSettings();
        this.bindEvents();
        this.renderSettings();
    }
    
    /**
     * Bind DOM elements
     */
    bindElements() {
        this.elements.container = document.getElementById('settings-view');
        // Add more element bindings as needed when HTML is complete
    }
    
    /**
     * Load settings from storage
     */
    loadSettings() {
        const savedSettings = storage.get(STORAGE_KEYS.USER_PREFERENCES, {});
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...savedSettings,
            theme: themeService.getTheme(),
            accentColor: themeService.getAccent()
        };
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Theme selector
        if (this.elements.themeSelector) {
            this.elements.themeSelector.addEventListener('change', (e) => {
                this.updateSetting('theme', e.target.value);
                themeService.setTheme(e.target.value);
            });
        }
        
        // Accent color selector
        if (this.elements.accentSelector) {
            this.elements.accentSelector.addEventListener('change', (e) => {
                this.updateSetting('accentColor', e.target.value);
                themeService.setAccent(e.target.value);
            });
        }
        
        // RAG profile selector
        if (this.elements.profileSelector) {
            this.elements.profileSelector.addEventListener('change', (e) => {
                this.updateSetting('ragProfile', e.target.value);
            });
        }
        
        // API URL input
        if (this.elements.apiUrlInput) {
            this.elements.apiUrlInput.addEventListener('input', (e) => {
                this.updateSetting('apiUrl', e.target.value);
            });
            
            this.elements.apiUrlInput.addEventListener('blur', () => {
                this.validateApiUrl();
            });
        }
        
        // Notifications toggle
        if (this.elements.notificationsToggle) {
            this.elements.notificationsToggle.addEventListener('change', (e) => {
                this.updateSetting('notifications', e.target.checked);
            });
        }
        
        // Save button
        if (this.elements.saveButton) {
            this.elements.saveButton.addEventListener('click', () => {
                this.saveSettings();
            });
        }
        
        // Reset button
        if (this.elements.resetButton) {
            this.elements.resetButton.addEventListener('click', () => {
                this.resetSettings();
            });
        }
        
        // Export button
        if (this.elements.exportButton) {
            this.elements.exportButton.addEventListener('click', () => {
                this.exportSettings();
            });
        }
        
        // Import button
        if (this.elements.importButton) {
            this.elements.importButton.addEventListener('click', () => {
                this.importSettings();
            });
        }
        
        // Listen for theme changes from other sources
        window.addEventListener(EVENTS.THEME_CHANGED, (e) => {
            this.settings.theme = e.detail.theme;
            this.renderSettings();
        });
        
        window.addEventListener(EVENTS.ACCENT_CHANGED, (e) => {
            this.settings.accentColor = e.detail.accent;
            this.renderSettings();
        });
    }
    
    /**
     * Update a setting value
     */
    updateSetting(key, value) {
        if (this.settings[key] !== value) {
            this.settings[key] = value;
            this.isDirty = true;
            this.updateSaveButton();
        }
    }
    
    /**
     * Update save button state
     */
    updateSaveButton() {
        if (this.elements.saveButton) {
            this.elements.saveButton.disabled = !this.isDirty;
        }
    }
    
    /**
     * Render settings UI
     */
    renderSettings() {
        // Update form controls with current values
        if (this.elements.themeSelector) {
            this.elements.themeSelector.value = this.settings.theme;
        }
        
        if (this.elements.accentSelector) {
            this.elements.accentSelector.value = this.settings.accentColor;
        }
        
        if (this.elements.profileSelector) {
            this.elements.profileSelector.value = this.settings.ragProfile;
        }
        
        if (this.elements.apiUrlInput) {
            this.elements.apiUrlInput.value = this.settings.apiUrl;
        }
        
        if (this.elements.notificationsToggle) {
            this.elements.notificationsToggle.checked = this.settings.notifications;
        }
        
        this.updateSaveButton();
    }
    
    /**
     * Save settings
     */
    saveSettings() {
        try {
            // Save to storage
            storage.set(STORAGE_KEYS.USER_PREFERENCES, this.settings);
            
            // Update API base URL if changed
            if (this.settings.apiUrl !== apiService.getBaseURL()) {
                apiService.setBaseURL(this.settings.apiUrl);
            }
            
            this.isDirty = false;
            this.updateSaveButton();
            
            notificationService.success('Settings saved successfully');
            
            // Dispatch event
            window.dispatchEvent(new CustomEvent('settings:saved', {
                detail: { settings: this.settings }
            }));
            
        } catch (error) {
            console.error('Failed to save settings:', error);
            notificationService.error('Failed to save settings');
        }
    }
    
    /**
     * Reset settings to defaults
     */
    resetSettings() {
        notificationService.confirm(
            'Are you sure you want to reset all settings to defaults?',
            () => {
                // Reset to defaults
                this.settings = { ...DEFAULT_SETTINGS };
                
                // Apply theme changes
                themeService.setTheme(this.settings.theme);
                themeService.setAccent(this.settings.accentColor);
                
                // Re-render UI
                this.renderSettings();
                
                this.isDirty = true;
                this.updateSaveButton();
                
                notificationService.success('Settings reset to defaults');
            }
        );
    }
    
    /**
     * Export settings to file
     */
    exportSettings() {
        try {
            const exportData = {
                settings: this.settings,
                theme: themeService.exportSettings(),
                exportDate: new Date().toISOString(),
                version: '1.0',
                platform: getPlatform(),
                isElectron: isElectron()
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ragmaker-settings-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            notificationService.success('Settings exported successfully');
            
        } catch (error) {
            console.error('Failed to export settings:', error);
            notificationService.error('Failed to export settings');
        }
    }
    
    /**
     * Import settings from file
     */
    importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    
                    if (data.settings) {
                        // Validate and merge settings
                        this.settings = {
                            ...DEFAULT_SETTINGS,
                            ...data.settings
                        };
                        
                        // Apply theme settings
                        if (data.theme) {
                            themeService.importSettings(data.theme);
                        } else {
                            themeService.setTheme(this.settings.theme);
                            themeService.setAccent(this.settings.accentColor);
                        }
                        
                        // Re-render UI
                        this.renderSettings();
                        
                        this.isDirty = true;
                        this.updateSaveButton();
                        
                        notificationService.success('Settings imported successfully');
                        
                    } else {
                        throw new Error('Invalid settings file format');
                    }
                    
                } catch (error) {
                    console.error('Failed to import settings:', error);
                    notificationService.error('Failed to import settings. Please check the file format.');
                }
            };
            
            reader.readAsText(file);
        });
        
        input.click();
    }
    
    /**
     * Validate API URL
     */
    async validateApiUrl() {
        const url = this.settings.apiUrl;
        
        if (!url) {
            this.showApiStatus('error', 'API URL is required');
            return;
        }
        
        try {
            this.showApiStatus('loading', 'Checking API connection...');
            
            // Temporarily set the API URL to test it
            const originalUrl = apiService.getBaseURL();
            apiService.setBaseURL(url);
            
            const isAvailable = await apiService.isAvailable();
            
            if (isAvailable) {
                this.showApiStatus('success', 'API connection successful');
            } else {
                this.showApiStatus('error', 'API is not responding');
                // Revert URL on failure
                apiService.setBaseURL(originalUrl);
            }
            
        } catch (error) {
            console.error('API validation failed:', error);
            this.showApiStatus('error', 'Failed to connect to API');
            
            // Revert URL on failure
            apiService.setBaseURL(apiService.getBaseURL());
        }
    }
    
    /**
     * Show API connection status
     */
    showApiStatus(status, message) {
        // This would update a status indicator near the API URL input
        // Implementation depends on the HTML structure
        console.log(`API Status: ${status} - ${message}`);
    }
    
    /**
     * Get available themes
     */
    getAvailableThemes() {
        return themeService.getAvailableThemes();
    }
    
    /**
     * Get available accent colors
     */
    getAvailableAccents() {
        return themeService.getAvailableAccents();
    }
    
    /**
     * Get available RAG profiles
     */
    getAvailableProfiles() {
        return Object.values(RAG_PROFILES).map(profile => ({
            id: profile,
            name: this.getProfileName(profile),
            current: profile === this.settings.ragProfile
        }));
    }
    
    /**
     * Get human-readable profile name
     */
    getProfileName(profile) {
        const names = {
            [RAG_PROFILES.DEFAULT]: 'Default',
            [RAG_PROFILES.TECHNICAL]: 'Technical',
            [RAG_PROFILES.CREATIVE]: 'Creative',
            [RAG_PROFILES.ANALYTICAL]: 'Analytical',
            [RAG_PROFILES.SUMMARIZATION]: 'Summarization',
            [RAG_PROFILES.QA]: 'Question & Answer'
        };
        return names[profile] || profile;
    }
    
    /**
     * Check for unsaved changes
     */
    hasUnsavedChanges() {
        return this.isDirty;
    }
    
    /**
     * Get component state
     */
    getState() {
        return {
            settings: this.settings,
            isDirty: this.isDirty
        };
    }
    
    /**
     * Destroy component
     */
    destroy() {
        if (this.isDirty) {
            // Save settings before destroying
            this.saveSettings();
        }
    }
}

export default SettingsComponent;
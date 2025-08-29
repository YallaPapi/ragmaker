// Desktop Keyboard Shortcuts Manager
class KeyboardShortcuts {
    constructor() {
        this.shortcuts = new Map();
        this.isEnabled = true;
        this.modifierKeys = {
            ctrl: false,
            shift: false,
            alt: false,
            meta: false
        };
        
        this.init();
        this.registerDefaultShortcuts();
    }

    init() {
        // Track modifier key states
        document.addEventListener('keydown', (e) => {
            this.updateModifierKeys(e);
            if (this.isEnabled) {
                this.handleKeydown(e);
            }
        });

        document.addEventListener('keyup', (e) => {
            this.updateModifierKeys(e);
        });

        // Reset modifier keys on blur (when app loses focus)
        window.addEventListener('blur', () => {
            this.resetModifierKeys();
        });
    }

    updateModifierKeys(event) {
        this.modifierKeys.ctrl = event.ctrlKey;
        this.modifierKeys.shift = event.shiftKey;
        this.modifierKeys.alt = event.altKey;
        this.modifierKeys.meta = event.metaKey;
    }

    resetModifierKeys() {
        this.modifierKeys.ctrl = false;
        this.modifierKeys.shift = false;
        this.modifierKeys.alt = false;
        this.modifierKeys.meta = false;
    }

    registerShortcut(key, modifiers, callback, description) {
        const shortcutKey = this.createShortcutKey(key, modifiers);
        this.shortcuts.set(shortcutKey, {
            callback,
            description,
            key,
            modifiers
        });
    }

    createShortcutKey(key, modifiers = {}) {
        const parts = [];
        if (modifiers.ctrl) parts.push('ctrl');
        if (modifiers.shift) parts.push('shift');
        if (modifiers.alt) parts.push('alt');
        if (modifiers.meta) parts.push('meta');
        parts.push(key.toLowerCase());
        return parts.join('+');
    }

    handleKeydown(event) {
        // Don't trigger shortcuts when user is typing in inputs
        if (this.isInputFocused()) {
            return;
        }

        const shortcutKey = this.createShortcutKey(event.key, this.modifierKeys);
        const shortcut = this.shortcuts.get(shortcutKey);

        if (shortcut) {
            event.preventDefault();
            event.stopPropagation();
            
            try {
                shortcut.callback(event);
                this.showShortcutFeedback(shortcut.description);
            } catch (error) {
                console.error('Keyboard shortcut error:', error);
            }
        }
    }

    isInputFocused() {
        const activeElement = document.activeElement;
        const inputTypes = ['input', 'textarea', 'select'];
        return inputTypes.includes(activeElement.tagName.toLowerCase()) ||
               activeElement.contentEditable === 'true' ||
               activeElement.hasAttribute('contenteditable');
    }

    showShortcutFeedback(description) {
        // Create a brief visual feedback for the shortcut
        const feedback = document.createElement('div');
        feedback.className = 'shortcut-feedback';
        feedback.textContent = description;
        
        document.body.appendChild(feedback);
        
        // Animate in
        requestAnimationFrame(() => {
            feedback.style.opacity = '1';
            feedback.style.transform = 'translateY(0)';
        });
        
        // Remove after delay
        setTimeout(() => {
            feedback.style.opacity = '0';
            feedback.style.transform = 'translateY(-10px)';
            setTimeout(() => feedback.remove(), 200);
        }, 1500);
    }

    registerDefaultShortcuts() {
        // Navigation shortcuts
        this.registerShortcut('1', { ctrl: true }, () => {
            this.switchTab('chat');
        }, 'Switch to Chat');

        this.registerShortcut('2', { ctrl: true }, () => {
            this.switchTab('channels');
        }, 'Switch to Channels');

        this.registerShortcut('3', { ctrl: true }, () => {
            this.switchTab('knowledge');
        }, 'Switch to Knowledge Base');

        this.registerShortcut('4', { ctrl: true }, () => {
            this.switchTab('analytics');
        }, 'Switch to Analytics');

        this.registerShortcut('5', { ctrl: true }, () => {
            this.switchTab('projects');
        }, 'Switch to Projects');

        // Application shortcuts
        this.registerShortcut(',', { ctrl: true }, () => {
            this.switchTab('settings');
        }, 'Open Settings');

        this.registerShortcut('n', { ctrl: true }, () => {
            this.newProject();
        }, 'New Project');

        this.registerShortcut('p', { ctrl: true }, () => {
            this.openProjectSelector();
        }, 'Quick Project Switch');

        this.registerShortcut('f', { ctrl: true }, () => {
            this.focusGlobalSearch();
        }, 'Focus Search');

        this.registerShortcut('b', { ctrl: true }, () => {
            this.toggleSidebar();
        }, 'Toggle Sidebar');

        this.registerShortcut('t', { ctrl: true }, () => {
            this.toggleTheme();
        }, 'Toggle Theme');

        this.registerShortcut('i', { ctrl: true }, () => {
            this.importData();
        }, 'Import Data');

        this.registerShortcut('e', { ctrl: true }, () => {
            this.exportData();
        }, 'Export Data');

        // Window controls
        this.registerShortcut('m', { ctrl: true }, () => {
            this.minimizeWindow();
        }, 'Minimize Window');

        this.registerShortcut('m', { ctrl: true, shift: true }, () => {
            this.toggleMaximizeWindow();
        }, 'Maximize/Restore Window');

        this.registerShortcut('q', { ctrl: true }, () => {
            this.closeWindow();
        }, 'Close Application');

        // Chat shortcuts
        this.registerShortcut('/', { ctrl: true }, () => {
            this.focusChatInput();
        }, 'Focus Chat Input');

        this.registerShortcut('k', { ctrl: true }, () => {
            this.clearChat();
        }, 'Clear Chat');

        this.registerShortcut('r', { ctrl: true }, () => {
            this.regenerateLastResponse();
        }, 'Regenerate Response');

        // File operations
        this.registerShortcut('a', { ctrl: true, shift: true }, () => {
            this.attachFile();
        }, 'Attach File');

        this.registerShortcut('s', { ctrl: true }, () => {
            this.saveCurrentSession();
        }, 'Save Session');

        this.registerShortcut('o', { ctrl: true }, () => {
            this.openSession();
        }, 'Open Session');

        // Help
        this.registerShortcut('F1', {}, () => {
            this.showHelp();
        }, 'Show Help');

        this.registerShortcut('?', { ctrl: true }, () => {
            this.showShortcutList();
        }, 'Show Shortcuts');

        // Developer tools (only in development)
        if (this.isDevelopment()) {
            this.registerShortcut('F12', {}, () => {
                this.openDevTools();
            }, 'Open Developer Tools');

            this.registerShortcut('r', { ctrl: true, shift: true }, () => {
                this.reloadApp();
            }, 'Reload Application');
        }
    }

    // Shortcut action methods
    switchTab(tabName) {
        const navItem = document.querySelector(`[data-tab="${tabName}"]`);
        if (navItem) {
            navItem.click();
        }
    }

    newProject() {
        const newProjectBtn = document.getElementById('newProjectBtn');
        if (newProjectBtn) {
            newProjectBtn.click();
        }
    }

    openProjectSelector() {
        const quickProjectSelect = document.getElementById('quickProjectSelect');
        if (quickProjectSelect) {
            quickProjectSelect.focus();
            quickProjectSelect.click();
        }
    }

    focusGlobalSearch() {
        const globalSearch = document.getElementById('globalSearch');
        if (globalSearch) {
            globalSearch.focus();
            globalSearch.select();
        }
    }

    toggleSidebar() {
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.click();
        }
    }

    toggleTheme() {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.click();
        }
    }

    importData() {
        const importBtn = document.getElementById('importBtn');
        if (importBtn) {
            importBtn.click();
        }
    }

    exportData() {
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.click();
        }
    }

    minimizeWindow() {
        if (window.electronAPI) {
            window.electronAPI.minimizeWindow();
        }
    }

    toggleMaximizeWindow() {
        if (window.electronAPI) {
            window.electronAPI.toggleMaximizeWindow();
        }
    }

    closeWindow() {
        if (window.electronAPI) {
            window.electronAPI.closeWindow();
        }
    }

    focusChatInput() {
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.focus();
        }
    }

    clearChat() {
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer && confirm('Clear chat history?')) {
            messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <h2>Chat Cleared</h2>
                    <p>Start a new conversation.</p>
                </div>
            `;
        }
    }

    regenerateLastResponse() {
        // Trigger regeneration of the last AI response
        if (window.chatManager) {
            window.chatManager.regenerateLastResponse();
        }
    }

    attachFile() {
        const attachmentBtn = document.getElementById('attachmentBtn');
        if (attachmentBtn) {
            attachmentBtn.click();
        }
    }

    saveCurrentSession() {
        if (window.sessionManager) {
            window.sessionManager.saveSession();
        }
    }

    openSession() {
        if (window.sessionManager) {
            window.sessionManager.openSession();
        }
    }

    showHelp() {
        const helpBtn = document.getElementById('helpBtn');
        if (helpBtn) {
            helpBtn.click();
        }
    }

    showShortcutList() {
        this.createShortcutModal();
    }

    createShortcutModal() {
        // Remove existing modal if present
        const existingModal = document.getElementById('shortcutModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'shortcutModal';
        modal.className = 'modal-overlay';
        
        const shortcuts = Array.from(this.shortcuts.entries()).map(([key, shortcut]) => {
            return {
                key: this.formatShortcutDisplay(key),
                description: shortcut.description
            };
        });

        modal.innerHTML = `
            <div class="modal-content shortcut-modal">
                <div class="modal-header">
                    <h2>Keyboard Shortcuts</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="shortcut-groups">
                        ${this.renderShortcutGroups(shortcuts)}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on escape or click outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        });
    }

    formatShortcutDisplay(key) {
        return key.split('+').map(part => {
            const keyMap = {
                'ctrl': 'Ctrl',
                'shift': 'Shift',
                'alt': 'Alt',
                'meta': 'Cmd'
            };
            return keyMap[part] || part.toUpperCase();
        }).join(' + ');
    }

    renderShortcutGroups(shortcuts) {
        const groups = {
            'Navigation': shortcuts.filter(s => s.description.includes('Switch to') || s.description.includes('Focus')),
            'Application': shortcuts.filter(s => ['New Project', 'Import Data', 'Export Data', 'Toggle Theme', 'Toggle Sidebar', 'Open Settings'].includes(s.description)),
            'Window': shortcuts.filter(s => s.description.includes('Window') || s.description.includes('Application')),
            'Chat': shortcuts.filter(s => s.description.includes('Chat') || s.description.includes('Response')),
            'File Operations': shortcuts.filter(s => ['Attach File', 'Save Session', 'Open Session'].includes(s.description)),
            'Help': shortcuts.filter(s => s.description.includes('Help') || s.description.includes('Shortcuts'))
        };

        return Object.entries(groups).map(([groupName, groupShortcuts]) => {
            if (groupShortcuts.length === 0) return '';
            
            return `
                <div class="shortcut-group">
                    <h3>${groupName}</h3>
                    <div class="shortcut-list">
                        ${groupShortcuts.map(shortcut => `
                            <div class="shortcut-item">
                                <kbd class="shortcut-key">${shortcut.key}</kbd>
                                <span class="shortcut-desc">${shortcut.description}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    openDevTools() {
        if (window.electronAPI) {
            window.electronAPI.openDevTools();
        }
    }

    reloadApp() {
        if (window.electronAPI) {
            window.electronAPI.reloadApp();
        }
    }

    isDevelopment() {
        return process.env.NODE_ENV === 'development' || 
               window.location.hostname === 'localhost';
    }

    enable() {
        this.isEnabled = true;
    }

    disable() {
        this.isEnabled = false;
    }

    unregisterShortcut(key, modifiers = {}) {
        const shortcutKey = this.createShortcutKey(key, modifiers);
        return this.shortcuts.delete(shortcutKey);
    }

    getShortcuts() {
        return Array.from(this.shortcuts.entries()).map(([key, shortcut]) => ({
            key: this.formatShortcutDisplay(key),
            description: shortcut.description
        }));
    }
}

// Initialize keyboard shortcuts when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.keyboardShortcuts = new KeyboardShortcuts();
});

// CSS for shortcut feedback and modal
const shortcutStyles = `
<style>
.shortcut-feedback {
    position: fixed;
    top: 50px;
    right: 20px;
    background: var(--color-primary);
    color: var(--color-text-inverse);
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    opacity: 0;
    transform: translateY(-10px);
    transition: all 0.2s var(--easing-standard);
    pointer-events: none;
    box-shadow: var(--shadow-lg);
}

.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
}

.modal-content {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.shortcut-modal {
    width: 600px;
}

.modal-header {
    padding: var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.modal-header h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    color: var(--color-text-primary);
}

.modal-close {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 50%;
    font-size: 20px;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
}

.modal-close:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
}

.modal-body {
    padding: var(--spacing-lg);
    overflow-y: auto;
    flex: 1;
}

.shortcut-groups {
    display: grid;
    gap: var(--spacing-xl);
}

.shortcut-group h3 {
    font-size: var(--font-size-lg);
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-md);
    font-weight: 600;
}

.shortcut-list {
    display: grid;
    gap: var(--spacing-sm);
}

.shortcut-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-sm);
    border-radius: var(--radius-md);
    transition: background-color 0.15s ease;
}

.shortcut-item:hover {
    background: var(--color-surface-hover);
}

.shortcut-key {
    background: var(--color-bg-tertiary);
    color: var(--color-text-primary);
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-weight: 600;
    min-width: 80px;
    text-align: center;
    border: 1px solid var(--color-border);
}

.shortcut-desc {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
}
</style>
`;

document.head.insertAdjacentHTML('beforeend', shortcutStyles);
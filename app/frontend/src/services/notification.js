// Notification Service - RAGMaker Desktop

import { 
    NOTIFICATION_TYPES, 
    ANIMATIONS, 
    EVENTS 
} from '../utils/constants.js';
import { generateId } from '../utils/helpers.js';

class NotificationService {
    constructor() {
        this.notifications = new Map();
        this.container = null;
        this.maxNotifications = 5;
        this.defaultDuration = 5000;
        
        this.init();
    }
    
    /**
     * Initialize notification container
     */
    init() {
        this.container = document.getElementById('notifications');
        
        if (!this.container) {
            console.warn('Notification container not found');
            return;
        }
        
        // Setup global error handler
        this.setupErrorHandler();
    }
    
    /**
     * Setup global error handler for unhandled errors
     */
    setupErrorHandler() {
        window.addEventListener('error', (event) => {
            this.error('An unexpected error occurred', {
                message: event.message,
                filename: event.filename,
                line: event.lineno
            });
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this.error('An unexpected error occurred', {
                message: event.reason?.message || 'Promise rejection',
                details: event.reason
            });
        });
    }
    
    /**
     * Show notification
     */
    show(message, type = NOTIFICATION_TYPES.INFO, options = {}) {
        if (!this.container) return null;
        
        const id = generateId();
        const notification = {
            id,
            message,
            type,
            title: options.title,
            duration: options.duration ?? this.defaultDuration,
            persistent: options.persistent || false,
            actions: options.actions || [],
            timestamp: new Date()
        };
        
        // Remove oldest notification if at limit
        if (this.notifications.size >= this.maxNotifications) {
            const oldest = Array.from(this.notifications.keys())[0];
            this.hide(oldest);
        }
        
        this.notifications.set(id, notification);
        this.render(notification);
        
        // Auto-hide after duration (unless persistent)
        if (!notification.persistent && notification.duration > 0) {
            setTimeout(() => {
                this.hide(id);
            }, notification.duration);
        }
        
        // Send desktop notification if supported and enabled
        this.sendDesktopNotification(notification);
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent(EVENTS.NOTIFICATION_SHOW, {
            detail: notification
        }));
        
        return id;
    }
    
    /**
     * Hide notification
     */
    hide(id) {
        const notification = this.notifications.get(id);
        if (!notification) return;
        
        const element = document.querySelector(`[data-notification-id="${id}"]`);
        if (element) {
            element.style.animation = `slideOut ${ANIMATIONS.NOTIFICATION_SLIDE}ms ease-in-out`;
            
            setTimeout(() => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            }, ANIMATIONS.NOTIFICATION_SLIDE);
        }
        
        this.notifications.delete(id);
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent(EVENTS.NOTIFICATION_HIDE, {
            detail: { id }
        }));
    }
    
    /**
     * Hide all notifications
     */
    hideAll() {
        const ids = Array.from(this.notifications.keys());
        ids.forEach(id => this.hide(id));
    }
    
    /**
     * Render notification element
     */
    render(notification) {
        const element = document.createElement('div');
        element.className = `notification ${notification.type}`;
        element.setAttribute('data-notification-id', notification.id);
        element.style.animation = `slideIn ${ANIMATIONS.NOTIFICATION_SLIDE}ms ease-out`;
        
        const hasActions = notification.actions && notification.actions.length > 0;
        
        element.innerHTML = `
            <div class="notification-header">
                ${notification.title ? `<div class="notification-title">${this.escapeHtml(notification.title)}</div>` : ''}
                <button class="notification-close" aria-label="Close notification">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                        <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            <div class="notification-content">
                <p class="notification-message">${this.escapeHtml(notification.message)}</p>
                ${hasActions ? this.renderActions(notification.actions) : ''}
            </div>
        `;
        
        // Add event listeners
        const closeButton = element.querySelector('.notification-close');
        closeButton.addEventListener('click', () => {
            this.hide(notification.id);
        });
        
        // Add action button listeners
        if (hasActions) {
            const actionButtons = element.querySelectorAll('.notification-action');
            actionButtons.forEach((button, index) => {
                button.addEventListener('click', () => {
                    const action = notification.actions[index];
                    if (action.callback) {
                        action.callback();
                    }
                    if (action.close !== false) {
                        this.hide(notification.id);
                    }
                });
            });
        }
        
        // Add to container
        this.container.appendChild(element);
        
        // Auto-focus for accessibility
        if (notification.type === NOTIFICATION_TYPES.ERROR) {
            closeButton.focus();
        }
    }
    
    /**
     * Render action buttons
     */
    renderActions(actions) {
        const actionsHtml = actions.map(action => `
            <button class="notification-action btn btn-sm ${action.class || 'btn-secondary'}">
                ${this.escapeHtml(action.text)}
            </button>
        `).join('');
        
        return `<div class="notification-actions">${actionsHtml}</div>`;
    }
    
    /**
     * Send desktop notification
     */
    async sendDesktopNotification(notification) {
        if (!('Notification' in window) || !window.electronAPI?.showNotification) {
            return;
        }
        
        try {
            // Check permission
            let permission = Notification.permission;
            
            if (permission === 'default') {
                permission = await Notification.requestPermission();
            }
            
            if (permission === 'granted') {
                if (window.electronAPI?.showNotification) {
                    // Use Electron's notification system
                    window.electronAPI.showNotification({
                        title: notification.title || 'RAGMaker',
                        body: notification.message,
                        icon: 'assets/icons/icon.png',
                        urgency: notification.type === NOTIFICATION_TYPES.ERROR ? 'critical' : 'normal'
                    });
                } else {
                    // Fallback to web notification
                    new Notification(notification.title || 'RAGMaker', {
                        body: notification.message,
                        icon: 'assets/icons/icon.png',
                        tag: notification.id
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to send desktop notification:', error);
        }
    }
    
    /**
     * Convenience methods for different notification types
     */
    success(message, options = {}) {
        return this.show(message, NOTIFICATION_TYPES.SUCCESS, {
            title: options.title || 'Success',
            ...options
        });
    }
    
    error(message, options = {}) {
        return this.show(message, NOTIFICATION_TYPES.ERROR, {
            title: options.title || 'Error',
            persistent: true,
            ...options
        });
    }
    
    warning(message, options = {}) {
        return this.show(message, NOTIFICATION_TYPES.WARNING, {
            title: options.title || 'Warning',
            ...options
        });
    }
    
    info(message, options = {}) {
        return this.show(message, NOTIFICATION_TYPES.INFO, {
            title: options.title || 'Information',
            ...options
        });
    }
    
    /**
     * Show loading notification
     */
    loading(message, options = {}) {
        return this.show(message, NOTIFICATION_TYPES.INFO, {
            title: options.title || 'Loading',
            persistent: true,
            duration: 0,
            ...options
        });
    }
    
    /**
     * Update existing notification
     */
    update(id, message, options = {}) {
        const notification = this.notifications.get(id);
        if (!notification) return;
        
        // Update notification data
        Object.assign(notification, {
            message,
            ...options,
            timestamp: new Date()
        });
        
        // Re-render
        const element = document.querySelector(`[data-notification-id="${id}"]`);
        if (element) {
            element.parentNode.removeChild(element);
            this.render(notification);
        }
    }
    
    /**
     * Show confirmation notification with actions
     */
    confirm(message, onConfirm, onCancel = null, options = {}) {
        return this.show(message, NOTIFICATION_TYPES.WARNING, {
            title: options.title || 'Confirm',
            persistent: true,
            actions: [
                {
                    text: options.confirmText || 'Confirm',
                    class: 'btn-primary',
                    callback: onConfirm
                },
                {
                    text: options.cancelText || 'Cancel',
                    class: 'btn-secondary',
                    callback: onCancel || (() => {})
                }
            ],
            ...options
        });
    }
    
    /**
     * Show progress notification
     */
    progress(message, progress = 0, options = {}) {
        const id = options.id || generateId();
        const progressHtml = `
            <div class="notification-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(100, Math.max(0, progress))}%"></div>
                </div>
                <div class="progress-text">${Math.round(progress)}%</div>
            </div>
        `;
        
        if (this.notifications.has(id)) {
            // Update existing progress notification
            const element = document.querySelector(`[data-notification-id="${id}"]`);
            if (element) {
                const messageElement = element.querySelector('.notification-message');
                const progressElement = element.querySelector('.notification-progress');
                
                if (messageElement) {
                    messageElement.textContent = message;
                }
                
                if (progressElement) {
                    const progressFill = progressElement.querySelector('.progress-fill');
                    const progressText = progressElement.querySelector('.progress-text');
                    
                    if (progressFill) {
                        progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
                    }
                    
                    if (progressText) {
                        progressText.textContent = `${Math.round(progress)}%`;
                    }
                }
            }
        } else {
            // Create new progress notification
            const fullMessage = `${message}${progressHtml}`;
            this.show(fullMessage, NOTIFICATION_TYPES.INFO, {
                ...options,
                id,
                persistent: true,
                duration: 0
            });
        }
        
        // Auto-hide when complete
        if (progress >= 100 && options.autoHide !== false) {
            setTimeout(() => {
                this.hide(id);
            }, 2000);
        }
        
        return id;
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Get all notifications
     */
    getAll() {
        return Array.from(this.notifications.values());
    }
    
    /**
     * Clear all notifications
     */
    clear() {
        this.hideAll();
        this.notifications.clear();
    }
    
    /**
     * Set maximum number of notifications
     */
    setMaxNotifications(max) {
        this.maxNotifications = Math.max(1, max);
    }
    
    /**
     * Set default duration
     */
    setDefaultDuration(duration) {
        this.defaultDuration = Math.max(0, duration);
    }
}

// Create singleton instance
const notificationService = new NotificationService();

// Export singleton and class
export default notificationService;
export { NotificationService };
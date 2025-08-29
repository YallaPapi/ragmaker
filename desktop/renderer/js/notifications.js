// Desktop Notifications Manager
class DesktopNotificationManager {
    constructor() {
        this.container = null;
        this.notifications = new Map();
        this.defaultDuration = 5000;
        this.maxNotifications = 5;
        this.notificationId = 0;
        this.position = 'top-right'; // top-right, top-left, bottom-right, bottom-left
        
        this.init();
    }

    init() {
        this.createContainer();
        this.setupSystemNotifications();
    }

    createContainer() {
        this.container = document.getElementById('desktopNotifications');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'desktopNotifications';
            this.container.className = `desktop-notifications position-${this.position}`;
            document.body.appendChild(this.container);
        }
    }

    setupSystemNotifications() {
        // Request permission for system notifications
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    show(message, type = 'info', options = {}) {
        const notification = this.createNotification(message, type, options);
        this.addNotification(notification);
        
        // Also show system notification if enabled and app is not focused
        if (options.system !== false && !document.hasFocus()) {
            this.showSystemNotification(message, type, options);
        }
        
        return notification.id;
    }

    createNotification(message, type, options) {
        const id = ++this.notificationId;
        const duration = options.duration !== undefined ? options.duration : this.defaultDuration;
        
        const notification = {
            id,
            message,
            type,
            title: options.title,
            actions: options.actions || [],
            duration,
            persistent: options.persistent || false,
            timestamp: Date.now(),
            element: null
        };
        
        notification.element = this.createNotificationElement(notification);
        return notification;
    }

    createNotificationElement(notification) {
        const element = document.createElement('div');
        element.className = `desktop-notification notification-${notification.type}`;
        element.dataset.id = notification.id;
        
        // Icon based on type
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️',
            progress: '🔄'
        };
        
        const icon = icons[notification.type] || icons.info;
        
        element.innerHTML = `
            <div class="notification-icon">${icon}</div>
            <div class="notification-content">
                ${notification.title ? `<div class="notification-title">${notification.title}</div>` : ''}
                <div class="notification-message">${notification.message}</div>
                ${notification.actions.length > 0 ? this.createActionsHTML(notification.actions) : ''}
            </div>
            <button class="notification-close" data-action="close">×</button>
            ${!notification.persistent && notification.duration > 0 ? '<div class="notification-progress"></div>' : ''}
        `;
        
        // Add event listeners
        element.addEventListener('click', (e) => this.handleNotificationClick(e, notification));
        
        // Auto-dismiss timer
        if (!notification.persistent && notification.duration > 0) {
            const progressBar = element.querySelector('.notification-progress');
            if (progressBar) {
                progressBar.style.animationDuration = `${notification.duration}ms`;
            }
            
            setTimeout(() => {
                this.dismiss(notification.id);
            }, notification.duration);
        }
        
        return element;
    }

    createActionsHTML(actions) {
        return `
            <div class="notification-actions">
                ${actions.map(action => `
                    <button class="notification-action" data-action="${action.id}">
                        ${action.label}
                    </button>
                `).join('')}
            </div>
        `;
    }

    addNotification(notification) {
        this.notifications.set(notification.id, notification);
        
        // Remove oldest notifications if we exceed max
        if (this.notifications.size > this.maxNotifications) {
            const oldestId = Math.min(...this.notifications.keys());
            this.dismiss(oldestId);
        }
        
        // Add to DOM with animation
        this.container.appendChild(notification.element);
        
        // Trigger entrance animation
        requestAnimationFrame(() => {
            notification.element.classList.add('notification-enter');
        });
        
        // Play notification sound if enabled
        this.playNotificationSound(notification.type);
    }

    dismiss(id) {
        const notification = this.notifications.get(id);
        if (!notification) return;
        
        // Exit animation
        notification.element.classList.add('notification-exit');
        
        setTimeout(() => {
            if (notification.element.parentNode) {
                notification.element.remove();
            }
            this.notifications.delete(id);
        }, 200);
    }

    dismissAll() {
        Array.from(this.notifications.keys()).forEach(id => this.dismiss(id));
    }

    handleNotificationClick(event, notification) {
        const target = event.target;
        const action = target.dataset.action;
        
        if (action === 'close') {
            this.dismiss(notification.id);
        } else if (action && notification.actions) {
            const actionConfig = notification.actions.find(a => a.id === action);
            if (actionConfig && actionConfig.handler) {
                actionConfig.handler();
                if (actionConfig.dismissOnClick !== false) {
                    this.dismiss(notification.id);
                }
            }
        }
    }

    showSystemNotification(message, type, options) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const title = options.title || this.getDefaultTitle(type);
            const systemOptions = {
                body: message,
                icon: options.icon || this.getDefaultIcon(type),
                tag: options.tag || `ragmaker-${type}`,
                requireInteraction: options.requireInteraction || false
            };
            
            const systemNotification = new Notification(title, systemOptions);
            
            // Auto-close system notification
            setTimeout(() => {
                systemNotification.close();
            }, options.duration || this.defaultDuration);
            
            // Handle clicks
            systemNotification.onclick = () => {
                window.focus();
                if (options.onClick) {
                    options.onClick();
                }
                systemNotification.close();
            };
        }
    }

    getDefaultTitle(type) {
        const titles = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'RAGMaker',
            progress: 'Processing'
        };
        return titles[type] || 'RAGMaker';
    }

    getDefaultIcon(type) {
        // Return appropriate icon path based on type
        // In a real app, these would be actual icon files
        return '/assets/notification-icons/default.png';
    }

    playNotificationSound(type) {
        // Play system notification sound if available
        if (window.electronAPI && window.electronAPI.playSound) {
            window.electronAPI.playSound(type);
        }
    }

    // Convenience methods for common notification types
    success(message, options = {}) {
        return this.show(message, 'success', options);
    }

    error(message, options = {}) {
        return this.show(message, 'error', { 
            duration: 8000, // Errors stay longer
            ...options 
        });
    }

    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }

    info(message, options = {}) {
        return this.show(message, 'info', options);
    }

    progress(message, options = {}) {
        return this.show(message, 'progress', {
            persistent: true,
            duration: 0,
            ...options
        });
    }

    // Update a progress notification
    updateProgress(id, message, progress = null) {
        const notification = this.notifications.get(id);
        if (!notification) return;
        
        const messageEl = notification.element.querySelector('.notification-message');
        if (messageEl) {
            messageEl.textContent = message;
        }
        
        if (progress !== null) {
            let progressEl = notification.element.querySelector('.notification-progress-bar');
            if (!progressEl) {
                progressEl = document.createElement('div');
                progressEl.className = 'notification-progress-bar';
                notification.element.appendChild(progressEl);
            }
            progressEl.style.width = `${Math.max(0, Math.min(100, progress))}%`;
        }
    }

    // Complete a progress notification
    completeProgress(id, message = 'Completed') {
        this.updateNotificationType(id, 'success');
        this.updateProgress(id, message, 100);
        
        setTimeout(() => {
            this.dismiss(id);
        }, 2000);
    }

    // Fail a progress notification
    failProgress(id, message = 'Failed') {
        this.updateNotificationType(id, 'error');
        this.updateProgress(id, message);
        
        // Don't auto-dismiss error notifications
    }

    updateNotificationType(id, newType) {
        const notification = this.notifications.get(id);
        if (!notification) return;
        
        notification.type = newType;
        notification.element.className = `desktop-notification notification-${newType}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️',
            progress: '🔄'
        };
        
        const iconEl = notification.element.querySelector('.notification-icon');
        if (iconEl) {
            iconEl.textContent = icons[newType] || icons.info;
        }
    }

    // Application-specific notification methods
    channelAdded(channelName) {
        this.success(`Channel "${channelName}" added successfully`, {
            title: 'Channel Added',
            actions: [
                {
                    id: 'view',
                    label: 'View Channel',
                    handler: () => {
                        // Switch to channels tab
                        const channelTab = document.querySelector('[data-tab="channels"]');
                        if (channelTab) channelTab.click();
                    }
                }
            ]
        });
    }

    channelIndexing(channelName) {
        return this.progress(`Indexing channel: ${channelName}`, {
            title: 'Indexing Content'
        });
    }

    channelIndexed(channelName, videoCount) {
        this.success(`Indexed ${videoCount} videos from "${channelName}"`, {
            title: 'Indexing Complete'
        });
    }

    projectCreated(projectName) {
        this.success(`Project "${projectName}" created`, {
            title: 'Project Created',
            actions: [
                {
                    id: 'open',
                    label: 'Open Project',
                    handler: () => {
                        // Switch to project
                        if (window.projectManager) {
                            window.projectManager.switchProject(projectName);
                        }
                    }
                }
            ]
        });
    }

    exportComplete(filename) {
        this.success(`Data exported to ${filename}`, {
            title: 'Export Complete',
            actions: [
                {
                    id: 'open-folder',
                    label: 'Open Folder',
                    handler: () => {
                        if (window.electronAPI) {
                            window.electronAPI.showItemInFolder(filename);
                        }
                    }
                }
            ]
        });
    }

    connectionError() {
        this.error('Connection to server lost. Retrying...', {
            title: 'Connection Error',
            persistent: true,
            actions: [
                {
                    id: 'retry',
                    label: 'Retry Now',
                    handler: () => {
                        if (window.connectionManager) {
                            window.connectionManager.retry();
                        }
                    },
                    dismissOnClick: false
                }
            ]
        });
    }

    connectionRestored() {
        this.success('Connection restored', {
            title: 'Connected'
        });
    }

    updateAvailable(version) {
        this.info(`Update available: v${version}`, {
            title: 'Update Available',
            persistent: true,
            actions: [
                {
                    id: 'download',
                    label: 'Download',
                    handler: () => {
                        if (window.electronAPI) {
                            window.electronAPI.downloadUpdate();
                        }
                    }
                },
                {
                    id: 'dismiss',
                    label: 'Later',
                    handler: () => {}
                }
            ]
        });
    }

    // Settings
    setPosition(position) {
        this.position = position;
        this.container.className = `desktop-notifications position-${position}`;
    }

    setMaxNotifications(max) {
        this.maxNotifications = max;
        
        // Remove excess notifications
        while (this.notifications.size > max) {
            const oldestId = Math.min(...this.notifications.keys());
            this.dismiss(oldestId);
        }
    }

    setDefaultDuration(duration) {
        this.defaultDuration = duration;
    }
}

// Initialize notification manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.notificationManager = new DesktopNotificationManager();
});

// CSS for desktop notifications
const notificationStyles = `
<style>
.desktop-notifications {
    position: fixed;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    max-width: 400px;
    pointer-events: none;
}

.desktop-notifications.position-top-right {
    top: var(--spacing-lg);
    right: var(--spacing-lg);
}

.desktop-notifications.position-top-left {
    top: var(--spacing-lg);
    left: var(--spacing-lg);
}

.desktop-notifications.position-bottom-right {
    bottom: var(--spacing-lg);
    right: var(--spacing-lg);
    flex-direction: column-reverse;
}

.desktop-notifications.position-bottom-left {
    bottom: var(--spacing-lg);
    left: var(--spacing-lg);
    flex-direction: column-reverse;
}

.desktop-notification {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: var(--spacing-md);
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
    min-width: 300px;
    max-width: 400px;
    pointer-events: auto;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s var(--easing-standard);
    position: relative;
    overflow: hidden;
}

.desktop-notification.notification-enter {
    opacity: 1;
    transform: translateX(0);
}

.desktop-notification.notification-exit {
    opacity: 0;
    transform: translateX(100%);
}

.desktop-notifications.position-top-left .desktop-notification,
.desktop-notifications.position-bottom-left .desktop-notification {
    transform: translateX(-100%);
}

.desktop-notifications.position-top-left .desktop-notification.notification-enter,
.desktop-notifications.position-bottom-left .desktop-notification.notification-enter {
    transform: translateX(0);
}

.desktop-notifications.position-top-left .desktop-notification.notification-exit,
.desktop-notifications.position-bottom-left .desktop-notification.notification-exit {
    transform: translateX(-100%);
}

.desktop-notification.notification-success {
    border-left: 4px solid var(--color-success);
}

.desktop-notification.notification-error {
    border-left: 4px solid var(--color-error);
}

.desktop-notification.notification-warning {
    border-left: 4px solid var(--color-warning);
}

.desktop-notification.notification-info {
    border-left: 4px solid var(--color-info);
}

.desktop-notification.notification-progress {
    border-left: 4px solid var(--color-primary);
}

.notification-icon {
    font-size: var(--font-size-lg);
    margin-top: 2px;
}

.notification-content {
    flex: 1;
    min-width: 0;
}

.notification-title {
    font-weight: 600;
    font-size: var(--font-size-md);
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-xs);
}

.notification-message {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.4;
    word-wrap: break-word;
}

.notification-actions {
    margin-top: var(--spacing-sm);
    display: flex;
    gap: var(--spacing-xs);
}

.notification-action {
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--color-text-primary);
    cursor: pointer;
    transition: all 0.15s var(--easing-standard);
}

.notification-action:hover {
    background: var(--color-primary);
    color: var(--color-text-inverse);
    border-color: var(--color-primary);
}

.notification-close {
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    border-radius: 50%;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all 0.15s var(--easing-standard);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.notification-close:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
}

.notification-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: var(--color-primary);
    animation: notification-progress linear forwards;
    transform-origin: left;
}

.notification-progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    background: var(--color-primary);
    border-radius: 0 0 var(--radius-lg) 0;
    transition: width 0.3s var(--easing-standard);
}

@keyframes notification-progress {
    from {
        transform: scaleX(1);
    }
    to {
        transform: scaleX(0);
    }
}

/* Dark theme adjustments */
[data-theme="dark"] .desktop-notification {
    background: var(--color-surface);
    border-color: var(--color-border);
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
    .desktop-notification {
        transition: opacity 0.2s ease;
        transform: none;
    }
    
    .desktop-notification.notification-enter {
        opacity: 1;
    }
    
    .desktop-notification.notification-exit {
        opacity: 0;
    }
    
    .notification-progress {
        animation: none;
        width: 100%;
    }
}
</style>
`;

document.head.insertAdjacentHTML('beforeend', notificationStyles);
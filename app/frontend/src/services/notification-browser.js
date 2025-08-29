// Browser-compatible Notification Service

class NotificationService {
    constructor() {
        this.container = null;
        this.notifications = [];
        this.maxNotifications = 5;
        this.defaultDuration = 5000;
        this.init();
    }

    init() {
        // Create notification container
        this.container = document.getElementById('notifications');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'notifications';
            this.container.className = 'notifications';
            document.body.appendChild(this.container);
        }
    }

    show(message, type = 'info', options = {}) {
        const notification = {
            id: Date.now() + Math.random(),
            message,
            type,
            duration: options.duration || this.defaultDuration,
            persistent: options.persistent || false
        };

        this.notifications.push(notification);
        this.render(notification);

        if (!notification.persistent && notification.duration > 0) {
            setTimeout(() => {
                this.hide(notification.id);
            }, notification.duration);
        }

        // Limit number of notifications
        if (this.notifications.length > this.maxNotifications) {
            const oldest = this.notifications.shift();
            this.hide(oldest.id);
        }

        return notification.id;
    }

    success(message, options = {}) {
        return this.show(message, 'success', options);
    }

    error(message, options = {}) {
        return this.show(message, 'error', { ...options, persistent: true });
    }

    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }

    info(message, options = {}) {
        return this.show(message, 'info', options);
    }

    hide(id) {
        this.notifications = this.notifications.filter(n => n.id !== id);
        const element = document.querySelector(`[data-notification-id="${id}"]`);
        if (element) {
            element.classList.add('notification-exit');
            setTimeout(() => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            }, 300);
        }
    }

    render(notification) {
        const element = document.createElement('div');
        element.className = `notification notification-${notification.type}`;
        element.setAttribute('data-notification-id', notification.id);
        
        element.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${this.escapeHtml(notification.message)}</span>
                <button class="notification-close" onclick="notificationService.hide('${notification.id}')">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                        <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `;

        this.container.appendChild(element);
        
        // Trigger animation
        requestAnimationFrame(() => {
            element.classList.add('notification-enter');
        });
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    clear() {
        this.notifications.forEach(notification => {
            this.hide(notification.id);
        });
        this.notifications = [];
    }
}

// Create global instance
window.notificationService = new NotificationService();
console.log('✅ Notification Service loaded');
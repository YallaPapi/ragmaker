// Chat Component - RAGMaker Desktop

import apiService from '../services/api.js';
import notificationService from '../services/notification.js';
import { 
    MESSAGE_TYPES, 
    RAG_PROFILES, 
    EVENTS, 
    STORAGE_KEYS,
    KEYBOARD_SHORTCUTS 
} from '../utils/constants.js';
import { 
    generateId, 
    validateMessage, 
    formatRelativeTime, 
    storage, 
    escapeHtml,
    autoResizeTextarea,
    createShortcutChecker
} from '../utils/helpers.js';

class ChatComponent {
    constructor() {
        this.messages = [];
        this.currentProfile = RAG_PROFILES.DEFAULT;
        this.isTyping = false;
        this.currentConversationId = null;
        
        this.elements = {
            container: null,
            messages: null,
            input: null,
            sendButton: null,
            profileSelector: null,
            clearButton: null,
            charCount: null
        };
        
        this.init();
    }
    
    /**
     * Initialize chat component
     */
    init() {
        this.bindElements();
        this.bindEvents();
        this.loadChatHistory();
        this.setupKeyboardShortcuts();
    }
    
    /**
     * Bind DOM elements
     */
    bindElements() {
        this.elements.container = document.getElementById('chat-view');
        this.elements.messages = document.getElementById('chatMessages');
        this.elements.input = document.getElementById('messageInput');
        this.elements.sendButton = document.getElementById('sendButton');
        this.elements.profileSelector = document.getElementById('profileSelector');
        this.elements.clearButton = document.getElementById('clearChat');
        this.elements.charCount = document.getElementById('charCount');
        
        if (!this.elements.container) {
            console.warn('Chat container not found');
            return;
        }
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        if (!this.elements.input) return;
        
        // Input events
        this.elements.input.addEventListener('input', (e) => {
            this.handleInputChange(e);
        });
        
        this.elements.input.addEventListener('keydown', (e) => {
            this.handleInputKeydown(e);
        });
        
        this.elements.input.addEventListener('paste', (e) => {
            this.handleInputPaste(e);
        });
        
        // Send button
        if (this.elements.sendButton) {
            this.elements.sendButton.addEventListener('click', () => {
                this.sendMessage();
            });
        }
        
        // Profile selector
        if (this.elements.profileSelector) {
            this.elements.profileSelector.addEventListener('change', (e) => {
                this.currentProfile = e.target.value;
                this.saveChatHistory();
            });
        }
        
        // Clear chat button
        if (this.elements.clearButton) {
            this.elements.clearButton.addEventListener('click', () => {
                this.clearChat();
            });
        }
        
        // Scroll event for messages container
        if (this.elements.messages) {
            this.elements.messages.addEventListener('scroll', () => {
                // Could implement read receipts or infinite scroll here
            });
        }
    }
    
    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        const sendChecker = createShortcutChecker(KEYBOARD_SHORTCUTS.SEND_MESSAGE);
        const clearChecker = createShortcutChecker(KEYBOARD_SHORTCUTS.CLEAR_CHAT);
        
        document.addEventListener('keydown', (e) => {
            // Only handle shortcuts when chat is active
            if (!this.elements.container?.classList.contains('hidden')) {
                if (sendChecker(e) && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
                
                if (clearChecker(e)) {
                    e.preventDefault();
                    this.clearChat();
                }
            }
        });
    }
    
    /**
     * Handle input change
     */
    handleInputChange(e) {
        const input = e.target;
        const length = input.value.length;
        const maxLength = input.getAttribute('maxlength') || 2000;
        
        // Update character counter
        if (this.elements.charCount) {
            this.elements.charCount.textContent = length;
            
            // Add warning class when approaching limit
            const counterContainer = this.elements.charCount.parentElement;
            if (length > maxLength * 0.9) {
                counterContainer.classList.add('warning');
            } else {
                counterContainer.classList.remove('warning');
            }
        }
        
        // Enable/disable send button
        const hasText = input.value.trim().length > 0;
        if (this.elements.sendButton) {
            this.elements.sendButton.disabled = !hasText || this.isTyping;
        }
        
        // Auto-resize textarea
        autoResizeTextarea(input);
    }
    
    /**
     * Handle input keydown
     */
    handleInputKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    }
    
    /**
     * Handle input paste
     */
    handleInputPaste(e) {
        // Could add file paste support here
        setTimeout(() => {
            this.handleInputChange({ target: e.target });
        }, 0);
    }
    
    /**
     * Send message
     */
    async sendMessage() {
        if (!this.elements.input || this.isTyping) return;
        
        const message = this.elements.input.value.trim();
        if (!message) return;
        
        // Validate message
        const validation = validateMessage(message);
        if (!validation.valid) {
            notificationService.error(validation.error);
            return;
        }
        
        try {
            // Add user message to chat
            const userMessage = this.addMessage({
                type: MESSAGE_TYPES.USER,
                content: message,
                timestamp: new Date()
            });
            
            // Clear input
            this.elements.input.value = '';
            this.handleInputChange({ target: this.elements.input });
            
            // Show typing indicator
            this.showTypingIndicator();
            
            // Send to API
            const response = await apiService.chatRAG(
                message,
                this.currentProfile,
                null,
                null,
                this.getConversationHistory()
            );
            
            // Hide typing indicator
            this.hideTypingIndicator();
            
            // Add assistant response
            this.addMessage({
                type: MESSAGE_TYPES.ASSISTANT,
                content: response.response || response.answer || 'I apologize, but I encountered an error processing your request.',
                timestamp: new Date(),
                metadata: response.debug || {}
            });
            
            // Save chat history
            this.saveChatHistory();
            
            // Focus input for next message
            this.elements.input.focus();
            
            // Dispatch event
            window.dispatchEvent(new CustomEvent(EVENTS.MESSAGE_SENT, {
                detail: { message, response }
            }));
            
        } catch (error) {
            console.error('Chat error:', error);
            
            this.hideTypingIndicator();
            
            // Add error message
            this.addMessage({
                type: MESSAGE_TYPES.ERROR,
                content: 'I apologize, but I encountered an error. Please try again.',
                timestamp: new Date()
            });
            
            notificationService.error('Failed to send message. Please check your connection and try again.');
        }
    }
    
    /**
     * Add message to chat
     */
    addMessage(messageData) {
        const message = {
            id: generateId(),
            type: messageData.type,
            content: messageData.content,
            timestamp: messageData.timestamp,
            metadata: messageData.metadata || {}
        };
        
        this.messages.push(message);
        this.renderMessage(message);
        this.scrollToBottom();
        
        return message;
    }
    
    /**
     * Render message in chat
     */
    renderMessage(message) {
        if (!this.elements.messages) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.type}`;
        messageElement.setAttribute('data-message-id', message.id);
        
        const isUser = message.type === MESSAGE_TYPES.USER;
        const avatar = isUser ? 'U' : 'AI';
        const sender = isUser ? 'You' : 'RAGMaker';
        const time = formatRelativeTime(message.timestamp);
        
        messageElement.innerHTML = `
            <div class="message-header">
                <div class="message-avatar">${avatar}</div>
                <div class="message-sender">${sender}</div>
                <div class="message-time" title="${message.timestamp.toLocaleString()}">${time}</div>
            </div>
            <div class="message-content">
                ${this.formatMessageContent(message.content, message.type)}
            </div>
            ${message.metadata && Object.keys(message.metadata).length > 0 ? this.renderMessageMetadata(message.metadata) : ''}
        `;
        
        // Add context menu for messages
        this.addMessageContextMenu(messageElement, message);
        
        this.elements.messages.appendChild(messageElement);
    }
    
    /**
     * Format message content
     */
    formatMessageContent(content, type) {
        if (type === MESSAGE_TYPES.ERROR) {
            return `<div class="error-message">${escapeHtml(content)}</div>`;
        }
        
        // Convert line breaks to paragraphs
        const paragraphs = content.split('\n\n').filter(p => p.trim());
        if (paragraphs.length > 1) {
            return paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
        }
        
        return `<p>${escapeHtml(content)}</p>`;
    }
    
    /**
     * Render message metadata
     */
    renderMessageMetadata(metadata) {
        if (!metadata || Object.keys(metadata).length === 0) return '';
        
        return `
            <div class="message-metadata">
                <button class="metadata-toggle" onclick="this.nextElementSibling.classList.toggle('hidden')">
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5"/>
                    </svg>
                    Debug Info
                </button>
                <div class="metadata-content hidden">
                    <pre>${JSON.stringify(metadata, null, 2)}</pre>
                </div>
            </div>
        `;
    }
    
    /**
     * Add context menu to message
     */
    addMessageContextMenu(element, message) {
        element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showMessageContextMenu(e, message);
        });
    }
    
    /**
     * Show message context menu
     */
    showMessageContextMenu(event, message) {
        // Create context menu
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = `
            <ul class="context-menu-list">
                <li><button class="context-menu-item" data-action="copy">Copy Message</button></li>
                <li><button class="context-menu-item" data-action="copy-plain">Copy as Plain Text</button></li>
                <li class="separator"></li>
                <li><button class="context-menu-item" data-action="retry" ${message.type !== MESSAGE_TYPES.USER ? 'disabled' : ''}>Retry Message</button></li>
                <li><button class="context-menu-item" data-action="delete">Delete Message</button></li>
            </ul>
        `;
        
        // Position menu
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
        
        // Add to page
        document.body.appendChild(menu);
        
        // Handle menu clicks
        menu.addEventListener('click', (e) => {
            const action = e.target.getAttribute('data-action');
            if (action) {
                this.handleMessageAction(action, message);
            }
            document.body.removeChild(menu);
        });
        
        // Remove menu on outside click
        setTimeout(() => {
            document.addEventListener('click', () => {
                if (document.body.contains(menu)) {
                    document.body.removeChild(menu);
                }
            }, { once: true });
        }, 0);
    }
    
    /**
     * Handle message context menu actions
     */
    handleMessageAction(action, message) {
        switch (action) {
            case 'copy':
                navigator.clipboard.writeText(message.content);
                notificationService.success('Message copied to clipboard');
                break;
                
            case 'copy-plain':
                const plainText = message.content.replace(/<[^>]*>/g, '');
                navigator.clipboard.writeText(plainText);
                notificationService.success('Plain text copied to clipboard');
                break;
                
            case 'retry':
                if (message.type === MESSAGE_TYPES.USER) {
                    this.elements.input.value = message.content;
                    this.sendMessage();
                }
                break;
                
            case 'delete':
                this.deleteMessage(message.id);
                break;
        }
    }
    
    /**
     * Delete message
     */
    deleteMessage(messageId) {
        // Remove from messages array
        this.messages = this.messages.filter(m => m.id !== messageId);
        
        // Remove from DOM
        const element = document.querySelector(`[data-message-id="${messageId}"]`);
        if (element) {
            element.remove();
        }
        
        // Save updated history
        this.saveChatHistory();
        
        notificationService.success('Message deleted');
    }
    
    /**
     * Show typing indicator
     */
    showTypingIndicator() {
        this.isTyping = true;
        
        if (this.elements.sendButton) {
            this.elements.sendButton.disabled = true;
        }
        
        // Remove existing typing indicator
        this.hideTypingIndicator();
        
        // Add new typing indicator
        const indicator = document.createElement('div');
        indicator.className = 'message assistant typing-indicator';
        indicator.innerHTML = `
            <div class="message-header">
                <div class="message-avatar">AI</div>
                <div class="message-sender">RAGMaker</div>
            </div>
            <div class="message-loading">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
                Thinking...
            </div>
        `;
        
        if (this.elements.messages) {
            this.elements.messages.appendChild(indicator);
            this.scrollToBottom();
        }
    }
    
    /**
     * Hide typing indicator
     */
    hideTypingIndicator() {
        this.isTyping = false;
        
        if (this.elements.sendButton) {
            const hasText = this.elements.input?.value.trim().length > 0;
            this.elements.sendButton.disabled = !hasText;
        }
        
        // Remove typing indicator
        const indicator = document.querySelector('.typing-indicator');
        if (indicator) {
            const messageElement = indicator.closest('.message');
            if (messageElement) {
                messageElement.remove();
            }
        }
    }
    
    /**
     * Clear chat
     */
    clearChat() {
        // Show confirmation
        notificationService.confirm(
            'Are you sure you want to clear all messages?',
            () => {
                this.messages = [];
                
                if (this.elements.messages) {
                    this.elements.messages.innerHTML = `
                        <div class="welcome-message">
                            <div class="welcome-icon">
                                <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
                                    <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-width="2"/>
                                    <path d="M24 32L30 38L40 26" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </div>
                            <h3>Welcome to RAGMaker</h3>
                            <p>Ask questions about your indexed documents and YouTube channels.</p>
                        </div>
                    `;
                }
                
                this.saveChatHistory();
                
                // Dispatch event
                window.dispatchEvent(new CustomEvent(EVENTS.CHAT_CLEARED));
                
                notificationService.success('Chat cleared');
            }
        );
    }
    
    /**
     * Scroll to bottom of messages
     */
    scrollToBottom() {
        if (!this.elements.messages) return;
        
        setTimeout(() => {
            this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
        }, 100);
    }
    
    /**
     * Get conversation history for API
     */
    getConversationHistory() {
        return this.messages.slice(-10).map(msg => ({
            role: msg.type === MESSAGE_TYPES.USER ? 'user' : 'assistant',
            content: msg.content
        }));
    }
    
    /**
     * Save chat history to local storage
     */
    saveChatHistory() {
        const chatData = {
            messages: this.messages,
            profile: this.currentProfile,
            timestamp: new Date().toISOString()
        };
        
        storage.set(STORAGE_KEYS.CHAT_HISTORY, chatData);
    }
    
    /**
     * Load chat history from local storage
     */
    loadChatHistory() {
        const chatData = storage.get(STORAGE_KEYS.CHAT_HISTORY);
        
        if (chatData && chatData.messages) {
            this.messages = chatData.messages.map(msg => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
            }));
            
            if (chatData.profile) {
                this.currentProfile = chatData.profile;
                if (this.elements.profileSelector) {
                    this.elements.profileSelector.value = chatData.profile;
                }
            }
            
            // Render messages
            if (this.elements.messages && this.messages.length > 0) {
                this.elements.messages.innerHTML = '';
                this.messages.forEach(message => this.renderMessage(message));
            }
        }
    }
    
    /**
     * Export chat history
     */
    exportHistory() {
        const data = {
            messages: this.messages,
            profile: this.currentProfile,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ragmaker-chat-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        notificationService.success('Chat history exported');
    }
    
    /**
     * Import chat history
     */
    importHistory(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                if (data.messages && Array.isArray(data.messages)) {
                    this.messages = data.messages.map(msg => ({
                        ...msg,
                        timestamp: new Date(msg.timestamp)
                    }));
                    
                    if (data.profile) {
                        this.currentProfile = data.profile;
                        if (this.elements.profileSelector) {
                            this.elements.profileSelector.value = data.profile;
                        }
                    }
                    
                    // Re-render chat
                    if (this.elements.messages) {
                        this.elements.messages.innerHTML = '';
                        this.messages.forEach(message => this.renderMessage(message));
                    }
                    
                    this.saveChatHistory();
                    notificationService.success('Chat history imported');
                } else {
                    throw new Error('Invalid chat history format');
                }
            } catch (error) {
                console.error('Import error:', error);
                notificationService.error('Failed to import chat history. Please check the file format.');
            }
        };
        
        reader.readAsText(file);
    }
    
    /**
     * Get component state
     */
    getState() {
        return {
            messages: this.messages,
            currentProfile: this.currentProfile,
            isTyping: this.isTyping
        };
    }
    
    /**
     * Set profile
     */
    setProfile(profile) {
        if (Object.values(RAG_PROFILES).includes(profile)) {
            this.currentProfile = profile;
            if (this.elements.profileSelector) {
                this.elements.profileSelector.value = profile;
            }
            this.saveChatHistory();
        }
    }
    
    /**
     * Focus input
     */
    focusInput() {
        if (this.elements.input) {
            this.elements.input.focus();
        }
    }
    
    /**
     * Destroy component
     */
    destroy() {
        // Remove event listeners and clean up
        this.saveChatHistory();
    }
}

// Export class
export default ChatComponent;
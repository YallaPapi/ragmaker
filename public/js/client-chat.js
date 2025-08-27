// Revolutionary Chat Interface JavaScript
class ChatInterface {
    constructor() {
        this.messageContainer = document.getElementById('messagesContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.charCount = document.getElementById('charCount');
        this.welcomeText = document.getElementById('welcomeText');
        
        this.isTyping = false;
        this.messageHistory = [];
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupAutoResize();
        this.animateWelcomeMessage();
        this.loadChatHistory();
    }
    
    setupEventListeners() {
        // Send button
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        
        // Input handling
        this.messageInput.addEventListener('input', () => this.handleInput());
        this.messageInput.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Quick actions
        document.querySelectorAll('.quick-action').forEach(btn => {
            btn.addEventListener('click', () => {
                this.messageInput.value = btn.dataset.suggestion;
                this.messageInput.focus();
                this.handleInput();
            });
        });
        
        // Header actions
        document.getElementById('historyBtn').addEventListener('click', () => this.showHistory());
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());
    }
    
    setupAutoResize() {
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = this.messageInput.scrollHeight + 'px';
        });
    }
    
    handleInput() {
        const value = this.messageInput.value.trim();
        const length = value.length;
        
        // Update character counter
        this.charCount.textContent = length;
        this.charCount.style.color = length > 1800 ? '#ef4444' : 'var(--text-muted)';
        
        // Update send button state
        this.sendBtn.disabled = length === 0;
        
        // Add typing animation
        if (length > 0 && !this.isTyping) {
            this.addTypingFeedback();
        }
    }
    
    handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!this.sendBtn.disabled) {
                this.sendMessage();
            }
        }
    }
    
    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || this.isTyping) return;
        
        // Add user message to UI
        this.addMessage(message, 'user');
        
        // Clear input
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        this.handleInput();
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            // Send to RAG API
            const response = await this.sendToRAG(message);
            this.hideTypingIndicator();
            this.addMessage(response.answer, 'ai', response.sources);
            
            // Save to history
            this.messageHistory.push({
                user: message,
                ai: response.answer,
                timestamp: Date.now(),
                sources: response.sources
            });
            this.saveChatHistory();
            
        } catch (error) {
            this.hideTypingIndicator();
            this.addMessage('Sorry, I encountered an error processing your question. Please try again.', 'ai', [], true);
            console.error('Chat error:', error);
        }
    }
    
    async sendToRAG(question) {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question: question,
                profileId: 'default' // Can be made dynamic
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    }
    
    addMessage(content, type, sources = [], isError = false) {
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `message-wrapper ${type}-message`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        
        if (type === 'ai') {
            avatar.innerHTML = '<div class="ai-avatar">AI</div>';
        } else {
            avatar.innerHTML = '<div class="user-avatar">You</div>';
        }
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const messageBubble = document.createElement('div');
        messageBubble.className = `message-bubble ${isError ? 'error' : ''}`;
        
        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        
        // Add typing animation for AI messages
        if (type === 'ai') {
            this.typewriterEffect(messageText, content);
        } else {
            messageText.textContent = content;
        }
        
        messageBubble.appendChild(messageText);
        
        // Add sources if available
        if (sources && sources.length > 0) {
            const sourcesContainer = document.createElement('div');
            sourcesContainer.className = 'message-sources';
            sourcesContainer.innerHTML = `
                <div class="sources-header">Sources:</div>
                ${sources.map(source => `
                    <a href="${source.url}" target="_blank" class="source-link">
                        Video: ${source.title}
                    </a>
                `).join('')}
            `;
            messageBubble.appendChild(sourcesContainer);
        }
        
        const messageTime = document.createElement('div');
        messageTime.className = 'message-time';
        messageTime.textContent = new Date().toLocaleTimeString();
        
        messageContent.appendChild(messageBubble);
        messageContent.appendChild(messageTime);
        
        messageWrapper.appendChild(avatar);
        messageWrapper.appendChild(messageContent);
        
        // Add with animation
        messageWrapper.style.opacity = '0';
        messageWrapper.style.transform = 'translateY(20px)';
        
        this.messageContainer.appendChild(messageWrapper);
        
        // Trigger animation
        requestAnimationFrame(() => {
            messageWrapper.style.transition = 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            messageWrapper.style.opacity = '1';
            messageWrapper.style.transform = 'translateY(0)';
        });
        
        // Scroll to bottom
        this.scrollToBottom();
    }
    
    typewriterEffect(element, text, speed = 30) {
        element.textContent = '';
        let i = 0;
        
        const timer = setInterval(() => {
            element.textContent += text.charAt(i);
            i++;
            
            if (i > text.length) {
                clearInterval(timer);
            }
            
            // Scroll as text appears
            this.scrollToBottom();
        }, speed);
    }
    
    showTypingIndicator() {
        this.isTyping = true;
        this.typingIndicator.classList.remove('hidden');
        this.scrollToBottom();
    }
    
    hideTypingIndicator() {
        this.isTyping = false;
        this.typingIndicator.classList.add('hidden');
    }
    
    scrollToBottom() {
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }
    
    addTypingFeedback() {
        // Add subtle UI feedback when user is typing
        // This could trigger suggestions or show that the AI is "listening"
    }
    
    animateWelcomeMessage() {
        // Animate the welcome message with typewriter effect
        setTimeout(() => {
            const dots = document.querySelector('.welcome-message .typing-animation');
            if (dots) {
                dots.style.display = 'none';
            }
            this.typewriterEffect(this.welcomeText, this.welcomeText.textContent, 50);
        }, 2000);
    }
    
    loadChatHistory() {
        const saved = localStorage.getItem('chatHistory');
        if (saved) {
            this.messageHistory = JSON.parse(saved);
        }
    }
    
    saveChatHistory() {
        localStorage.setItem('chatHistory', JSON.stringify(this.messageHistory.slice(-50))); // Keep last 50 messages
    }
    
    showHistory() {
        // Implementation for chat history modal
        console.log('Show chat history');
    }
    
    showSettings() {
        // Implementation for settings modal
        console.log('Show settings');
    }
}

// Enhanced Animations
class AnimationEngine {
    static fadeInUp(element, delay = 0) {
        element.style.opacity = '0';
        element.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            element.style.transition = 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        }, delay);
    }
    
    static bounceIn(element) {
        element.style.animation = 'bounceIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    }
    
    static pulseGlow(element) {
        element.style.animation = 'pulseGlow 2s infinite';
    }
}

// Add bounce animation CSS
const bounceCSS = `
@keyframes bounceIn {
    0% {
        opacity: 0;
        transform: scale(0.3);
    }
    50% {
        transform: scale(1.05);
    }
    70% {
        transform: scale(0.9);
    }
    100% {
        opacity: 1;
        transform: scale(1);
    }
}

@keyframes pulseGlow {
    0%, 100% {
        box-shadow: 0 0 5px rgba(102, 126, 234, 0.5);
    }
    50% {
        box-shadow: 0 0 20px rgba(102, 126, 234, 0.8);
    }
}

.message-sources {
    margin-top: 1rem;
    padding: 1rem;
    background: rgba(102, 126, 234, 0.1);
    border-radius: 12px;
    border: 1px solid rgba(102, 126, 234, 0.2);
}

.sources-header {
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: #667eea;
    font-size: 0.875rem;
}

.source-link {
    display: block;
    color: #667eea;
    text-decoration: none;
    margin-bottom: 0.25rem;
    font-size: 0.85rem;
    transition: all 0.2s ease;
}

.source-link:hover {
    color: #764ba2;
    transform: translateX(4px);
}

.error {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
    color: white !important;
}
`;

// Inject additional CSS
const style = document.createElement('style');
style.textContent = bounceCSS;
document.head.appendChild(style);

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChatInterface();
    
    // Add some initial animations
    const particles = document.querySelectorAll('.floating-particle');
    particles.forEach((particle, index) => {
        setTimeout(() => {
            AnimationEngine.fadeInUp(particle);
        }, index * 200);
    });
});

// Add service worker for offline functionality (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
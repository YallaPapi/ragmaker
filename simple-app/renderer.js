// Renderer process script for RAGMaker Desktop

console.log('🎨 RAGMaker Desktop Renderer Loaded');

// Test functions for the UI
function testNotification() {
    // Create a simple notification div
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(76, 175, 80, 0.9);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        z-index: 1000;
        box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        backdrop-filter: blur(10px);
        font-size: 1rem;
        animation: slideIn 0.3s ease;
    `;
    
    notification.textContent = '✅ Test notification - Window is working!';
    document.body.appendChild(notification);
    
    // Add slide in animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
    
    console.log('📢 Test notification displayed');
}

function showAbout() {
    alert('RAGMaker Desktop - Simple Visible Version\\n\\nThis is a minimal Electron app that ensures the window is visible and functional.\\n\\nFeatures:\\n• Visible window guaranteed\\n• Simple but functional UI\\n• Ready for RAG integration\\n• Cross-platform compatibility');
}

function toggleDevTools() {
    // This will be handled by the main process menu
    console.log('🔧 DevTools toggle requested');
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('📱 RAGMaker Desktop UI Initialized');
    
    // Add some interactive behavior
    const statusCard = document.querySelector('.status-card');
    if (statusCard) {
        statusCard.addEventListener('click', () => {
            statusCard.style.transform = 'scale(1.02)';
            setTimeout(() => {
                statusCard.style.transform = 'scale(1)';
            }, 200);
        });
    }
    
    // Update status indicator every 5 seconds to show it's alive
    setInterval(() => {
        const indicator = document.querySelector('.status-indicator');
        if (indicator) {
            indicator.style.background = indicator.style.background === 'rgb(76, 175, 80)' ? '#2196F3' : '#4CAF50';
        }
    }, 5000);
    
    // Add current time display
    const updateTime = () => {
        const versionInfo = document.querySelector('.version-info');
        if (versionInfo) {
            const now = new Date().toLocaleTimeString();
            versionInfo.innerHTML = `RAGMaker Desktop v1.0.0 - Simple Visible Edition<br>Running since: ${now}`;
        }
    };
    
    updateTime();
    setInterval(updateTime, 1000);
});

// Handle window focus events
window.addEventListener('focus', () => {
    console.log('🎯 Window focused');
    document.body.style.opacity = '1';
});

window.addEventListener('blur', () => {
    console.log('😴 Window blurred');
    document.body.style.opacity = '0.95';
});

// Ensure window is always visible
console.log('✅ RAGMaker Desktop Renderer Ready - Window is VISIBLE!');
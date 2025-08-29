const { ipcRenderer } = require('electron');
const fs = require('fs').promises;
const path = require('path');

// Application state
let documents = [];
let isProcessing = false;

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const selectFileBtn = document.getElementById('selectFileBtn');
const fileList = document.getElementById('fileList');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const statusText = document.getElementById('statusText');
const documentCount = document.getElementById('documentCount');

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    console.log('Simple RAGMaker initialized');
    updateStatus('Ready to upload documents');
    
    // Set up event listeners
    selectFileBtn.addEventListener('click', selectFile);
    uploadArea.addEventListener('click', selectFile);
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Drag and drop functionality
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.backgroundColor = 'rgba(79, 172, 254, 0.2)';
    });
    
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.style.backgroundColor = 'rgba(79, 172, 254, 0.05)';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.backgroundColor = 'rgba(79, 172, 254, 0.05)';
        
        const files = Array.from(e.dataTransfer.files);
        files.forEach(file => processFile(file.path));
    });
});

// File selection
async function selectFile() {
    try {
        const filePath = await ipcRenderer.invoke('select-file');
        if (filePath) {
            await processFile(filePath);
        }
    } catch (error) {
        console.error('Error selecting file:', error);
        updateStatus('Error selecting file');
    }
}

// Process uploaded file
async function processFile(filePath) {
    try {
        updateStatus('Processing file...');
        
        const fileName = path.basename(filePath);
        const stats = await fs.stat(filePath);
        const fileSize = formatFileSize(stats.size);
        
        // Read file content
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Create document object
        const document = {
            id: Date.now(),
            name: fileName,
            path: filePath,
            size: fileSize,
            content: content,
            chunks: chunkText(content, 500) // Split into chunks for better RAG
        };
        
        documents.push(document);
        renderFileList();
        updateDocumentCount();
        updateStatus(`Added ${fileName}`);
        
        // Add system message about successful upload
        addMessage('bot', `✅ Successfully loaded "${fileName}" (${fileSize}). You can now ask questions about this document!`);
        
    } catch (error) {
        console.error('Error processing file:', error);
        updateStatus('Error processing file');
        addMessage('bot', `❌ Error loading file: ${error.message}`);
    }
}

// Chunk text into smaller pieces for RAG
function chunkText(text, chunkSize = 500) {
    const words = text.split(/\s+/);
    const chunks = [];
    
    for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize).join(' ');
        chunks.push(chunk);
    }
    
    return chunks;
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Render file list
function renderFileList() {
    fileList.innerHTML = '';
    
    documents.forEach(doc => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div>
                <div class="file-name">${doc.name}</div>
                <div class="file-size">${doc.size}</div>
            </div>
            <button onclick="removeDocument(${doc.id})" class="btn" style="background: #ff6b6b; padding: 5px 10px; font-size: 12px;">Remove</button>
        `;
        fileList.appendChild(fileItem);
    });
}

// Remove document
function removeDocument(id) {
    documents = documents.filter(doc => doc.id !== id);
    renderFileList();
    updateDocumentCount();
    updateStatus('Document removed');
}

// Update document count
function updateDocumentCount() {
    const count = documents.length;
    documentCount.textContent = `${count} document${count !== 1 ? 's' : ''} loaded`;
}

// Update status
function updateStatus(status) {
    statusText.textContent = status;
}

// Send message
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isProcessing) return;
    
    // Clear input
    messageInput.value = '';
    
    // Add user message
    addMessage('user', message);
    
    // Process message
    isProcessing = true;
    updateStatus('Thinking...');
    
    try {
        const response = await processRAGQuery(message);
        addMessage('bot', response);
    } catch (error) {
        console.error('Error processing message:', error);
        addMessage('bot', 'Sorry, I encountered an error while processing your question.');
    } finally {
        isProcessing = false;
        updateStatus('Ready');
    }
}

// Process RAG query (simplified implementation)
async function processRAGQuery(query) {
    if (documents.length === 0) {
        return "I don't have any documents loaded yet. Please upload some documents first so I can answer questions about them.";
    }
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simple keyword-based search through document chunks
    const queryWords = query.toLowerCase().split(/\s+/);
    const relevantChunks = [];
    
    documents.forEach(doc => {
        doc.chunks.forEach(chunk => {
            const chunkLower = chunk.toLowerCase();
            const matches = queryWords.filter(word => chunkLower.includes(word));
            
            if (matches.length > 0) {
                relevantChunks.push({
                    text: chunk,
                    document: doc.name,
                    score: matches.length / queryWords.length
                });
            }
        });
    });
    
    // Sort by relevance score
    relevantChunks.sort((a, b) => b.score - a.score);
    
    if (relevantChunks.length === 0) {
        return `I couldn't find information related to "${query}" in the uploaded documents. Try rephrasing your question or uploading more relevant documents.`;
    }
    
    // Generate response based on top relevant chunks
    const topChunks = relevantChunks.slice(0, 3);
    const sources = [...new Set(topChunks.map(chunk => chunk.document))];
    
    let response = `Based on the uploaded documents, here's what I found:\\n\\n`;
    
    // Add relevant information
    topChunks.forEach((chunk, index) => {
        const excerpt = chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : '');
        response += `**From ${chunk.document}:**\\n${excerpt}\\n\\n`;
    });
    
    response += `*Sources: ${sources.join(', ')}*`;
    
    return response;
}

// Add message to chat
function addMessage(sender, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (sender === 'bot') {
        contentDiv.innerHTML = `<strong>RAG Assistant:</strong> ${content.replace(/\\n/g, '<br>')}`;
    } else {
        contentDiv.innerHTML = `<strong>You:</strong> ${content}`;
    }
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Global function for removing documents (called from HTML)
window.removeDocument = removeDocument;
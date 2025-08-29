const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const express = require('express');
const http = require('http');

const isDev = process.env.NODE_ENV === 'development';

class SimpleRAGMakerApp {
    constructor() {
        this.mainWindow = null;
        this.server = null;
        this.port = 8080; // Fixed port to avoid conflicts
        this.init();
    }
    
    async init() {
        try {
            console.log('🚀 Starting Simple RAGMaker Desktop...');
            
            // Wait for Electron to be ready
            await app.whenReady();
            
            // Start simple server
            await this.startServer();
            
            // Create window
            this.createWindow();
            
            // Setup handlers
            this.setupHandlers();
            
        } catch (error) {
            console.error('❌ Failed to start app:', error);
        }
    }
    
    async startServer() {
        const expressApp = express();
        expressApp.use(express.json());
        expressApp.use(express.static(path.join(__dirname, 'frontend')));
        
        // Basic API endpoint
        expressApp.get('/api/health', (req, res) => {
            res.json({ status: 'ok', message: 'Simple RAGMaker is running' });
        });
        
        expressApp.post('/api/chat/message', (req, res) => {
            const { message } = req.body;
            setTimeout(() => {
                res.json({
                    message: `Echo: ${message}. This is a minimal working version.`,
                    timestamp: Date.now()
                });
            }, 1000);
        });
        
        this.server = http.createServer(expressApp);
        
        return new Promise((resolve) => {
            this.server.listen(this.port, () => {
                console.log(`✅ Server running on port ${this.port}`);
                resolve();
            });
        });
    }
    
    createWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1000,
            height: 700,
            minWidth: 600,
            minHeight: 400,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            }
        });
        
        const url = `http://localhost:${this.port}`;
        console.log(`Loading: ${url}`);
        this.mainWindow.loadURL(url);
        
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
            if (isDev) {
                this.mainWindow.webContents.openDevTools();
            }
            console.log('✅ Window ready');
        });
        
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });
    }
    
    setupHandlers() {
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                if (this.server) {
                    this.server.close();
                }
                app.quit();
            }
        });
        
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createWindow();
            }
        });
    }
}

// Initialize
new SimpleRAGMakerApp();
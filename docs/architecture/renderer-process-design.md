# Renderer Process Architecture Design

## Overview

The renderer process architecture for RAGMaker focuses on creating a secure, performant, and user-friendly interface while maintaining strict isolation from Node.js APIs and following Electron security best practices.

## Core Design Principles

### 1. Security-First Architecture
- Complete sandboxing with no direct Node.js access
- All main process communication through secure IPC bridge
- Content Security Policy enforcement
- Input validation and sanitization

### 2. Modern React Architecture
- React 18 with Concurrent Features
- TypeScript for type safety
- Component-based architecture with clear separation of concerns
- State management with Zustand for simplicity and performance

### 3. Performance Optimization
- Code splitting and lazy loading
- Virtual scrolling for large lists
- Efficient re-rendering patterns
- Memory-conscious data structures

## Technology Stack

### Core Framework
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "typescript": "^5.0.0",
  "vite": "^4.0.0"
}
```

### State Management & Routing
```json
{
  "zustand": "^4.4.0",
  "react-router-dom": "^6.8.0"
}
```

### UI Components & Styling
```json
{
  "tailwindcss": "^3.3.0",
  "@radix-ui/react-primitives": "^1.0.0",
  "lucide-react": "^0.263.0",
  "recharts": "^2.7.0"
}
```

## Application Structure

### Component Architecture

```
src/renderer/
├── components/
│   ├── ui/           # Reusable UI components
│   ├── layout/       # Layout components
│   ├── chat/         # Chat interface components
│   ├── channels/     # Channel management
│   ├── projects/     # Project management
│   └── settings/     # Settings panels
├── hooks/            # Custom React hooks
├── stores/           # Zustand stores
├── types/            # TypeScript definitions
├── utils/            # Utility functions
├── styles/           # Global styles
└── main.tsx          # Application entry point
```

### Preload Script Architecture

```javascript
// src/preload/main-preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// Define the ElectronAPI interface
interface ElectronAPI {
  // RAG System
  rag: {
    query: (question: string, options?: QueryOptions) => Promise<RAGResponse>;
    chat: (message: string, conversation?: Message[]) => Promise<ChatResponse>;
  };
  
  // Channel Management
  channels: {
    index: (channelId: string, options?: IndexOptions) => Promise<IndexResult>;
    list: () => Promise<Channel[]>;
    delete: (channelId: string) => Promise<void>;
    getVideos: (channelId: string) => Promise<VideoDetails[]>;
  };
  
  // Project Management
  projects: {
    create: (name: string, description?: string) => Promise<Project>;
    list: () => Promise<Project[]>;
    switch: (projectId: string) => Promise<Project>;
    delete: (projectId: string) => Promise<void>;
  };
  
  // System Integration
  system: {
    showNotification: (options: NotificationOptions) => void;
    openExternal: (url: string) => Promise<void>;
    showSaveDialog: (options?: SaveDialogOptions) => Promise<SaveDialogResult>;
  };
  
  // Event Listeners
  on: (channel: string, callback: (...args: any[]) => void) => void;
  off: (channel: string, callback: (...args: any[]) => void) => void;
}

// Expose secure API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // RAG System Operations
  rag: {
    query: (question: string, options?: QueryOptions) => 
      ipcRenderer.invoke('rag:query', question, options),
    
    chat: (message: string, conversation?: Message[]) => 
      ipcRenderer.invoke('rag:chat', message, conversation)
  },

  // Channel Operations
  channels: {
    index: (channelId: string, options?: IndexOptions) => 
      ipcRenderer.invoke('channel:index', channelId, options),
    
    list: () => ipcRenderer.invoke('channel:list'),
    
    delete: (channelId: string) => 
      ipcRenderer.invoke('channel:delete', channelId),
    
    getVideos: (channelId: string) => 
      ipcRenderer.invoke('channel:videos', channelId)
  },

  // Project Operations
  projects: {
    create: (name: string, description?: string) => 
      ipcRenderer.invoke('project:create', name, description),
    
    list: () => ipcRenderer.invoke('project:list'),
    
    switch: (projectId: string) => 
      ipcRenderer.invoke('project:switch', projectId),
    
    delete: (projectId: string) => 
      ipcRenderer.invoke('project:delete', projectId)
  },

  // System Operations
  system: {
    showNotification: (options: NotificationOptions) => 
      ipcRenderer.send('system:notification', options),
    
    openExternal: (url: string) => 
      ipcRenderer.invoke('system:open-external', url),
    
    showSaveDialog: (options?: SaveDialogOptions) => 
      ipcRenderer.invoke('system:save-dialog', options)
  },

  // Event Listeners
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'channel:index:progress',
      'rag:query:progress',
      'system:theme-changed',
      'project:switched'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, callback);
    }
  },

  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// Type declaration for global electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

### State Management Architecture

```typescript
// src/renderer/stores/app-store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface AppState {
  // UI State
  theme: 'light' | 'dark' | 'system';
  sidebarOpen: boolean;
  currentView: 'chat' | 'channels' | 'settings' | 'analytics';
  
  // Application Data
  currentProject: Project | null;
  projects: Project[];
  channels: Channel[];
  
  // Chat State
  messages: Message[];
  isQuerying: boolean;
  
  // Indexing State
  indexingJobs: Map<string, IndexingProgress>;
  
  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleSidebar: () => void;
  setCurrentView: (view: string) => void;
  
  // Project Actions
  setCurrentProject: (project: Project) => void;
  addProject: (project: Project) => void;
  removeProject: (projectId: string) => void;
  
  // Chat Actions
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  setQuerying: (isQuerying: boolean) => void;
  
  // Channel Actions
  setChannels: (channels: Channel[]) => void;
  addChannel: (channel: Channel) => void;
  removeChannel: (channelId: string) => void;
  
  // Indexing Actions
  setIndexingProgress: (channelId: string, progress: IndexingProgress) => void;
  clearIndexingProgress: (channelId: string) => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // Initial state
      theme: 'system',
      sidebarOpen: true,
      currentView: 'chat',
      currentProject: null,
      projects: [],
      channels: [],
      messages: [],
      isQuerying: false,
      indexingJobs: new Map(),

      // UI Actions
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setCurrentView: (currentView) => set({ currentView }),

      // Project Actions
      setCurrentProject: (project) => set({ currentProject: project }),
      addProject: (project) => set((state) => ({ 
        projects: [...state.projects, project] 
      })),
      removeProject: (projectId) => set((state) => ({
        projects: state.projects.filter(p => p.id !== projectId)
      })),

      // Chat Actions
      addMessage: (message) => set((state) => ({ 
        messages: [...state.messages, message] 
      })),
      clearMessages: () => set({ messages: [] }),
      setQuerying: (isQuerying) => set({ isQuerying }),

      // Channel Actions
      setChannels: (channels) => set({ channels }),
      addChannel: (channel) => set((state) => ({ 
        channels: [...state.channels, channel] 
      })),
      removeChannel: (channelId) => set((state) => ({
        channels: state.channels.filter(c => c.id !== channelId)
      })),

      // Indexing Actions
      setIndexingProgress: (channelId, progress) => set((state) => {
        const newJobs = new Map(state.indexingJobs);
        newJobs.set(channelId, progress);
        return { indexingJobs: newJobs };
      }),
      clearIndexingProgress: (channelId) => set((state) => {
        const newJobs = new Map(state.indexingJobs);
        newJobs.delete(channelId);
        return { indexingJobs: newJobs };
      })
    }),
    { name: 'ragmaker-store' }
  )
);
```

### Main Application Component

```tsx
// src/renderer/App.tsx
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useAppStore } from './stores/app-store';
import { Layout } from './components/layout/Layout';
import { ChatView } from './components/chat/ChatView';
import { ChannelsView } from './components/channels/ChannelsView';
import { SettingsView } from './components/settings/SettingsView';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { ThemeProvider } from './components/ui/ThemeProvider';
import { Toaster } from './components/ui/Toaster';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

export const App: React.FC = () => {
  const { theme, setCurrentProject, setChannels } = useAppStore();

  useEffect(() => {
    // Initialize application data
    const initializeApp = async () => {
      try {
        // Load projects and set current project
        const projects = await window.electronAPI.projects.list();
        const currentProject = projects.find(p => p.isCurrent);
        if (currentProject) {
          setCurrentProject(currentProject);
        }

        // Load channels for current project
        const channels = await window.electronAPI.channels.list();
        setChannels(channels);

        // Set up event listeners
        setupEventListeners();
      } catch (error) {
        console.error('Failed to initialize application:', error);
      }
    };

    initializeApp();

    // Cleanup event listeners on unmount
    return () => {
      cleanupEventListeners();
    };
  }, []);

  const setupEventListeners = () => {
    // Listen for project switches
    window.electronAPI.on('project:switched', (project: Project) => {
      setCurrentProject(project);
    });

    // Listen for theme changes
    window.electronAPI.on('system:theme-changed', (newTheme: string) => {
      useAppStore.getState().setTheme(newTheme as 'light' | 'dark' | 'system');
    });
  };

  const cleanupEventListeners = () => {
    window.electronAPI.removeAllListeners('project:switched');
    window.electronAPI.removeAllListeners('system:theme-changed');
  };

  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<ChatView />} />
              <Route path="/channels" element={<ChannelsView />} />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="/analytics" element={<AnalyticsView />} />
            </Routes>
          </Layout>
        </Router>
        <Toaster />
      </ThemeProvider>
    </ErrorBoundary>
  );
};
```

### Chat Interface Component

```tsx
// src/renderer/components/chat/ChatView.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../stores/app-store';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { ScrollArea } from '../ui/ScrollArea';

export const ChatView: React.FC = () => {
  const { messages, isQuerying, addMessage, setQuerying } = useAppStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (message: string) => {
    try {
      // Add user message
      const userMessage: Message = {
        id: Date.now().toString(),
        content: message,
        role: 'user',
        timestamp: new Date()
      };
      addMessage(userMessage);

      // Set querying state
      setQuerying(true);

      // Send to RAG system
      const response = await window.electronAPI.rag.query(message);

      // Add assistant response
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response.answer,
        role: 'assistant',
        timestamp: new Date(),
        sources: response.sources,
        debug: response.debug
      };
      addMessage(assistantMessage);
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        role: 'assistant',
        timestamp: new Date(),
        isError: true
      };
      addMessage(errorMessage);
    } finally {
      setQuerying(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full p-4">
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-8">
                <h2 className="text-xl font-semibold mb-2">Welcome to RAGMaker</h2>
                <p>Ask me anything about your indexed YouTube channels!</p>
              </div>
            )}
            
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            
            {isQuerying && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>
      
      <div className="border-t p-4">
        <ChatInput onSendMessage={handleSendMessage} disabled={isQuerying} />
      </div>
    </div>
  );
};
```

### Channel Management Component

```tsx
// src/renderer/components/channels/ChannelsView.tsx
import React, { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { ChannelCard } from './ChannelCard';
import { AddChannelDialog } from './AddChannelDialog';
import { IndexingProgressDialog } from './IndexingProgressDialog';
import { Button } from '../ui/Button';
import { Plus } from 'lucide-react';

export const ChannelsView: React.FC = () => {
  const { channels, indexingJobs } = useAppStore();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  const activeIndexingJobs = Array.from(indexingJobs.entries());

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Channels</h1>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Channel
        </Button>
      </div>

      {/* Active Indexing Jobs */}
      {activeIndexingJobs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Indexing in Progress</h2>
          <div className="space-y-2">
            {activeIndexingJobs.map(([channelId, progress]) => (
              <IndexingProgressDialog 
                key={channelId} 
                channelId={channelId} 
                progress={progress} 
              />
            ))}
          </div>
        </div>
      )}

      {/* Channels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {channels.map((channel) => (
          <ChannelCard 
            key={channel.id} 
            channel={channel}
            onSelect={() => setSelectedChannel(channel.id)}
          />
        ))}
      </div>

      {channels.length === 0 && (
        <div className="text-center text-gray-500 mt-12">
          <h2 className="text-xl font-semibold mb-2">No channels indexed yet</h2>
          <p className="mb-4">Add your first YouTube channel to get started</p>
          <Button onClick={() => setShowAddDialog(true)}>
            Add Channel
          </Button>
        </div>
      )}

      <AddChannelDialog 
        open={showAddDialog} 
        onClose={() => setShowAddDialog(false)} 
      />
    </div>
  );
};
```

## Security Considerations

### Input Validation
- All user inputs are validated before sending to main process
- XSS prevention through proper React rendering
- URL validation for external links

### Content Security Policy
```typescript
// Applied in main process, enforced in renderer
const CSP = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "https:"],
  "connect-src": ["'none'"], // All API calls through IPC
  "font-src": ["'self'"],
  "object-src": ["'none'"],
  "media-src": ["'none'"]
};
```

### Error Boundaries
```tsx
// src/renderer/components/ui/ErrorBoundary.tsx
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React Error Boundary caught an error:', error, errorInfo);
    
    // Report error to main process for logging
    window.electronAPI?.system?.reportError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-gray-600 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <Button onClick={() => window.location.reload()}>
              Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

This renderer process architecture provides a robust, secure, and performant foundation for the RAGMaker desktop application UI while maintaining strict security boundaries and excellent user experience.
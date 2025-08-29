# IPC Communication Patterns

## Overview

This document defines the secure Inter-Process Communication (IPC) patterns between the main and renderer processes in the RAGMaker Electron application. The design prioritizes security, type safety, and maintainability while providing a clean API surface for the frontend.

## Security Principles

### 1. Zero Trust Architecture
- No direct Node.js access in renderer processes
- All communication through validated IPC channels
- Message sanitization and validation at boundaries
- Principle of least privilege for API exposure

### 2. Context Isolation Enforcement
- Complete separation between main world and isolated world
- Controlled API exposure through contextBridge
- No global variable pollution
- Secure event handling patterns

### 3. Input Validation
- Schema-based message validation
- Type checking for all parameters
- Sanitization of user inputs
- Rate limiting for resource-intensive operations

## IPC Channel Architecture

### Channel Naming Convention
```
<domain>:<action>[:<sub-action>]

Examples:
- rag:query
- channel:index
- channel:index:progress  (event channel)
- project:create
- system:notification
```

### Channel Categories

#### 1. RAG System Channels
```typescript
interface RAGChannels {
  'rag:query': {
    request: [question: string, options?: QueryOptions];
    response: RAGResponse;
  };
  
  'rag:chat': {
    request: [message: string, conversation?: Message[]];
    response: ChatResponse;
  };
  
  'rag:query:progress': {
    event: ProgressUpdate;
  };
}
```

#### 2. Channel Management Channels
```typescript
interface ChannelChannels {
  'channel:index': {
    request: [channelId: string, options?: IndexOptions];
    response: IndexResult;
  };
  
  'channel:list': {
    request: [];
    response: Channel[];
  };
  
  'channel:delete': {
    request: [channelId: string];
    response: void;
  };
  
  'channel:videos': {
    request: [channelId: string];
    response: VideoDetails[];
  };
  
  'channel:index:progress': {
    event: IndexingProgress;
  };
}
```

#### 3. Project Management Channels
```typescript
interface ProjectChannels {
  'project:create': {
    request: [name: string, description?: string];
    response: Project;
  };
  
  'project:list': {
    request: [];
    response: { projects: Project[], current: Project | null };
  };
  
  'project:switch': {
    request: [projectId: string];
    response: Project;
  };
  
  'project:delete': {
    request: [projectId: string];
    response: void;
  };
  
  'project:switched': {
    event: Project;
  };
}
```

#### 4. System Integration Channels
```typescript
interface SystemChannels {
  'system:notification': {
    request: [options: NotificationOptions];
    response: void;
  };
  
  'system:open-external': {
    request: [url: string];
    response: void;
  };
  
  'system:save-dialog': {
    request: [options?: SaveDialogOptions];
    response: SaveDialogResult;
  };
  
  'system:theme-changed': {
    event: string;
  };
}
```

## Implementation Details

### Main Process IPC Handler

```typescript
// src/main/ipc/ipc-handler.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { SecurityValidator } from '../security/security-validator';
import { ServiceManager } from '../services/service-manager';
import { Logger } from '../utils/logger';

export class IPCHandler {
  private security: SecurityValidator;
  private services: ServiceManager;
  private logger: Logger;
  private handlers: Map<string, IPCChannelHandler>;

  constructor(security: SecurityValidator, services: ServiceManager) {
    this.security = security;
    this.services = services;
    this.logger = new Logger('IPC');
    this.handlers = new Map();
  }

  initialize() {
    // Register all channel handlers
    this.registerRAGHandlers();
    this.registerChannelHandlers();
    this.registerProjectHandlers();
    this.registerSystemHandlers();

    // Set up global error handling
    this.setupErrorHandling();
  }

  private registerHandler<T extends keyof IPCChannelMap>(
    channel: T,
    schema: z.ZodSchema,
    handler: IPCChannelHandler<T>
  ) {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: any[]) => {
      try {
        // Validate sender
        this.security.validateSender(event.sender);
        
        // Validate and parse arguments
        const validatedArgs = schema.parse(args);
        
        // Rate limiting check
        await this.security.checkRateLimit(channel, event.sender);
        
        // Execute handler
        const result = await handler(event, ...validatedArgs);
        
        // Log successful operation
        this.logger.info(`IPC ${channel} executed successfully`);
        
        return result;
      } catch (error) {
        this.logger.error(`IPC ${channel} error:`, error);
        throw error;
      }
    });
  }

  private registerRAGHandlers() {
    // RAG Query Handler
    this.registerHandler(
      'rag:query',
      z.tuple([
        z.string().min(1).max(1000),
        z.object({
          maxChunks: z.number().optional(),
          profileId: z.string().optional(),
          customInstructions: z.string().optional()
        }).optional()
      ]),
      async (event, question, options = {}) => {
        const ragService = this.services.get('rag');
        
        // Start progress tracking
        const progressCallback = (progress: ProgressUpdate) => {
          this.sendProgressUpdate(event.sender, 'rag:query:progress', progress);
        };
        
        return await ragService.query(question, {
          ...options,
          onProgress: progressCallback
        });
      }
    );

    // RAG Chat Handler
    this.registerHandler(
      'rag:chat',
      z.tuple([
        z.string().min(1).max(1000),
        z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string()
        })).optional()
      ]),
      async (event, message, conversation = []) => {
        const ragService = this.services.get('rag');
        return await ragService.chat(message, conversation);
      }
    );
  }

  private registerChannelHandlers() {
    // Channel Index Handler
    this.registerHandler(
      'channel:index',
      z.tuple([
        z.string().regex(/^[a-zA-Z0-9_-]+$/), // YouTube channel ID validation
        z.object({
          videoLimit: z.number().min(1).max(1000).optional(),
          excludeShorts: z.boolean().optional(),
          skipExisting: z.boolean().optional()
        }).optional()
      ]),
      async (event, channelId, options = {}) => {
        const indexingService = this.services.get('indexing');
        
        // Progress callback for real-time updates
        const progressCallback = (progress: IndexingProgress) => {
          this.sendProgressUpdate(event.sender, 'channel:index:progress', progress);
        };
        
        return await indexingService.indexChannel(channelId, {
          ...options,
          onProgress: progressCallback
        });
      }
    );

    // Channel List Handler
    this.registerHandler(
      'channel:list',
      z.tuple([]),
      async () => {
        const channelService = this.services.get('channel');
        return await channelService.getAllChannels();
      }
    );

    // Channel Delete Handler
    this.registerHandler(
      'channel:delete',
      z.tuple([z.string()]),
      async (event, channelId) => {
        const channelService = this.services.get('channel');
        
        // Confirm deletion with user
        const confirmation = await this.showConfirmationDialog(
          'Delete Channel',
          `Are you sure you want to delete this channel? This action cannot be undone.`
        );
        
        if (confirmation) {
          await channelService.deleteChannel(channelId);
        }
      }
    );

    // Channel Videos Handler
    this.registerHandler(
      'channel:videos',
      z.tuple([z.string()]),
      async (event, channelId) => {
        const channelService = this.services.get('channel');
        return await channelService.getChannelVideos(channelId);
      }
    );
  }

  private registerProjectHandlers() {
    // Project Create Handler
    this.registerHandler(
      'project:create',
      z.tuple([
        z.string().min(1).max(100),
        z.string().max(500).optional()
      ]),
      async (event, name, description) => {
        const projectService = this.services.get('project');
        const project = await projectService.createProject(name, description);
        
        // Notify all windows of project creation
        this.broadcastEvent('project:created', project);
        
        return project;
      }
    );

    // Project List Handler
    this.registerHandler(
      'project:list',
      z.tuple([]),
      async () => {
        const projectService = this.services.get('project');
        const projects = await projectService.getAllProjects();
        const current = await projectService.getCurrentProject();
        
        return { projects, current };
      }
    );

    // Project Switch Handler
    this.registerHandler(
      'project:switch',
      z.tuple([z.string()]),
      async (event, projectId) => {
        const projectService = this.services.get('project');
        const project = await projectService.switchToProject(projectId);
        
        // Notify all windows of project switch
        this.broadcastEvent('project:switched', project);
        
        return project;
      }
    );
  }

  private registerSystemHandlers() {
    // System Notification Handler
    this.registerHandler(
      'system:notification',
      z.tuple([z.object({
        title: z.string(),
        body: z.string(),
        icon: z.string().optional(),
        silent: z.boolean().optional()
      })]),
      async (event, options) => {
        const { Notification } = require('electron');
        
        if (Notification.isSupported()) {
          const notification = new Notification(options);
          notification.show();
        }
      }
    );

    // External URL Handler
    this.registerHandler(
      'system:open-external',
      z.tuple([z.string().url()]),
      async (event, url) => {
        const { shell } = require('electron');
        
        // Additional URL validation for security
        const allowedDomains = ['youtube.com', 'github.com', 'openai.com'];
        const urlObj = new URL(url);
        
        if (allowedDomains.some(domain => urlObj.hostname.endsWith(domain))) {
          await shell.openExternal(url);
        } else {
          throw new Error('URL not allowed');
        }
      }
    );

    // Save Dialog Handler
    this.registerHandler(
      'system:save-dialog',
      z.tuple([z.object({
        defaultPath: z.string().optional(),
        filters: z.array(z.object({
          name: z.string(),
          extensions: z.array(z.string())
        })).optional()
      }).optional()]),
      async (event, options = {}) => {
        const { dialog } = require('electron');
        const window = BrowserWindow.fromWebContents(event.sender);
        
        return await dialog.showSaveDialog(window, options);
      }
    );
  }

  private sendProgressUpdate(sender: Electron.WebContents, channel: string, data: any) {
    if (!sender.isDestroyed()) {
      sender.send(channel, data);
    }
  }

  private broadcastEvent(channel: string, data: any) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, data);
      }
    });
  }

  private async showConfirmationDialog(title: string, message: string): Promise<boolean> {
    const { dialog } = require('electron');
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Cancel', 'Confirm'],
      defaultId: 1,
      title,
      message
    });
    
    return result.response === 1;
  }

  private setupErrorHandling() {
    ipcMain.on('renderer-error', (event, error) => {
      this.logger.error('Renderer process error:', error);
    });
  }
}
```

### Renderer Process IPC Client

```typescript
// src/renderer/services/ipc-client.ts
import { z } from 'zod';

export class IPCClient {
  private eventListeners: Map<string, Set<Function>>;

  constructor() {
    this.eventListeners = new Map();
  }

  // Typed IPC invoke wrapper
  async invoke<T extends keyof IPCChannelMap>(
    channel: T,
    ...args: IPCChannelMap[T]['request']
  ): Promise<IPCChannelMap[T]['response']> {
    try {
      return await window.electronAPI.invoke(channel, ...args);
    } catch (error) {
      console.error(`IPC ${channel} error:`, error);
      throw new IPCError(channel, error.message);
    }
  }

  // Event listener management
  on<T extends keyof IPCEventMap>(
    channel: T,
    callback: (data: IPCEventMap[T]) => void
  ): void {
    if (!this.eventListeners.has(channel)) {
      this.eventListeners.set(channel, new Set());
    }
    
    this.eventListeners.get(channel)!.add(callback);
    window.electronAPI.on(channel, callback);
  }

  off<T extends keyof IPCEventMap>(
    channel: T,
    callback: (data: IPCEventMap[T]) => void
  ): void {
    const listeners = this.eventListeners.get(channel);
    if (listeners) {
      listeners.delete(callback);
      window.electronAPI.off(channel, callback);
    }
  }

  removeAllListeners(channel: string): void {
    const listeners = this.eventListeners.get(channel);
    if (listeners) {
      listeners.clear();
    }
    window.electronAPI.removeAllListeners(channel);
  }

  // Cleanup method
  cleanup(): void {
    for (const [channel] of this.eventListeners) {
      this.removeAllListeners(channel);
    }
  }
}

export class IPCError extends Error {
  constructor(public channel: string, message: string) {
    super(`IPC Error on ${channel}: ${message}`);
    this.name = 'IPCError';
  }
}

// Global IPC client instance
export const ipcClient = new IPCClient();
```

### React Hooks for IPC

```typescript
// src/renderer/hooks/use-ipc.ts
import { useEffect, useCallback } from 'react';
import { ipcClient } from '../services/ipc-client';

export function useIPCQuery<T extends keyof IPCChannelMap>(
  channel: T
) {
  return useCallback(
    async (...args: IPCChannelMap[T]['request']): Promise<IPCChannelMap[T]['response']> => {
      return await ipcClient.invoke(channel, ...args);
    },
    [channel]
  );
}

export function useIPCEvent<T extends keyof IPCEventMap>(
  channel: T,
  callback: (data: IPCEventMap[T]) => void,
  deps: any[] = []
) {
  useEffect(() => {
    ipcClient.on(channel, callback);
    
    return () => {
      ipcClient.off(channel, callback);
    };
  }, [channel, ...deps]);
}

// Example usage hook
export function useChannelIndexing() {
  const indexChannel = useIPCQuery('channel:index');
  
  useIPCEvent('channel:index:progress', (progress) => {
    // Handle progress updates
    console.log('Indexing progress:', progress);
  });
  
  return { indexChannel };
}
```

## Security Validation

### Message Validation Schema

```typescript
// src/main/security/validation-schemas.ts
import { z } from 'zod';

export const ValidationSchemas = {
  'rag:query': z.tuple([
    z.string()
      .min(1, 'Query cannot be empty')
      .max(1000, 'Query too long')
      .refine(query => !/<script|javascript:|data:/.test(query), 'Invalid query content'),
    z.object({
      maxChunks: z.number().min(1).max(50).optional(),
      profileId: z.string().uuid().optional(),
      customInstructions: z.string().max(500).optional()
    }).optional()
  ]),
  
  'channel:index': z.tuple([
    z.string()
      .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid channel ID format')
      .min(1)
      .max(50),
    z.object({
      videoLimit: z.number().min(1).max(1000).optional(),
      excludeShorts: z.boolean().optional(),
      skipExisting: z.boolean().optional()
    }).optional()
  ])
};
```

### Rate Limiting

```typescript
// src/main/security/rate-limiter.ts
export class RateLimiter {
  private limits: Map<string, { count: number; resetTime: number }>;
  private rateLimits = {
    'rag:query': { maxRequests: 60, windowMs: 60000 }, // 60 requests per minute
    'channel:index': { maxRequests: 5, windowMs: 300000 }, // 5 requests per 5 minutes
  };

  constructor() {
    this.limits = new Map();
  }

  async checkLimit(channel: string, senderId: string): Promise<void> {
    const limit = this.rateLimits[channel];
    if (!limit) return;

    const key = `${channel}:${senderId}`;
    const now = Date.now();
    const current = this.limits.get(key);

    if (!current || now > current.resetTime) {
      this.limits.set(key, {
        count: 1,
        resetTime: now + limit.windowMs
      });
      return;
    }

    if (current.count >= limit.maxRequests) {
      throw new Error(`Rate limit exceeded for ${channel}`);
    }

    current.count++;
  }
}
```

This IPC communication pattern provides a secure, type-safe, and maintainable foundation for communication between the main and renderer processes while enforcing strict security boundaries and providing excellent developer experience.
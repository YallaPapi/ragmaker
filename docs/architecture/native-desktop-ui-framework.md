# Native Desktop UI Framework Specification

## Framework Selection: Tauri + React

### Rationale for Tauri Selection

**Primary Choice: Tauri**
- **Performance**: Rust backend provides memory safety and near-native performance
- **Security**: Strong security model with capability-based permissions
- **Resource Efficiency**: Smaller bundle size and lower memory footprint than Electron
- **Web Technologies**: Leverage existing web UI while maintaining native performance
- **Cross-Platform**: Single codebase for Windows, macOS, and Linux
- **Active Development**: Modern, actively maintained framework

**Alternative Consideration: Qt/C++**
- Would provide maximum native integration
- Higher development complexity
- Steeper learning curve
- Less flexible for rapid UI iteration

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Tauri Application Architecture                   │
├─────────────────────────────────────────────────────────────────────────┤
│                         Frontend (React/TypeScript)                     │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐        │
│  │   UI Components │ │  State Management│ │   Routing       │        │
│  │  (Shadcn/ui)    │ │    (Zustand)     │ │ (React Router)  │        │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐        │
│  │   Tauri API     │ │   Event System  │ │   Theme Engine  │        │
│  │   Integration   │ │                 │ │                 │        │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘        │
├─────────────────────────────────────────────────────────────────────────┤
│                    IPC Bridge (Tauri Commands)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                         Backend (Rust)                                  │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐        │
│  │   Command       │ │   File System   │ │   Database      │        │
│  │   Handlers      │ │   Operations    │ │   Operations    │        │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐        │
│  │   RAG Engine    │ │   YouTube       │ │   Background    │        │
│  │   Interface     │ │   Processor     │ │   Tasks         │        │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Frontend Architecture (React/TypeScript)

### 1. Component Structure

```typescript
// Main Application Structure
interface AppStructure {
  layout: {
    shell: AppShell;
    sidebar: NavigationSidebar;
    header: AppHeader;
    main: MainContent;
    footer: StatusBar;
  };
  
  pages: {
    dashboard: DashboardPage;
    projects: ProjectsPage;
    channels: ChannelsPage;
    chat: ChatPage;
    settings: SettingsPage;
    modelManagement: ModelManagementPage;
  };
  
  components: {
    shared: SharedComponents;
    domain: DomainComponents;
    ui: UIComponents;
  };
}

// Core Application Shell
export const AppShell: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  return (
    <div className={`app-shell ${theme}`} data-tauri-drag-region>
      <div className="app-layout">
        <NavigationSidebar 
          collapsed={sidebarCollapsed}
          onToggle={setSidebarCollapsed}
          currentProject={currentProject}
        />
        
        <div className="main-container">
          <AppHeader 
            currentProject={currentProject}
            onProjectChange={setCurrentProject}
          />
          
          <main className="main-content">
            <Suspense fallback={<LoadingSpinner />}>
              <Router />
            </Suspense>
          </main>
          
          <StatusBar />
        </div>
      </div>
      
      <GlobalModals />
      <NotificationSystem />
    </div>
  );
};

// Navigation Sidebar Component
export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  collapsed,
  onToggle,
  currentProject
}) => {
  const navigation = [
    { 
      name: 'Dashboard', 
      href: '/', 
      icon: Home, 
      shortcut: 'Cmd+1' 
    },
    { 
      name: 'Projects', 
      href: '/projects', 
      icon: Folder, 
      shortcut: 'Cmd+2' 
    },
    { 
      name: 'Channels', 
      href: '/channels', 
      icon: Youtube, 
      shortcut: 'Cmd+3' 
    },
    { 
      name: 'Chat', 
      href: '/chat', 
      icon: MessageCircle, 
      shortcut: 'Cmd+4' 
    },
    { 
      name: 'Settings', 
      href: '/settings', 
      icon: Settings, 
      shortcut: 'Cmd+,' 
    },
  ];

  useKeyboardShortcuts(navigation);

  return (
    <aside className={cn(
      "sidebar",
      collapsed && "sidebar-collapsed"
    )}>
      <div className="sidebar-header">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="sidebar-toggle"
        >
          <Menu className="h-4 w-4" />
        </Button>
        
        {!collapsed && (
          <div className="project-selector">
            <ProjectSelector
              currentProject={currentProject}
              onProjectChange={onProjectChange}
            />
          </div>
        )}
      </div>
      
      <nav className="sidebar-nav">
        {navigation.map((item) => (
          <SidebarNavItem
            key={item.name}
            item={item}
            collapsed={collapsed}
          />
        ))}
      </nav>
      
      <div className="sidebar-footer">
        <ModelStatusIndicator />
        <SyncStatusIndicator />
      </div>
    </aside>
  );
};
```

### 2. State Management with Zustand

```typescript
// Global Application State
interface AppState {
  // UI State
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  modalStack: Modal[];
  notifications: Notification[];
  
  // Application State
  currentProject: Project | null;
  isInitialized: boolean;
  
  // Performance State
  systemResources: SystemResources;
  modelStatus: ModelStatus;
  
  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleSidebar: () => void;
  showModal: (modal: Modal) => void;
  hideModal: (modalId: string) => void;
  addNotification: (notification: Notification) => void;
  removeNotification: (notificationId: string) => void;
  switchProject: (project: Project) => Promise<void>;
  initializeApp: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial State
        theme: 'system',
        sidebarCollapsed: false,
        modalStack: [],
        notifications: [],
        currentProject: null,
        isInitialized: false,
        systemResources: {
          memoryUsage: 0,
          cpuUsage: 0,
          diskUsage: 0,
        },
        modelStatus: {
          loaded: false,
          loading: false,
          error: null,
        },

        // Actions
        setTheme: (theme) => {
          set({ theme });
          document.documentElement.setAttribute('data-theme', theme);
        },

        toggleSidebar: () => set((state) => ({
          sidebarCollapsed: !state.sidebarCollapsed
        })),

        showModal: (modal) => set((state) => ({
          modalStack: [...state.modalStack, modal]
        })),

        hideModal: (modalId) => set((state) => ({
          modalStack: state.modalStack.filter(m => m.id !== modalId)
        })),

        addNotification: (notification) => set((state) => ({
          notifications: [
            ...state.notifications,
            { ...notification, id: generateId(), timestamp: Date.now() }
          ]
        })),

        removeNotification: (notificationId) => set((state) => ({
          notifications: state.notifications.filter(n => n.id !== notificationId)
        })),

        switchProject: async (project) => {
          try {
            set({ currentProject: null }); // Clear current project
            await invoke('switch_project', { projectId: project.id });
            set({ currentProject: project });
          } catch (error) {
            console.error('Failed to switch project:', error);
            throw error;
          }
        },

        initializeApp: async () => {
          try {
            const systemInfo = await invoke('get_system_info');
            const modelStatus = await invoke('get_model_status');
            const currentProject = await invoke('get_current_project');
            
            set({
              systemResources: systemInfo,
              modelStatus,
              currentProject,
              isInitialized: true,
            });
          } catch (error) {
            console.error('Failed to initialize app:', error);
            throw error;
          }
        },
      }),
      {
        name: 'ragmaker-app-state',
        partialize: (state) => ({
          theme: state.theme,
          sidebarCollapsed: state.sidebarCollapsed,
          currentProject: state.currentProject,
        }),
      }
    )
  )
);

// Domain-Specific Stores

// Chat Store
interface ChatState {
  conversations: Conversation[];
  currentConversation: string | null;
  isGenerating: boolean;
  
  // Actions
  startConversation: () => string;
  sendMessage: (message: string) => Promise<void>;
  loadConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
  clearHistory: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversation: null,
  isGenerating: false,

  startConversation: () => {
    const conversationId = generateId();
    const newConversation: Conversation = {
      id: conversationId,
      title: 'New Conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    set((state) => ({
      conversations: [...state.conversations, newConversation],
      currentConversation: conversationId,
    }));
    
    return conversationId;
  },

  sendMessage: async (message: string) => {
    const { currentConversation, conversations } = get();
    if (!currentConversation) return;

    // Add user message
    const userMessage: Message = {
      id: generateId(),
      type: 'user',
      content: message,
      timestamp: Date.now(),
    };

    set((state) => ({
      conversations: state.conversations.map(conv =>
        conv.id === currentConversation
          ? { ...conv, messages: [...conv.messages, userMessage] }
          : conv
      ),
      isGenerating: true,
    }));

    try {
      // Call Tauri backend for RAG response
      const response = await invoke<RAGResponse>('query_rag', {
        question: message,
        projectId: useAppStore.getState().currentProject?.id,
      });

      // Add assistant message
      const assistantMessage: Message = {
        id: generateId(),
        type: 'assistant',
        content: response.answer,
        sources: response.sources,
        timestamp: Date.now(),
        metadata: {
          modelUsed: response.model_info.name,
          tokensUsed: response.generation_metadata.tokens_used,
          confidenceScore: response.confidence_score,
        },
      };

      set((state) => ({
        conversations: state.conversations.map(conv =>
          conv.id === currentConversation
            ? { 
                ...conv, 
                messages: [...conv.messages, assistantMessage],
                updatedAt: Date.now(),
              }
            : conv
        ),
        isGenerating: false,
      }));
    } catch (error) {
      console.error('Failed to generate response:', error);
      
      // Add error message
      const errorMessage: Message = {
        id: generateId(),
        type: 'error',
        content: 'Failed to generate response. Please try again.',
        timestamp: Date.now(),
      };

      set((state) => ({
        conversations: state.conversations.map(conv =>
          conv.id === currentConversation
            ? { ...conv, messages: [...conv.messages, errorMessage] }
            : conv
        ),
        isGenerating: false,
      }));
    }
  },

  loadConversation: (conversationId: string) => {
    set({ currentConversation: conversationId });
  },

  deleteConversation: (conversationId: string) => {
    set((state) => ({
      conversations: state.conversations.filter(conv => conv.id !== conversationId),
      currentConversation: state.currentConversation === conversationId 
        ? null 
        : state.currentConversation,
    }));
  },

  clearHistory: () => {
    set({
      conversations: [],
      currentConversation: null,
    });
  },
}));

// Project Management Store
interface ProjectState {
  projects: Project[];
  isLoading: boolean;
  
  // Actions
  loadProjects: () => Promise<void>;
  createProject: (project: CreateProjectRequest) => Promise<Project>;
  updateProject: (projectId: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  duplicateProject: (projectId: string) => Promise<Project>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  isLoading: false,

  loadProjects: async () => {
    set({ isLoading: true });
    try {
      const projects = await invoke<Project[]>('get_all_projects');
      set({ projects, isLoading: false });
    } catch (error) {
      console.error('Failed to load projects:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  createProject: async (projectRequest) => {
    set({ isLoading: true });
    try {
      const project = await invoke<Project>('create_project', { project: projectRequest });
      set((state) => ({
        projects: [...state.projects, project],
        isLoading: false,
      }));
      return project;
    } catch (error) {
      console.error('Failed to create project:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  updateProject: async (projectId, updates) => {
    try {
      await invoke('update_project', { projectId, updates });
      set((state) => ({
        projects: state.projects.map(p =>
          p.id === projectId ? { ...p, ...updates } : p
        ),
      }));
    } catch (error) {
      console.error('Failed to update project:', error);
      throw error;
    }
  },

  deleteProject: async (projectId) => {
    try {
      await invoke('delete_project', { projectId });
      set((state) => ({
        projects: state.projects.filter(p => p.id !== projectId),
      }));
    } catch (error) {
      console.error('Failed to delete project:', error);
      throw error;
    }
  },

  duplicateProject: async (projectId) => {
    set({ isLoading: true });
    try {
      const project = await invoke<Project>('duplicate_project', { projectId });
      set((state) => ({
        projects: [...state.projects, project],
        isLoading: false,
      }));
      return project;
    } catch (error) {
      console.error('Failed to duplicate project:', error);
      set({ isLoading: false });
      throw error;
    }
  },
}));
```

### 3. UI Components with shadcn/ui

```typescript
// Enhanced Chat Interface
export const ChatInterface: React.FC = () => {
  const {
    conversations,
    currentConversation,
    isGenerating,
    sendMessage,
    loadConversation,
  } = useChatStore();

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const currentConv = conversations.find(c => c.id === currentConversation);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [currentConv?.messages, scrollToBottom]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isGenerating) return;
    
    const message = inputValue.trim();
    setInputValue('');
    
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <ConversationSelector
          conversations={conversations}
          currentConversation={currentConversation}
          onConversationSelect={loadConversation}
        />
        
        <div className="chat-actions">
          <ModelSelector />
          <Button variant="outline" size="sm">
            <FileText className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="chat-messages">
        <ScrollArea className="h-full">
          {currentConv?.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isGenerating={isGenerating && message === currentConv.messages[currentConv.messages.length - 1]}
            />
          ))}
          
          {isGenerating && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </ScrollArea>
      </div>

      <div className="chat-input">
        <div className="input-container">
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your indexed content..."
            className="min-h-[60px] max-h-[200px] resize-none"
            disabled={isGenerating}
          />
          
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isGenerating}
            size="sm"
            className="absolute bottom-2 right-2"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="input-footer">
          <div className="input-hints">
            <kbd>Enter</kbd> to send • <kbd>Shift + Enter</kbd> for new line
          </div>
          
          <div className="model-status">
            <ModelStatusBadge />
          </div>
        </div>
      </div>
    </div>
  );
};

// Message Bubble Component
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isGenerating
}) => {
  const isUser = message.type === 'user';
  const isError = message.type === 'error';

  return (
    <div className={cn(
      "message-bubble",
      isUser && "message-user",
      isError && "message-error"
    )}>
      <div className="message-avatar">
        {isUser ? (
          <User className="w-6 h-6" />
        ) : isError ? (
          <AlertCircle className="w-6 h-6" />
        ) : (
          <Bot className="w-6 h-6" />
        )}
      </div>

      <div className="message-content">
        <div className="message-header">
          <span className="message-author">
            {isUser ? 'You' : isError ? 'Error' : 'Assistant'}
          </span>
          <span className="message-timestamp">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>

        <div className="message-text">
          {isGenerating ? (
            <StreamingText content={message.content} />
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
        </div>

        {message.sources && message.sources.length > 0 && (
          <div className="message-sources">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  <FileText className="w-4 h-4 mr-2" />
                  Sources ({message.sources.length})
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="sources-list">
                  {message.sources.map((source, index) => (
                    <SourceCard key={index} source={source} />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {message.metadata && (
          <div className="message-metadata">
            <div className="metadata-items">
              {message.metadata.modelUsed && (
                <Badge variant="secondary" className="text-xs">
                  {message.metadata.modelUsed}
                </Badge>
              )}
              {message.metadata.tokensUsed && (
                <Badge variant="outline" className="text-xs">
                  {message.metadata.tokensUsed} tokens
                </Badge>
              )}
              {message.metadata.confidenceScore && (
                <Badge
                  variant={message.metadata.confidenceScore > 0.8 ? "default" : "destructive"}
                  className="text-xs"
                >
                  {Math.round(message.metadata.confidenceScore * 100)}% confidence
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="message-actions">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => copyToClipboard(message.content)}>
              <Copy className="w-4 h-4 mr-2" />
              Copy
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => regenerateMessage(message.id)}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => shareMessage(message.id)}>
              <Share className="w-4 h-4 mr-2" />
              Share
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

// Project Management Interface
export const ProjectsPage: React.FC = () => {
  const { projects, isLoading, loadProjects, createProject, deleteProject } = useProjectStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'updated'>('updated');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    return projects
      .filter(project =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'created':
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          case 'updated':
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          default:
            return 0;
        }
      });
  }, [projects, searchQuery, sortBy]);

  const handleCreateProject = async (projectData: CreateProjectRequest) => {
    try {
      await createProject(projectData);
      useAppStore.getState().addNotification({
        type: 'success',
        title: 'Project Created',
        message: `Project "${projectData.name}" has been created successfully.`,
      });
    } catch (error) {
      useAppStore.getState().addNotification({
        type: 'error',
        title: 'Failed to Create Project',
        message: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    }
  };

  return (
    <div className="projects-page">
      <div className="projects-header">
        <div className="header-content">
          <h1 className="page-title">Projects</h1>
          <p className="page-description">
            Manage your RAG projects and knowledge bases
          </p>
        </div>

        <div className="header-actions">
          <CreateProjectDialog onCreateProject={handleCreateProject} />
        </div>
      </div>

      <div className="projects-controls">
        <div className="search-and-filter">
          <div className="search-input">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Last Updated</SelectItem>
              <SelectItem value="created">Created Date</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="view-toggle">
          <ToggleGroup type="single" value={viewMode} onValueChange={setViewMode}>
            <ToggleGroupItem value="grid">
              <Grid className="w-4 h-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list">
              <List className="w-4 h-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="projects-content">
        {isLoading ? (
          <div className="loading-state">
            <LoadingSpinner />
            <p>Loading projects...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="empty-state">
            <FolderOpen className="w-16 h-16 text-muted-foreground" />
            <h3>No projects found</h3>
            <p>
              {searchQuery
                ? `No projects match "${searchQuery}"`
                : "Create your first project to get started"
              }
            </p>
            {!searchQuery && (
              <CreateProjectDialog onCreateProject={handleCreateProject}>
                <Button>Create Your First Project</Button>
              </CreateProjectDialog>
            )}
          </div>
        ) : (
          <div className={cn(
            "projects-grid",
            viewMode === 'list' && "projects-list"
          )}>
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                viewMode={viewMode}
                onDelete={() => deleteProject(project.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
```

This native desktop UI framework specification provides a comprehensive foundation for building a modern, responsive, and performant desktop application using Tauri and React, with full integration to the local RAG system backend.
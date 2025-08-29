const { Menu, app, shell, dialog } = require('electron');
const path = require('path');

class MenuManager {
  constructor() {
    this.isMac = process.platform === 'darwin';
  }

  createApplicationMenu(handlers = {}) {
    const template = this.buildMenuTemplate(handlers);
    return Menu.buildFromTemplate(template);
  }

  buildMenuTemplate(handlers) {
    const template = [
      // File menu
      {
        label: 'File',
        submenu: [
          {
            label: 'New Window',
            accelerator: this.isMac ? 'Cmd+N' : 'Ctrl+N',
            click: handlers.onNewWindow || (() => {})
          },
          { type: 'separator' },
          {
            label: 'Open Document...',
            accelerator: this.isMac ? 'Cmd+O' : 'Ctrl+O',
            click: async (menuItem, browserWindow) => {
              if (handlers.onOpenDocument) {
                handlers.onOpenDocument();
              } else {
                this.showOpenDocumentDialog(browserWindow);
              }
            }
          },
          {
            label: 'Index YouTube Channel...',
            accelerator: this.isMac ? 'Cmd+Shift+Y' : 'Ctrl+Shift+Y',
            click: handlers.onIndexYouTube || (() => {})
          },
          { type: 'separator' },
          {
            label: 'Settings...',
            accelerator: this.isMac ? 'Cmd+,' : 'Ctrl+,',
            click: handlers.onSettings || (() => {})
          },
          { type: 'separator' },
          this.isMac ? { role: 'close' } : { role: 'quit' }
        ]
      },
      
      // Edit menu
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          ...(this.isMac ? [
            { role: 'pasteAndMatchStyle' },
            { role: 'delete' },
            { role: 'selectAll' },
            { type: 'separator' },
            {
              label: 'Speech',
              submenu: [
                { role: 'startspeaking' },
                { role: 'stopspeaking' }
              ]
            }
          ] : [
            { role: 'delete' },
            { type: 'separator' },
            { role: 'selectAll' }
          ])
        ]
      },

      // View menu
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          { type: 'separator' },
          {
            label: 'Search Documents',
            accelerator: this.isMac ? 'Cmd+F' : 'Ctrl+F',
            click: handlers.onSearch || (() => {})
          },
          {
            label: 'Document Library',
            accelerator: this.isMac ? 'Cmd+L' : 'Ctrl+L',
            click: handlers.onDocumentLibrary || (() => {})
          }
        ]
      },

      // RAG menu
      {
        label: 'RAG',
        submenu: [
          {
            label: 'Index Document',
            accelerator: this.isMac ? 'Cmd+I' : 'Ctrl+I',
            click: handlers.onIndexDocument || (() => {})
          },
          {
            label: 'Batch Index Folder',
            accelerator: this.isMac ? 'Cmd+Shift+I' : 'Ctrl+Shift+I',
            click: handlers.onBatchIndex || (() => {})
          },
          { type: 'separator' },
          {
            label: 'Search Knowledge Base',
            accelerator: this.isMac ? 'Cmd+Shift+F' : 'Ctrl+Shift+F',
            click: handlers.onSearchKnowledge || (() => {})
          },
          {
            label: 'Chat with Documents',
            accelerator: this.isMac ? 'Cmd+T' : 'Ctrl+T',
            click: handlers.onChatWithDocs || (() => {})
          },
          { type: 'separator' },
          {
            label: 'Manage Vector Store',
            click: handlers.onManageVectorStore || (() => {})
          },
          {
            label: 'Clear Index',
            click: async (menuItem, browserWindow) => {
              const response = await dialog.showMessageBox(browserWindow, {
                type: 'warning',
                title: 'Clear Index',
                message: 'Are you sure you want to clear the entire document index?',
                detail: 'This action cannot be undone. All indexed documents will be removed.',
                buttons: ['Cancel', 'Clear Index'],
                defaultId: 0,
                cancelId: 0
              });

              if (response.response === 1 && handlers.onClearIndex) {
                handlers.onClearIndex();
              }
            }
          }
        ]
      },

      // YouTube menu
      {
        label: 'YouTube',
        submenu: [
          {
            label: 'Add Channel',
            accelerator: this.isMac ? 'Cmd+Alt+Y' : 'Ctrl+Alt+Y',
            click: handlers.onAddYouTubeChannel || (() => {})
          },
          {
            label: 'Bulk Import Channels',
            click: handlers.onBulkImportChannels || (() => {})
          },
          { type: 'separator' },
          {
            label: 'Refresh All Channels',
            accelerator: this.isMac ? 'Cmd+R' : 'F5',
            click: handlers.onRefreshChannels || (() => {})
          },
          {
            label: 'Manage Channels',
            click: handlers.onManageChannels || (() => {})
          },
          { type: 'separator' },
          {
            label: 'YouTube Settings',
            click: handlers.onYouTubeSettings || (() => {})
          }
        ]
      },

      // Window menu
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          ...(this.isMac ? [
            { type: 'separator' },
            { role: 'front' },
            { type: 'separator' },
            { role: 'window' }
          ] : [
            { role: 'close' }
          ])
        ]
      },

      // Help menu
      {
        role: 'help',
        submenu: [
          {
            label: 'About RagMaker',
            click: handlers.onAbout || (() => {})
          },
          { type: 'separator' },
          {
            label: 'Documentation',
            click: async () => {
              await shell.openExternal('https://ragmaker-docs.com');
            }
          },
          {
            label: 'Keyboard Shortcuts',
            accelerator: this.isMac ? 'Cmd+?' : 'F1',
            click: handlers.onShowShortcuts || (() => {})
          },
          { type: 'separator' },
          {
            label: 'Report Issue',
            click: async () => {
              await shell.openExternal('https://github.com/ragmaker/ragmaker/issues');
            }
          },
          {
            label: 'Check for Updates',
            click: handlers.onCheckUpdates || (() => {})
          },
          { type: 'separator' },
          {
            label: 'Developer',
            submenu: [
              {
                label: 'Toggle Developer Tools',
                accelerator: this.isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
                click: handlers.onToggleDevTools || (() => {})
              },
              {
                label: 'Reload',
                accelerator: this.isMac ? 'Cmd+R' : 'Ctrl+R',
                click: handlers.onReload || (() => {})
              },
              {
                label: 'Force Reload',
                accelerator: this.isMac ? 'Cmd+Shift+R' : 'Ctrl+Shift+R',
                click: (item, focusedWindow) => {
                  if (focusedWindow) focusedWindow.webContents.reloadIgnoringCache();
                }
              }
            ]
          }
        ]
      }
    ];

    // macOS specific adjustments
    if (this.isMac) {
      template.unshift({
        label: app.getName(),
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideothers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      });

      // Window menu
      template[5].submenu = [
        { role: 'close' },
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ];
    }

    return template;
  }

  createContextMenu() {
    return Menu.buildFromTemplate([
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { role: 'selectall' }
    ]);
  }

  createTrayMenu(handlers = {}) {
    return Menu.buildFromTemplate([
      {
        label: 'Show RagMaker',
        click: handlers.onShow || (() => {})
      },
      { type: 'separator' },
      {
        label: 'Search Documents',
        click: handlers.onSearch || (() => {})
      },
      {
        label: 'Quick Index',
        click: handlers.onQuickIndex || (() => {})
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: handlers.onSettings || (() => {})
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: handlers.onQuit || (() => {})
      }
    ]);
  }

  async showOpenDocumentDialog(browserWindow) {
    try {
      const result = await dialog.showOpenDialog(browserWindow, {
        title: 'Open Document to Index',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'All Documents', extensions: ['pdf', 'txt', 'md', 'docx', 'html'] },
          { name: 'PDF Files', extensions: ['pdf'] },
          { name: 'Text Files', extensions: ['txt', 'md'] },
          { name: 'Word Documents', extensions: ['docx'] },
          { name: 'HTML Files', extensions: ['html'] }
        ]
      });

      if (!result.canceled && result.filePaths.length > 0) {
        browserWindow.webContents.send('open-documents', result.filePaths);
      }
    } catch (error) {
      console.error('Error showing open dialog:', error);
    }
  }

  // Utility method to update menu items dynamically
  updateMenuItem(menuId, enabled = true, visible = true) {
    const menu = Menu.getApplicationMenu();
    if (menu) {
      const menuItem = menu.getMenuItemById(menuId);
      if (menuItem) {
        menuItem.enabled = enabled;
        menuItem.visible = visible;
      }
    }
  }

  // Method to add recent documents to File menu
  updateRecentDocuments(recentFiles = []) {
    // Implementation would dynamically update the recent files submenu
    console.log('Updating recent documents:', recentFiles);
  }
}

module.exports = { MenuManager };
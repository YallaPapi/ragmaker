/**
 * File Association and Context Menu Service
 * Manages file associations and context menu integration for desktop app
 */

const { app, shell, Menu, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { EventEmitter } = require('events');

class ContextMenuService extends EventEmitter {
  constructor(fileManager, previewGenerator, versionControl) {
    super();
    this.fileManager = fileManager;
    this.previewGenerator = previewGenerator;
    this.versionControl = versionControl;
    this.registeredAssociations = new Map(); // fileExtension -> association info
    this.contextMenuActions = new Map(); // actionId -> action handler
    this.quickActions = new Map(); // actionId -> quick action config
    this.customMenuItems = [];
    this.recentFiles = [];
    this.maxRecentFiles = 10;

    this.initializeDefaultActions();
  }

  /**
   * Initialize default context menu actions
   * @private
   */
  initializeDefaultActions() {
    // File operations
    this.registerAction('open', {
      label: 'Open',
      icon: 'open',
      handler: this.openFile.bind(this),
      accelerator: 'CmdOrCtrl+O',
      position: 0
    });

    this.registerAction('openWith', {
      label: 'Open With...',
      icon: 'apps',
      handler: this.openFileWith.bind(this),
      position: 1
    });

    this.registerAction('preview', {
      label: 'Quick Preview',
      icon: 'visibility',
      handler: this.showPreview.bind(this),
      accelerator: 'Space',
      position: 2
    });

    this.registerAction('separator1', { type: 'separator', position: 10 });

    // File management
    this.registerAction('addToCollection', {
      label: 'Add to Collection...',
      icon: 'folder_special',
      handler: this.addToCollection.bind(this),
      position: 20
    });

    this.registerAction('addTags', {
      label: 'Add Tags...',
      icon: 'local_offer',
      handler: this.addTags.bind(this),
      position: 21
    });

    this.registerAction('separator2', { type: 'separator', position: 30 });

    // File operations
    this.registerAction('copy', {
      label: 'Copy',
      icon: 'content_copy',
      handler: this.copyFiles.bind(this),
      accelerator: 'CmdOrCtrl+C',
      position: 40
    });

    this.registerAction('cut', {
      label: 'Cut',
      icon: 'content_cut',
      handler: this.cutFiles.bind(this),
      accelerator: 'CmdOrCtrl+X',
      position: 41
    });

    this.registerAction('rename', {
      label: 'Rename',
      icon: 'edit',
      handler: this.renameFile.bind(this),
      accelerator: 'F2',
      position: 42
    });

    this.registerAction('delete', {
      label: 'Move to Trash',
      icon: 'delete',
      handler: this.deleteFiles.bind(this),
      accelerator: 'Delete',
      position: 43
    });

    this.registerAction('separator3', { type: 'separator', position: 50 });

    // Version control
    this.registerAction('versionHistory', {
      label: 'Version History',
      icon: 'history',
      handler: this.showVersionHistory.bind(this),
      position: 60
    });

    this.registerAction('createVersion', {
      label: 'Create Version',
      icon: 'save',
      handler: this.createVersion.bind(this),
      position: 61
    });

    this.registerAction('separator4', { type: 'separator', position: 70 });

    // System operations
    this.registerAction('showInExplorer', {
      label: 'Show in File Explorer',
      icon: 'folder_open',
      handler: this.showInExplorer.bind(this),
      position: 80
    });

    this.registerAction('copyPath', {
      label: 'Copy Path',
      icon: 'link',
      handler: this.copyPath.bind(this),
      position: 81
    });

    this.registerAction('properties', {
      label: 'Properties',
      icon: 'info',
      handler: this.showProperties.bind(this),
      accelerator: 'Alt+Enter',
      position: 90
    });
  }

  /**
   * Register a context menu action
   * @param {string} actionId - Unique action identifier
   * @param {Object} config - Action configuration
   */
  registerAction(actionId, config) {
    this.contextMenuActions.set(actionId, config);
    this.emit('actionRegistered', { actionId, config });
  }

  /**
   * Unregister a context menu action
   * @param {string} actionId - Action identifier to remove
   */
  unregisterAction(actionId) {
    const removed = this.contextMenuActions.delete(actionId);
    if (removed) {
      this.emit('actionUnregistered', { actionId });
    }
    return removed;
  }

  /**
   * Show context menu for files
   * @param {Array} filePaths - Selected file paths
   * @param {Object} options - Menu options
   * @returns {Promise<void>}
   */
  async showContextMenu(filePaths, options = {}) {
    try {
      const menuItems = await this.buildContextMenu(filePaths, options);
      const menu = Menu.buildFromTemplate(menuItems);
      
      // Show menu
      if (options.window) {
        menu.popup({
          window: options.window,
          x: options.x,
          y: options.y
        });
      } else {
        menu.popup();
      }

      this.emit('contextMenuShown', { filePaths, itemCount: menuItems.length });

    } catch (error) {
      this.emit('contextMenuError', { filePaths, error: error.message });
      throw error;
    }
  }

  /**
   * Build context menu items
   * @private
   */
  async buildContextMenu(filePaths, options) {
    const menuItems = [];
    const isSingleFile = filePaths.length === 1;
    const isMultipleFiles = filePaths.length > 1;

    // Get file metadata for context-specific items
    const fileMetadata = await Promise.all(
      filePaths.slice(0, 5).map(async (filePath) => {
        try {
          const metadata = this.fileManager?.getFileMetadata(filePath);
          const stats = await fs.stat(filePath);
          return {
            path: filePath,
            metadata,
            stats,
            extension: path.extname(filePath).toLowerCase()
          };
        } catch (error) {
          return { path: filePath, error: error.message };
        }
      })
    );

    // Sort actions by position
    const sortedActions = Array.from(this.contextMenuActions.entries())
      .sort(([, a], [, b]) => (a.position || 999) - (b.position || 999));

    // Build menu items
    for (const [actionId, config] of sortedActions) {
      // Skip if action should be hidden for current selection
      if (config.condition && !config.condition(filePaths, fileMetadata, options)) {
        continue;
      }

      // Skip certain actions for multiple files
      if (isMultipleFiles && ['rename', 'openWith'].includes(actionId)) {
        continue;
      }

      if (config.type === 'separator') {
        menuItems.push({ type: 'separator' });
        continue;
      }

      const menuItem = {
        label: this.formatLabel(config.label, filePaths, fileMetadata),
        click: () => this.handleAction(actionId, filePaths, options),
        enabled: config.enabled !== false,
        icon: config.icon ? this.getMenuIcon(config.icon) : undefined
      };

      // Add accelerator if specified
      if (config.accelerator && isSingleFile) {
        menuItem.accelerator = config.accelerator;
      }

      // Add submenu items if needed
      if (config.submenu) {
        menuItem.submenu = await this.buildSubmenu(config.submenu, filePaths, fileMetadata);
      }

      menuItems.push(menuItem);
    }

    // Add file-specific actions
    if (isSingleFile) {
      const fileInfo = fileMetadata[0];
      const specificActions = await this.getFileSpecificActions(fileInfo);
      
      if (specificActions.length > 0) {
        menuItems.push({ type: 'separator' });
        menuItems.push(...specificActions);
      }
    }

    // Add custom menu items
    if (this.customMenuItems.length > 0) {
      menuItems.push({ type: 'separator' });
      menuItems.push(...this.customMenuItems);
    }

    return menuItems;
  }

  /**
   * Get file-specific context actions
   * @private
   */
  async getFileSpecificActions(fileInfo) {
    const actions = [];
    const extension = fileInfo.extension;
    const associations = this.registeredAssociations.get(extension);

    // Add registered application associations
    if (associations && associations.applications.length > 0) {
      const submenu = associations.applications.map(app => ({
        label: app.name,
        icon: app.icon,
        click: () => this.openWithApp(fileInfo.path, app)
      }));

      actions.push({
        label: `Open with ${associations.applications[0].name}`,
        submenu
      });
    }

    // Add format-specific actions
    if (this.isImageFile(extension)) {
      actions.push({
        label: 'Set as Wallpaper',
        click: () => this.setAsWallpaper(fileInfo.path)
      });
    }

    if (this.isCodeFile(extension)) {
      actions.push({
        label: 'Format Code',
        click: () => this.formatCode(fileInfo.path)
      });
    }

    if (this.isVideoFile(extension)) {
      actions.push({
        label: 'Extract Thumbnail',
        click: () => this.extractVideoThumbnail(fileInfo.path)
      });
    }

    return actions;
  }

  /**
   * Handle context menu action
   * @private
   */
  async handleAction(actionId, filePaths, options) {
    try {
      const config = this.contextMenuActions.get(actionId);
      if (!config || !config.handler) {
        throw new Error(`No handler found for action: ${actionId}`);
      }

      await config.handler(filePaths, options);
      
      this.emit('actionExecuted', { actionId, filePaths, success: true });

    } catch (error) {
      this.emit('actionError', { actionId, filePaths, error: error.message });
      throw error;
    }
  }

  /**
   * Default action handlers
   */

  async openFile(filePaths) {
    for (const filePath of filePaths) {
      await shell.openPath(filePath);
    }
  }

  async openFileWith(filePaths) {
    if (filePaths.length !== 1) return;
    
    const result = await dialog.showOpenDialog({
      title: 'Choose Application',
      filters: [
        { name: 'Applications', extensions: ['exe', 'app'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const appPath = result.filePaths[0];
      // Implementation would depend on OS
      await shell.openPath(filePaths[0]);
    }
  }

  async showPreview(filePaths) {
    if (filePaths.length !== 1 || !this.previewGenerator) return;

    try {
      const preview = await this.previewGenerator.generatePreview(filePaths[0]);
      
      // Show preview window
      const previewWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const previewHTML = this.generatePreviewHTML(preview, filePaths[0]);
      previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(previewHTML)}`);

    } catch (error) {
      this.emit('previewError', { filePath: filePaths[0], error: error.message });
    }
  }

  async addToCollection(filePaths) {
    if (!this.fileManager) return;

    // Show collection selection dialog
    const collections = this.fileManager.getAllCollections();
    
    // Implementation would show a selection dialog
    // For now, just emit event for UI to handle
    this.emit('showCollectionDialog', { filePaths, collections });
  }

  async addTags(filePaths) {
    if (!this.fileManager) return;

    // Show tag selection dialog
    const tags = this.fileManager.getAllTags();
    
    // Implementation would show a tag selection dialog
    this.emit('showTagDialog', { filePaths, tags });
  }

  async copyFiles(filePaths) {
    // Implementation would copy files to clipboard
    this.emit('copyToClipboard', { filePaths });
  }

  async cutFiles(filePaths) {
    // Implementation would cut files to clipboard
    this.emit('cutToClipboard', { filePaths });
  }

  async renameFile(filePaths) {
    if (filePaths.length !== 1) return;

    const result = await dialog.showInputBox({
      title: 'Rename File',
      message: 'Enter new name:',
      defaultValue: path.basename(filePaths[0])
    });

    if (result) {
      const newPath = path.join(path.dirname(filePaths[0]), result);
      await fs.rename(filePaths[0], newPath);
      
      this.emit('fileRenamed', { oldPath: filePaths[0], newPath });
    }
  }

  async deleteFiles(filePaths) {
    const result = await dialog.showMessageBox({
      type: 'warning',
      title: 'Confirm Delete',
      message: `Are you sure you want to move ${filePaths.length} file(s) to trash?`,
      buttons: ['Move to Trash', 'Cancel'],
      defaultId: 1
    });

    if (result.response === 0) {
      for (const filePath of filePaths) {
        await shell.trashItem(filePath);
      }
      
      this.emit('filesDeleted', { filePaths });
    }
  }

  async showVersionHistory(filePaths) {
    if (filePaths.length !== 1 || !this.versionControl) return;

    const history = this.versionControl.getFileHistory(filePaths[0]);
    this.emit('showVersionHistory', { filePath: filePaths[0], history });
  }

  async createVersion(filePaths) {
    if (filePaths.length !== 1 || !this.versionControl) return;

    try {
      const versionId = await this.versionControl.createVersion(filePaths[0], {
        type: 'manual',
        comment: 'Manual version created from context menu'
      });
      
      this.emit('versionCreated', { filePath: filePaths[0], versionId });
      
    } catch (error) {
      this.emit('versionError', { filePath: filePaths[0], error: error.message });
    }
  }

  async showInExplorer(filePaths) {
    for (const filePath of filePaths) {
      await shell.showItemInFolder(filePath);
    }
  }

  async copyPath(filePaths) {
    const { clipboard } = require('electron');
    const paths = filePaths.join('\n');
    clipboard.writeText(paths);
    
    this.emit('pathsCopied', { filePaths });
  }

  async showProperties(filePaths) {
    this.emit('showProperties', { filePaths });
  }

  /**
   * Register file association
   * @param {string} extension - File extension
   * @param {Object} config - Association configuration
   */
  registerFileAssociation(extension, config) {
    this.registeredAssociations.set(extension.toLowerCase(), {
      extension,
      defaultApp: config.defaultApp,
      applications: config.applications || [],
      icon: config.icon,
      description: config.description,
      actions: config.actions || []
    });

    this.emit('associationRegistered', { extension, config });
  }

  /**
   * Add custom menu item
   * @param {Object} menuItem - Menu item configuration
   */
  addCustomMenuItem(menuItem) {
    this.customMenuItems.push(menuItem);
    this.emit('customMenuItemAdded', menuItem);
  }

  /**
   * Remove custom menu item
   * @param {number} index - Menu item index
   */
  removeCustomMenuItem(index) {
    if (index >= 0 && index < this.customMenuItems.length) {
      const removed = this.customMenuItems.splice(index, 1)[0];
      this.emit('customMenuItemRemoved', removed);
      return true;
    }
    return false;
  }

  /**
   * Helper methods
   */

  formatLabel(label, filePaths, fileMetadata) {
    const count = filePaths.length;
    return label
      .replace('{count}', count)
      .replace('{files}', count === 1 ? 'file' : 'files')
      .replace('{filename}', count === 1 ? path.basename(filePaths[0]) : '');
  }

  getMenuIcon(iconName) {
    // Implementation would return appropriate icon for the platform
    return undefined; // Placeholder
  }

  generatePreviewHTML(preview, filePath) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Preview: ${path.basename(filePath)}</title>
        <style>
          body { margin: 0; padding: 20px; font-family: system-ui; }
          img { max-width: 100%; max-height: 80vh; }
          .content { text-align: center; }
        </style>
      </head>
      <body>
        <div class="content">
          <h2>${path.basename(filePath)}</h2>
          <img src="${preview.dataUrl}" alt="Preview" />
        </div>
      </body>
      </html>
    `;
  }

  isImageFile(extension) {
    return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].includes(extension);
  }

  isCodeFile(extension) {
    return ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html'].includes(extension);
  }

  isVideoFile(extension) {
    return ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm'].includes(extension);
  }

  /**
   * Get context menu configuration
   * @returns {Object} Configuration
   */
  getConfiguration() {
    return {
      actions: Array.from(this.contextMenuActions.entries()),
      associations: Array.from(this.registeredAssociations.entries()),
      customItems: this.customMenuItems
    };
  }

  /**
   * Cleanup context menu service
   */
  destroy() {
    this.contextMenuActions.clear();
    this.registeredAssociations.clear();
    this.quickActions.clear();
    this.customMenuItems = [];
    this.removeAllListeners();
  }
}

module.exports = ContextMenuService;
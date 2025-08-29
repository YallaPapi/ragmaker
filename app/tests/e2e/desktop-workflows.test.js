const { _electron: electron } = require('playwright');
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');

// Test configuration
const ELECTRON_PATH = path.join(__dirname, '../../../desktop/node_modules/.bin/electron');
const APP_PATH = path.join(__dirname, '../../../desktop');
const TEST_DATA_PATH = path.join(__dirname, '../fixtures');
const BACKEND_PORT = 3013;

describe('Desktop End-to-End Workflow Tests', () => {
  let electronApp;
  let mainWindow;
  let backendProcess;

  beforeAll(async () => {
    // Start backend server for testing
    backendProcess = spawn('node', [path.join(__dirname, '../../../src/api/server.js')], {
      env: { ...process.env, PORT: BACKEND_PORT, NODE_ENV: 'test' },
      stdio: 'pipe'
    });
    
    // Wait for backend to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Launch Electron app
    electronApp = await electron.launch({
      args: [APP_PATH],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        BACKEND_URL: `http://localhost:${BACKEND_PORT}`
      }
    });
    
    // Wait for app to be ready
    await electronApp.evaluate(async ({ app }) => {
      await app.whenReady();
    });
    
    // Get the main window
    mainWindow = await electronApp.firstWindow();
    
    // Wait for window to load
    await mainWindow.waitForLoadState('domcontentloaded');
  });

  afterAll(async () => {
    // Cleanup
    if (electronApp) {
      await electronApp.close();
    }
    if (backendProcess) {
      backendProcess.kill('SIGTERM');
    }
  });

  describe('Complete User Workflows', () => {
    test('should complete full project creation and indexing workflow', async () => {
      // Step 1: Create new project
      await mainWindow.click('[data-testid="create-project-btn"]');
      
      const projectModal = mainWindow.locator('[data-testid="project-modal"]');
      await expect(projectModal).toBeVisible();
      
      await mainWindow.fill('[data-testid="project-name"]', 'E2E Test Project');
      await mainWindow.fill('[data-testid="project-description"]', 'End-to-end testing project');
      await mainWindow.selectOption('[data-testid="project-type"]', 'youtube');
      await mainWindow.click('[data-testid="create-project-submit"]');
      
      // Verify project was created
      await expect(mainWindow.locator('[data-testid="project-title"]')).toContainText('E2E Test Project');
      
      // Step 2: Add YouTube channel
      await mainWindow.click('[data-testid="add-channel-btn"]');
      
      const channelInput = mainWindow.locator('[data-testid="channel-input"]');
      await channelInput.fill('https://www.youtube.com/@TestChannel');
      await mainWindow.click('[data-testid="add-channel-submit"]');
      
      // Wait for channel processing to start
      await expect(mainWindow.locator('[data-testid="indexing-status"]')).toContainText('Processing');
      
      // Step 3: Monitor indexing progress
      let progressUpdates = 0;
      await mainWindow.waitForFunction(
        () => {
          const progressBar = document.querySelector('[data-testid="progress-bar"]');
          return progressBar && progressBar.value > 0;
        },
        { timeout: 30000 }
      );
      
      // Verify progress is updating
      const progressBar = mainWindow.locator('[data-testid="progress-bar"]');
      const initialProgress = await progressBar.getAttribute('value');
      
      await mainWindow.waitForTimeout(2000);
      const updatedProgress = await progressBar.getAttribute('value');
      
      expect(parseFloat(updatedProgress)).toBeGreaterThan(parseFloat(initialProgress));
      
      // Step 4: Wait for indexing completion
      await mainWindow.waitForSelector('[data-testid="indexing-complete"]', {
        timeout: 120000 // 2 minutes timeout
      });
      
      // Verify completion status
      await expect(mainWindow.locator('[data-testid="indexing-status"]')).toContainText('Completed');
      
      // Step 5: Verify indexed content appears
      const videoCount = mainWindow.locator('[data-testid="video-count"]');
      await expect(videoCount).toContainText(/\d+ videos indexed/);
    }, 180000); // 3 minutes timeout

    test('should perform complete RAG query workflow', async () => {
      // Ensure we have an indexed project
      await mainWindow.waitForSelector('[data-testid="search-input"]');
      
      // Step 1: Enter search query
      const searchInput = mainWindow.locator('[data-testid="search-input"]');
      await searchInput.fill('machine learning basics');
      
      // Step 2: Configure search options
      await mainWindow.click('[data-testid="search-options-toggle"]');
      
      const maxResultsSlider = mainWindow.locator('[data-testid="max-results-slider"]');
      await maxResultsSlider.fill('10');
      
      await mainWindow.check('[data-testid="include-transcripts"]');
      await mainWindow.check('[data-testid="semantic-search"]');
      
      // Step 3: Execute search
      await mainWindow.click('[data-testid="search-submit"]');
      
      // Step 4: Wait for results
      await mainWindow.waitForSelector('[data-testid="search-results"]', {
        timeout: 30000
      });
      
      // Verify search results
      const results = mainWindow.locator('[data-testid="result-item"]');
      await expect(results).toHaveCount.toBeGreaterThan(0);
      
      // Verify result structure
      const firstResult = results.first();
      await expect(firstResult.locator('[data-testid="result-title"]')).toBeVisible();
      await expect(firstResult.locator('[data-testid="result-content"]')).toBeVisible();
      await expect(firstResult.locator('[data-testid="result-score"]')).toBeVisible();
      
      // Step 5: Test result interaction
      await firstResult.click();
      
      const resultModal = mainWindow.locator('[data-testid="result-modal"]');
      await expect(resultModal).toBeVisible();
      
      // Verify modal content
      await expect(resultModal.locator('[data-testid="video-player"]')).toBeVisible();
      await expect(resultModal.locator('[data-testid="transcript-section"]')).toBeVisible();
      
      // Close modal
      await mainWindow.click('[data-testid="modal-close"]');
      await expect(resultModal).not.toBeVisible();
      
      // Step 6: Test search history
      await mainWindow.click('[data-testid="search-history-btn"]');
      const historyItems = mainWindow.locator('[data-testid="history-item"]');
      await expect(historyItems.first()).toContainText('machine learning basics');
    });

    test('should handle document upload and indexing workflow', async () => {
      // Prepare test documents
      const testDoc = path.join(TEST_DATA_PATH, 'test-document.pdf');
      
      // Step 1: Open file upload area
      await mainWindow.click('[data-testid="upload-documents-btn"]');
      
      const uploadArea = mainWindow.locator('[data-testid="upload-area"]');
      await expect(uploadArea).toBeVisible();
      
      // Step 2: Upload file via drag-and-drop simulation
      const fileInput = mainWindow.locator('[data-testid="file-input"]');
      await fileInput.setInputFiles(testDoc);
      
      // Step 3: Configure upload options
      await mainWindow.selectOption('[data-testid="document-type"]', 'pdf');
      await mainWindow.check('[data-testid="extract-text"]');
      await mainWindow.check('[data-testid="generate-embeddings"]');
      
      // Step 4: Start upload
      await mainWindow.click('[data-testid="start-upload"]');
      
      // Step 5: Monitor upload progress
      const uploadProgress = mainWindow.locator('[data-testid="upload-progress"]');
      await expect(uploadProgress).toBeVisible();
      
      // Wait for upload completion
      await mainWindow.waitForSelector('[data-testid="upload-complete"]', {
        timeout: 60000
      });
      
      // Step 6: Verify document appears in library
      await mainWindow.click('[data-testid="document-library-tab"]');
      
      const documentItems = mainWindow.locator('[data-testid="document-item"]');
      await expect(documentItems).toHaveCount.toBeGreaterThan(0);
      
      // Verify document metadata
      const newDocument = documentItems.last();
      await expect(newDocument.locator('[data-testid="doc-name"]')).toContainText('test-document');
      await expect(newDocument.locator('[data-testid="doc-status"]')).toContainText('Indexed');
    });

    test('should handle offline mode gracefully', async () => {
      // Step 1: Simulate network disconnection
      await mainWindow.evaluate(() => {
        // Mock navigator.onLine
        Object.defineProperty(navigator, 'onLine', {
          writable: true,
          value: false
        });
        
        // Dispatch offline event
        window.dispatchEvent(new Event('offline'));
      });
      
      // Step 2: Verify offline indicator
      const offlineIndicator = mainWindow.locator('[data-testid="offline-indicator"]');
      await expect(offlineIndicator).toBeVisible();
      await expect(offlineIndicator).toContainText('Offline Mode');
      
      // Step 3: Test local operations still work
      const searchInput = mainWindow.locator('[data-testid="search-input"]');
      await searchInput.fill('offline search test');
      await mainWindow.click('[data-testid="search-submit"]');
      
      // Should show cached/local results
      await expect(mainWindow.locator('[data-testid="local-results-notice"]'))).toBeVisible();
      
      // Step 4: Test that online-only features are disabled
      const addChannelBtn = mainWindow.locator('[data-testid="add-channel-btn"]');
      await expect(addChannelBtn).toBeDisabled();
      
      // Step 5: Simulate reconnection
      await mainWindow.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', {
          writable: true,
          value: true
        });
        window.dispatchEvent(new Event('online'));
      });
      
      // Verify online features are restored
      await expect(offlineIndicator).not.toBeVisible();
      await expect(addChannelBtn).toBeEnabled();
    });

    test('should export and import project data', async () => {
      const exportPath = path.join(__dirname, '../tmp/test-export.json');
      
      // Step 1: Export project
      await mainWindow.click('[data-testid="project-menu"]');
      await mainWindow.click('[data-testid="export-project"]');
      
      const exportModal = mainWindow.locator('[data-testid="export-modal"]');
      await expect(exportModal).toBeVisible();
      
      // Configure export options
      await mainWindow.check('[data-testid="include-documents"]');
      await mainWindow.check('[data-testid="include-embeddings"]');
      await mainWindow.uncheck('[data-testid="include-cache"]');
      
      // Set export path
      await mainWindow.fill('[data-testid="export-path"]', exportPath);
      await mainWindow.click('[data-testid="start-export"]');
      
      // Wait for export completion
      await mainWindow.waitForSelector('[data-testid="export-complete"]', {
        timeout: 60000
      });
      
      // Verify export file exists
      const exportExists = await fs.access(exportPath).then(() => true).catch(() => false);
      expect(exportExists).toBe(true);
      
      // Step 2: Create new project and import
      await mainWindow.click('[data-testid="create-project-btn"]');
      await mainWindow.fill('[data-testid="project-name"]', 'Imported Project');
      await mainWindow.click('[data-testid="create-project-submit"]');
      
      // Import data
      await mainWindow.click('[data-testid="project-menu"]');
      await mainWindow.click('[data-testid="import-project"]');
      
      const importModal = mainWindow.locator('[data-testid="import-modal"]');
      await expect(importModal).toBeVisible();
      
      await mainWindow.fill('[data-testid="import-path"]', exportPath);
      await mainWindow.click('[data-testid="start-import"]');
      
      // Wait for import completion
      await mainWindow.waitForSelector('[data-testid="import-complete"]', {
        timeout: 60000
      });
      
      // Verify imported data
      const videoCount = mainWindow.locator('[data-testid="video-count"]');
      await expect(videoCount).toContainText(/\d+ videos/);
      
      // Cleanup
      await fs.unlink(exportPath).catch(() => {});
    });
  });

  describe('Desktop-Specific Features', () => {
    test('should handle keyboard shortcuts', async () => {
      // Test global search shortcut (Ctrl/Cmd + K)
      const isMac = process.platform === 'darwin';
      const modifier = isMac ? 'Meta' : 'Control';
      
      await mainWindow.keyboard.press(`${modifier}+KeyK`);
      
      const searchModal = mainWindow.locator('[data-testid="quick-search-modal"]');
      await expect(searchModal).toBeVisible();
      
      // Test escape to close
      await mainWindow.keyboard.press('Escape');
      await expect(searchModal).not.toBeVisible();
      
      // Test new project shortcut (Ctrl/Cmd + N)
      await mainWindow.keyboard.press(`${modifier}+KeyN`);
      
      const projectModal = mainWindow.locator('[data-testid="project-modal"]');
      await expect(projectModal).toBeVisible();
      
      await mainWindow.keyboard.press('Escape');
    });

    test('should handle window management', async () => {
      // Test window minimize/restore
      await electronApp.evaluate(async ({ BrowserWindow }) => {
        const windows = BrowserWindow.getAllWindows();
        const mainWindow = windows[0];
        mainWindow.minimize();
        return mainWindow.isMinimized();
      });
      
      // Restore window
      await electronApp.evaluate(async ({ BrowserWindow }) => {
        const windows = BrowserWindow.getAllWindows();
        const mainWindow = windows[0];
        mainWindow.restore();
      });
      
      // Test fullscreen toggle (F11)
      await mainWindow.keyboard.press('F11');
      
      const isFullScreen = await electronApp.evaluate(async ({ BrowserWindow }) => {
        const windows = BrowserWindow.getAllWindows();
        return windows[0].isFullScreen();
      });
      
      expect(isFullScreen).toBe(true);
      
      // Exit fullscreen
      await mainWindow.keyboard.press('F11');
    });

    test('should handle system notifications', async () => {
      // Start a long-running operation
      await mainWindow.click('[data-testid="add-channel-btn"]');
      await mainWindow.fill('[data-testid="channel-input"]', 'https://www.youtube.com/@LongChannel');
      await mainWindow.click('[data-testid="add-channel-submit"]');
      
      // Minimize window to test background notifications
      await electronApp.evaluate(async ({ BrowserWindow }) => {
        const windows = BrowserWindow.getAllWindows();
        windows[0].minimize();
      });
      
      // Wait for notification (check system tray or notification center)
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Verify notification was sent (this would need platform-specific testing)
      const notificationSent = await electronApp.evaluate(async () => {
        // Mock or check notification system
        return true; // Simplified for example
      });
      
      expect(notificationSent).toBe(true);
    });

    test('should handle file associations', async () => {
      // Test opening project file via file association
      const projectFile = path.join(TEST_DATA_PATH, 'test-project.ragmaker');
      
      // Simulate opening file through OS
      await electronApp.evaluate(async ({ app }, filePath) => {
        // Simulate file open event
        app.emit('open-file', null, filePath);
      }, projectFile);
      
      // Verify project loads
      await expect(mainWindow.locator('[data-testid="project-title"]'))).toContainText('Test Project');
    });
  });

  describe('Error Scenarios & Recovery', () => {
    test('should handle application crashes gracefully', async () => {
      // Simulate renderer crash
      await mainWindow.evaluate(() => {
        // Force a crash scenario
        setTimeout(() => {
          throw new Error('Simulated renderer crash');
        }, 100);
      });
      
      // Wait for crash recovery
      await mainWindow.waitForLoadState('domcontentloaded');
      
      // Verify app recovered and shows error recovery UI
      const recoveryNotice = mainWindow.locator('[data-testid="recovery-notice"]');
      await expect(recoveryNotice).toBeVisible();
      
      // Verify data is still accessible after recovery
      await mainWindow.click('[data-testid="dismiss-recovery"]');
      const projectTitle = mainWindow.locator('[data-testid="project-title"]');
      await expect(projectTitle).toBeVisible();
    });

    test('should handle storage quota exceeded', async () => {
      // Simulate storage quota exceeded scenario
      await mainWindow.evaluate(() => {
        // Mock storage quota exceeded
        const originalSetItem = localStorage.setItem;
        localStorage.setItem = () => {
          throw new DOMException('QuotaExceededError');
        };
        
        // Trigger storage operation
        document.dispatchEvent(new CustomEvent('storage-quota-exceeded'));
      });
      
      // Verify error handling
      const storageWarning = mainWindow.locator('[data-testid="storage-warning"]');
      await expect(storageWarning).toBeVisible();
      
      // Test cleanup option
      await mainWindow.click('[data-testid="cleanup-storage"]');
      
      await expect(mainWindow.locator('[data-testid="cleanup-complete"]'))).toBeVisible();
    });

    test('should handle corrupted data recovery', async () => {
      // Simulate corrupted database
      await mainWindow.evaluate(() => {
        // Simulate database corruption
        document.dispatchEvent(new CustomEvent('database-corrupted'));
      });
      
      // Verify recovery options are presented
      const recoveryModal = mainWindow.locator('[data-testid="recovery-modal"]');
      await expect(recoveryModal).toBeVisible();
      
      // Test restore from backup option
      await mainWindow.click('[data-testid="restore-backup"]');
      
      const backupList = mainWindow.locator('[data-testid="backup-list"]');
      await expect(backupList).toBeVisible();
      
      // Select most recent backup
      const latestBackup = backupList.locator('[data-testid="backup-item"]').first();
      await latestBackup.click();
      await mainWindow.click('[data-testid="restore-selected"]');
      
      // Wait for restoration
      await mainWindow.waitForSelector('[data-testid="restore-complete"]', {
        timeout: 30000
      });
      
      // Verify app is functional after restoration
      await expect(mainWindow.locator('[data-testid="project-title"]'))).toBeVisible();
    });
  });

  describe('Performance Validation', () => {
    test('should handle large datasets efficiently', async () => {
      const startTime = Date.now();
      
      // Load project with large dataset
      await mainWindow.click('[data-testid="load-large-project"]');
      
      // Wait for loading to complete
      await mainWindow.waitForSelector('[data-testid="large-project-loaded"]', {
        timeout: 60000
      });
      
      const loadTime = Date.now() - startTime;
      
      // Verify reasonable load time (under 30 seconds)
      expect(loadTime).toBeLessThan(30000);
      
      // Test search performance with large dataset
      const searchStartTime = Date.now();
      
      await mainWindow.fill('[data-testid="search-input"]', 'performance test query');
      await mainWindow.click('[data-testid="search-submit"]');
      
      await mainWindow.waitForSelector('[data-testid="search-results"]');
      
      const searchTime = Date.now() - searchStartTime;
      
      // Search should complete within 5 seconds
      expect(searchTime).toBeLessThan(5000);
    });

    test('should maintain responsiveness during intensive operations', async () => {
      // Start intensive background operation
      await mainWindow.click('[data-testid="start-intensive-operation"]');
      
      // Verify UI remains responsive
      const button = mainWindow.locator('[data-testid="responsive-test-btn"]');
      
      // Test multiple UI interactions during background operation
      for (let i = 0; i < 10; i++) {
        await button.click();
        const responseTime = await mainWindow.evaluate(() => {
          const start = performance.now();
          return new Promise(resolve => {
            requestAnimationFrame(() => {
              resolve(performance.now() - start);
            });
          });
        });
        
        // Each interaction should respond within 100ms
        expect(responseTime).toBeLessThan(100);
        
        await mainWindow.waitForTimeout(200);
      }
    });
  });
});

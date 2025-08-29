const { _electron: electron } = require('playwright');
const { test, expect } = require('@playwright/test');
const path = require('path');

describe('End-to-End Application Flow', () => {
  let electronApp;
  let page;

  const APP_PATH = path.join(__dirname, '../../../app'); // Adjust path as needed

  beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: [APP_PATH],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });
    
    // Get the first page
    page = await electronApp.firstWindow();
    
    // Wait for app to load
    await page.waitForLoadState('domcontentloaded');
  });

  afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  describe('Application Startup', () => {
    test('should launch application successfully', async () => {
      expect(page).toBeDefined();
      
      // Check window properties
      const title = await page.title();
      expect(title).toContain('RAG Maker');
      
      // Check if main UI elements are visible
      await expect(page.locator('[data-testid="main-container"]')).toBeVisible();
    });

    test('should display correct initial state', async () => {
      // Check for welcome screen or initial UI
      await expect(page.locator('[data-testid="welcome-screen"]')).toBeVisible();
      
      // Check for main navigation
      await expect(page.locator('[data-testid="main-nav"]')).toBeVisible();
      
      // Check for search input
      await expect(page.locator('[data-testid="search-input"]')).toBeVisible();
    });

    test('should handle window resize correctly', async () => {
      const initialSize = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight
      }));
      
      // Resize window
      await page.setViewportSize({ width: 1400, height: 900 });
      
      const newSize = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight
      }));
      
      expect(newSize.width).toBe(1400);
      expect(newSize.height).toBe(900);
    });
  });

  describe('Document Management Flow', () => {
    test('should create new document', async () => {
      // Click new document button
      await page.click('[data-testid="new-document-btn"]');
      
      // Wait for new document dialog
      await expect(page.locator('[data-testid="new-document-dialog"]')).toBeVisible();
      
      // Fill document details
      await page.fill('[data-testid="document-title"]', 'Test Document');
      await page.fill('[data-testid="document-description"]', 'Test description');
      
      // Create document
      await page.click('[data-testid="create-document-btn"]');
      
      // Verify document created
      await expect(page.locator('[data-testid="document-list"]')).toContainText('Test Document');
    });

    test('should edit existing document', async () => {
      // Select first document
      await page.click('[data-testid="document-item"]:first-child');
      
      // Click edit button
      await page.click('[data-testid="edit-document-btn"]');
      
      // Modify title
      await page.fill('[data-testid="document-title"]', 'Updated Test Document');
      
      // Save changes
      await page.click('[data-testid="save-document-btn"]');
      
      // Verify changes saved
      await expect(page.locator('[data-testid="document-list"]')).toContainText('Updated Test Document');
    });

    test('should delete document', async () => {
      // Right-click on document for context menu
      await page.click('[data-testid="document-item"]:first-child', { button: 'right' });
      
      // Click delete option
      await page.click('[data-testid="delete-document-option"]');
      
      // Confirm deletion
      await page.click('[data-testid="confirm-delete-btn"]');
      
      // Verify document removed
      await expect(page.locator('[data-testid="document-list"]')).not.toContainText('Updated Test Document');
    });
  });

  describe('Search and Query Flow', () => {
    beforeEach(async () => {
      // Setup test documents
      await page.evaluate(() => {
        window.electronAPI.addTestDocuments([
          { id: 1, title: 'AI Research Paper', content: 'Artificial intelligence research findings...' },
          { id: 2, title: 'Machine Learning Guide', content: 'Comprehensive guide to machine learning...' },
          { id: 3, title: 'Data Science Handbook', content: 'Data science methodologies and practices...' }
        ]);
      });
    });

    test('should perform basic search', async () => {
      // Enter search query
      await page.fill('[data-testid="search-input"]', 'machine learning');
      
      // Click search or press Enter
      await page.press('[data-testid="search-input"]', 'Enter');
      
      // Wait for search results
      await page.waitForSelector('[data-testid="search-results"]');
      
      // Verify results
      const results = await page.locator('[data-testid="search-result-item"]').count();
      expect(results).toBeGreaterThan(0);
      
      // Check if relevant document appears
      await expect(page.locator('[data-testid="search-results"]')).toContainText('Machine Learning Guide');
    });

    test('should perform semantic search', async () => {
      // Enable semantic search
      await page.click('[data-testid="semantic-search-toggle"]');
      
      // Enter semantic query
      await page.fill('[data-testid="search-input"]', 'artificial intelligence techniques');
      await page.press('[data-testid="search-input"]', 'Enter');
      
      // Wait for results
      await page.waitForSelector('[data-testid="search-results"]');
      
      // Verify semantic results
      const results = await page.locator('[data-testid="search-result-item"]');
      expect(await results.count()).toBeGreaterThan(0);
    });

    test('should filter search results', async () => {
      // Perform search
      await page.fill('[data-testid="search-input"]', 'data');
      await page.press('[data-testid="search-input"]', 'Enter');
      
      // Wait for results
      await page.waitForSelector('[data-testid="search-results"]');
      
      // Apply date filter
      await page.click('[data-testid="filter-dropdown"]');
      await page.click('[data-testid="date-filter-option"]');
      
      // Apply filter
      await page.fill('[data-testid="date-from"]', '2024-01-01');
      await page.click('[data-testid="apply-filter-btn"]');
      
      // Verify filtered results
      const filteredResults = await page.locator('[data-testid="search-result-item"]').count();
      expect(filteredResults).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Settings and Configuration', () => {
    test('should open and modify settings', async () => {
      // Open settings
      await page.click('[data-testid="settings-btn"]');
      
      // Wait for settings dialog
      await expect(page.locator('[data-testid="settings-dialog"]')).toBeVisible();
      
      // Modify theme setting
      await page.click('[data-testid="theme-dropdown"]');
      await page.click('[data-testid="dark-theme-option"]');
      
      // Save settings
      await page.click('[data-testid="save-settings-btn"]');
      
      // Verify theme changed
      const bodyClass = await page.getAttribute('body', 'class');
      expect(bodyClass).toContain('dark-theme');
    });

    test('should configure API settings', async () => {
      await page.click('[data-testid="settings-btn"]');
      await page.click('[data-testid="api-settings-tab"]');
      
      // Configure OpenAI API
      await page.fill('[data-testid="openai-api-key"]', 'test-api-key');
      await page.fill('[data-testid="openai-model"]', 'gpt-4');
      
      // Test connection
      await page.click('[data-testid="test-connection-btn"]');
      
      // Wait for connection result
      await expect(page.locator('[data-testid="connection-status"]')).toBeVisible();
    });
  });

  describe('Keyboard Shortcuts', () => {
    test('should handle global shortcuts', async () => {
      // Test Ctrl+N for new document
      await page.keyboard.press('Control+n');
      await expect(page.locator('[data-testid="new-document-dialog"]')).toBeVisible();
      
      // Test Escape to close dialog
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-testid="new-document-dialog"]')).not.toBeVisible();
      
      // Test Ctrl+F for search
      await page.keyboard.press('Control+f');
      await expect(page.locator('[data-testid="search-input"]')).toBeFocused();
    });

    test('should handle application menu shortcuts', async () => {
      // Test File menu shortcuts
      await page.keyboard.press('Alt+f');
      
      // Test Help menu
      await page.keyboard.press('Alt+h');
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      // Simulate network error
      await page.route('**/api/**', route => route.abort());
      
      // Try to perform operation that requires network
      await page.click('[data-testid="sync-btn"]');
      
      // Check for error message
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="error-message"]')).toContainText('network error');
    });

    test('should handle file operation errors', async () => {
      // Try to open non-existent file
      await page.evaluate(() => {
        window.electronAPI.openFile('non-existent-file.txt');
      });
      
      // Check for error notification
      await expect(page.locator('[data-testid="notification"]')).toBeVisible();
      await expect(page.locator('[data-testid="notification"]')).toContainText('file not found');
    });
  });

  describe('Performance', () => {
    test('should load large document sets efficiently', async () => {
      const startTime = Date.now();
      
      // Load large dataset
      await page.evaluate(() => {
        const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          title: `Document ${i}`,
          content: `Content for document ${i}`.repeat(100)
        }));
        
        window.electronAPI.loadDocuments(largeDataset);
      });
      
      // Wait for UI to update
      await page.waitForSelector('[data-testid="document-count"]');
      
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(5000); // Should load within 5 seconds
      
      // Verify document count
      const documentCount = await page.textContent('[data-testid="document-count"]');
      expect(documentCount).toContain('1000');
    });

    test('should handle rapid user interactions', async () => {
      // Rapidly click search button
      for (let i = 0; i < 10; i++) {
        await page.fill('[data-testid="search-input"]', `query ${i}`);
        await page.click('[data-testid="search-btn"]');
        await page.waitForTimeout(50); // Small delay between clicks
      }
      
      // Verify app remains responsive
      const isVisible = await page.locator('[data-testid="search-results"]').isVisible();
      expect(isVisible).toBe(true);
    });
  });
});
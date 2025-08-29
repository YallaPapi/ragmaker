# Electron Desktop Application Testing Suite

Comprehensive testing strategy for Electron-based desktop applications with focus on reliability, performance, and cross-platform compatibility.

## 📋 Testing Strategy Overview

This testing suite implements a multi-layered approach following the testing pyramid:

```
         /\
        /E2E\      ← End-to-end tests (Playwright)
       /------\
      /Integr. \   ← Integration tests (IPC, File System)
     /----------\
    /   Unit     \  ← Unit tests (Main Process, Renderer)
   /--------------\
  /  Performance  \  ← Performance & Memory tests
 /------------------\
```

## 🏗️ Test Structure

### `/unit/` - Unit Tests
- **Main Process Tests**: Application lifecycle, window management, menu systems
- **Renderer Process Tests**: UI components, user interactions, client-side logic
- **IPC Communication**: Message passing between main and renderer processes

### `/integration/` - Integration Tests
- **IPC Communication**: End-to-end message flow testing
- **File System Operations**: File read/write, dialog interactions
- **Database Operations**: CRUD operations, transactions
- **External API Integration**: Service communication tests

### `/e2e/` - End-to-End Tests
- **Application Flow**: Complete user workflows from start to finish
- **UI Automation**: Playwright-based interface testing
- **Cross-Browser Compatibility**: Testing across different environments
- **User Journey Validation**: Real-world usage scenarios

### `/performance/` - Performance Tests
- **Memory Leak Detection**: Long-running memory usage analysis
- **CPU Usage Monitoring**: Performance under load
- **Resource Management**: File handles, WebContents cleanup
- **Responsiveness Testing**: UI performance metrics

### `/platform/` - Cross-Platform Tests
- **Windows-Specific Features**: Native Windows integration
- **macOS-Specific Features**: Apple ecosystem integration
- **Linux Compatibility**: Various Linux distribution testing
- **Platform API Differences**: OS-specific functionality

## 🚀 Quick Start

### Prerequisites

```bash
# Install dependencies
npm install

# Install Electron testing tools
npm install --save-dev playwright electron spectron

# Enable garbage collection for memory tests
node --expose-gc
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:performance
npm run test:platform

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch

# Debug tests
npm run test:debug
```

## 🔧 Configuration

### Jest Configuration (`jest.config.js`)

```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/unit/**/*.test.js',
    '<rootDir>/integration/**/*.test.js',
    '<rootDir>/e2e/**/*.test.js',
    '<rootDir>/performance/**/*.test.js',
    '<rootDir>/platform/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/setup/jest.setup.js'],
  collectCoverageFrom: ['../src/**/*.{js,ts}'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### Playwright Configuration (`playwright.config.js`)

```javascript
module.exports = defineConfig({
  testDir: './e2e',
  use: {
    launchOptions: {
      executablePath: require('electron')
    }
  },
  projects: [
    { name: 'electron', use: { ...devices['Desktop Chrome'] } },
    { name: 'electron-windows', use: { platform: 'win32' } },
    { name: 'electron-macos', use: { platform: 'darwin' } },
    { name: 'electron-linux', use: { platform: 'linux' } }
  ]
});
```

## 📝 Test Examples

### Unit Test Example

```javascript
describe('Main Process', () => {
  test('should create window with secure preferences', () => {
    const window = new BrowserWindow({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false
      }
    });
    
    expect(window.webContents.getWebPreferences().nodeIntegration).toBe(false);
  });
});
```

### Integration Test Example

```javascript
describe('IPC Communication', () => {
  test('should handle file read requests', async () => {
    ipcMain.handle('read-file', async (event, path) => {
      return { success: true, content: 'file content' };
    });
    
    const result = await ipcRenderer.invoke('read-file', 'test.txt');
    expect(result.success).toBe(true);
  });
});
```

### E2E Test Example

```javascript
test('should create and edit document', async ({ page }) => {
  await page.click('[data-testid="new-document"]');
  await page.fill('[data-testid="title"]', 'Test Document');
  await page.click('[data-testid="save"]');
  
  await expect(page.locator('[data-testid="document-list"]'))
    .toContainText('Test Document');
});
```

### Performance Test Example

```javascript
test('should not leak memory during window creation', async () => {
  const iterations = 50;
  
  for (let i = 0; i < iterations; i++) {
    const window = new BrowserWindow();
    window.close();
  }
  
  if (global.gc) global.gc();
  
  const memoryUsage = process.memoryUsage().heapUsed;
  expect(memoryUsage).toBeLessThan(initialMemory * 1.5);
});
```

## 🎯 Testing Best Practices

### 1. Test Organization
- Use descriptive test names that explain behavior
- Group related tests using `describe` blocks
- Follow Arrange-Act-Assert pattern

### 2. Mocking and Stubbing
- Mock external dependencies
- Use `electron-mock-ipc` for IPC testing
- Stub file system operations in unit tests

### 3. Async Testing
- Properly handle async operations with `async/await`
- Use appropriate timeouts for long-running operations
- Test both success and error scenarios

### 4. Platform-Specific Testing
- Use conditional tests based on `process.platform`
- Test platform-specific features separately
- Ensure consistent behavior across platforms

### 5. Performance Testing
- Run performance tests in isolation
- Use `global.gc()` for memory testing
- Monitor system resources during tests

## 📊 Coverage and Metrics

### Coverage Thresholds
- **Statements**: 80%
- **Branches**: 75%
- **Functions**: 80%
- **Lines**: 80%

### Performance Metrics
- **Memory Growth**: <10MB during stress tests
- **Response Time**: <100ms for UI operations
- **Startup Time**: <3 seconds on average hardware

### Quality Gates
- All tests must pass
- Coverage thresholds must be met
- No memory leaks detected
- Performance benchmarks within acceptable range

## 🔍 Debugging Tests

### Debug Configuration

```bash
# Run tests with debugging enabled
npm run test:debug

# Run specific test file with debugging
npx jest --runInBand --no-cache unit/main-process.test.js

# Enable Electron debugging
DEBUG=electron:* npm test
```

### Common Issues

1. **Test Timeouts**: Increase timeout for slow operations
2. **Memory Leaks**: Ensure proper cleanup in `afterEach`
3. **Platform Differences**: Use conditional testing
4. **IPC Communication**: Verify proper setup/teardown

## 📈 CI/CD Integration

### GitHub Actions Example

```yaml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm run test:ci
      - name: Upload coverage
        uses: codecov/codecov-action@v1
```

## 🛡️ Security Testing

### Security Checklist
- ✅ Node integration disabled in renderer
- ✅ Context isolation enabled
- ✅ Remote module disabled
- ✅ Web security enabled
- ✅ Secure preload scripts
- ✅ CSP headers configured

### Security Tests

```javascript
test('should have secure webPreferences', () => {
  const window = new BrowserWindow({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true
    }
  });
  
  const prefs = window.webContents.getWebPreferences();
  expect(prefs.nodeIntegration).toBe(false);
  expect(prefs.contextIsolation).toBe(true);
});
```

## 📚 Additional Resources

- [Electron Testing Guide](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [Playwright for Electron](https://playwright.dev/docs/api/class-electronapplication)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Spectron (deprecated)](https://github.com/electron-userland/spectron)

## 🤝 Contributing

1. Follow existing test patterns
2. Add tests for new features
3. Ensure all tests pass before submitting PR
4. Update documentation for new test types
5. Run full test suite on multiple platforms

## 📋 Test Checklist

Before deploying:
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass on target platforms
- [ ] Performance tests within thresholds
- [ ] Memory leak tests clean
- [ ] Security tests pass
- [ ] Coverage thresholds met
- [ ] Platform-specific features tested

This comprehensive testing strategy ensures robust, reliable, and performant Electron applications across all supported platforms.
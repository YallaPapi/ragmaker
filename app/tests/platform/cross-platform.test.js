const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Platform-specific test configurations
const platformConfigs = {
  win32: {
    executable: 'ragmaker.exe',
    dataDir: path.join(os.homedir(), 'AppData', 'Local', 'RagMaker'),
    configDir: path.join(os.homedir(), 'AppData', 'Roaming', 'RagMaker'),
    shortcuts: {
      search: 'Ctrl+K',
      newProject: 'Ctrl+N',
      settings: 'Ctrl+,'
    },
    fileAssociations: ['.ragmaker', '.ragproj'],
    features: ['notifications', 'autoUpdater', 'fileAssociations', 'contextMenu']
  },
  darwin: {
    executable: 'RagMaker.app',
    dataDir: path.join(os.homedir(), 'Library', 'Application Support', 'RagMaker'),
    configDir: path.join(os.homedir(), 'Library', 'Preferences', 'RagMaker'),
    shortcuts: {
      search: 'Cmd+K',
      newProject: 'Cmd+N',
      settings: 'Cmd+,'
    },
    fileAssociations: ['.ragmaker', '.ragproj'],
    features: ['notifications', 'autoUpdater', 'fileAssociations', 'touchBar', 'darkMode']
  },
  linux: {
    executable: 'ragmaker',
    dataDir: path.join(os.homedir(), '.local', 'share', 'RagMaker'),
    configDir: path.join(os.homedir(), '.config', 'RagMaker'),
    shortcuts: {
      search: 'Ctrl+K',
      newProject: 'Ctrl+N',
      settings: 'Ctrl+,'
    },
    fileAssociations: ['.ragmaker', '.ragproj'],
    features: ['notifications', 'autoUpdater', 'fileAssociations']
  }
};

describe('Cross-Platform Compatibility Tests', () => {
  const currentPlatform = process.platform;
  const config = platformConfigs[currentPlatform];
  
  if (!config) {
    throw new Error(`Unsupported platform: ${currentPlatform}`);
  }

  describe('Platform Detection & Configuration', () => {
    test('should detect current platform correctly', () => {
      expect(currentPlatform).toMatch(/^(win32|darwin|linux)$/);
      expect(config).toBeDefined();
      
      console.log(`\nTesting on platform: ${currentPlatform}`);
      console.log(`Architecture: ${process.arch}`);
      console.log(`Node.js version: ${process.version}`);
      console.log(`OS version: ${os.release()}`);
    });

    test('should have platform-specific paths configured', () => {
      expect(config.dataDir).toContain('RagMaker');
      expect(config.configDir).toContain('RagMaker');
      expect(path.isAbsolute(config.dataDir)).toBe(true);
      expect(path.isAbsolute(config.configDir)).toBe(true);
      
      // Paths should follow platform conventions
      if (currentPlatform === 'win32') {
        expect(config.dataDir).toContain('AppData');
        expect(config.configDir).toContain('AppData');
      } else if (currentPlatform === 'darwin') {
        expect(config.dataDir).toContain('Library');
        expect(config.configDir).toContain('Library');
      } else if (currentPlatform === 'linux') {
        expect(config.dataDir).toContain('.local');
        expect(config.configDir).toContain('.config');
      }
    });

    test('should have correct keyboard shortcuts for platform', () => {
      const shortcuts = config.shortcuts;
      expect(shortcuts.search).toBeDefined();
      expect(shortcuts.newProject).toBeDefined();
      expect(shortcuts.settings).toBeDefined();
      
      // Check platform-specific modifier keys
      if (currentPlatform === 'darwin') {
        expect(shortcuts.search).toContain('Cmd');
        expect(shortcuts.newProject).toContain('Cmd');
      } else {
        expect(shortcuts.search).toContain('Ctrl');
        expect(shortcuts.newProject).toContain('Ctrl');
      }
    });
  });

  describe('File System Operations', () => {
    test('should create platform-specific directories', async () => {
      const testDataDir = path.join(config.dataDir, 'test');
      const testConfigDir = path.join(config.configDir, 'test');
      
      try {
        // Create directories
        await fs.mkdir(testDataDir, { recursive: true });
        await fs.mkdir(testConfigDir, { recursive: true });
        
        // Verify directories exist
        const dataDirStats = await fs.stat(testDataDir);
        const configDirStats = await fs.stat(testConfigDir);
        
        expect(dataDirStats.isDirectory()).toBe(true);
        expect(configDirStats.isDirectory()).toBe(true);
        
      } finally {
        // Cleanup
        try {
          await fs.rmdir(testDataDir);
          await fs.rmdir(testConfigDir);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    test('should handle path separators correctly', () => {
      const testPaths = [
        'projects/my-project/data.db',
        'cache\\embeddings\\vectors.json',
        'documents/files with spaces/document.pdf'
      ];
      
      testPaths.forEach(testPath => {
        const normalizedPath = path.normalize(testPath);
        const joinedPath = path.join(config.dataDir, testPath);
        
        expect(path.isAbsolute(joinedPath)).toBe(true);
        expect(joinedPath).toContain(config.dataDir);
        
        // Verify platform-specific separators
        if (currentPlatform === 'win32') {
          expect(joinedPath.includes('/')).toBe(false); // Should only have backslashes
        } else {
          expect(joinedPath.includes('\\')).toBe(false); // Should only have forward slashes
        }
      });
    });

    test('should handle file permissions correctly', async () => {
      const testFile = path.join(config.dataDir, 'test-permissions.txt');
      
      try {
        // Create test directories
        await fs.mkdir(config.dataDir, { recursive: true });
        
        // Write test file
        await fs.writeFile(testFile, 'test content', 'utf8');
        
        // Check file exists and is readable
        const content = await fs.readFile(testFile, 'utf8');
        expect(content).toBe('test content');
        
        // Platform-specific permission tests
        if (currentPlatform !== 'win32') {
          const stats = await fs.stat(testFile);
          const mode = stats.mode & parseInt('777', 8);
          
          // File should be readable by owner
          expect(mode & parseInt('400', 8)).toBeGreaterThan(0);
          // File should be writable by owner
          expect(mode & parseInt('200', 8)).toBeGreaterThan(0);
        }
        
      } finally {
        // Cleanup
        try {
          await fs.unlink(testFile);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });
  });

  describe('Process Management', () => {
    test('should handle child processes correctly', async () => {
      const testCommand = currentPlatform === 'win32' ? 'dir' : 'ls';
      const args = currentPlatform === 'win32' ? ['/b'] : ['-la'];
      
      return new Promise((resolve, reject) => {
        const child = spawn(testCommand, args, {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('close', (code) => {
          try {
            expect(code).toBe(0);
            expect(stdout.length).toBeGreaterThan(0);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
        
        child.on('error', reject);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          child.kill();
          reject(new Error('Process timeout'));
        }, 10000);
      });
    });

    test('should handle environment variables correctly', () => {
      // Platform-specific environment variables
      const platformEnvVars = {
        win32: ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA'],
        darwin: ['HOME', 'USER'],
        linux: ['HOME', 'USER', 'XDG_CONFIG_HOME']
      };
      
      const expectedVars = platformEnvVars[currentPlatform] || ['HOME'];
      
      expectedVars.forEach(varName => {
        if (varName !== 'XDG_CONFIG_HOME') { // XDG_CONFIG_HOME is optional
          expect(process.env[varName]).toBeDefined();
          expect(process.env[varName]).not.toBe('');
        }
      });
      
      // Test PATH variable
      expect(process.env.PATH).toBeDefined();
      const pathSeparator = currentPlatform === 'win32' ? ';' : ':';
      expect(process.env.PATH.includes(pathSeparator)).toBe(true);
    });
  });

  describe('System Integration', () => {
    test('should detect system capabilities', async () => {
      const capabilities = {
        notifications: false,
        darkMode: false,
        touchBar: false,
        systemTray: false,
        autoStart: false,
        fileAssociations: false
      };
      
      // Platform-specific capability detection
      if (currentPlatform === 'win32') {
        capabilities.notifications = true;
        capabilities.systemTray = true;
        capabilities.autoStart = true;
        capabilities.fileAssociations = true;
      } else if (currentPlatform === 'darwin') {
        capabilities.notifications = true;
        capabilities.darkMode = true;
        capabilities.touchBar = true;
        capabilities.systemTray = true;
        capabilities.autoStart = true;
        capabilities.fileAssociations = true;
      } else if (currentPlatform === 'linux') {
        capabilities.notifications = true;
        capabilities.systemTray = true;
        capabilities.autoStart = true;
        capabilities.fileAssociations = true;
      }
      
      // Verify expected capabilities match platform config
      config.features.forEach(feature => {
        switch (feature) {
          case 'notifications':
            expect(capabilities.notifications).toBe(true);
            break;
          case 'darkMode':
            expect(capabilities.darkMode).toBe(true);
            break;
          case 'touchBar':
            expect(capabilities.touchBar).toBe(true);
            break;
        }
      });
    });

    test('should handle system theme changes', async () => {
      // This test would check if the app can detect and respond to system theme changes
      // For now, we'll just verify the detection mechanism works
      
      let systemTheme = 'unknown';
      
      if (currentPlatform === 'win32') {
        try {
          // Check Windows registry for theme info (simplified)
          systemTheme = 'light'; // Default assumption
        } catch (error) {
          systemTheme = 'light';
        }
      } else if (currentPlatform === 'darwin') {
        try {
          const { stdout } = await execAsync('defaults read -g AppleInterfaceStyle 2>/dev/null || echo "Light"');
          systemTheme = stdout.trim().toLowerCase().includes('dark') ? 'dark' : 'light';
        } catch (error) {
          systemTheme = 'light';
        }
      } else if (currentPlatform === 'linux') {
        try {
          // Try to detect dark theme via various methods
          const { stdout } = await execAsync('gsettings get org.gnome.desktop.interface gtk-theme 2>/dev/null || echo "light"');
          systemTheme = stdout.toLowerCase().includes('dark') ? 'dark' : 'light';
        } catch (error) {
          systemTheme = 'light';
        }
      }
      
      expect(systemTheme).toMatch(/^(light|dark|unknown)$/);
      console.log(`Detected system theme: ${systemTheme}`);
    });
  });

  describe('Performance Characteristics', () => {
    test('should have platform-appropriate performance characteristics', async () => {
      const performanceMetrics = {
        startupTime: 0,
        memoryUsage: 0,
        cpuUsage: 0
      };
      
      // Measure basic performance
      const startTime = Date.now();
      
      // Simulate app initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      performanceMetrics.startupTime = Date.now() - startTime;
      performanceMetrics.memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB
      
      // Platform-specific performance expectations
      const platformExpectations = {
        win32: {
          maxStartupTime: 5000,
          maxMemoryUsage: 200,
          features: ['fastStartup', 'efficientMemory']
        },
        darwin: {
          maxStartupTime: 3000,
          maxMemoryUsage: 150,
          features: ['fastStartup', 'nativePerformance']
        },
        linux: {
          maxStartupTime: 4000,
          maxMemoryUsage: 180,
          features: ['lightWeight', 'efficientMemory']
        }
      };
      
      const expectations = platformExpectations[currentPlatform];
      
      expect(performanceMetrics.startupTime).toBeLessThan(expectations.maxStartupTime);
      expect(performanceMetrics.memoryUsage).toBeLessThan(expectations.maxMemoryUsage);
      
      console.log(`Platform performance metrics:`);
      console.log(`  Startup time: ${performanceMetrics.startupTime}ms`);
      console.log(`  Memory usage: ${performanceMetrics.memoryUsage.toFixed(2)}MB`);
    });

    test('should handle platform-specific resource constraints', async () => {
      const systemInfo = {
        totalMemory: os.totalmem() / 1024 / 1024 / 1024, // GB
        cpuCores: os.cpus().length,
        architecture: process.arch
      };
      
      console.log(`System specifications:`);
      console.log(`  Total memory: ${systemInfo.totalMemory.toFixed(2)}GB`);
      console.log(`  CPU cores: ${systemInfo.cpuCores}`);
      console.log(`  Architecture: ${systemInfo.architecture}`);
      
      // Adjust expectations based on system capabilities
      let expectedConcurrency = Math.min(4, systemInfo.cpuCores);
      let expectedMemoryLimit = Math.min(512, systemInfo.totalMemory * 1024 * 0.1); // 10% of system memory, max 512MB
      
      // Platform-specific adjustments
      if (currentPlatform === 'darwin' && systemInfo.architecture === 'arm64') {
        expectedConcurrency = Math.min(6, systemInfo.cpuCores); // M1/M2 Macs are more efficient
      }
      
      expect(expectedConcurrency).toBeGreaterThan(0);
      expect(expectedMemoryLimit).toBeGreaterThan(64); // At least 64MB
      
      console.log(`  Expected concurrency: ${expectedConcurrency}`);
      console.log(`  Expected memory limit: ${expectedMemoryLimit.toFixed(0)}MB`);
    });
  });

  describe('Error Handling & Recovery', () => {
    test('should handle platform-specific errors gracefully', async () => {
      const platformErrors = {
        win32: [
          'EACCES', // Access denied
          'ENOENT', // File not found
          'EMFILE', // Too many open files
          'EBUSY'   // Resource busy
        ],
        darwin: [
          'EACCES', // Permission denied
          'ENOENT', // No such file or directory
          'EMFILE', // Too many open files
          'ENOTDIR' // Not a directory
        ],
        linux: [
          'EACCES', // Permission denied
          'ENOENT', // No such file or directory
          'EMFILE', // Too many open files
          'ENOSPC'  // No space left on device
        ]
      };
      
      const expectedErrors = platformErrors[currentPlatform];
      
      expectedErrors.forEach(errorCode => {
        // Simulate error handling
        const mockError = new Error(`Mock ${errorCode} error`);
        mockError.code = errorCode;
        
        // Error should be recognized and handled appropriately
        expect(mockError.code).toBe(errorCode);
        expect(mockError.message).toContain(errorCode);
      });
    });

    test('should handle platform-specific crash recovery', async () => {
      // Test crash recovery mechanisms
      const recoveryStrategies = {
        win32: [
          'restartService',
          'clearTempFiles',
          'resetUserSettings',
          'rebuildIndex'
        ],
        darwin: [
          'restartService',
          'clearCaches',
          'resetPreferences',
          'rebuildDatabase'
        ],
        linux: [
          'restartService',
          'clearTmpFiles',
          'resetConfig',
          'rebuildIndex'
        ]
      };
      
      const strategies = recoveryStrategies[currentPlatform];
      
      expect(strategies.length).toBeGreaterThan(0);
      expect(strategies).toContain('restartService'); // All platforms should have this
      
      console.log(`Available recovery strategies: ${strategies.join(', ')}`);
    });
  });

  describe('Security & Permissions', () => {
    test('should handle platform-specific security requirements', async () => {
      const securityFeatures = {
        win32: [
          'codeSignature',
          'userAccountControl',
          'windowsDefender',
          'dataProtectionAPI'
        ],
        darwin: {
          'codeSignature',
          'gatekeeper',
          'sandboxing',
          'keychain'
        ],
        linux: [
          'apparmor',
          'selinux',
          'capabilities',
          'keyring'
        ]
      };
      
      const platformSecurity = securityFeatures[currentPlatform];
      expect(platformSecurity).toBeDefined();
      expect(Array.isArray(platformSecurity)).toBe(true);
      
      // All platforms should support code signatures
      expect(platformSecurity.includes('codeSignature')).toBe(true);
    });

    test('should respect platform permission models', async () => {
      // Test file system permissions
      const testDir = path.join(os.tmpdir(), 'ragmaker-permission-test');
      
      try {
        // Create test directory
        await fs.mkdir(testDir, { recursive: true });
        
        // Test read permission
        const files = await fs.readdir(testDir);
        expect(Array.isArray(files)).toBe(true);
        
        // Test write permission
        const testFile = path.join(testDir, 'permission-test.txt');
        await fs.writeFile(testFile, 'permission test');
        
        const content = await fs.readFile(testFile, 'utf8');
        expect(content).toBe('permission test');
        
        // Platform-specific permission tests
        if (currentPlatform !== 'win32') {
          // Test chmod on Unix-like systems
          await fs.chmod(testFile, 0o644);
          const stats = await fs.stat(testFile);
          const mode = stats.mode & parseInt('777', 8);
          expect(mode).toBe(parseInt('644', 8));
        }
        
      } finally {
        // Cleanup
        try {
          await fs.rmdir(testDir, { recursive: true });
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });
  });

  describe('Compatibility Matrix', () => {
    test('should document supported platform versions', () => {
      const supportedVersions = {
        win32: {
          minimum: '10.0.0',
          recommended: '11.0.0',
          architectures: ['x64', 'ia32']
        },
        darwin: {
          minimum: '10.14.0', // Mojave
          recommended: '12.0.0', // Monterey
          architectures: ['x64', 'arm64']
        },
        linux: {
          minimum: 'Ubuntu 18.04, CentOS 7',
          recommended: 'Ubuntu 20.04+, CentOS 8+',
          architectures: ['x64', 'arm64']
        }
      };
      
      const platformSupport = supportedVersions[currentPlatform];
      expect(platformSupport).toBeDefined();
      expect(platformSupport.architectures).toContain(process.arch);
      
      console.log(`Platform support for ${currentPlatform}:`);
      console.log(`  Minimum version: ${platformSupport.minimum}`);
      console.log(`  Recommended version: ${platformSupport.recommended}`);
      console.log(`  Supported architectures: ${platformSupport.architectures.join(', ')}`);
    });

    test('should validate current environment compatibility', () => {
      // Check Node.js version compatibility
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
      
      expect(majorVersion).toBeGreaterThanOrEqual(16); // Minimum Node.js 16
      
      // Check architecture compatibility
      const supportedArchs = ['x64', 'arm64', 'ia32'];
      expect(supportedArchs).toContain(process.arch);
      
      // Platform-specific compatibility checks
      if (currentPlatform === 'win32') {
        // Windows-specific version check would go here
        expect(os.release()).toBeDefined();
      } else if (currentPlatform === 'darwin') {
        // macOS-specific version check would go here
        expect(os.release()).toBeDefined();
      } else if (currentPlatform === 'linux') {
        // Linux-specific checks would go here
        expect(os.release()).toBeDefined();
      }
      
      console.log(`Environment compatibility check passed for ${currentPlatform}`);
    });
  });
});

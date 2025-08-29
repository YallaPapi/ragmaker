# Build and Deployment Architecture

## Overview

This document outlines the comprehensive build, packaging, and deployment strategy for the RAGMaker Electron desktop application. The architecture supports multi-platform builds, automated updates, code signing, and secure distribution.

## Build System Architecture

### Core Build Tools

#### Primary: electron-builder
- **Complete packaging solution** with auto-updater support
- **Multi-platform builds** (Windows, macOS, Linux)
- **Code signing integration** for all platforms
- **Extensive configuration options** and plugin ecosystem
- **Built-in auto-updater** with electron-updater

#### Alternative: Electron Forge (considered for future migration)
- **Unified toolchain** with integrated publishing
- **Plugin-based architecture** for extensibility
- **Better GitHub integration** for open-source projects
- **Simpler configuration** for standard use cases

### Technology Stack

```json
{
  "build": {
    "electron-builder": "^24.6.0",
    "electron": "^28.0.0",
    "typescript": "^5.0.0",
    "vite": "^4.4.0"
  },
  "development": {
    "electron-dev": "^2.0.0",
    "concurrently": "^8.2.0",
    "wait-on": "^7.0.0"
  },
  "distribution": {
    "electron-updater": "^6.1.0",
    "electron-log": "^4.4.0"
  }
}
```

## Project Structure

### Build Configuration Structure

```
ragmaker/
├── build/                      # Build assets
│   ├── icons/                 # Application icons (all platforms)
│   │   ├── icon.icns         # macOS icon
│   │   ├── icon.ico          # Windows icon
│   │   └── icon.png          # Linux icon
│   ├── background.png        # macOS DMG background
│   ├── installerSidebar.bmp  # Windows installer sidebar
│   └── uninstallerSidebar.bmp
├── dist/                      # Built application files
├── release/                   # Packaged distributables
├── src/
│   ├── main/                 # Main process source
│   ├── renderer/             # Renderer process source
│   └── preload/              # Preload scripts
├── electron-builder.json     # Build configuration
├── forge.config.js          # Forge configuration (alternative)
├── vite.config.ts           # Vite bundler configuration
└── package.json             # Dependencies and scripts
```

## Build Configuration

### electron-builder Configuration

```json
{
  "build": {
    "productName": "RAGMaker",
    "appId": "com.ragmaker.desktop",
    "copyright": "Copyright © 2024 RAGMaker",
    "directories": {
      "output": "release",
      "buildResources": "build"
    },
    "files": [
      "dist/**/*",
      "src/main/**/*",
      "src/preload/**/*",
      "node_modules/**/*",
      "!node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}",
      "!node_modules/*/{test,__tests__,tests,powered-test,example,examples}",
      "!node_modules/*.d.ts",
      "!node_modules/.bin",
      "!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}",
      "!.editorconfig",
      "!**/._*",
      "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}",
      "!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}",
      "!**/{appveyor.yml,.travis.yml,circle.yml}",
      "!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}"
    ],
    "extraResources": [
      {
        "from": "data/",
        "to": "data/",
        "filter": ["**/*"]
      }
    ],
    "publish": {
      "provider": "github",
      "owner": "ragmaker",
      "repo": "ragmaker-desktop",
      "private": false
    },
    "mac": {
      "category": "public.app-category.productivity",
      "icon": "build/icons/icon.icns",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist",
      "notarize": {
        "teamId": "YOUR_TEAM_ID"
      },
      "target": [
        {
          "target": "dmg",
          "arch": ["x64", "arm64"]
        },
        {
          "target": "zip",
          "arch": ["x64", "arm64"]
        }
      ]
    },
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64", "ia32"]
        },
        {
          "target": "portable",
          "arch": ["x64"]
        }
      ],
      "icon": "build/icons/icon.ico",
      "publisherName": "RAGMaker Inc.",
      "verifyUpdateCodeSignature": true
    },
    "linux": {
      "target": [
        {
          "target": "AppImage",
          "arch": ["x64"]
        },
        {
          "target": "snap",
          "arch": ["x64"]
        },
        {
          "target": "deb",
          "arch": ["x64"]
        }
      ],
      "icon": "build/icons/",
      "category": "Office"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "installerSidebar": "build/installerSidebar.bmp",
      "uninstallerSidebar": "build/uninstallerSidebar.bmp"
    },
    "dmg": {
      "background": "build/background.png",
      "window": {
        "width": 600,
        "height": 400
      },
      "contents": [
        {
          "x": 150,
          "y": 200
        },
        {
          "x": 450,
          "y": 200,
          "type": "link",
          "path": "/Applications"
        }
      ]
    }
  }
}
```

### macOS Entitlements

```xml
<!-- build/entitlements.mac.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
  <key>com.apple.security.files.downloads.read-write</key>
  <true/>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

## Development Workflow

### Build Scripts

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:renderer\" \"wait-on http://localhost:3000 && npm run dev:electron\"",
    "dev:renderer": "vite",
    "dev:electron": "electron-dev",
    
    "build": "npm run build:renderer && npm run build:main",
    "build:renderer": "vite build",
    "build:main": "tsc -p src/main/tsconfig.json",
    
    "dist": "npm run build && electron-builder",
    "dist:mac": "npm run build && electron-builder --mac",
    "dist:win": "npm run build && electron-builder --win",
    "dist:linux": "npm run build && electron-builder --linux",
    
    "pack": "npm run build && electron-builder --dir",
    "release": "npm run build && electron-builder --publish=always",
    
    "test": "jest",
    "test:e2e": "playwright test",
    "lint": "eslint src/ --ext .ts,.tsx",
    "type-check": "tsc --noEmit"
  }
}
```

### Development Environment Setup

```typescript
// scripts/dev-setup.js
const { spawn } = require('child_process');
const waitOn = require('wait-on');
const electron = require('electron');

async function startDevelopment() {
  console.log('Starting development environment...');
  
  // Start Vite dev server
  const renderer = spawn('npm', ['run', 'dev:renderer'], {
    stdio: 'inherit',
    shell: true
  });
  
  // Wait for renderer to be ready
  await waitOn({
    resources: ['http://localhost:3000'],
    timeout: 30000
  });
  
  // Start Electron with hot reload
  const main = spawn(electron, ['.', '--dev'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_IS_DEV: '1'
    }
  });
  
  // Handle cleanup
  const cleanup = () => {
    renderer.kill();
    main.kill();
    process.exit();
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

startDevelopment().catch(console.error);
```

## Auto-Update Implementation

### Main Process Auto-Updater

```typescript
// src/main/updater/auto-updater.ts
import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog } from 'electron';
import log from 'electron-log';

export class AutoUpdater {
  private mainWindow: BrowserWindow;
  private updateAvailable = false;
  private updateDownloaded = false;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.setupAutoUpdater();
  }

  private setupAutoUpdater() {
    // Configure logging
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = 'info';

    // Configure update server
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'ragmaker',
      repo: 'ragmaker-desktop',
      private: false
    });

    // Auto-download updates
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for update...');
      this.sendStatusToWindow('checking-for-update');
    });

    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info);
      this.updateAvailable = true;
      this.sendStatusToWindow('update-available', info);
      this.showUpdateDialog(info);
    });

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info);
      this.sendStatusToWindow('update-not-available', info);
    });

    autoUpdater.on('error', (err) => {
      log.error('Update error:', err);
      this.sendStatusToWindow('update-error', err);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      log.info('Download progress:', progressObj);
      this.sendStatusToWindow('download-progress', progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info);
      this.updateDownloaded = true;
      this.sendStatusToWindow('update-downloaded', info);
      this.showRestartDialog();
    });
  }

  async checkForUpdates() {
    if (process.env.NODE_ENV === 'development') {
      log.info('Skipping update check in development');
      return;
    }

    try {
      await autoUpdater.checkForUpdatesAndNotify();
    } catch (error) {
      log.error('Failed to check for updates:', error);
    }
  }

  private async showUpdateDialog(updateInfo: any) {
    const response = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${updateInfo.version}) is available. Would you like to download it?`,
      detail: updateInfo.releaseNotes || 'No release notes available.',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    });

    if (response.response === 0) {
      autoUpdater.downloadUpdate();
    }
  }

  private async showRestartDialog() {
    const response = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded successfully. Restart the application to apply the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    });

    if (response.response === 0) {
      autoUpdater.quitAndInstall();
    }
  }

  private sendStatusToWindow(event: string, data?: any) {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('updater-status', {
        event,
        data
      });
    }
  }

  quitAndInstall() {
    autoUpdater.quitAndInstall();
  }

  get isUpdateAvailable() {
    return this.updateAvailable;
  }

  get isUpdateDownloaded() {
    return this.updateDownloaded;
  }
}
```

### Renderer Update UI

```tsx
// src/renderer/components/UpdateNotification.tsx
import React, { useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { Progress } from './ui/Progress';
import { X, Download, RefreshCw } from 'lucide-react';

interface UpdateStatus {
  event: string;
  data?: any;
}

export const UpdateNotification: React.FC = () => {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleUpdateStatus = (statusData: UpdateStatus) => {
      setStatus(statusData);
      
      if (statusData.event === 'download-progress' && statusData.data) {
        setProgress(statusData.data.percent);
      }
    };

    window.electronAPI.on('updater-status', handleUpdateStatus);

    // Check for updates on startup
    window.electronAPI.system.checkForUpdates();

    return () => {
      window.electronAPI.off('updater-status', handleUpdateStatus);
    };
  }, []);

  if (!status) return null;

  const renderUpdateUI = () => {
    switch (status.event) {
      case 'checking-for-update':
        return (
          <div className="flex items-center space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            <span className="text-blue-800">Checking for updates...</span>
          </div>
        );

      case 'update-available':
        return (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-green-800">Update Available</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatus(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-green-700 text-sm mb-3">
              Version {status.data?.version} is now available.
            </p>
            <div className="flex space-x-2">
              <Button
                size="sm"
                onClick={() => window.electronAPI.system.downloadUpdate()}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatus(null)}
              >
                Later
              </Button>
            </div>
          </div>
        );

      case 'download-progress':
        return (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-blue-800">Downloading Update</h3>
              <span className="text-blue-600 text-sm">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="mb-2" />
            <p className="text-blue-700 text-sm">
              Please wait while the update downloads...
            </p>
          </div>
        );

      case 'update-downloaded':
        return (
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-purple-800">Update Ready</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatus(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-purple-700 text-sm mb-3">
              Restart the application to apply the update.
            </p>
            <div className="flex space-x-2">
              <Button
                size="sm"
                onClick={() => window.electronAPI.system.restartAndUpdate()}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Restart Now
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatus(null)}
              >
                Later
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      {renderUpdateUI()}
    </div>
  );
};
```

## Code Signing & Security

### Windows Code Signing

```json
{
  "win": {
    "certificateFile": "certs/windows-certificate.p12",
    "certificatePassword": "${env.WINDOWS_CERT_PASSWORD}",
    "signingHashAlgorithms": ["sha256"],
    "timeStampServer": "http://timestamp.comodoca.com"
  }
}
```

### macOS Code Signing

```json
{
  "mac": {
    "identity": "Developer ID Application: RAGMaker Inc. (TEAM_ID)",
    "hardenedRuntime": true,
    "entitlements": "build/entitlements.mac.plist",
    "notarize": {
      "teamId": "TEAM_ID"
    }
  }
}
```

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/build-and-release.yml
name: Build and Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test

      - name: Build application
        run: npm run build

      - name: Build distributables (macOS)
        if: matrix.os == 'macos-latest'
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          CSC_LINK: ${{ secrets.MAC_CERTIFICATE }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERTIFICATE_PASSWORD }}
        run: npm run dist:mac

      - name: Build distributables (Windows)
        if: matrix.os == 'windows-latest'
        env:
          WINDOWS_CERT_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}
        run: npm run dist:win

      - name: Build distributables (Linux)
        if: matrix.os == 'ubuntu-latest'
        run: npm run dist:linux

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: distributables-${{ matrix.os }}
          path: release/

  release:
    needs: build
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/')

    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v3

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            distributables-*/**/*
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Performance Optimization

### Bundle Analysis

```typescript
// scripts/analyze-bundle.js
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

module.exports = {
  configureWebpack: {
    plugins: [
      new BundleAnalyzerPlugin({
        analyzerMode: 'server',
        openAnalyzer: false,
        reportFilename: 'bundle-report.html'
      })
    ]
  }
};
```

### Build Optimization Strategies

1. **Tree Shaking**: Remove unused code from bundles
2. **Code Splitting**: Separate vendor and application code
3. **Asset Optimization**: Compress images and fonts
4. **Native Module Optimization**: Rebuild native modules for target platforms

This comprehensive build and deployment architecture ensures secure, efficient, and maintainable distribution of the RAGMaker desktop application across all major platforms with automated updates and proper code signing.
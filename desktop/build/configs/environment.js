const path = require('path');

// Environment configuration for Electron builds
const environments = {
  development: {
    NODE_ENV: 'development',
    ELECTRON_IS_DEV: '1',
    WEBPACK_DEV_SERVER_URL: 'http://localhost:3000',
    LOG_LEVEL: 'debug',
    ENABLE_DEVTOOLS: '1',
    UPDATER_ENABLED: '0'
  },
  
  production: {
    NODE_ENV: 'production',
    ELECTRON_IS_DEV: '0',
    LOG_LEVEL: 'info',
    ENABLE_DEVTOOLS: '0',
    UPDATER_ENABLED: '1'
  },
  
  test: {
    NODE_ENV: 'test',
    ELECTRON_IS_DEV: '1',
    LOG_LEVEL: 'error',
    ENABLE_DEVTOOLS: '0',
    UPDATER_ENABLED: '0'
  }
};

// Code signing configuration
const codeSigningConfig = {
  windows: {
    certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
    certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
    timestampServer: 'http://timestamp.digicert.com'
  },
  
  macos: {
    identity: process.env.APPLE_IDENTITY,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASS,
    teamId: process.env.APPLE_TEAM_ID,
    installerIdentity: process.env.APPLE_INSTALLER_IDENTITY
  }
};

// Platform-specific build options
const platformConfig = {
  win32: {
    targets: [
      { target: 'nsis', arch: ['x64', 'arm64'] },
      { target: 'portable', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] }
    ],
    fileAssociations: [
      {
        ext: 'rag',
        name: 'RAGMaker Document',
        description: 'RAGMaker Document File',
        icon: 'icon.ico'
      }
    ]
  },
  
  darwin: {
    targets: [
      { target: 'dmg', arch: ['x64', 'arm64', 'universal'] },
      { target: 'zip', arch: ['x64', 'arm64', 'universal'] },
      { target: 'pkg', arch: ['x64', 'arm64', 'universal'] }
    ],
    fileAssociations: [
      {
        ext: 'rag',
        name: 'RAGMaker Document',
        description: 'RAGMaker Document File',
        icon: 'icon.icns',
        role: 'Editor'
      }
    ]
  },
  
  linux: {
    targets: [
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      { target: 'deb', arch: ['x64', 'arm64'] },
      { target: 'rpm', arch: ['x64', 'arm64'] },
      { target: 'tar.gz', arch: ['x64', 'arm64'] }
    ],
    fileAssociations: [
      {
        ext: 'rag',
        name: 'RAGMaker Document',
        description: 'RAGMaker Document File',
        mimeType: 'application/x-ragmaker'
      }
    ]
  }
};

// Build optimization settings
const optimization = {
  // Webpack optimization
  webpack: {
    splitChunks: true,
    minimize: true,
    removeConsole: process.env.NODE_ENV === 'production',
    sourceMaps: process.env.NODE_ENV !== 'production'
  },
  
  // Electron optimization
  electron: {
    asar: true,
    asarUnpack: ['**/*.node', '**/node_modules/sharp/**/*'],
    compression: 'maximum',
    removePackageScripts: true,
    nodeGypRebuild: false
  }
};

// Security settings
const security = {
  csp: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https:", "wss:"],
    fontSrc: ["'self'", "data:"]
  },
  
  permissions: {
    nodeIntegration: false,
    contextIsolation: true,
    enableRemoteModule: false,
    webSecurity: true,
    allowRunningInsecureContent: false
  }
};

module.exports = {
  environments,
  codeSigningConfig,
  platformConfig,
  optimization,
  security,
  
  // Helper functions
  getEnvironment: (env = process.env.NODE_ENV) => {
    return environments[env] || environments.development;
  },
  
  getPlatformConfig: (platform = process.platform) => {
    return platformConfig[platform] || platformConfig.linux;
  },
  
  getCodeSigningConfig: (platform = process.platform) => {
    return codeSigningConfig[platform === 'win32' ? 'windows' : platform];
  }
};
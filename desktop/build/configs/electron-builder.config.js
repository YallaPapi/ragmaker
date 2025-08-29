const { name, version, description, author, homepage } = require('../../../package.json');

module.exports = {
  appId: 'com.ragmaker.desktop',
  productName: 'RAGMaker Desktop',
  directories: {
    output: 'dist',
    resources: 'desktop/build/assets',
    buildResources: 'desktop/build/assets'
  },
  files: [
    'desktop/main.js',
    'desktop/preload.js',
    'desktop/renderer/**/*',
    'src/**/*',
    'public/**/*',
    '!node_modules',
    '!desktop/build',
    '!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}'
  ],
  extraResources: [
    {
      from: 'desktop/build/assets',
      to: 'assets',
      filter: ['**/*']
    }
  ],
  publish: {
    provider: 'github',
    owner: 'your-github-username',
    repo: 'ragmaker',
    private: false
  },
  // Auto-updater configuration
  autoUpdater: {
    provider: 'github'
  },
  // Windows configuration
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64', 'arm64']
      },
      {
        target: 'portable',
        arch: ['x64', 'arm64']
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64']
      }
    ],
    icon: 'desktop/build/assets/icon.ico',
    requestedExecutionLevel: 'asInvoker',
    artifactName: '${productName}-${version}-${arch}.${ext}',
    // Code signing
    certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
    certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
    signingHashAlgorithms: ['sha256'],
    // Windows Store
    appx: {
      applicationId: 'RAGMakerDesktop',
      backgroundColor: '#1e1e1e',
      showNameOnTiles: true,
      identityName: 'RAGMaker.Desktop',
      publisher: 'CN=YourCompany',
      publisherDisplayName: 'Your Company Name'
    }
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'RAGMaker Desktop',
    include: 'desktop/build/scripts/installer.nsh',
    installerIcon: 'desktop/build/assets/installer.ico',
    uninstallerIcon: 'desktop/build/assets/uninstaller.ico',
    installerHeaderIcon: 'desktop/build/assets/installer-header.ico'
  },
  portable: {
    artifactName: '${productName}-${version}-portable.${ext}'
  },
  // macOS configuration
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64', 'universal']
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64', 'universal']
      },
      {
        target: 'pkg',
        arch: ['x64', 'arm64', 'universal']
      }
    ],
    icon: 'desktop/build/assets/icon.icns',
    category: 'public.app-category.productivity',
    darkModeSupport: true,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'desktop/build/configs/entitlements.mac.plist',
    entitlementsInherit: 'desktop/build/configs/entitlements.mac.plist',
    // Code signing
    identity: process.env.APPLE_IDENTITY,
    type: 'distribution'
  },
  dmg: {
    sign: false,
    background: 'desktop/build/assets/dmg-background.png',
    iconSize: 100,
    iconTextSize: 12,
    window: {
      width: 660,
      height: 400
    },
    contents: [
      {
        x: 180,
        y: 170,
        type: 'file'
      },
      {
        x: 480,
        y: 170,
        type: 'link',
        path: '/Applications'
      }
    ]
  },
  pkg: {
    installLocation: '/Applications',
    allowAnywhere: false,
    allowCurrentUserHome: false,
    allowRootDirectory: false
  },
  // Linux configuration
  linux: {
    target: [
      {
        target: 'AppImage',
        arch: ['x64', 'arm64']
      },
      {
        target: 'deb',
        arch: ['x64', 'arm64']
      },
      {
        target: 'rpm',
        arch: ['x64', 'arm64']
      },
      {
        target: 'snap',
        arch: ['x64', 'arm64']
      },
      {
        target: 'tar.gz',
        arch: ['x64', 'arm64']
      }
    ],
    icon: 'desktop/build/assets/icon.png',
    category: 'Office',
    synopsis: description,
    description: description,
    vendor: author,
    maintainer: author
  },
  deb: {
    priority: 'optional',
    depends: ['gconf2', 'gconf-service', 'libnotify4', 'libappindicator1', 'libxtst6', 'libnss3'],
    recommends: ['pulseaudio | libasound2']
  },
  rpm: {
    depends: ['libnotify', 'libappindicator', 'libxtst', 'nss'],
    fpm: ['--rpm-rpmbuild-define', '_build_id_links none']
  },
  snap: {
    grade: 'stable',
    confinement: 'strict',
    plugs: ['default', 'home', 'network', 'network-bind', 'removable-media']
  },
  // Compression and optimization
  compression: 'maximum',
  removePackageScripts: true,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,
  // Notarization (macOS)
  afterSign: 'desktop/build/scripts/notarize.js',
  // Build hooks
  beforeBuild: 'desktop/build/scripts/before-build.js',
  afterPack: 'desktop/build/scripts/after-pack.js'
};
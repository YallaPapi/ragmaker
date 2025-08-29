/**
 * Electron Builder Configuration for RagMaker Desktop Standalone
 * Comprehensive packaging solution with embedded databases, models, and auto-update
 */

const { platform } = require('os');
const path = require('path');

module.exports = {
  appId: "com.ragmaker.standalone",
  productName: "RagMaker Standalone",
  copyright: "Copyright © 2025 RagMaker Team",
  electronVersion: "28.0.0",
  
  directories: {
    output: "dist",
    buildResources: "build-resources",
    app: "../desktop"
  },

  // Files to include in the app package
  files: [
    "src/**/*",
    "renderer/**/*",
    "assets/**/*",
    "node_modules/**/*",
    "package.json",
    "!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}",
    "!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}",
    "!**/node_modules/*.d.ts",
    "!**/node_modules/.bin",
    "!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}",
    "!.editorconfig",
    "!**/._*",
    "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}",
    "!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}",
    "!**/{appveyor.yml,.travis.yml,circle.yml}",
    "!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}"
  ],

  // Extra resources (embedded databases, models, etc.)
  extraResources: [
    {
      from: "../data",
      to: "data",
      filter: ["**/*"]
    },
    {
      from: "../src",
      to: "backend",
      filter: ["**/*"]
    },
    {
      from: "models",
      to: "models",
      filter: ["**/*"]
    },
    {
      from: "databases",
      to: "databases",
      filter: ["**/*"]
    }
  ],

  // macOS Configuration
  mac: {
    category: "public.app-category.productivity",
    target: [
      {
        target: "dmg",
        arch: ["x64", "arm64"]
      },
      {
        target: "zip",
        arch: ["x64", "arm64"]
      },
      {
        target: "pkg",
        arch: ["x64", "arm64"]
      }
    ],
    icon: "assets/icons/icon.icns",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "build-resources/entitlements.mac.plist",
    entitlementsInherit: "build-resources/entitlements.mac.plist",
    minimumSystemVersion: "10.14.0",
    extendInfo: {
      NSMicrophoneUsageDescription: "This app needs access to microphone for voice input features",
      NSCameraUsageDescription: "This app needs access to camera for document scanning",
      NSDocumentsFolderUsageDescription: "This app needs access to documents for indexing"
    },
    // Code signing configuration
    identity: process.env.APPLE_IDENTITY || null,
    provisioningProfile: process.env.APPLE_PROVISIONING_PROFILE || null
  },

  // Windows Configuration
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64", "ia32"]
      },
      {
        target: "portable",
        arch: ["x64"]
      },
      {
        target: "appx",
        arch: ["x64"]
      },
      {
        target: "msi",
        arch: ["x64"]
      }
    ],
    icon: "assets/icons/icon.ico",
    publisherName: "RagMaker Team",
    verifyUpdateCodeSignature: false,
    certificateFile: process.env.WIN_CSC_LINK || null,
    certificatePassword: process.env.WIN_CSC_KEY_PASSWORD || null,
    signingHashAlgorithms: ["sha256"],
    signAndEditExecutable: true,
    signDlls: true
  },

  // Linux Configuration
  linux: {
    target: [
      {
        target: "AppImage",
        arch: ["x64"]
      },
      {
        target: "deb",
        arch: ["x64"]
      },
      {
        target: "rpm",
        arch: ["x64"]
      },
      {
        target: "snap",
        arch: ["x64"]
      },
      {
        target: "tar.gz",
        arch: ["x64"]
      }
    ],
    icon: "assets/icons/",
    category: "Office",
    desktop: {
      Name: "RagMaker Standalone",
      Comment: "Advanced RAG system with document indexing",
      Keywords: "RAG;AI;Documents;Search;Knowledge;"
    },
    maintainer: "ragmaker-team@example.com",
    vendor: "RagMaker Team",
    synopsis: "Advanced RAG system for document indexing and search"
  },

  // NSIS Installer Configuration (Windows)
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    installerIcon: "assets/icons/icon.ico",
    uninstallerIcon: "assets/icons/icon.ico",
    installerHeaderIcon: "assets/icons/icon.ico",
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "RagMaker Standalone",
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
    include: "build-resources/installer.nsh",
    script: "build-resources/installer.nsh",
    warningsAsErrors: false,
    displayLanguageSelector: true,
    multiLanguageInstaller: true,
    packElevateHelper: true,
    requestExecutionLevel: "asInvoker",
    menuCategory: false,
    artifactName: "${productName}-Setup-${version}-${arch}.${ext}"
  },

  // DMG Configuration (macOS)
  dmg: {
    title: "${productName} ${version}",
    icon: "assets/icons/icon.icns",
    iconSize: 100,
    window: {
      width: 600,
      height: 400
    },
    contents: [
      {
        x: 150,
        y: 220,
        type: "file"
      },
      {
        x: 450,
        y: 220,
        type: "link",
        path: "/Applications"
      }
    ],
    backgroundColor: "#ffffff",
    format: "ULFO"
  },

  // AppX Configuration (Windows Store)
  appx: {
    applicationId: "RagMakerStandalone",
    displayName: "RagMaker Standalone",
    publisherDisplayName: "RagMaker Team",
    identityName: "RagMaker.Standalone",
    publisher: "CN=RagMaker Team",
    backgroundColor: "transparent",
    showNameOnTiles: true,
    languages: ["en-US", "es", "fr", "de", "it", "pt", "ru", "zh-CN", "ja"]
  },

  // Snap Configuration (Linux)
  snap: {
    grade: "stable",
    confinement: "strict",
    plugs: [
      "default",
      "home",
      "removable-media",
      "network",
      "network-bind",
      "desktop",
      "desktop-legacy",
      "wayland",
      "x11",
      "unity7",
      "browser-support",
      "gsettings",
      "pulseaudio",
      "audio-playback",
      "audio-record"
    ],
    summary: "Advanced RAG system for document indexing and search",
    description: "RagMaker Standalone is a comprehensive RAG (Retrieval-Augmented Generation) system that enables advanced document indexing, search, and AI-powered knowledge retrieval."
  },

  // Auto-updater configuration
  publish: [
    {
      provider: "github",
      owner: "ragmaker",
      repo: "ragmaker-standalone",
      private: false,
      releaseType: "release",
      publishAutoUpdate: true
    },
    {
      provider: "s3",
      bucket: process.env.S3_BUCKET || "ragmaker-releases",
      region: process.env.S3_REGION || "us-east-1",
      acl: "public-read",
      storageClass: "STANDARD"
    },
    {
      provider: "generic",
      url: process.env.GENERIC_SERVER_URL || "https://releases.ragmaker.com/"
    }
  ],

  // Compression and optimization
  compression: "maximum",
  removePackageScripts: true,
  removePackageKeywords: true,
  
  // Platform-specific artifact naming
  artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
  
  // Build hooks
  beforeBuild: async (context) => {
    console.log('Before build hook executed');
    // Add custom pre-build logic here
  },
  
  afterPack: async (context) => {
    console.log('After pack hook executed');
    // Add custom post-pack logic here
  },
  
  afterSign: "build-resources/notarize.js",
  
  // Portable configuration
  portable: {
    artifactName: "${productName}-${version}-portable.${ext}"
  },

  // MSI Configuration
  msi: {
    oneClick: false,
    perMachine: false,
    runAfterFinish: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    menuCategory: "RagMaker",
    shortcutName: "RagMaker Standalone",
    upgradeCode: "{12345678-1234-1234-1234-123456789012}"
  },

  // Debian package configuration
  deb: {
    priority: "optional",
    depends: [
      "libnss3",
      "libxss1",
      "libgconf-2-4",
      "libxtst6",
      "libxrandr2",
      "libasound2",
      "libpangocairo-1.0-0",
      "libatk1.0-0",
      "libcairo-gobject2",
      "libgtk-3-0",
      "libgdk-pixbuf2.0-0"
    ],
    recommends: [
      "sqlite3",
      "python3"
    ]
  },

  // RPM package configuration
  rpm: {
    fpm: [
      "--rpm-summary", "Advanced RAG system for document indexing",
      "--rpm-description", "RagMaker Standalone provides comprehensive document indexing and AI-powered search capabilities"
    ],
    depends: [
      "nss",
      "libXScrnSaver",
      "GConf2",
      "libXtst",
      "libXrandr",
      "alsa-lib",
      "pango",
      "atk",
      "cairo-gobject",
      "gtk3",
      "gdk-pixbuf2"
    ]
  }
};

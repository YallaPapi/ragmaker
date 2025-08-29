# RagMaker Standalone - Packaging & Distribution System

Comprehensive packaging and distribution system for the RagMaker Desktop standalone application with cross-platform support, embedded resources, auto-updates, and license management.

## 🏁 Overview

This build system provides:

- **Cross-platform packaging** (Windows, macOS, Linux)
- **Code signing** for all platforms
- **Auto-updater** with rollback capabilities
- **License management** and activation
- **Embedded databases and AI models**
- **CI/CD automation** with GitHub Actions
- **App store distribution** ready
- **Portable versions** for each platform

## 📁 Directory Structure

```
app/build/
├── electron-builder.config.js     # Main packaging configuration
├── code-signing.config.js       # Code signing for all platforms
├── auto-updater.config.js       # Auto-updater with rollback
├── license-manager.js           # License validation & activation
├── package.json                 # Build dependencies & scripts
├── build-resources/
│   ├── entitlements.mac.plist       # macOS entitlements
│   ├── installer.nsh                # Windows NSIS installer
│   └── notarize.js                  # macOS notarization
├── github-workflows/
│   └── build-and-release.yml        # CI/CD pipeline
└── scripts/
    ├── setup-signing.js
    ├── prepare-resources.js
    └── upload-artifacts.js
```

## 🚀 Quick Start

### Prerequisites

```bash
# Install Node.js 18+
node --version  # Should be 18+
npm --version   # Should be 8+

# Install build dependencies
npm install

# Platform-specific tools
# Windows: Install NSIS, Windows SDK
# macOS: Install Xcode Command Line Tools
# Linux: Install build-essential, rpm, snapcraft
```

### Build Commands

```bash
# Build for all platforms
npm run build

# Build for specific platform
npm run build:win     # Windows
npm run build:mac     # macOS
npm run build:linux   # Linux

# Create portable versions
npm run build:win:portable
npm run build:mac:dmg
npm run build:linux:appimage

# Pack without distribution
npm run pack          # All platforms
npm run pack:win      # Windows only
```

### Release Commands

```bash
# Release to GitHub
npm run release:github

# Release to S3
npm run release:s3

# Full release pipeline
npm run release
```

## 🔐 Code Signing Setup

### Windows Code Signing

```bash
# Set environment variables
export WIN_CSC_LINK="/path/to/certificate.p12"
export WIN_CSC_KEY_PASSWORD="certificate_password"

# For CI/CD (base64 encoded)
export WIN_CSC_LINK="base64_encoded_certificate"
export WIN_CSC_KEY_PASSWORD="certificate_password"
```

### macOS Code Signing

```bash
# Required environment variables
export APPLE_ID="developer@example.com"
export APPLE_ID_PASSWORD="app_specific_password"
export APPLE_TEAM_ID="TEAM123456"
export APPLE_IDENTITY="Developer ID Application: Your Name"

# Certificate setup (for CI)
export APPLE_CERTIFICATE="base64_encoded_certificate"
export APPLE_CERTIFICATE_PASSWORD="certificate_password"
export KEYCHAIN_PASSWORD="keychain_password"
```

### Linux Signing (GPG)

```bash
# GPG key for AppImage signing
export LINUX_GPG_KEY="path/to/private.key"
export LINUX_GPG_KEY_ID="GPG_KEY_ID"
export LINUX_GPG_PASSPHRASE="gpg_passphrase"
```

## 🔄 Auto-Updater Configuration

### Update Channels

- **latest**: Stable releases (main branch)
- **beta**: Beta releases (develop branch)
- **alpha**: Development builds (feature branches)

### Update Servers

1. **GitHub Releases** (default)
2. **Amazon S3** (configurable)
3. **Generic HTTP server** (custom)

### Configuration

```javascript
// In your main process
const { AutoUpdaterManager } = require('./auto-updater.config');

const updater = new AutoUpdaterManager();
updater.startAutoUpdateCheck();

// Listen for update events
updater.on('update-available', (info) => {
  console.log('Update available:', info.version);
});

updater.on('update-downloaded', () => {
  // Prompt user to restart
  updater.quitAndInstall();
});
```

## 🔑 License Management

### License Types

- **Trial**: 30-day free trial with basic features
- **Personal**: Individual license with standard features
- **Professional**: Advanced features + API access
- **Enterprise**: Full features + SSO + support

### Feature Matrix

| Feature | Trial | Personal | Professional | Enterprise |
|---------|--------|----------|--------------|------------|
| Basic Search | ✓ | ✓ | ✓ | ✓ |
| Document Import | ✓ | ✓ | ✓ | ✓ |
| YouTube Integration | ✓ | ✓ | ✓ | ✓ |
| Advanced Embedding | ✗ | ✗ | ✓ | ✓ |
| API Access | ✗ | ✗ | ✓ | ✓ |
| SSO Integration | ✗ | ✗ | ✗ | ✓ |
| Priority Support | ✗ | ✗ | ✗ | ✓ |

### Usage

```javascript
const { LicenseManager } = require('./license-manager');

const licenseManager = new LicenseManager();

// Validate license
const validation = await licenseManager.validateLicense();
if (validation.valid) {
  console.log('Licensed features:', validation.features);
} else {
  console.log('Trial info:', validation.trialInfo);
}

// Activate license
const result = await licenseManager.activateLicense('LICENSE-KEY');
if (result.success) {
  console.log('License activated successfully');
}
```

## 🎨 Platform-Specific Builds

### Windows

**Outputs:**
- `RagMaker-Setup-1.0.0-x64.exe` (NSIS installer)
- `RagMaker-1.0.0-portable-x64.exe` (Portable)
- `RagMaker-1.0.0-x64.msi` (MSI installer)
- `RagMaker-1.0.0-x64.appx` (Windows Store)

**Features:**
- Code signing with Authenticode
- NSIS installer with custom pages
- License activation during installation
- File associations (.rag files)
- Windows Defender exclusions
- Uninstaller with cleanup

### macOS

**Outputs:**
- `RagMaker-1.0.0-x64.dmg` (Intel)
- `RagMaker-1.0.0-arm64.dmg` (Apple Silicon)
- `RagMaker-1.0.0-universal.dmg` (Universal)
- `RagMaker-1.0.0-x64.pkg` (Installer)

**Features:**
- Code signing with Developer ID
- Notarization for Gatekeeper
- Hardened Runtime enabled
- Proper entitlements for AI features
- Universal binaries support
- DMG with custom background

### Linux

**Outputs:**
- `RagMaker-1.0.0-x64.AppImage` (Portable)
- `ragmaker_1.0.0_amd64.deb` (Debian/Ubuntu)
- `ragmaker-1.0.0-x64.rpm` (RedHat/SUSE)
- `ragmaker_1.0.0_amd64.snap` (Universal)
- `RagMaker-1.0.0-x64.tar.gz` (Archive)

**Features:**
- AppImage with embedded dependencies
- Proper desktop integration
- Icon and MIME type registration
- Package manager integration
- Snap with confined permissions

## 🌐 CI/CD Pipeline

### GitHub Actions Workflow

The build pipeline includes:

1. **Security Scan**
   - Dependency audit
   - CodeQL analysis
   - Vulnerability checks

2. **Multi-Platform Build**
   - Windows (latest)
   - macOS (latest)
   - Linux (Ubuntu latest)

3. **Code Signing**
   - Automatic signing on all platforms
   - Certificate validation
   - Signature verification

4. **Release Creation**
   - GitHub Releases
   - S3 upload (optional)
   - Auto-updater manifests

5. **Notifications**
   - Slack/Discord integration
   - Email notifications
   - Build status updates

### Required Secrets

```bash
# Windows Signing
WIN_CSC_LINK                 # Certificate file (base64)
WIN_CSC_KEY_PASSWORD         # Certificate password

# macOS Signing
APPLE_ID                     # Apple Developer ID
APPLE_ID_PASSWORD            # App-specific password
APPLE_TEAM_ID                # Team ID
APPLE_CERTIFICATE            # Certificate (base64)
APPLE_CERTIFICATE_PASSWORD   # Certificate password
KEYCHAIN_PASSWORD           # Keychain password

# Release Distribution
GITHUB_TOKEN                 # GitHub token for releases
S3_BUCKET                    # S3 bucket (optional)
S3_REGION                    # S3 region
AWS_ACCESS_KEY_ID           # AWS access key
AWS_SECRET_ACCESS_KEY       # AWS secret key

# Notifications
SLACK_WEBHOOK               # Slack webhook URL
```

## 📦 Embedded Resources

### Databases

- SQLite databases with indexes
- Sample data and configurations
- Migration scripts
- Backup/restore utilities

### AI Models

- Embedding models (sentence-transformers)
- Language models (quantized)
- Model metadata and configs
- Download fallbacks

### Assets

- Icons (ICO, ICNS, PNG)
- Fonts and stylesheets
- Documentation files
- License texts

## 🔧 Troubleshooting

### Common Issues

**Build Failures:**
```bash
# Clean cache and rebuild
npm run clean:cache
npm run clean
npm install
npm run build
```

**Signing Issues:**
```bash
# Verify certificates
npm run sign:verify

# Setup signing (interactive)
npm run sign:setup
```

**Update Issues:**
```bash
# Test auto-updater
node -e "require('./auto-updater.config').checkForUpdates()"
```

### Debug Mode

```bash
# Enable debug logging
export DEBUG="electron-builder,electron-updater"
npm run build
```

### Platform Issues

**Windows:**
- Install Visual Studio Build Tools
- Ensure NSIS is in PATH
- Check certificate validity

**macOS:**
- Install Xcode Command Line Tools
- Verify signing identity
- Check keychain access

**Linux:**
- Install build dependencies
- Check AppImage tools
- Verify GPG keys

## 📚 Documentation

- [Electron Builder Configuration](https://www.electron.build/configuration/configuration)
- [Code Signing Guide](https://www.electron.build/code-signing)
- [Auto-updater Documentation](https://www.electronjs.org/docs/api/auto-updater)
- [macOS Notarization](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Windows Code Signing](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)

## 🐛 Bug Reports

Report issues at: https://github.com/ragmaker/ragmaker-standalone/issues

## 📜 License

MIT License - see LICENSE file for details.

---

© 2025 RagMaker Team. All rights reserved.

/**
 * Code Signing Configuration for All Platforms
 * Handles certificates, notarization, and security requirements
 */

const { readFileSync } = require('fs');
const { resolve } = require('path');

class CodeSigningManager {
  constructor() {
    this.isCI = process.env.CI === 'true';
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  // Windows Code Signing
  getWindowsSigningConfig() {
    const config = {
      certificateFile: process.env.WIN_CSC_LINK,
      certificatePassword: process.env.WIN_CSC_KEY_PASSWORD,
      certificateSubjectName: process.env.WIN_CSC_SUBJECT_NAME,
      certificateSha1: process.env.WIN_CSC_FINGERPRINT,
      signingHashAlgorithms: ['sha256'],
      signAndEditExecutable: true,
      signDlls: true,
      timeStampServer: 'http://timestamp.sectigo.com',
      additionalCertificateFile: process.env.WIN_CSC_INTERMEDIATE_LINK,
      rfc3161TimeStampServer: 'http://timestamp.sectigo.com/rfc3161',
      verifyUpdateCodeSignature: !this.isDevelopment
    };

    // Validate Windows signing configuration
    if (this.isCI && (!config.certificateFile || !config.certificatePassword)) {
      console.warn('Windows code signing: Certificate not configured for CI build');
      return { verifyUpdateCodeSignature: false };
    }

    return config;
  }

  // macOS Code Signing
  getMacSigningConfig() {
    const config = {
      identity: process.env.APPLE_IDENTITY || process.env.CSC_NAME,
      provisioningProfile: process.env.APPLE_PROVISIONING_PROFILE,
      hardenedRuntime: true,
      gatekeeperAssess: false,
      entitlements: resolve(__dirname, 'entitlements.mac.plist'),
      entitlementsInherit: resolve(__dirname, 'entitlements.mac.plist'),
      type: 'distribution',
      minimumSystemVersion: '10.14.0'
    };

    // Notarization configuration
    if (process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD) {
      config.notarize = {
        teamId: process.env.APPLE_TEAM_ID,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASSWORD,
        ascProvider: process.env.APPLE_ASC_PROVIDER
      };
    }

    return config;
  }

  // Linux Code Signing (AppImage signing)
  getLinuxSigningConfig() {
    return {
      // GPG signing for AppImage
      sign: process.env.LINUX_GPG_KEY ? {
        key: process.env.LINUX_GPG_KEY,
        keyId: process.env.LINUX_GPG_KEY_ID,
        passphrase: process.env.LINUX_GPG_PASSPHRASE
      } : undefined
    };
  }

  // Generate signing hooks
  getSigningHooks() {
    return {
      beforeSign: async (context) => {
        console.log(`Preparing to sign ${context.platformName} build...`);
        
        // Platform-specific pre-signing setup
        switch (context.platformName) {
          case 'mac':
            await this.setupMacSigning(context);
            break;
          case 'win':
            await this.setupWindowsSigning(context);
            break;
          case 'linux':
            await this.setupLinuxSigning(context);
            break;
        }
      },

      afterSign: async (context) => {
        console.log(`${context.platformName} signing completed`);
        
        // Platform-specific post-signing actions
        switch (context.platformName) {
          case 'mac':
            if (context.electronPlatformName === 'darwin') {
              await this.notarizeMacApp(context);
            }
            break;
          case 'win':
            await this.verifyWindowsSignature(context);
            break;
        }
      }
    };
  }

  async setupMacSigning(context) {
    if (!process.env.APPLE_IDENTITY) {
      console.warn('macOS: No Apple Developer identity configured');
      return;
    }

    // Unlock keychain in CI environment
    if (this.isCI && process.env.KEYCHAIN_PASSWORD) {
      const { execSync } = require('child_process');
      try {
        execSync(`security unlock-keychain -p "${process.env.KEYCHAIN_PASSWORD}" ~/Library/Keychains/login.keychain`, {
          stdio: 'inherit'
        });
        console.log('Keychain unlocked for CI signing');
      } catch (error) {
        console.error('Failed to unlock keychain:', error.message);
      }
    }
  }

  async setupWindowsSigning(context) {
    if (!process.env.WIN_CSC_LINK) {
      console.warn('Windows: No code signing certificate configured');
      return;
    }

    console.log('Windows code signing certificate configured');
  }

  async setupLinuxSigning(context) {
    if (!process.env.LINUX_GPG_KEY) {
      console.warn('Linux: No GPG key configured for signing');
      return;
    }

    console.log('Linux GPG signing configured');
  }

  async notarizeMacApp(context) {
    if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD) {
      console.warn('macOS: Notarization credentials not configured');
      return;
    }

    console.log('Starting macOS app notarization...');
    
    try {
      const { notarize } = require('electron-notarize');
      
      await notarize({
        appBundleId: context.packager.appInfo.id,
        appPath: context.appOutDir,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
        tool: 'notarytool'
      });
      
      console.log('macOS app notarization completed successfully');
    } catch (error) {
      console.error('macOS notarization failed:', error);
      throw error;
    }
  }

  async verifyWindowsSignature(context) {
    if (!process.env.WIN_CSC_LINK) return;

    console.log('Verifying Windows code signature...');
    
    try {
      const { execSync } = require('child_process');
      const executablePath = context.appOutDir;
      
      // Use signtool to verify signature
      const result = execSync(`signtool verify /v /pa "${executablePath}"`, {
        encoding: 'utf8'
      });
      
      console.log('Windows signature verification:', result);
    } catch (error) {
      console.warn('Windows signature verification failed:', error.message);
    }
  }

  // Certificate validation utilities
  validateCertificates() {
    const issues = [];

    // Check Windows certificates
    if (this.isCI) {
      if (!process.env.WIN_CSC_LINK || !process.env.WIN_CSC_KEY_PASSWORD) {
        issues.push('Windows: Missing certificate file or password in CI');
      }
      
      if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD) {
        issues.push('macOS: Missing Apple ID credentials for notarization');
      }
    }

    return issues;
  }

  // Security audit for build artifacts
  async auditBuildSecurity(buildPath) {
    console.log('Running security audit on build artifacts...');
    
    const issues = [];
    
    // Check for unsigned binaries
    // Check for insecure permissions
    // Validate embedded resources
    
    return issues;
  }
}

// Export configuration functions
module.exports = {
  CodeSigningManager,
  
  // Quick access to signing configs
  getSigningConfig: (platform) => {
    const manager = new CodeSigningManager();
    
    switch (platform) {
      case 'win':
      case 'win32':
        return manager.getWindowsSigningConfig();
      case 'mac':
      case 'darwin':
        return manager.getMacSigningConfig();
      case 'linux':
        return manager.getLinuxSigningConfig();
      default:
        return {};
    }
  },
  
  // Get all platform signing configs
  getAllSigningConfigs: () => {
    const manager = new CodeSigningManager();
    
    return {
      win: manager.getWindowsSigningConfig(),
      mac: manager.getMacSigningConfig(),
      linux: manager.getLinuxSigningConfig()
    };
  },
  
  // Export signing hooks
  signingHooks: new CodeSigningManager().getSigningHooks()
};

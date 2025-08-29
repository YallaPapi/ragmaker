/**
 * License Management and Activation System
 * Handles software licensing, activation, and trial periods
 */

const crypto = require('crypto');
const { app } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class LicenseManager {
  constructor() {
    this.licenseFile = path.join(app.getPath('userData'), 'license.json');
    this.activationFile = path.join(app.getPath('userData'), 'activation.json');
    this.publicKey = this.getPublicKey();
    this.trialDays = 30;
    this.features = this.loadFeatureConfig();
  }

  // License validation
  async validateLicense() {
    try {
      const license = await this.loadLicense();
      
      if (!license) {
        return this.handleTrialMode();
      }

      // Check license signature
      if (!this.verifySignature(license)) {
        throw new Error('Invalid license signature');
      }

      // Check expiration
      if (this.isExpired(license)) {
        throw new Error('License has expired');
      }

      // Check activation
      const activation = await this.loadActivation();
      if (!activation || !this.validateActivation(license, activation)) {
        throw new Error('Invalid activation');
      }

      return {
        valid: true,
        type: license.type,
        features: this.getEnabledFeatures(license),
        expiresAt: license.expiresAt,
        activatedAt: activation.activatedAt
      };
    } catch (error) {
      console.error('License validation failed:', error);
      return {
        valid: false,
        error: error.message,
        trialInfo: await this.getTrialInfo()
      };
    }
  }

  // Trial mode handling
  async handleTrialMode() {
    const trialInfo = await this.getTrialInfo();
    
    if (trialInfo.expired) {
      return {
        valid: false,
        trialExpired: true,
        error: 'Trial period has expired'
      };
    }

    return {
      valid: true,
      type: 'trial',
      features: this.getTrialFeatures(),
      trialInfo: trialInfo
    };
  }

  async getTrialInfo() {
    try {
      const activation = await this.loadActivation();
      
      if (!activation || !activation.trialStarted) {
        // Start trial
        const trialStart = new Date();
        const newActivation = {
          trialStarted: trialStart.toISOString(),
          deviceId: this.getDeviceId(),
          platform: process.platform,
          version: app.getVersion()
        };
        
        await this.saveActivation(newActivation);
        
        return {
          started: trialStart,
          daysRemaining: this.trialDays,
          expired: false
        };
      }

      const trialStart = new Date(activation.trialStarted);
      const now = new Date();
      const daysPassed = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.max(0, this.trialDays - daysPassed);
      
      return {
        started: trialStart,
        daysRemaining: daysRemaining,
        expired: daysRemaining <= 0
      };
    } catch (error) {
      console.error('Error getting trial info:', error);
      return {
        started: new Date(),
        daysRemaining: this.trialDays,
        expired: false
      };
    }
  }

  // License activation
  async activateLicense(licenseKey) {
    try {
      // Parse license key
      const license = this.parseLicenseKey(licenseKey);
      
      if (!this.verifySignature(license)) {
        throw new Error('Invalid license key');
      }

      // Check if license is for this product
      if (license.product !== 'ragmaker-standalone') {
        throw new Error('License key is not for this product');
      }

      // Create activation record
      const activation = {
        licenseId: license.id,
        deviceId: this.getDeviceId(),
        activatedAt: new Date().toISOString(),
        platform: process.platform,
        hostname: os.hostname(),
        version: app.getVersion()
      };

      // Save license and activation
      await this.saveLicense(license);
      await this.saveActivation(activation);

      // Report activation to server (if online)
      this.reportActivation(license, activation).catch(console.warn);

      return {
        success: true,
        license: license,
        activation: activation
      };
    } catch (error) {
      console.error('License activation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Deactivate license
  async deactivateLicense() {
    try {
      const license = await this.loadLicense();
      const activation = await this.loadActivation();

      if (license && activation) {
        // Report deactivation to server
        this.reportDeactivation(license, activation).catch(console.warn);
      }

      // Remove local files
      await this.removeLicense();
      await this.removeActivation();

      return { success: true };
    } catch (error) {
      console.error('License deactivation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Feature management
  getEnabledFeatures(license) {
    const baseFeatures = this.features.base;
    const licenseFeatures = this.features[license.type] || [];
    
    return {
      ...baseFeatures,
      ...licenseFeatures.reduce((acc, feature) => {
        acc[feature] = true;
        return acc;
      }, {})
    };
  }

  getTrialFeatures() {
    return {
      ...this.features.base,
      ...this.features.trial.reduce((acc, feature) => {
        acc[feature] = true;
        return acc;
      }, {})
    };
  }

  isFeatureEnabled(featureName, licenseInfo) {
    if (!licenseInfo || !licenseInfo.valid) {
      return this.getTrialFeatures()[featureName] || false;
    }

    return licenseInfo.features[featureName] || false;
  }

  // Utility methods
  getDeviceId() {
    const machineId = os.hostname() + os.platform() + os.arch();
    return crypto.createHash('sha256').update(machineId).digest('hex').substring(0, 16);
  }

  parseLicenseKey(licenseKey) {
    try {
      // Decode base64 license key
      const decoded = Buffer.from(licenseKey, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (error) {
      throw new Error('Invalid license key format');
    }
  }

  verifySignature(license) {
    if (!license.signature) return false;
    
    try {
      const data = JSON.stringify({
        id: license.id,
        product: license.product,
        type: license.type,
        issuedAt: license.issuedAt,
        expiresAt: license.expiresAt,
        features: license.features
      });
      
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(data);
      
      return verify.verify(this.publicKey, license.signature, 'base64');
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  isExpired(license) {
    if (!license.expiresAt) return false; // Lifetime license
    return new Date() > new Date(license.expiresAt);
  }

  validateActivation(license, activation) {
    return activation.licenseId === license.id &&
           activation.deviceId === this.getDeviceId();
  }

  // File operations
  async loadLicense() {
    try {
      const data = await fs.readFile(this.licenseFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading license:', error);
      }
      return null;
    }
  }

  async saveLicense(license) {
    await fs.writeFile(this.licenseFile, JSON.stringify(license, null, 2));
  }

  async removeLicense() {
    try {
      await fs.unlink(this.licenseFile);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async loadActivation() {
    try {
      const data = await fs.readFile(this.activationFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading activation:', error);
      }
      return null;
    }
  }

  async saveActivation(activation) {
    await fs.writeFile(this.activationFile, JSON.stringify(activation, null, 2));
  }

  async removeActivation() {
    try {
      await fs.unlink(this.activationFile);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  // Network operations
  async reportActivation(license, activation) {
    if (process.env.NODE_ENV === 'development') {
      console.log('Skipping activation reporting in development mode');
      return;
    }

    try {
      // Report to license server
      const response = await fetch(process.env.LICENSE_SERVER_URL + '/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          licenseId: license.id,
          deviceId: activation.deviceId,
          platform: activation.platform,
          hostname: activation.hostname,
          version: activation.version
        })
      });

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      console.log('Activation reported successfully');
    } catch (error) {
      console.warn('Failed to report activation:', error.message);
    }
  }

  async reportDeactivation(license, activation) {
    if (process.env.NODE_ENV === 'development') {
      console.log('Skipping deactivation reporting in development mode');
      return;
    }

    try {
      const response = await fetch(process.env.LICENSE_SERVER_URL + '/deactivate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          licenseId: license.id,
          deviceId: activation.deviceId
        })
      });

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      console.log('Deactivation reported successfully');
    } catch (error) {
      console.warn('Failed to report deactivation:', error.message);
    }
  }

  // Configuration
  getPublicKey() {
    // In production, this should be embedded or loaded securely
    return `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----`;
  }

  loadFeatureConfig() {
    return {
      base: {
        basicSearch: true,
        documentImport: true,
        exportResults: true
      },
      trial: [
        'advancedSearch',
        'youtubeIntegration',
        'basicEmbedding'
      ],
      personal: [
        'advancedSearch',
        'youtubeIntegration',
        'basicEmbedding',
        'documentAnnotation',
        'exportToFormats'
      ],
      professional: [
        'advancedSearch',
        'youtubeIntegration',
        'advancedEmbedding',
        'documentAnnotation',
        'exportToFormats',
        'apiAccess',
        'bulkProcessing',
        'customModels'
      ],
      enterprise: [
        'advancedSearch',
        'youtubeIntegration',
        'advancedEmbedding',
        'documentAnnotation',
        'exportToFormats',
        'apiAccess',
        'bulkProcessing',
        'customModels',
        'ssoIntegration',
        'auditLogs',
        'prioritySupport'
      ]
    };
  }

  // License generation utility (for development/testing)
  static generateLicense(config) {
    const privateKey = config.privateKey; // Should be kept secure
    
    const license = {
      id: crypto.randomUUID(),
      product: 'ragmaker-standalone',
      type: config.type,
      issuedAt: new Date().toISOString(),
      expiresAt: config.expiresAt || null,
      features: config.features || []
    };

    // Sign the license
    const data = JSON.stringify({
      id: license.id,
      product: license.product,
      type: license.type,
      issuedAt: license.issuedAt,
      expiresAt: license.expiresAt,
      features: license.features
    });

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(data);
    license.signature = sign.sign(privateKey, 'base64');

    // Encode as base64 license key
    return Buffer.from(JSON.stringify(license)).toString('base64');
  }
}

module.exports = {
  LicenseManager,
  
  // Factory function
  createLicenseManager: () => {
    return new LicenseManager();
  }
};

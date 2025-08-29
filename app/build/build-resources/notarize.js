/**
 * macOS Notarization Script
 * Handles code signing and notarization for macOS builds
 */

const { notarize } = require('electron-notarize');
const path = require('path');

exports.default = async function notarizeMacOS(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization for non-macOS platform');
    return;
  }

  // Check if running in CI or if credentials are available
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_ID_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  
  if (!appleId || !appleIdPassword) {
    console.log('Skipping notarization: APPLE_ID or APPLE_ID_PASSWORD not set');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const appBundleId = context.packager.appInfo.id;
  
  console.log(`Starting notarization for ${appName}...`);
  console.log(`App path: ${appPath}`);
  console.log(`Bundle ID: ${appBundleId}`);
  
  try {
    await notarize({
      appBundleId: appBundleId,
      appPath: appPath,
      appleId: appleId,
      appleIdPassword: appleIdPassword,
      teamId: teamId,
      tool: 'notarytool' // Use the newer notarytool instead of altool
    });
    
    console.log('\u2713 Notarization completed successfully!');
  } catch (error) {
    console.error('\u2717 Notarization failed:', error);
    
    // Don't fail the build in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: continuing despite notarization failure');
      return;
    }
    
    throw error;
  }
};

// Alternative notarization function using app-specific password
exports.notarizeWithAppPassword = async function(context) {
  const { electronPlatformName, appOutDir } = context;
  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD; // App-specific password
  const teamId = process.env.APPLE_TEAM_ID;
  
  if (!appleId || !appPassword) {
    console.log('Skipping notarization: credentials not available');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const appBundleId = context.packager.appInfo.id;
  
  console.log(`Starting notarization with app-specific password...`);
  
  try {
    await notarize({
      appBundleId: appBundleId,
      appPath: appPath,
      appleId: appleId,
      appleIdPassword: appPassword,
      teamId: teamId,
      tool: 'notarytool'
    });
    
    console.log('\u2713 Notarization with app-specific password completed!');
  } catch (error) {
    console.error('\u2717 Notarization with app-specific password failed:', error);
    throw error;
  }
};

// Keychain-based notarization (for local development)
exports.notarizeWithKeychain = async function(context) {
  const { electronPlatformName, appOutDir } = context;
  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // This uses credentials stored in the macOS Keychain
  const keychainProfile = process.env.APPLE_KEYCHAIN_PROFILE || 'ragmaker-notarize';
  
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const appBundleId = context.packager.appInfo.id;
  
  console.log(`Starting notarization with keychain profile: ${keychainProfile}`);
  
  try {
    await notarize({
      appBundleId: appBundleId,
      appPath: appPath,
      keychainProfile: keychainProfile,
      tool: 'notarytool'
    });
    
    console.log('\u2713 Keychain-based notarization completed!');
  } catch (error) {
    console.error('\u2717 Keychain-based notarization failed:', error);
    
    // Fall back to environment variable method
    console.log('Falling back to environment variable notarization...');
    return exports.default(context);
  }
};

// Utility function to check notarization status
exports.checkNotarizationStatus = async function(requestId) {
  const { execSync } = require('child_process');
  
  try {
    const result = execSync(
      `xcrun notarytool history --keychain-profile ragmaker-notarize --format json`,
      { encoding: 'utf8' }
    );
    
    const history = JSON.parse(result);
    const submission = history.find(item => item.id === requestId);
    
    if (submission) {
      console.log(`Notarization status for ${requestId}: ${submission.status}`);
      return submission;
    }
    
    console.log(`No submission found with ID: ${requestId}`);
    return null;
  } catch (error) {
    console.error('Failed to check notarization status:', error.message);
    return null;
  }
};

// Setup keychain profile for notarization
exports.setupKeychainProfile = function() {
  const { execSync } = require('child_process');
  
  const appleId = process.env.APPLE_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const appPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const profileName = process.env.APPLE_KEYCHAIN_PROFILE || 'ragmaker-notarize';
  
  if (!appleId || !teamId || !appPassword) {
    console.log('Missing credentials for keychain setup');
    return false;
  }
  
  try {
    console.log(`Setting up keychain profile: ${profileName}`);
    
    execSync(
      `xcrun notarytool store-credentials "${profileName}" ` +
      `--apple-id "${appleId}" ` +
      `--team-id "${teamId}" ` +
      `--password "${appPassword}"`,
      { stdio: 'inherit' }
    );
    
    console.log('\u2713 Keychain profile setup completed');
    return true;
  } catch (error) {
    console.error('\u2717 Failed to setup keychain profile:', error.message);
    return false;
  }
};

// Pre-flight checks
exports.checkNotarizationRequirements = function() {
  const issues = [];
  
  // Check for required tools
  try {
    require('child_process').execSync('xcrun notarytool --version', { stdio: 'ignore' });
  } catch (error) {
    issues.push('notarytool is not available (requires Xcode 13+)');
  }
  
  // Check for credentials
  const hasEnvCredentials = process.env.APPLE_ID && 
    (process.env.APPLE_ID_PASSWORD || process.env.APPLE_APP_SPECIFIC_PASSWORD);
  
  const hasKeychainProfile = process.env.APPLE_KEYCHAIN_PROFILE;
  
  if (!hasEnvCredentials && !hasKeychainProfile) {
    issues.push('No notarization credentials configured');
  }
  
  // Check for team ID
  if (!process.env.APPLE_TEAM_ID) {
    issues.push('APPLE_TEAM_ID environment variable not set');
  }
  
  if (issues.length > 0) {
    console.warn('Notarization requirement issues:');
    issues.forEach(issue => console.warn(`  - ${issue}`));
    return false;
  }
  
  console.log('\u2713 All notarization requirements met');
  return true;
};

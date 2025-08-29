const fs = require('fs-extra');
const path = require('path');

module.exports = async function(context) {
  console.log('Running pre-build tasks...');
  
  const { appDir, electronVersion, platform, arch } = context;
  const buildDir = path.join(appDir, 'desktop', 'build');
  
  try {
    // Ensure assets directory exists
    const assetsDir = path.join(buildDir, 'assets');
    await fs.ensureDir(assetsDir);
    
    // Copy platform-specific assets
    const platformAssetsDir = path.join(assetsDir, platform);
    if (await fs.pathExists(platformAssetsDir)) {
      console.log(`Copying ${platform}-specific assets...`);
      await fs.copy(platformAssetsDir, assetsDir);
    }
    
    // Minify renderer assets if in production
    if (process.env.NODE_ENV === 'production') {
      console.log('Optimizing renderer assets...');
      // Add asset optimization logic here
    }
    
    // Generate build info
    const buildInfo = {
      version: context.packager.appInfo.version,
      buildTime: new Date().toISOString(),
      platform,
      arch,
      electronVersion,
      nodeVersion: process.version
    };
    
    await fs.writeJSON(
      path.join(appDir, 'desktop', 'renderer', 'build-info.json'),
      buildInfo,
      { spaces: 2 }
    );
    
    console.log('Pre-build tasks completed successfully');
  } catch (error) {
    console.error('Pre-build task failed:', error);
    throw error;
  }
};
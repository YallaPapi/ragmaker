const fs = require('fs-extra');
const path = require('path');

module.exports = async function(context) {
  console.log('Running post-pack tasks...');
  
  const { appOutDir, packager, electronPlatformName } = context;
  
  try {
    // Platform-specific post-processing
    switch (electronPlatformName) {
      case 'win32':
        await processWindows(appOutDir, packager);
        break;
      case 'darwin':
        await processMacOS(appOutDir, packager);
        break;
      case 'linux':
        await processLinux(appOutDir, packager);
        break;
    }
    
    // Generate checksums
    await generateChecksums(appOutDir);
    
    console.log('Post-pack tasks completed successfully');
  } catch (error) {
    console.error('Post-pack task failed:', error);
    throw error;
  }
};

async function processWindows(appOutDir, packager) {
  console.log('Processing Windows build...');
  
  // Add Windows-specific post-processing
  const appName = packager.appInfo.productFilename;
  const exePath = path.join(appOutDir, `${appName}.exe`);
  
  if (await fs.pathExists(exePath)) {
    console.log('Windows executable found:', exePath);
    // Add any Windows-specific processing here
  }
}

async function processMacOS(appOutDir, packager) {
  console.log('Processing macOS build...');
  
  // Add macOS-specific post-processing
  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  
  if (await fs.pathExists(appPath)) {
    console.log('macOS app bundle found:', appPath);
    // Add any macOS-specific processing here
  }
}

async function processLinux(appOutDir, packager) {
  console.log('Processing Linux build...');
  
  // Add Linux-specific post-processing
  const appName = packager.appInfo.productFilename;
  const executablePath = path.join(appOutDir, appName.toLowerCase());
  
  if (await fs.pathExists(executablePath)) {
    console.log('Linux executable found:', executablePath);
    // Add any Linux-specific processing here
  }
}

async function generateChecksums(appOutDir) {
  const crypto = require('crypto');
  
  console.log('Generating checksums...');
  
  const files = await fs.readdir(appOutDir);
  const checksums = {};
  
  for (const file of files) {
    const filePath = path.join(appOutDir, file);
    const stat = await fs.stat(filePath);
    
    if (stat.isFile()) {
      const fileBuffer = await fs.readFile(filePath);
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      checksums[file] = {
        sha256: hashSum.digest('hex'),
        size: stat.size
      };
    }
  }
  
  await fs.writeJSON(
    path.join(appOutDir, 'checksums.json'),
    checksums,
    { spaces: 2 }
  );
}
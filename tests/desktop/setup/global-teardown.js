const path = require('path');
const fs = require('fs').promises;

async function globalTeardown() {
  console.log('Cleaning up Electron testing environment...');
  
  try {
    // Clean up test data directory
    const testDataDir = path.join(__dirname, '../../../data/test');
    
    if (await directoryExists(testDataDir)) {
      await fs.rmdir(testDataDir, { recursive: true });
      console.log(`Cleaned up test data directory: ${testDataDir}`);
    }
    
    // Clean up test artifacts
    const testArtifactsDir = path.join(__dirname, '../test-results');
    if (await directoryExists(testArtifactsDir)) {
      // Keep test results for CI/CD but clean old ones
      console.log(`Test results preserved in: ${testArtifactsDir}`);
    }
    
    // Clean up screenshot artifacts older than 24 hours
    await cleanupOldScreenshots();
    
    // Clean up video recordings older than 24 hours
    await cleanupOldVideos();
    
    // Clean up trace files older than 24 hours
    await cleanupOldTraces();
    
    // Reset environment variables
    delete process.env.TEST_DATA_DIR;
    
    console.log('Global teardown completed successfully');
    
  } catch (error) {
    console.error('Error during global teardown:', error);
    // Don't throw error in teardown to avoid masking test failures
  }
}

async function directoryExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function cleanupOldScreenshots() {
  const screenshotsDir = path.join(__dirname, '../test-results');
  
  try {
    if (!(await directoryExists(screenshotsDir))) {
      return;
    }
    
    const files = await fs.readdir(screenshotsDir);
    const screenshotFiles = files.filter(file => 
      file.endsWith('.png') || file.endsWith('.jpg')
    );
    
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    for (const file of screenshotFiles) {
      const filePath = path.join(screenshotsDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.mtime.getTime() < oneDayAgo) {
        await fs.unlink(filePath);
        console.log(`Cleaned up old screenshot: ${file}`);
      }
    }
    
  } catch (error) {
    console.log('Error cleaning up screenshots:', error.message);
  }
}

async function cleanupOldVideos() {
  const videosDir = path.join(__dirname, '../test-results');
  
  try {
    if (!(await directoryExists(videosDir))) {
      return;
    }
    
    const files = await fs.readdir(videosDir);
    const videoFiles = files.filter(file => 
      file.endsWith('.webm') || file.endsWith('.mp4')
    );
    
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    for (const file of videoFiles) {
      const filePath = path.join(videosDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.mtime.getTime() < oneDayAgo) {
        await fs.unlink(filePath);
        console.log(`Cleaned up old video: ${file}`);
      }
    }
    
  } catch (error) {
    console.log('Error cleaning up videos:', error.message);
  }
}

async function cleanupOldTraces() {
  const tracesDir = path.join(__dirname, '../test-results');
  
  try {
    if (!(await directoryExists(tracesDir))) {
      return;
    }
    
    const files = await fs.readdir(tracesDir);
    const traceFiles = files.filter(file => 
      file.endsWith('.zip') && file.includes('trace')
    );
    
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    for (const file of traceFiles) {
      const filePath = path.join(tracesDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.mtime.getTime() < oneDayAgo) {
        await fs.unlink(filePath);
        console.log(`Cleaned up old trace: ${file}`);
      }
    }
    
  } catch (error) {
    console.log('Error cleaning up traces:', error.message);
  }
}

module.exports = globalTeardown;
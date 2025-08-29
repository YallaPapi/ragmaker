const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Simple manual packaging script
async function packageApp() {
    console.log('📦 Packaging Simple RAGMaker...');
    
    // Create dist directory
    const distDir = path.join(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir);
    }
    
    // Copy necessary files to dist
    const filesToCopy = [
        'main.js',
        'package.json',
        'src'
    ];
    
    console.log('📁 Copying files...');
    filesToCopy.forEach(file => {
        const sourcePath = path.join(__dirname, file);
        const destPath = path.join(distDir, file);
        
        if (fs.lstatSync(sourcePath).isDirectory()) {
            copyDir(sourcePath, destPath);
        } else {
            fs.copyFileSync(sourcePath, destPath);
        }
        console.log(`✅ Copied ${file}`);
    });
    
    // Create a run script
    const runScript = `@echo off
echo Starting Simple RAGMaker...
cd /d "%~dp0"
if exist "node_modules" (
    echo Using local Electron...
    npx electron . --no-sandbox
) else (
    echo Please run: npm install
    pause
)`;
    
    fs.writeFileSync(path.join(distDir, 'run.bat'), runScript);
    console.log('✅ Created run.bat script');
    
    // Create package.json for the dist
    const distPackageJson = {
        "name": "simple-ragmaker-dist",
        "version": "1.0.0",
        "main": "main.js",
        "scripts": {
            "start": "electron . --no-sandbox"
        }
    };
    
    fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(distPackageJson, null, 2));
    console.log('✅ Created distribution package.json');
    
    console.log(`
🎉 Simple RAGMaker packaged successfully!

📂 Distribution files are in: ${distDir}

🚀 To run the application:
   1. Navigate to: ${distDir}
   2. Run: npm install
   3. Double-click: run.bat
   
   OR
   
   1. Open terminal in dist folder
   2. Run: npm start

✨ The application window will appear and be fully functional!
`);
}

function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    files.forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        
        if (fs.lstatSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}

// Run the packaging
packageApp().catch(console.error);
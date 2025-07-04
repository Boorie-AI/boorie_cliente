const fs = require('fs');
const path = require('path');

const distElectronPath = path.join(__dirname, '..', 'dist', 'electron');
const electronSubPath = path.join(distElectronPath, 'electron');

// Function to move directory recursively
function moveDirectory(src, dest) {
  if (fs.existsSync(src)) {
    // Create destination directory if it doesn't exist
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    // Read contents of source directory
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    entries.forEach(entry => {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        moveDirectory(srcPath, destPath);
      } else {
        fs.renameSync(srcPath, destPath);
      }
    });
    
    // Remove source directory
    fs.rmSync(src, { recursive: true, force: true });
    return true;
  }
  return false;
}

// Check if the electron subdirectory exists
if (fs.existsSync(electronSubPath)) {
  // Move files from electron subdirectory to dist/electron
  const files = ['main.js', 'preload.js'];
  
  files.forEach(file => {
    const srcPath = path.join(electronSubPath, file);
    const destPath = path.join(distElectronPath, file);
    
    if (fs.existsSync(srcPath)) {
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      fs.renameSync(srcPath, destPath);
      console.log(`Moved ${file}`);
    }
  });
  
  // Move handlers directory
  const handlersSrcPath = path.join(electronSubPath, 'handlers');
  const handlersDestPath = path.join(distElectronPath, 'handlers');
  
  if (fs.existsSync(handlersSrcPath)) {
    // Remove existing handlers directory if it exists
    if (fs.existsSync(handlersDestPath)) {
      fs.rmSync(handlersDestPath, { recursive: true, force: true });
    }
    fs.renameSync(handlersSrcPath, handlersDestPath);
    console.log('Moved handlers directory');
  }
  
  // Move backend directory
  const backendSrcPath = path.join(electronSubPath, 'backend');
  const backendDestPath = path.join(distElectronPath, 'backend');
  
  if (fs.existsSync(backendSrcPath)) {
    // Remove existing backend directory if it exists
    if (fs.existsSync(backendDestPath)) {
      fs.rmSync(backendDestPath, { recursive: true, force: true });
    }
    fs.renameSync(backendSrcPath, backendDestPath);
    console.log('Moved backend directory');
  }
  
  // Remove the empty electron subdirectory
  fs.rmSync(electronSubPath, { recursive: true, force: true });
  console.log('Cleaned up electron subdirectory');
}

// Fix import paths in compiled files
const mainJsPath = path.join(distElectronPath, 'main.js');
if (fs.existsSync(mainJsPath)) {
  let mainContent = fs.readFileSync(mainJsPath, 'utf8');
  
  // Replace relative backend paths with local paths
  mainContent = mainContent.replace(/require\("\.\.\/backend\//g, 'require("./backend/');
  mainContent = mainContent.replace(/require\("\.\.\\backend\\/g, 'require("./backend/');
  
  fs.writeFileSync(mainJsPath, mainContent);
  console.log('Fixed import paths in main.js');
}

// Fix import paths in handlers
const handlersPath = path.join(distElectronPath, 'handlers');
if (fs.existsSync(handlersPath)) {
  const handlerFiles = fs.readdirSync(handlersPath).filter(file => file.endsWith('.js'));
  
  handlerFiles.forEach(file => {
    const filePath = path.join(handlersPath, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace relative backend paths with correct paths
    content = content.replace(/require\("\.\.\/\.\.\/backend\//g, 'require("../backend/');
    content = content.replace(/require\("\.\.\\\.\.\\backend\\/g, 'require("../backend/');
    
    fs.writeFileSync(filePath, content);
  });
  
  console.log('Fixed import paths in handler files');
}

console.log('Electron build files organized successfully');
const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing import paths...');

function fixImportPaths(filePath) {
  if (!fs.existsSync(filePath) || !filePath.endsWith('.js')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Fix imports from electron handlers to backend services
  if (filePath.includes('dist/electron/handlers/')) {
    // Fix paths that have three levels up (../../../backend/) to one level up (../backend/)
    content = content.replace(/require\("\.\.\/\.\.\/\.\.\/backend\//g, 'require("../backend/');
    content = content.replace(/require\('\.\.\/\.\.\/\.\.\/backend\//g, "require('../backend/");
    // Fix paths that have two levels up (../../backend/) to one level up (../backend/)
    content = content.replace(/require\("\.\.\/\.\.\/backend\//g, 'require("../backend/');
    content = content.replace(/require\('\.\.\/\.\.\/backend\//g, "require('../backend/");
    modified = true;
  }
  
  // Fix imports from electron services to backend
  if (filePath.includes('dist/electron/services/')) {
    // For services/security/* and services/auth/* files, paths need to go up two levels to reach backend
    if (filePath.includes('dist/electron/services/security/') || filePath.includes('dist/electron/services/auth/')) {
      content = content.replace(/require\("\.\.\/\.\.\/\.\.\/backend\//g, 'require("../../backend/');
      content = content.replace(/require\('\.\.\/\.\.\/\.\.\/backend\//g, "require('../../backend/");
      // Also handle incorrect single-level paths
      content = content.replace(/require\("\.\.\/backend\//g, 'require("../../backend/');
      content = content.replace(/require\('\.\.\/backend\//g, "require('../../backend/");
    } else {
      content = content.replace(/require\("\.\.\/\.\.\/\.\.\/backend\//g, 'require("../../../backend/');
      content = content.replace(/require\('\.\.\/\.\.\/\.\.\/backend\//g, "require('../../../backend/");
      content = content.replace(/require\("\.\.\/\.\.\/\.\.\/\.\.\/backend\//g, 'require("../../../../backend/');
      content = content.replace(/require\('\.\.\/\.\.\/\.\.\/\.\.\/backend\//g, "require('../../../../backend/");
    }
    modified = true;
  }
  
  // Fix imports in main.js
  if (filePath.endsWith('main.js') && filePath.includes('dist/electron/')) {
    content = content.replace(/require\("\.\.\/backend\//g, 'require("../backend/');
    content = content.replace(/require\('\.\.\/backend\//g, "require('../backend/");
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Fixed imports in ${path.basename(filePath)}`);
  }
}

function processDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  
  const files = fs.readdirSync(dirPath);
  
  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (file.endsWith('.js')) {
      fixImportPaths(fullPath);
    }
  });
}

// Process electron directory
processDirectory('dist/electron');

console.log('✨ Import paths fixed!');
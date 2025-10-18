#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('Fixing all import paths in dist/electron...');

function getCorrectBackendPath(filePath) {
  // Calculate how many levels up we need to go from the file to reach dist/electron
  const relativePath = path.relative('dist/electron', filePath);
  const depth = relativePath.split(path.sep).length - 1;
  
  // Special case for main.js at the root
  if (filePath === path.join('dist', 'electron', 'main.js')) {
    return './backend/';
  }
  
  // For all other files, use appropriate number of ../
  return '../'.repeat(depth) + 'backend/';
}

function fixImportsInFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Get the correct backend path for this file
  const correctPath = getCorrectBackendPath(filePath);
  
  // Replace all variations of backend imports with the correct path
  // Handle require("...backend/
  content = content.replace(/require\("[^"]*\/backend\//g, `require("${correctPath}`);
  // Handle require('...backend/
  content = content.replace(/require\('[^']*\/backend\//g, `require('${correctPath}`);
  
  // Also fix any imports that might be using 'from'
  content = content.replace(/from "[^"]*\/backend\//g, `from "${correctPath}`);
  content = content.replace(/from '[^']*\/backend\//g, `from '${correctPath}`);
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`  Fixed: ${path.relative('.', filePath)} -> ${correctPath}`);
  }
}

function processDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  
  const items = fs.readdirSync(dir);
  
  items.forEach(item => {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      processDirectory(itemPath);
    } else if (item.endsWith('.js')) {
      fixImportsInFile(itemPath);
    }
  });
}

// Process the entire dist/electron directory
processDirectory('dist/electron');

console.log('Import fix completed!');
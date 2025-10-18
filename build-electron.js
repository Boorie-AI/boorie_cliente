const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

console.log('🔨 Building Electron app...');

// Clean dist directory
console.log('📦 Cleaning dist directory...');
fs.removeSync('dist');

// Create necessary directories
console.log('📁 Creating directories...');
fs.ensureDirSync('dist/electron');
fs.ensureDirSync('dist/backend');

// Compile TypeScript files
console.log('🔧 Compiling TypeScript files...');

// 1. Compile electron files
try {
  execSync('npx tsc -p electron', { stdio: 'inherit' });
  console.log('✅ Electron files compiled');
} catch (error) {
  console.error('❌ Error compiling electron files:', error.message);
  process.exit(1);
}

// 2. Move compiled electron files to correct location
console.log('📋 Organizing electron files...');
if (fs.existsSync('dist/electron/electron')) {
  // Move files from nested electron directory
  fs.copySync('dist/electron/electron', 'dist/electron', { overwrite: true });
  fs.removeSync('dist/electron/electron');
}

// 3. Compile backend TypeScript files individually
console.log('🔧 Compiling backend services...');
const backendDirs = ['services', 'utils', 'models'];

backendDirs.forEach(dir => {
  const srcDir = path.join('backend', dir);
  const distDir = path.join('dist', 'backend', dir);
  
  if (fs.existsSync(srcDir)) {
    fs.ensureDirSync(distDir);
    
    // Copy JavaScript files
    const jsFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));
    jsFiles.forEach(file => {
      fs.copySync(path.join(srcDir, file), path.join(distDir, file));
    });
    
    console.log(`✅ Copied ${jsFiles.length} JS files from ${dir}`);
  }
});

// 4. Copy aiProviders subdirectory if it exists
const aiProvidersDir = 'backend/services/aiProviders';
if (fs.existsSync(aiProvidersDir)) {
  fs.ensureDirSync('dist/backend/services/aiProviders');
  const jsFiles = fs.readdirSync(aiProvidersDir).filter(f => f.endsWith('.js'));
  jsFiles.forEach(file => {
    fs.copySync(path.join(aiProvidersDir, file), path.join('dist/backend/services/aiProviders', file));
  });
}

// 5. Fix import paths in compiled files
console.log('🔗 Fixing import paths...');

function fixImportPaths(filePath) {
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  // Calculate the depth of the file relative to dist/electron
  const relativePath = path.relative('dist/electron', filePath);
  const depth = relativePath.split(path.sep).length - 1;
  
  // Fix imports based on file location
  if (filePath.includes('dist/electron/main.js')) {
    // main.js uses ./backend
    content = content.replace(/require\("\.\.\/backend\//g, 'require("./backend/');
    content = content.replace(/require\('\.\.\/backend\//g, "require('./backend/");
    changed = true;
  } else if (depth === 1) {
    // Files in immediate subdirectories use ../backend
    content = content.replace(/require\("\.\.\/\.\.\/backend\//g, 'require("../backend/');
    content = content.replace(/require\('\.\.\/\.\.\/backend\//g, "require('../backend/");
    changed = true;
  } else if (depth >= 2) {
    // Deeply nested files need more ../
    const backPath = '../'.repeat(depth) + 'backend/';
    // Replace any variation of backend paths
    content = content.replace(/require\("[\.\/]*backend\//g, `require("${backPath}`);
    content = content.replace(/require\('[\.\/]*backend\//g, `require('${backPath}`);
    content = content.replace(/require\("\.\.\/\.\.\/\.\.\/backend\//g, `require("${backPath}`);
    content = content.replace(/require\('\.\.\/\.\.\/\.\.\/backend\//g, `require('${backPath}`);
    changed = true;
  }
  
  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log(`  Fixed: ${path.relative('.', filePath)}`);
  }
}

// Function to recursively fix all JS files
function fixAllJsFiles(dir) {
  if (!fs.existsSync(dir)) return;
  
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      fixAllJsFiles(filePath);
    } else if (file.endsWith('.js')) {
      fixImportPaths(filePath);
    }
  });
}

// Fix all JS files in dist/electron
fixAllJsFiles('dist/electron');

// 6. Build frontend
console.log('🎨 Building frontend...');
try {
  execSync('npm run build:vite', { stdio: 'inherit' });
  console.log('✅ Frontend built successfully');
} catch (error) {
  console.error('❌ Error building frontend:', error.message);
}

console.log('✨ Build complete!');
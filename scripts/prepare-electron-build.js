const fs = require('fs');
const path = require('path');

// Copy main.js and preload.js to root
fs.copyFileSync('dist/electron/main.js', 'main.js');
fs.copyFileSync('dist/electron/preload.js', 'preload.js');

// Copy handlers directory
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy handlers and backend directories
if (fs.existsSync('dist/electron/handlers')) {
  copyDir('dist/electron/handlers', 'handlers');
}

if (fs.existsSync('dist/electron/backend')) {
  copyDir('dist/electron/backend', 'backend');
}

console.log('Electron build files prepared successfully');
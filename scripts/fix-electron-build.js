const fs = require('fs');
const path = require('path');

// Create a temporary build directory with the correct structure
const buildDir = path.join(__dirname, '..', 'electron-build-temp');

// Clean and create build directory
if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
fs.mkdirSync(buildDir, { recursive: true });

// Copy package.json with modified main
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
packageJson.main = 'main.js';
// Remove build config temporarily
const buildConfig = packageJson.build;
delete packageJson.build;
delete packageJson.scripts;
delete packageJson.devDependencies;

fs.writeFileSync(
  path.join(buildDir, 'package.json'),
  JSON.stringify(packageJson, null, 2)
);

// Copy main files
fs.copyFileSync(
  path.join(__dirname, '..', 'dist', 'electron', 'main.js'),
  path.join(buildDir, 'main.js')
);

fs.copyFileSync(
  path.join(__dirname, '..', 'dist', 'electron', 'preload.js'),
  path.join(buildDir, 'preload.js')
);

// Copy directories
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

// Copy handlers
copyDir(
  path.join(__dirname, '..', 'dist', 'electron', 'handlers'),
  path.join(buildDir, 'handlers')
);

// Copy backend
if (fs.existsSync(path.join(__dirname, '..', 'dist', 'electron', 'backend'))) {
  copyDir(
    path.join(__dirname, '..', 'dist', 'electron', 'backend'),
    path.join(buildDir, 'backend')
  );
}

// Copy dist (frontend)
copyDir(
  path.join(__dirname, '..', 'dist'),
  path.join(buildDir, 'dist')
);

// Install production dependencies
const { execSync } = require('child_process');
console.log('Installing production dependencies...');
execSync('npm install --production', {
  cwd: buildDir,
  stdio: 'inherit'
});

console.log('Build directory prepared at:', buildDir);
console.log('Now run: cd electron-build-temp && npx electron-builder --win');
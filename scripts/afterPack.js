const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  console.log('After pack: Setting up Prisma files...');
  
  const { appOutDir, packager } = context;
  const isWin = packager.platform.name === 'windows';
  const isMac = packager.platform.name === 'mac';
  
  try {
    // Copy Prisma generated files
    const prismaSourceDir = path.join(__dirname, '..', 'node_modules', '.prisma');
    const targetDir = isWin 
      ? path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', '.prisma')
      : path.join(appOutDir, 'Xavi9.app', 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', '.prisma');
    
    if (fs.existsSync(prismaSourceDir)) {
      console.log(`Copying Prisma files from ${prismaSourceDir} to ${targetDir}`);
      
      // Create target directory
      fs.mkdirSync(targetDir, { recursive: true });
      
      // Copy .prisma directory recursively
      copyDir(prismaSourceDir, targetDir);
      
      console.log('Prisma files copied successfully');
    } else {
      console.warn('Prisma source directory not found');
    }
    
  } catch (error) {
    console.error('Failed to copy Prisma files:', error);
    // Don't throw error to avoid breaking the build
  }
};

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
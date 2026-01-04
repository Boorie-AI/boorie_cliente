const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const copyFile = promisify(fs.copyFile);
const mkdir = promisify(fs.mkdir);

// Source root
const SRC_ROOT = path.resolve(__dirname, '..');
const DIST_ROOT = path.resolve(__dirname, '../dist');

// Files to copy relative to root
const FILES_TO_COPY = [
    'backend/services/hydraulic/hydraulicCalculator.py',
    'backend/services/hydraulic/wntrService.py',
    'backend/services/hydraulic/wntr_analysis_service.py',
    'backend/services/hydraulic/wntr_simulation_service.py'
];

async function copyAssets() {
    console.log('Copying assets to dist...');

    for (const file of FILES_TO_COPY) {
        const srcPath = path.join(SRC_ROOT, file);
        const destPath = path.join(DIST_ROOT, file);

        try {
            // Ensure destination directory exists
            await mkdir(path.dirname(destPath), { recursive: true });

            // Copy file
            await copyFile(srcPath, destPath);
            console.log(`Copied ${file} -> ${destPath}`);
        } catch (err) {
            console.error(`Error copying ${file}:`, err);
            process.exit(1);
        }
    }

    console.log('Assets copied successfully.');
}

copyAssets();

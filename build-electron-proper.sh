#!/bin/bash

echo "Building Electron with proper file structure..."

# Build TypeScript
npx tsc -p electron

# Check if build succeeded
if [ $? -ne 0 ]; then
    echo "TypeScript build failed"
    exit 1
fi

cd dist/electron

# Move electron files to root of dist/electron
if [ -d electron ]; then
    echo "Moving electron files..."
    mv electron/main.js . 2>/dev/null || true
    mv electron/preload.js . 2>/dev/null || true
    mv electron/handlers . 2>/dev/null || true
    mv electron/services . 2>/dev/null || true
    
    # Move backend if it exists inside electron folder
    if [ -d electron/backend ]; then
        echo "Moving backend from electron folder..."
        mv electron/backend .
    fi
    
    # Move src if it exists inside electron folder
    if [ -d electron/src ]; then
        echo "Moving src from electron folder..."
        mv electron/src .
    fi
    
    # Remove the now empty electron folder
    rm -rf electron/
fi

# List final structure for debugging
echo "Final structure in dist/electron:"
ls -la

# Copy backend services
echo "Copying backend services..."
if [ -d "../../backend/services" ]; then
    mkdir -p backend/services/hydraulic backend/utils backend/models
    cp ../../backend/services/*.js backend/services/ 2>/dev/null || true
    cp ../../backend/utils/*.js backend/utils/ 2>/dev/null || true
    cp ../../backend/models/*.js backend/models/ 2>/dev/null || true
    echo "Backend JS files copied to dist/electron/backend/"
fi

# Copy Python files
echo "Copying Python files..."
if [ -d "../../backend/services/hydraulic" ]; then
    cp ../../backend/services/hydraulic/*.py backend/services/hydraulic/ 2>/dev/null || true
    echo "Python files copied to dist/electron/backend/services/hydraulic/"
fi

# Fix import paths
cd ../..
echo "Fixing import paths..."
./fix-all-imports.sh

echo "Build completed!"
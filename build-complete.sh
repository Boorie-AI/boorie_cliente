#!/bin/bash

echo "🔨 Complete Build Script for Boorie"

# Clean
echo "🧹 Cleaning dist directory..."
rm -rf dist

# Build frontend
echo "📦 Building frontend..."
npm run build:vite

# Build electron
echo "⚡ Building Electron..."
npm run build:electron

# Compile additional TypeScript files
echo "🔧 Compiling additional services..."
cd electron
npx tsc services/auth/*.ts services/security/*.ts --outDir ../dist/electron --target es2020 --module commonjs --esModuleInterop --skipLibCheck
cd ..

# Reorganize compiled files
echo "📂 Organizing files..."
if [ -d "dist/electron/electron/services" ]; then
    cp -r dist/electron/electron/services/* dist/electron/services/ 2>/dev/null || true
    rm -rf dist/electron/electron
fi

# Copy backend JavaScript files
echo "📄 Copying backend services..."
mkdir -p dist/backend/services dist/backend/utils dist/backend/models
cp backend/services/*.js dist/backend/services/ 2>/dev/null || true
cp backend/utils/*.js dist/backend/utils/ 2>/dev/null || true
cp backend/models/*.js dist/backend/models/ 2>/dev/null || true

# Copy hydraulic services if they exist
if [ -d "backend/services/hydraulic" ]; then
    mkdir -p dist/backend/services/hydraulic
    cp backend/services/hydraulic/*.js dist/backend/services/hydraulic/ 2>/dev/null || true
    # Copy Python files too
    cp backend/services/hydraulic/*.py dist/backend/services/hydraulic/ 2>/dev/null || true
fi

# Copy backend files to electron directory as well
echo "📂 Copying backend to electron directory..."
mkdir -p dist/electron/backend/services/hydraulic dist/electron/backend/utils dist/electron/backend/models
cp -r backend/services/*.js dist/electron/backend/services/ 2>/dev/null || true
cp -r backend/utils/*.js dist/electron/backend/utils/ 2>/dev/null || true
cp -r backend/models/*.js dist/electron/backend/models/ 2>/dev/null || true
cp -r backend/services/hydraulic/* dist/electron/backend/services/hydraulic/ 2>/dev/null || true

# Fix imports
echo "🔗 Fixing import paths..."
node fix-imports.js

echo "✅ Build complete!"
echo "Run 'npm run dev' to start the application"
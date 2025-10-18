#!/bin/bash

echo "🚀 Starting Boorie Development Environment"

# Check if virtual environment exists
if [ -d "venv" ]; then
    echo "🐍 Using Python virtual environment..."
    export PYTHON_PATH="$(pwd)/venv/bin/python3"
else
    echo "⚠️  No virtual environment found. WNTR simulations may fail."
    echo "   Run ./setup-python-env.sh to create one."
fi

# Step 1: Clean and build everything
echo "📦 Building application..."
bash build-complete.sh

# Step 2: Compile auth and security services manually
echo "🔐 Compiling auth and security services..."
cd electron
mkdir -p ../dist/electron/services/auth ../dist/electron/services/security

# Compile auth services
for file in services/auth/*.ts; do
    if [ -f "$file" ]; then
        npx tsc "$file" --outDir ../dist/electron --target es2020 --module commonjs --esModuleInterop --skipLibCheck
    fi
done

# Compile security services
for file in services/security/*.ts; do
    if [ -f "$file" ]; then
        npx tsc "$file" --outDir ../dist/electron --target es2020 --module commonjs --esModuleInterop --skipLibCheck
    fi
done

cd ..

# Step 3: Fix nested structure
echo "📂 Fixing file structure..."
if [ -d "dist/electron/electron" ]; then
    cp -r dist/electron/electron/* dist/electron/ 2>/dev/null || true
    rm -rf dist/electron/electron
fi

# Step 4: Apply development fixes
echo "🔧 Applying development fixes..."
node fix-imports.js
node fix-electron-dev.js

# Step 5: Start the application
echo "✨ Starting application..."
npm run dev
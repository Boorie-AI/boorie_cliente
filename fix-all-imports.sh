#!/bin/bash

echo "Fixing all import paths in dist/electron..."

# Fix main.js imports
echo "Fixing main.js..."
sed -i '' 's|require("../backend/|require("./backend/|g' dist/electron/main.js
sed -i '' 's|require('\''../backend/|require('\''./backend/|g' dist/electron/main.js

# Fix all handler files
echo "Fixing handler files..."
find dist/electron/handlers -name "*.js" -type f -exec sed -i '' 's|require("../../backend/|require("../backend/|g' {} \;
find dist/electron/handlers -name "*.js" -type f -exec sed -i '' 's|require('\''../../backend/|require('\''../backend/|g' {} \;

# Fix all service files (but not in subdirectories)
echo "Fixing service files..."
find dist/electron/services -maxdepth 1 -name "*.js" -type f -exec sed -i '' 's|require("../../backend/|require("../backend/|g' {} \;
find dist/electron/services -maxdepth 1 -name "*.js" -type f -exec sed -i '' 's|require('\''../../backend/|require('\''../backend/|g' {} \;

# Fix backend files that might have wrong paths
echo "Fixing backend files..."
find dist/electron/backend -name "*.js" -type f -exec sed -i '' 's|require("../../../backend/|require("../../backend/|g' {} \;
find dist/electron/backend -name "*.js" -type f -exec sed -i '' 's|require('\''../../../backend/|require('\''../../backend/|g' {} \;

# Fix nested service files in security folder
echo "Fixing nested service files..."
find dist/electron/services/security -name "*.js" -type f -exec sed -i '' 's|require("../backend/|require("../../backend/|g' {} \;
find dist/electron/services/security -name "*.js" -type f -exec sed -i '' 's|require('\''../backend/|require('\''../../backend/|g' {} \;

# Fix nested service files in auth folder
echo "Fixing auth service files..."
find dist/electron/services/auth -name "*.js" -type f -exec sed -i '' 's|require("../backend/|require("../../backend/|g' {} \;
find dist/electron/services/auth -name "*.js" -type f -exec sed -i '' 's|require('\''../backend/|require('\''../../backend/|g' {} \;

# Fix any other deeply nested files
echo "Fixing all deeply nested files..."
find dist/electron -name "*.js" -type f -exec grep -l "../../../backend" {} \; | xargs -I {} sed -i '' 's|require("../../../backend/|require("../../backend/|g' {}
find dist/electron -name "*.js" -type f -exec grep -l "'../../../backend" {} \; | xargs -I {} sed -i '' 's|require('\''../../../backend/|require('\''../../backend/|g' {}

echo "Import fix completed!"
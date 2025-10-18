#!/bin/bash

echo "🎨 Generating app icons from Logo Boorie.png"

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "❌ ImageMagick is not installed. Please install it first:"
    echo "   macOS: brew install imagemagick"
    echo "   Ubuntu/Debian: sudo apt-get install imagemagick"
    echo "   Windows: Download from https://imagemagick.org/script/download.php"
    exit 1
fi

# Check if source file exists
if [ ! -f "resources/Logo Boorie.png" ]; then
    echo "❌ Logo Boorie.png not found in resources folder"
    exit 1
fi

# Create a backup of existing icons
echo "📦 Backing up existing icons..."
mkdir -p resources/backup
cp resources/icon.* resources/backup/ 2>/dev/null || true

# Copy the logo as the base PNG icon
echo "📋 Creating base PNG icon..."
cp "resources/Logo Boorie.png" "resources/icon.png"

# Generate Windows ICO file (multiple sizes)
echo "🪟 Creating Windows icon (.ico)..."
convert "resources/Logo Boorie.png" -resize 16x16 resources/icon-16.png
convert "resources/Logo Boorie.png" -resize 32x32 resources/icon-32.png
convert "resources/Logo Boorie.png" -resize 48x48 resources/icon-48.png
convert "resources/Logo Boorie.png" -resize 64x64 resources/icon-64.png
convert "resources/Logo Boorie.png" -resize 128x128 resources/icon-128.png
convert "resources/Logo Boorie.png" -resize 256x256 resources/icon-256.png
convert resources/icon-16.png resources/icon-32.png resources/icon-48.png resources/icon-64.png resources/icon-128.png resources/icon-256.png resources/icon.ico
rm resources/icon-*.png

# Generate macOS ICNS file
echo "🍎 Creating macOS icon (.icns)..."
mkdir -p resources/icon.iconset
convert "resources/Logo Boorie.png" -resize 16x16 resources/icon.iconset/icon_16x16.png
convert "resources/Logo Boorie.png" -resize 32x32 resources/icon.iconset/icon_16x16@2x.png
convert "resources/Logo Boorie.png" -resize 32x32 resources/icon.iconset/icon_32x32.png
convert "resources/Logo Boorie.png" -resize 64x64 resources/icon.iconset/icon_32x32@2x.png
convert "resources/Logo Boorie.png" -resize 128x128 resources/icon.iconset/icon_128x128.png
convert "resources/Logo Boorie.png" -resize 256x256 resources/icon.iconset/icon_128x128@2x.png
convert "resources/Logo Boorie.png" -resize 256x256 resources/icon.iconset/icon_256x256.png
convert "resources/Logo Boorie.png" -resize 512x512 resources/icon.iconset/icon_256x256@2x.png
convert "resources/Logo Boorie.png" -resize 512x512 resources/icon.iconset/icon_512x512.png
convert "resources/Logo Boorie.png" -resize 1024x1024 resources/icon.iconset/icon_512x512@2x.png

# Convert to ICNS (macOS command)
if command -v iconutil &> /dev/null; then
    iconutil -c icns resources/icon.iconset -o resources/icon.icns
else
    echo "⚠️  iconutil not found. Using ImageMagick fallback for ICNS..."
    convert "resources/Logo Boorie.png" -resize 256x256 resources/icon.icns
fi

# Clean up
rm -rf resources/icon.iconset

echo "✅ Icon generation complete!"
echo ""
echo "Generated files:"
echo "  • resources/icon.png (Linux/General)"
echo "  • resources/icon.ico (Windows)"
echo "  • resources/icon.icns (macOS)"
echo ""
echo "Old icons backed up to: resources/backup/"
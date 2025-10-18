#!/bin/bash

# Upload Release Assets Script
# This script uploads the compiled Windows version to the GitHub release

echo "🚀 Uploading Boorie v1.0.0 Release Assets to GitHub"
echo "=================================================="

# Check if gh CLI is authenticated
if ! gh auth status > /dev/null 2>&1; then
    echo "❌ GitHub CLI not authenticated. Please run: gh auth login"
    exit 1
fi

# Release information
RELEASE_TAG="v1.0.0"
REPO="Boorie-AI/boorie_cliente"

# Files to upload
WINDOWS_INSTALLER="dist-electron/Boorie Setup 1.0.0.exe"
WINDOWS_BLOCKMAP="dist-electron/Boorie Setup 1.0.0.exe.blockmap"
MACOS_DMG="dist-electron/Boorie-1.0.0-arm64.dmg"
MACOS_BLOCKMAP="dist-electron/Boorie-1.0.0-arm64.dmg.blockmap"

echo "📂 Checking files..."

# Check if files exist
if [ ! -f "$WINDOWS_INSTALLER" ]; then
    echo "❌ Windows installer not found: $WINDOWS_INSTALLER"
    exit 1
fi

if [ ! -f "$WINDOWS_BLOCKMAP" ]; then
    echo "❌ Windows blockmap not found: $WINDOWS_BLOCKMAP"
    exit 1
fi

if [ ! -f "$MACOS_DMG" ]; then
    echo "❌ macOS DMG not found: $MACOS_DMG"
    exit 1
fi

if [ ! -f "$MACOS_BLOCKMAP" ]; then
    echo "❌ macOS blockmap not found: $MACOS_BLOCKMAP"
    exit 1
fi

echo "✅ All files found"

# Get file sizes
WINDOWS_SIZE=$(du -h "$WINDOWS_INSTALLER" | cut -f1)
MACOS_SIZE=$(du -h "$MACOS_DMG" | cut -f1)

echo "📊 File Information:"
echo "   🪟 Windows: $WINDOWS_SIZE ($WINDOWS_INSTALLER)"
echo "   🍎 macOS: $MACOS_SIZE ($MACOS_DMG)"

# Check if release exists
echo "🔍 Checking release $RELEASE_TAG..."
if ! gh release view "$RELEASE_TAG" --repo "$REPO" > /dev/null 2>&1; then
    echo "❌ Release $RELEASE_TAG not found. Creating release..."
    
    # Create release
    gh release create "$RELEASE_TAG" \
        --repo "$REPO" \
        --title "Boorie v1.0.0 - Advanced AI Desktop Client for Hydraulic Engineers" \
        --notes "$(cat <<EOF
# Boorie v1.0.0 - Production Release

## 🎉 First Production Release

This is the first production-ready release of Boorie, the advanced AI desktop client specialized for hydraulic engineers.

## 🎯 Key Features

### 🤖 Multi-Provider AI Integration
- **OpenAI GPT-4/GPT-3.5**: Industry-leading conversational AI
- **Anthropic Claude**: Advanced reasoning and technical analysis
- **Google Gemini**: Multimodal AI with vision capabilities
- **OpenRouter**: Access to multiple models through one API
- **Ollama**: Local AI for privacy-sensitive projects

### 🔧 Hydraulic Engineering Tools
- **WNTR Integration**: Water Network Tool for Resilience analysis
- **EPANET Support**: Load and analyze .inp network files
- **Hydraulic Calculations**: Pipe sizing, pump selection, tank volumes
- **Network Visualization**: Interactive diagrams and geographic views
- **Regulatory Compliance**: Support for NOM, RAS, CTE, and international standards

### 📊 Advanced Analytics
- **Microsoft Clarity**: Comprehensive user behavior analytics
- **Performance Tracking**: Specialized metrics for engineering workflows
- **Error Monitoring**: Real-time error tracking and reporting

### 🗂️ Project Management
- **Team Collaboration**: Multi-user project support
- **Document Management**: Technical document organization
- **Version Control**: Track project changes and history
- **Export Capabilities**: Multiple format support

## 📦 Downloads

| Platform | Architecture | Size |
|----------|-------------|------|
| 🪟 Windows | x64 | ~105 MB |
| 🍎 macOS | ARM64 (M1/M2/M3) | ~137 MB |

## 🛠️ Installation Requirements

### System Requirements
- **RAM**: 4 GB minimum, 8 GB recommended
- **Storage**: 2 GB free space
- **Network**: Internet connection for AI providers

### Python Requirements (for WNTR)
- **Python**: 3.8, 3.9, 3.10, or 3.11
- **Packages**: numpy, scipy, pandas, networkx, matplotlib, wntr

## 🚀 Getting Started

1. **Download** the appropriate installer for your platform
2. **Install** following the platform-specific instructions
3. **Configure** your AI provider API keys
4. **Setup** Python environment for WNTR (guided setup available)
5. **Start** your first hydraulic engineering project

## 📚 Documentation

Complete documentation is available in our [Wiki](https://github.com/Boorie-AI/boorie_cliente/wiki), including:

- [Quick Start Guide](https://github.com/Boorie-AI/boorie_cliente/wiki/Quick-Start)
- [Installation Guide](https://github.com/Boorie-AI/boorie_cliente/wiki/Installation-Guide)
- [AI Integration](https://github.com/Boorie-AI/boorie_cliente/wiki/AI-Integration)
- [WNTR Integration](https://github.com/Boorie-AI/boorie_cliente/wiki/WNTR-Integration)
- [Engineering Calculations](https://github.com/Boorie-AI/boorie_cliente/wiki/Engineering-Calculations)
- [Regional Standards](https://github.com/Boorie-AI/boorie_cliente/wiki/Regional-Standards)

## 🌍 Language Support

- **English**: Full support with international standards
- **Español**: Soporte completo con estándares latinoamericanos
- **Català**: Suport complet amb estàndards europeus

## 🔒 Security & Privacy

- Encrypted API key storage
- Optional local AI processing with Ollama
- GDPR/CCPA compliance
- Comprehensive audit trails

## 💼 Professional Features

- Multi-regional standards compliance (Mexico NOM, Colombia RAS, Spain CTE)
- Advanced hydraulic calculations and simulations
- Team collaboration and project management
- Professional report generation
- Integration with industry tools

## 🐛 Known Issues

- Linux version is still in development
- Some WNTR operations may require additional setup on Windows
- Performance optimization ongoing for large networks

## 📞 Support

- 📚 [Documentation](https://github.com/Boorie-AI/boorie_cliente/wiki)
- 🐛 [Issue Tracker](https://github.com/Boorie-AI/boorie_cliente/issues)
- 💬 [Discussions](https://github.com/Boorie-AI/boorie_cliente/discussions)

---

**🎉 Thank you for using Boorie!** We're excited to see how it transforms your hydraulic engineering workflows.

**🔧 Built with**: Electron, React, TypeScript, Python, WNTR, and ❤️ for hydraulic engineering.
EOF
)" \
        --prerelease=false \
        --latest
        
    echo "✅ Release created successfully"
else
    echo "✅ Release found"
fi

# Upload files
echo "📤 Uploading release assets..."

echo "   Uploading Windows installer..."
if gh release upload "$RELEASE_TAG" "$WINDOWS_INSTALLER" --repo "$REPO" --clobber; then
    echo "   ✅ Windows installer uploaded"
else
    echo "   ❌ Failed to upload Windows installer"
fi

echo "   Uploading Windows blockmap..."
if gh release upload "$RELEASE_TAG" "$WINDOWS_BLOCKMAP" --repo "$REPO" --clobber; then
    echo "   ✅ Windows blockmap uploaded"
else
    echo "   ❌ Failed to upload Windows blockmap"
fi

echo "   Uploading macOS DMG..."
if gh release upload "$RELEASE_TAG" "$MACOS_DMG" --repo "$REPO" --clobber; then
    echo "   ✅ macOS DMG uploaded"
else
    echo "   ❌ Failed to upload macOS DMG"
fi

echo "   Uploading macOS blockmap..."
if gh release upload "$RELEASE_TAG" "$MACOS_BLOCKMAP" --repo "$REPO" --clobber; then
    echo "   ✅ macOS blockmap uploaded"
else
    echo "   ❌ Failed to upload macOS blockmap"
fi

echo ""
echo "🎉 Upload completed!"
echo "🔗 View release: https://github.com/$REPO/releases/tag/$RELEASE_TAG"
echo ""
echo "📊 Final release assets:"
echo "   🪟 Boorie Setup 1.0.0.exe ($WINDOWS_SIZE)"
echo "   🪟 Boorie Setup 1.0.0.exe.blockmap"
echo "   🍎 Boorie-1.0.0-arm64.dmg ($MACOS_SIZE)"
echo "   🍎 Boorie-1.0.0-arm64.dmg.blockmap"
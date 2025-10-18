# Installation Guide

## 📦 System Requirements

### Minimum Requirements
- **RAM**: 4 GB minimum, 8 GB recommended
- **Storage**: 2 GB free space minimum
- **Network**: Internet connection for AI providers and updates

### Platform-Specific Requirements

#### 🍎 macOS
- **Version**: macOS 10.15 (Catalina) or later
- **Architecture**: Intel x64 or Apple Silicon (M1/M2/M3)
- **Additional**: Xcode Command Line Tools (for development)

#### 🪟 Windows
- **Version**: Windows 10 version 1809 or later
- **Architecture**: x64 (64-bit)
- **Additional**: Microsoft Visual C++ Redistributable

#### 🐧 Linux
- **Distributions**: Ubuntu 18.04+, Debian 10+, CentOS 8+, Fedora 32+
- **Architecture**: x64 (64-bit)
- **Dependencies**: glibc 2.17+, GTK 3.0+

### Python Requirements (for WNTR)
- **Python**: 3.8, 3.9, 3.10, or 3.11
- **Packages**: numpy, scipy, pandas, networkx, matplotlib, wntr

## 🚀 Quick Installation

### Option 1: Download Pre-built Binaries (Recommended)

1. **Visit the Releases Page**
   - Go to: [GitHub Releases](https://github.com/Boorie-AI/boorie_cliente/releases)
   - Download the latest version for your platform

2. **Install for Your Platform**

   #### macOS Installation
   ```bash
   # Download and install
   curl -L -o Boorie.dmg https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.0.0/Boorie-1.0.0-arm64.dmg
   open Boorie.dmg
   # Drag Boorie.app to Applications folder
   ```

   #### Linux Installation
   ```bash
   # Download and extract
   wget https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.0.0/boorie-linux.tar.gz
   tar -xzf boorie-linux.tar.gz
   cd boorie-linux
   ./boorie
   ```

   #### Windows Installation
   ```powershell
   # Download and extract
   # Download from releases page
   # Extract ZIP file
   # Run Boorie.exe
   ```

### Option 2: Build from Source

1. **Clone Repository**
   ```bash
   git clone https://github.com/Boorie-AI/boorie_cliente.git
   cd boorie_cliente
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Setup Python Environment**
   ```bash
   ./setup-python-wntr.sh  # macOS/Linux
   # or manual setup for Windows
   ```

4. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Build and Run**
   ```bash
   npm run build
   npm run dist
   ```

## 🐍 Python Environment Setup

### Automatic Setup (Recommended)

#### macOS/Linux
```bash
# Run the setup script
./setup-python-wntr.sh

# Verify installation
./check-python-wntr.js
```

#### Windows
```powershell
# Manual setup required
python -m venv venv-wntr
venv-wntr\Scripts\activate
pip install numpy>=1.20 scipy>=1.7 pandas>=1.3 networkx>=2.6 matplotlib>=3.4 wntr>=0.5.0
```

### Manual Setup

1. **Create Virtual Environment**
   ```bash
   python3 -m venv venv-wntr
   ```

2. **Activate Environment**
   ```bash
   # macOS/Linux
   source venv-wntr/bin/activate
   
   # Windows
   venv-wntr\Scripts\activate
   ```

3. **Install WNTR and Dependencies**
   ```bash
   pip install --upgrade pip
   pip install numpy>=1.20
   pip install scipy>=1.7
   pip install pandas>=1.3
   pip install networkx>=2.6
   pip install matplotlib>=3.4
   pip install wntr>=0.5.0
   ```

4. **Update Environment Configuration**
   ```bash
   echo "PYTHON_PATH=$(which python)" >> .env
   ```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Python Configuration
PYTHON_PATH=/path/to/your/venv-wntr/bin/python

# AI Provider API Keys
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_API_KEY=your_google_api_key
OPENROUTER_API_KEY=your_openrouter_api_key

# Microsoft Clarity Analytics (Optional)
VITE_CLARITY_PROJECT_ID=your_clarity_project_id
VITE_CLARITY_ENABLED=true

# Mapbox Configuration (Optional)
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_access_token
VITE_DEFAULT_MAP_LNG=-70.9
VITE_DEFAULT_MAP_LAT=42.35
VITE_DEFAULT_MAP_ZOOM=9

# OAuth Configuration (Optional)
MS_CLIENT_ID=your_microsoft_client_id
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### Database Initialization

```bash
# Generate Prisma client
npm run db:generate

# Initialize database
npm run db:push
```

## 🧪 Verification

### Test Installation

1. **Launch Boorie**
   ```bash
   # Development mode
   npm run dev
   
   # Production build
   ./dist-electron/Boorie  # Linux
   open ./dist-electron/Boorie.app  # macOS
   ```

2. **Test WNTR Integration**
   ```bash
   # Run WNTR tests
   ./run-with-wntr.sh python test-files/test-wntr-complete.py
   ```

3. **Test Core Features**
   - ✅ Application launches successfully
   - ✅ AI providers can be configured
   - ✅ EPANET files can be imported
   - ✅ Network visualization works
   - ✅ Projects can be created

### Common Verification Issues

#### Python/WNTR Issues
```bash
# Check Python version
python --version

# Check WNTR installation
python -c "import wntr; print(wntr.__version__)"

# Reinstall if needed
pip install --upgrade --force-reinstall wntr
```

#### Node.js Issues
```bash
# Check Node.js version
node --version
npm --version

# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

## 🛠️ Development Environment

### Additional Setup for Contributors

1. **Install Development Tools**
   ```bash
   # ESLint and Prettier
   npm install -g eslint prettier
   
   # TypeScript
   npm install -g typescript
   ```

2. **Setup Git Hooks**
   ```bash
   # Install husky for git hooks
   npm install --save-dev husky
   npx husky install
   ```

3. **Configure IDE**
   - **VS Code**: Install recommended extensions
   - **WebStorm**: Configure TypeScript and ESLint
   - **Vim/Neovim**: Setup LSP for TypeScript

### Build Scripts

```bash
# Development
npm run dev              # Start development server
npm run dev:vite         # Frontend only
npm run dev:electron     # Electron only

# Building
npm run build            # Build everything
npm run build:vite       # Build frontend
npm run build:electron   # Build Electron backend

# Distribution
npm run dist             # Create distributable packages
npm run build:app        # Electron-builder

# Quality
npm run lint             # ESLint
npm run lint:fix         # ESLint with auto-fix
npm run typecheck        # TypeScript type checking
```

## 🚨 Troubleshooting

### Common Installation Issues

#### Issue: npm install fails
```bash
# Solution 1: Clear cache
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Solution 2: Use different registry
npm install --registry https://registry.npmjs.org/
```

#### Issue: Python/WNTR not found
```bash
# Solution: Verify Python path
which python3
python3 -c "import sys; print(sys.path)"

# Update .env file
echo "PYTHON_PATH=$(which python3)" >> .env
```

#### Issue: Electron fails to start
```bash
# Solution: Rebuild native modules
npm run rebuild

# Or rebuild specific modules
npx electron-rebuild
```

#### Issue: Build fails on Windows
```powershell
# Solution: Install Windows Build Tools
npm install --global windows-build-tools

# Or use Visual Studio
# Install Visual Studio with C++ development tools
```

### Platform-Specific Issues

#### macOS
- **Code signing**: Install Xcode Command Line Tools
- **Permissions**: Grant accessibility permissions in System Preferences
- **Quarantine**: Remove quarantine attribute: `xattr -d com.apple.quarantine Boorie.app`

#### Linux
- **Dependencies**: Install missing libraries
  ```bash
  # Ubuntu/Debian
  sudo apt-get install libgtk-3-0 libgbm1 libnss3 libasound2
  
  # CentOS/RHEL
  sudo yum install gtk3 libXrandr libXdamage
  ```

#### Windows
- **Antivirus**: Add Boorie to antivirus exceptions
- **Permissions**: Run as administrator if needed
- **Dependencies**: Install Visual C++ Redistributable

### Getting Help

1. **Check Documentation**
   - [Wiki Home](Home.md)
   - [FAQ](FAQ.md)
   - [Troubleshooting](Troubleshooting.md)

2. **Search Issues**
   - [GitHub Issues](https://github.com/Boorie-AI/boorie_cliente/issues)
   - [Discussions](https://github.com/Boorie-AI/boorie_cliente/discussions)

3. **Contact Support**
   - 💬 Discord: [Boorie Community](https://discord.gg/boorie)
   - 📧 Email: support@boorie.com

## 🔄 Updates

### Automatic Updates
Boorie includes an auto-updater that checks for new versions:
- Updates are downloaded in the background
- Users are notified when updates are available
- Updates can be installed with one click

### Manual Updates
1. Download the latest version from [Releases](https://github.com/Boorie-AI/boorie_cliente/releases)
2. Replace the existing installation
3. Restart Boorie

### Development Updates
```bash
# Update dependencies
npm update

# Update to latest main branch
git pull origin main
npm install
npm run build
```

---

**Next Steps**: After successful installation, proceed to [Quick Start](Quick-Start.md) to begin using Boorie.
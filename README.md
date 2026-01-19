# Boorie - Advanced AI Desktop Client for Hydraulic Engineers

![Boorie Logo](resources/icon.png)

**Boorie** is a specialized AI desktop client designed specifically for hydraulic engineers. Built with modern web technologies and integrated with advanced AI capabilities, it combines multi-provider AI chat with specialized hydraulic engineering tools, WNTR integration for water network analysis, and comprehensive project management features.

## 🎯 Key Features

### 🤖 Multi-Provider AI Integration
- **Supported Providers**: OpenAI, Anthropic Claude, Google Gemini, OpenRouter, Ollama
- **Specialized Context**: Hydraulic engineering domain expertise
- **RAG System**: Knowledge retrieval from technical documentation and regulations
- **Context-Aware Responses**: Engineering-specific query processing

### 🔧 Hydraulic Engineering Tools
- **WNTR Integration**: Water Network Tool for Resilience analysis
- **Network Analysis**: Load and visualize EPANET (.inp) files
- **Hydraulic Simulations**: Run comprehensive water system simulations
- **Calculation Engine**: Pipe sizing, pump selection, tank volume calculations
- **Regulatory Compliance**: Support for multiple regional standards

### 📊 Advanced Analytics
- **Microsoft Clarity**: Comprehensive user behavior analytics
- **Performance Tracking**: Specialized tracking for hydraulic calculations
- **Error Monitoring**: Real-time error tracking and reporting
- **Usage Insights**: Detailed analytics for engineering workflows

### 🌐 Network Visualization
- **Interactive Diagrams**: vis-network integration for hydraulic networks
- **Geographic Views**: Mapbox integration for spatial analysis
- **Network Topology**: Connectivity and component analysis
- **Real-time Updates**: Dynamic visualization of simulation results

### 🗂️ Project Management
- **Hydraulic Projects**: Create and manage engineering projects
- **Document Management**: Upload and organize technical documents
- **Team Collaboration**: Multi-user project support
- **Version Control**: Track project changes and history

## 📦 Download & Install

### 🚀 Latest Release - v1.3.1

| Platform | Architecture | Download | Size |
|----------|-------------|----------|------|
| 🍎 **macOS** | ARM64 (M1/M2/M3) | [Boorie-1.3.1-arm64.dmg](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.3.1/Boorie-1.3.1-arm64.dmg) | ~227 MB |
| 🪟 **Windows** | x64 | [Boorie Setup 1.3.1.exe](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.3.1/Boorie%20Setup%201.3.1.exe) | ~170 MB |
| 🐧 **Linux** | x64 | [Coming Soon](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.3.1) | ~TBD |

### ✨ Credits
Created and developed by:
- **Phd Luis Mora**
- **Javier Molina**
- **Cristina Cruz**

### 📝 What's New in v1.3.1
- **UI Credits**: Added creator credits in the sidebar footer.
- **RAG & Search Upgrade**: Robust file processing for PDFs/DOCX, memory-optimized synchronization (batch processing), and automatic truncation of oversized content to prevent crashes.
- **Conversation Vectorization**: All chat messages are now automatically vectorized and stored in Milvus.
- **Reliability**: Fixed startup crashes related to Milvus and embedding timeouts.


### Installation Instructions

#### macOS
1. Download the DMG file from the link above
2. Open the downloaded DMG file
3. Drag Boorie.app to your Applications folder
4. Launch Boorie from Applications

#### Linux
1. Download the Linux package from the release page
2. Extract the archive: `tar -xzf boorie-linux.tar.gz`
3. Run: `./boorie`

#### Windows
1. Download the Windows package from the release page
2. Extract the ZIP file
3. Run `Boorie.exe`

### 🔗 All Releases
View all available releases: [**GitHub Releases**](https://github.com/Boorie-AI/boorie_cliente/releases)

## 🛠️ Development Setup

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+ with pip
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/boorie_cliente.git
   cd boorie_cliente
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup Python environment for WNTR**
   ```bash
   ./setup-python-wntr.sh
   ```

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Initialize database**
   ```bash
   npm run db:generate
   npm run db:push
   ```

6. **Start development environment**
   ```bash
   npm run dev
   ```

## 🛠️ Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start full development environment |
| `npm run dev:vite` | Frontend only (http://localhost:3000) |
| `npm run dev:electron` | Electron only |
| `npm run build` | Build both frontend and Electron |
| `npm run build:app` | Create distributable packages |
| `npm run dist` | Create distributable packages (DMG/NSIS/AppImage) |
| `npm run lint` | Run ESLint checks |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run typecheck` | TypeScript type checking |

### Database Commands

| Command | Description |
|---------|-------------|
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema changes |
| `npm run db:migrate` | Run database migrations |

### Python/WNTR Commands

| Command | Description |
|---------|-------------|
| `./setup-python-wntr.sh` | Initial WNTR environment setup |
| `./activate-wntr.sh` | Activate WNTR environment |
| `./run-with-wntr.sh` | Run commands in WNTR environment |
| `./check-python-wntr.js` | Verify WNTR installation |

## 🏗️ Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **State Management**: Zustand + React Context
- **UI Components**: Radix UI primitives
- **Backend**: Electron 28 + TypeScript + Prisma ORM
- **Database**: SQLite with encryption support
- **Analytics**: Microsoft Clarity integration
- **Hydraulics**: Python WNTR integration
- **Visualization**: vis-network + Mapbox
- **Build**: Vite + custom Electron build scripts

### Project Structure
```
boorie_cliente/
├── backend/              # Backend business logic
│   ├── models/           # Data models
│   └── services/         # Core services
│       └── hydraulic/    # Hydraulic-specific services
├── electron/             # Electron main process
│   ├── handlers/         # IPC handlers by domain
│   └── services/         # System services
├── src/                  # React frontend
│   ├── components/       # UI components
│   │   ├── hydraulic/    # Hydraulic engineering components
│   │   └── ui/           # Reusable UI components
│   ├── services/         # Frontend services
│   ├── stores/           # Zustand state management
│   └── types/            # TypeScript definitions
├── prisma/               # Database schema
├── rag-knowledge/        # Hydraulic knowledge base
│   ├── hydraulics/       # Technical documentation
│   ├── regulations/      # Regional standards
│   └── best-practices/   # Industry guidelines
└── venv-wntr/           # Python WNTR environment
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Microsoft Clarity Analytics
VITE_CLARITY_PROJECT_ID=your_clarity_project_id
VITE_CLARITY_ENABLED=true

# Mapbox Configuration
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token
VITE_DEFAULT_MAP_LNG=-70.9
VITE_DEFAULT_MAP_LAT=42.35
VITE_DEFAULT_MAP_ZOOM=9

# Python Configuration
PYTHON_PATH=/path/to/python/with/wntr

# OAuth Configuration (Optional)
MS_CLIENT_ID=your_microsoft_client_id
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_secret
```

### AI Provider Setup

Configure your AI providers in the application settings:

1. **OpenAI**: Requires API key
2. **Anthropic Claude**: Requires API key
3. **Google Gemini**: Requires API key
4. **OpenRouter**: Requires API key
5. **Ollama**: Requires local installation

## 🌊 Hydraulic Engineering Features

### WNTR Integration
- **File Support**: Import/export EPANET (.inp) files
- **Simulation Types**: Hydraulic and water quality analysis
- **Network Analysis**: Topology, connectivity, and component analysis
- **Results Export**: JSON format with comprehensive data

### Calculation Engine
- **Pipe Sizing**: Darcy-Weisbach and Hazen-Williams equations
- **Pump Analysis**: Curve analysis and selection tools
- **Tank Calculations**: Volume and sizing computations
- **Head Loss**: Comprehensive friction loss calculations

### Regional Standards
- **Mexico**: NOM standards and regulations
- **Colombia**: Technical standards and best practices
- **Spain**: UNE standards and regulations
- **International**: ISO and other global standards

## 📊 Analytics and Monitoring

### Microsoft Clarity Integration
- **User Behavior**: Comprehensive interaction tracking
- **Performance Metrics**: Application performance monitoring
- **Error Tracking**: Real-time error detection and reporting
- **Custom Events**: Specialized tracking for hydraulic operations

### Tracked Events
- Hydraulic calculations and simulations
- WNTR analysis operations
- File imports and exports
- Project management activities
- AI chat interactions
- Error occurrences and system issues

## 🔒 Security Features

- **Context Isolation**: Secure Electron architecture
- **Encrypted Storage**: API keys and sensitive data encryption
- **OAuth Integration**: Secure authentication with major providers
- **Content Security Policy**: Strict CSP for web security
- **IPC Security**: Type-safe inter-process communication

## 🌍 Internationalization

Support for multiple languages:
- **English** (default)
- **Spanish (ES)**
- **Catalan (CA)**

Technical terminology is localized for each region's engineering standards.

## 🧪 Testing

### Test Files
- `test-wntr-functionality.py` - WNTR integration tests
- `test-hydraulic-calc.js` - Calculation engine tests
- `test-wntr-ipc.js` - IPC communication tests

### Running Tests
```bash
# WNTR functionality tests
python test-wntr-functionality.py

# With WNTR environment
./run-with-wntr.sh python test-wntr-functionality.py

# Hydraulic calculations
node test-hydraulic-calc.js
```

## 📦 Building and Distribution

### Development Build
```bash
npm run build
```

### Production Distribution
```bash
npm run dist
```

### Platform-Specific Builds
- **macOS**: DMG installer
- **Windows**: NSIS installer  
- **Linux**: AppImage

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Use existing UI components from Radix UI
- Maintain Electron security best practices
- Add tests for new hydraulic calculations
- Update documentation for new features

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **WNTR Team**: Water Network Tool for Resilience
- **Electron Team**: Cross-platform desktop applications
- **React Team**: User interface library
- **Hydraulic Engineering Community**: Domain expertise and feedback

## 📞 Support

For support and questions:
- 📧 Email: support@boorie.com
- 💬 Discord: [Boorie Community](https://discord.gg/boorie)
- 📖 Documentation: [GitHub Wiki](https://github.com/your-username/boorie_cliente/wiki)
- 🐛 Issues: [GitHub Issues](https://github.com/your-username/boorie_cliente/issues)

## 📚 Additional Documentation

### Multilingual Wiki
- 🇺🇸 [English Documentation](docs/wiki/en/Home.md)
- 🇪🇸 [Documentación en Español](docs/wiki/es/Home.md)
- 🏴󠁥󠁳󠁣󠁴󠁿 [Documentació en Català](docs/wiki/ca/Home.md)

### Language-Specific READMEs
- 🇺🇸 [README in English](README.md)
- 🇪🇸 [README en Español](README.es.md)
- 🏴󠁥󠁳󠁣󠁴󠁿 [README en Català](README.ca.md)

---

**Made with ❤️ for Hydraulic Engineers**
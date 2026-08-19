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

### 🚀 Latest Release - v1.8.0

| Platform | Architecture | Download |
|----------|-------------|----------|
| 🍎 **macOS** | ARM64 (M1/M2/M3) | [Boorie-1.8.0-arm64.dmg](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.8.0/Boorie-1.8.0-arm64.dmg) |
| 🪟 **Windows** | x64 | [Boorie-Setup-1.8.0.exe](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.8.0/Boorie-Setup-1.8.0.exe) |
| 🐧 **Linux** | x64 | [Boorie-1.8.0.AppImage](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.8.0/Boorie-1.8.0.AppImage) |

### 📝 What's New

- **v1.8.0**: The chat no longer talks about your network second-hand — it has it in front of it and can query it. The agent now receives the real figures of the loaded network — junctions, tanks, reservoirs, pipes, total length, demand and diameter range — instead of a bare «a network is loaded». Asked «how do I improve flow at node J3?» it used to answer generic advice about cleaning a mechanical joint, unaware that J3 is a node of your network. It can now look up a specific node or pipe when you ask about it, instead of answering with approximate figures: in a 92-node network the whole network does not fit in the conversation, so it reads only what it needs. The chat header shows which network the agent is seeing, and when it sees none it says so and tells you to load an .inp file into the project. With no project open the chat answers from general hydraulic engineering knowledge and your knowledge base, but no longer describes networks it does not have in front of it nor offers numeric examples that could be mistaken for yours. When the model you use does not support network queries, the agent knows it and tells you it cannot look, instead of estimating. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.8.0).
- **v1.7.0**: Boorie now tells you **what is missing and gives you the button that fixes it**. Entering the hydraulic network without an active project used to swap your screen for the project list with no explanation — the menu said «WNTR Network» and the content was something else. Now it says so and offers to pick one. Menu items that need something appear dimmed with a lock and explain what they are waiting for on hover, and they stay clickable so you reach the screen that resolves it instead of hitting a dead button. The first-run tour no longer ends at the calculator: it leads you to create a project and load your network. The calculator still works on its own, with no project required. Menu labels are finally translated — «Projects», «Calculator» and «WNTR Network» stayed in English even with the app in Spanish or Catalan. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.7.0).
- **v1.6.0**: Service interruption simulation now tells you **how many people are left without water**. Simulating the failure of a pipe, pump or valve also reports the affected population and nodes, how long the deficit lasts and how much water is never delivered — all from the same run, with no second simulation to launch. The demand module (litres per person per day) is yours to set, and the result recalculates; give the people-per-connection factor and Boorie translates population into affected customers. Boorie separates what the failure causes from what the network already had wrong, so a sector that was chronically short of pressure is not counted against the new fault. Interruption simulations now run pressure-dependent, which is the physically correct mode when water is short: a node with very little pressure used to be treated as fully served and the impact came out as zero. Fixed outage hours exceeding the simulated window (24 simulated hours could report 25 hours of outage). See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.6.0).
- **v1.5.2**: A single active project shared by the whole application — chat, network and Wisdom Center now work on the same context, and it is restored when you reopen Boorie. Opening a conversation that belongs to another project asks whether to switch, so the assistant never answers with the wrong context. Your networks and calculations are stored in the project instead of only on this machine, and are migrated automatically without touching the previous data. A saved network opens even if you moved or deleted the original .inp. Scenarios derived from a network, such as a skeletonization, can hang from it with their own results folder. Fixed analysis and simulation possibly running on a different network from the one on screen. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.5.2).
- **v1.5.1**: Python/WNTR startup on Windows now survives a restart (the virtual environment path is persisted), and the setup assistant explains *why* an install failed instead of just reporting "verification-failed". Supported range narrowed to **Python 3.10 – 3.13** (WNTR 1.5 ships no cp314 wheel). "Reindex" in the Wisdom Center actually reindexes again — it used to delete the document's chunks and report success without recreating them. Resilience routines gained table headers, highlighting of the nodes affected by a service interruption, CSV export for the fragility curve and indicators, and duration warnings. New **About** section in Settings with the installed version and this history (#30). See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.5.1).
- **v1.5.0**: New WNTR resilience routines in the WNTR Network module — network skeletonization, service interruption simulation, resilience indicators (Todini index, network entropy, hydraulic redundancy) and seismic fragility curves. Fixed bug #16 (UI freeze when switching the embedding model in Wisdom Center) and bug #17 (Chat project selector not applying, and the LLM not receiving hydraulic project context). See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.5.0).
- **v1.4.3**: Fixed bug #15 (projects not appearing in the Chat project selector — a single project with malformed data silently emptied the whole list) and bug #14 (Wisdom Center documents stuck on "Not Indexed" on Windows — Ollama embedding fallback was hardcoded to a developer's LAN IP instead of `localhost`). Backend logger refactor + dependency updates.
- **v1.4.2**: 5 real bugs fixed during lint/typecheck cleanup; CI matrix (macOS/Linux/Windows) green again.
- **v1.4.1**: Automatic Python/WNTR setup on first launch (no terminal required).
- **v1.4.0**: NVIDIA NeMo Guardrails (agentic safety net) + embedded Milvus Lite vector DB (no Docker).

### Recent Changes
- **v1.3.10**: Fix Ollama detection on macOS (broken template string).
- **v1.3.9**: Fix bugs #8 (.inp path), #9 (Milvus sync), #10 (chat WNTR projects).
- **v1.3.8**: Fix Prisma module resolution on Windows startup.

📖 Full documentation: [GitHub Wiki](https://github.com/Boorie-AI/boorie_cliente/wiki)


### Installation Instructions

#### macOS
1. Download the DMG file from the link above
2. Open the downloaded DMG file
3. Drag Boorie.app to your Applications folder
4. Launch Boorie from Applications

#### Linux
1. Download `Boorie-1.8.0.AppImage` from the link above
2. Make it executable: `chmod +x Boorie-1.8.0.AppImage`
3. Run: `./Boorie-1.8.0.AppImage`

#### Windows
1. Download `Boorie-Setup-1.8.0.exe` from the link above
2. Run the installer and follow the setup wizard
3. Launch Boorie from the Start Menu or Desktop shortcut

### 🔗 All Releases
View all available releases: [**GitHub Releases**](https://github.com/Boorie-AI/boorie_cliente/releases)

## 🛠️ Development Setup

### Prerequisites
- Node.js 18+ and npm
- Python 3.10 – 3.13 with pip (3.14 is not supported yet: WNTR ships no wheel for it)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Boorie-AI/boorie_cliente.git
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
- 📖 Documentation: [GitHub Wiki](https://github.com/Boorie-AI/boorie_cliente/wiki)
- 🐛 Issues: [GitHub Issues](https://github.com/Boorie-AI/boorie_cliente/issues)

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
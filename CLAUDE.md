# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Boorie** is an advanced AI desktop client specialized for hydraulic engineers. Built with Electron, React, TypeScript, and Prisma, it combines multi-provider AI chat with specialized hydraulic engineering tools, WNTR integration for network analysis, and comprehensive project management capabilities.

## Essential Commands

### Development
- `npm run dev` - Start development environment (Vite + Electron)
- `npm run dev:vite` - Frontend only (http://localhost:3000)
- `npm run dev:electron` - Electron only (requires Vite running on port 3000)
- `./dev-start.sh` - Full development setup with complete build

### Testing
- No formal test framework configured in package.json
- `test-files/` directory contains EPANET .inp files and test results for hydraulic simulations
- Manual testing scripts in root directory for system verification:
  - `test-*.js` - Various functionality tests (RAG, WNTR, IPC, database, etc.)
  - `debug-*.js` - Debugging scripts for troubleshooting specific issues
  - `check-*.js` - System validation and verification scripts

### Build & Distribution
- `npm run build` - Build both frontend and Electron
- `npm run build:vite` - Build frontend only
- `npm run build:electron` - Build Electron only (uses build-electron-proper.sh)
- `npm run build:app` - Create distributable packages with electron-builder
- `./build-complete.sh` - Complete build with all services
- `npm run dist` - Create distributable packages (DMG/NSIS/AppImage)

### Code Quality
- `npm run lint` - Run ESLint checks
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run typecheck` - TypeScript type checking

### Database
- `npm run db:generate` - Generate Prisma client after schema changes
- `npm run db:push` - Push schema changes to PostgreSQL database
- `npm run db:migrate` - Run database migrations

### Python/WNTR Environment
- `./setup-python-wntr.sh` - Initial setup of WNTR virtual environment
- `./activate-wntr.sh` - Activate WNTR virtual environment
- `./run-with-wntr.sh` - Run commands within WNTR environment
- `./check-python-wntr.js` - Verify WNTR installation

## Environment Variables

Required variables (see `.env.example`):
- `DATABASE_URL` - PostgreSQL database connection string (format: `postgresql://username:password@localhost:5432/dbname`)
- `VITE_MAPBOX_ACCESS_TOKEN` - Mapbox access token for network visualization (get from https://account.mapbox.com/)

Optional variables:
- `VITE_DEFAULT_MAP_LNG` - Default map longitude (default: -70.9)
- `VITE_DEFAULT_MAP_LAT` - Default map latitude (default: 42.35)
- `VITE_DEFAULT_MAP_ZOOM` - Default map zoom level (default: 9)
- `VITE_CLARITY_PROJECT_ID` - Microsoft Clarity analytics project ID (default: ts4zpakpjj)
- `VITE_CLARITY_ENABLED` - Enable/disable Clarity analytics (default: true)
- `PYTHON_PATH` - Path to Python executable with WNTR installed (auto-configured by setup script)
- `ENABLE_HARDWARE_ACCELERATION` - Enable/disable hardware acceleration (default: true)

## Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + Zustand + Radix UI
- **Backend**: Electron 28 + TypeScript + Prisma ORM + PostgreSQL
- **IPC**: Secure context-isolated communication via preload script
- **Hydraulics**: Python WNTR integration for network analysis
- **Visualization**: vis-network for hydraulic network diagrams, Mapbox for geographic views
- **Build**: Vite for frontend, custom build scripts for Electron, electron-builder for distribution

### Project Structure
```
boorie_cliente/
├── backend/              # Backend business logic (JS/TS mixed)
│   ├── models/           # Data models
│   └── services/         # AI providers, chat, database services
│       └── hydraulic/    # Hydraulic-specific services
│           ├── wntrService.py     # Python WNTR wrapper
│           └── wntrWrapper.ts     # TypeScript interface
├── electron/             # Electron main process (TypeScript)
│   ├── handlers/         # IPC handlers by domain
│   │   ├── hydraulic.handler.ts   # Hydraulic calculations
│   │   └── wntr.handler.ts        # WNTR operations
│   └── services/         # Auth, security services
├── src/                  # React frontend (TypeScript)
│   ├── components/       # UI components by feature
│   │   ├── hydraulic/    # Hydraulic engineering components
│   │   └── wisdom/       # Unified Wisdom Center components
│   ├── services/         # Frontend service layer
│   └── stores/           # Zustand state management
├── prisma/               # Database schema and migrations
├── rag-knowledge/        # Hydraulic knowledge base
│   ├── hydraulics/       # Technical documentation
│   ├── regulations/      # Regional standards
│   └── best-practices/   # Industry guidelines
├── test-files/           # Test data (EPANET files, results)
└── venv-wntr/           # WNTR virtual environment (auto-generated)
```

### Key Architectural Patterns

1. **IPC Communication**: All renderer-main communication goes through secure IPC handlers
   - Handlers organized by domain in `electron/handlers/`
   - Type-safe API exposed via `window.electronAPI` in preload script
   - Hydraulic-specific handlers for WNTR operations

2. **State Management**: Zustand stores for each feature domain
   - `useAuthStore` - Authentication state
   - `useChatStore` - Chat conversations and messages
   - `useAIConfigStore` - AI provider configurations
   - `usePreferencesStore` - User preferences (theme, language)
   - `useAppStore` - General app state and hydraulic projects
   - `useProjectStore` - Project management state
   - `useWNTRStore` - WNTR operations and network analysis state

3. **Service Layer**: Both frontend and backend have service layers
   - Frontend services in `src/services/` handle UI-side logic
   - Backend services in `backend/services/` handle business logic
   - Hydraulic services integrate WNTR and calculation engines
   - Clear separation of concerns between layers

4. **Database**: PostgreSQL with Prisma ORM
   - Schema in `prisma/schema.prisma`
   - Core models: Conversation, Message, AIProvider for chat functionality
   - Hydraulic models: HydraulicProject, HydraulicCalculation, ProjectDocument, HydraulicKnowledge, etc.
   - Extended schema for hydraulic engineering domain
   - Binary targets configured for cross-platform deployment: native, darwin-arm64, darwin, windows, debian-openssl-3.0.x, linux-musl

5. **AI Integration**: Multi-provider support with hydraulic specialization
   - Providers: OpenAI, Anthropic, Google, OpenRouter, Ollama
   - Advanced agentic RAG system for intelligent knowledge retrieval
   - Context-aware responses for engineering queries
   - Network repository integration for hydraulic data analysis
   - Microsoft Clarity analytics integration for usage tracking

6. **WNTR Integration**: Python-based water network analysis
   - `wntrService.py` handles EPANET file operations
   - Simulation capabilities: hydraulic and water quality
   - Network topology and connectivity analysis
   - Results visualization in frontend

## Unified Wisdom Center

The **Unified Wisdom Center** is a centralized knowledge management interface that consolidates document management with Boorie's hydraulic knowledge catalog, providing a unified experience for managing the entire knowledge base.

### Key Features

1. **Unified Document View**:
   - Single view including all documents (uploaded + catalog)
   - Visual distinction with badges and icons (Uploaded vs Catalog)
   - Intelligent filtering without separate tabs

2. **Advanced Search Capabilities**:
   - **Semantic RAG Search** (Shift+Enter): AI-powered knowledge retrieval
   - **Simple text search**: Real-time filtering
   - **Category filters**: Sources, Hydraulics, Pumping, Networks, etc.
   - **Region filters**: MX, CO, ES, and other country codes

3. **Document Management**:
   - **File upload**: Advanced PDF processing with metadata extraction
   - **Document processing**: Support for PDF, TXT, DOC, DOCX formats
   - **Selective deletion**: Remove uploaded documents
   - **Automatic categorization**: Content-based classification

4. **Pre-indexed Catalog**:
   - **Hierarchical view**: Expandable technical sections
   - **Indexing status**: Clear indication (✓ Indexed / ○ Not Indexed)
   - **On-demand indexing**: One-click document indexing
   - **Complete metadata**: Pages, size, topics, description

5. **Embedding Configuration**:
   - **Multi-provider support**: OpenAI, Ollama embedding models
   - **Dynamic switching**: Change between embedding models
   - **Ollama auto-detection**: Automatic detection of local models
   - **Real-time status**: Live connection status with Ollama
   - **Model recommendations**: Popular embedding model suggestions

### Architecture

- **Main Component**: `src/components/wisdom/UnifiedWisdomPanel.tsx`
- **APIs**: 
  - `wisdom:upload` - Document upload and processing
  - `wisdom:search` - Semantic search with RAG
  - `wisdom:list` - Document listing with filters
  - `wisdom:getCatalog` - Access to pre-indexed catalog
  - `wisdom:indexFromCatalog` - Catalog document indexing

### Usage

1. **Access**: From sidebar "Wisdom Center"
2. **Search**: Enter text and press Enter (simple) or Shift+Enter (RAG)
3. **Filter**: Use category and region selectors
4. **Upload**: Click "Add Document" button
5. **Index**: Click "Index" button on non-indexed catalog documents

## Python/WNTR Setup

The project requires a properly configured Python environment with WNTR for hydraulic network analysis:

1. **Initial Setup**: Run `./setup-python-wntr.sh` which:
   - Creates a virtual environment at `venv-wntr/`
   - Installs required packages: numpy>=1.20, scipy>=1.7, pandas>=1.3, networkx>=2.6, matplotlib>=3.4, wntr>=0.5.0
   - Updates `.env` with the correct `PYTHON_PATH`

2. **Why Virtual Environment?**: On macOS, system Python causes code signing crashes with NumPy/SciPy. The virtual environment avoids these issues.

3. **Manual Setup**: If needed, manually install WNTR in a non-system Python and set `PYTHON_PATH` in `.env`

4. **Verification**: Run `./check-python-wntr.js` to verify WNTR is properly installed

## Hydraulic Engineering Features

1. **Network Analysis**:
   - Load and visualize EPANET (.inp) files
   - Run hydraulic simulations
   - Analyze network topology
   - Export results to JSON

2. **Calculation Engine**:
   - Pipe sizing (Darcy-Weisbach, Hazen-Williams)
   - Pump selection and curve analysis
   - Tank volume calculations
   - Head loss computations

3. **Project Management**:
   - Create and manage hydraulic projects
   - Track calculations and documents
   - Team collaboration features
   - Regulatory compliance tracking

4. **Unified Wisdom Center**:
   - Centralized knowledge management interface
   - RAG-powered technical documentation with semantic search
   - Regional regulations (Mexico, Colombia, Spain, etc.)
   - Best practices and design guidelines
   - Formula references with examples
   - Document upload and processing (PDF, TXT, DOC, etc.)
   - Pre-indexed catalog of hydraulic engineering resources
   - Multi-provider embedding support (OpenAI, Ollama)

## Important Implementation Details

1. **Authentication**: OAuth2 support for Google and Microsoft
   - Handled in `electron/services/authService.ts`
   - Tokens stored securely in database

2. **Internationalization**: i18next with three languages
   - English, Spanish (ES), Catalan (CA)
   - Language files in `src/locales/`
   - Technical terminology localized

3. **Security**: 
   - Context isolation enabled
   - No direct node integration in renderer
   - API keys encrypted in database
   - Secure IPC-only communication
   - Project data encryption

4. **Window Management**: Custom frameless window
   - Custom top bar implementation in `src/components/CustomTopBar.tsx`
   - Window controls handled via IPC

5. **File Handling**:
   - EPANET file import/export
   - Document upload with RAG processing
   - Project file management
   - Vector embeddings for semantic search

6. **Python Integration**:
   - WNTR service runs as child process
   - JSON-based communication protocol
   - Error handling and timeout management

7. **Path Aliases**: TypeScript and Vite configured with aliases
   - `@/components/*` → `src/components/*`
   - `@/services/*` → `src/services/*`
   - `@/stores/*` → `src/stores/*`
   - `@/types/*` → `src/types/*`
   - `@/utils/*` → `src/utils/*`

8. **Key Files and Entry Points**:
   - Main process: `electron/main.ts`
   - Preload script: `electron/preload.ts`
   - Renderer entry: `src/main.tsx`
   - IPC handlers: `electron/handlers/index.ts`
   - Database service: `backend/services/database.service.ts`
   - Agentic RAG: `electron/handlers/agenticRAG.handler.ts`
   - Network Repository: `electron/handlers/networkRepository.handler.ts`
   - Wisdom Center: `src/components/wisdom/UnifiedWisdomPanel.tsx`

## Development Guidelines

1. **Type Safety**: Always use TypeScript types
   - Shared types in `src/types/`
   - Hydraulic types in `src/types/hydraulic.ts`
   - Avoid `any` types (ESLint will warn)
   - Use path aliases for imports

2. **Component Structure**: 
   - Components organized by feature
   - Use Radix UI primitives for accessibility
   - TailwindCSS for styling with custom theme
   - Hydraulic components in `src/components/hydraulic/`

3. **IPC Patterns**:
   - Always use handlers for main process operations
   - Never expose sensitive operations to renderer
   - Type-safe IPC calls via preload API
   - Handle Python process errors gracefully

4. **Database Changes**:
   - Modify `prisma/schema.prisma`
   - Run `npm run db:generate` after schema changes
   - Use migrations for production changes
   - Test with hydraulic-specific models

5. **AI Provider Integration**:
   - Implement provider interface in `backend/services/aiProviders/`
   - Add hydraulic context to prompts
   - Handle rate limiting and errors gracefully
   - Integrate RAG results appropriately

6. **WNTR Operations**:
   - Always validate file paths before processing
   - Handle large network files with progress indicators
   - Cache simulation results when appropriate
   - Clean up temporary files after operations

7. **ESLint Rules**:
   - No unused variables (warnings)
   - No explicit any types (warnings)
   - React hooks rules enforced
   - TypeScript-specific rules applied

## Common Development Tasks

### Adding a New Hydraulic Calculation
1. Add formula to `backend/services/hydraulic/calculationEngine.ts`
2. Create UI component in `src/components/hydraulic/`
3. Add IPC handler if needed
4. Update types in `src/types/hydraulic.ts`
5. Add tests for calculation accuracy

### Integrating New WNTR Features
1. Update `wntrService.py` with new functionality
2. Add corresponding TypeScript interface in `wntrWrapper.ts`
3. Create IPC handler in `electron/handlers/wntr.handler.ts`
4. Update preload script with new API methods
5. Implement frontend components for visualization

### Adding Regional Regulations
1. Add documentation to `rag-knowledge/regulations/`
2. Process and index for RAG system
3. Update regulation identification logic
4. Add UI for region selection
5. Test compliance checking features

## Troubleshooting

### Common Issues
1. **Python/WNTR errors**: 
   - On macOS, system Python causes code signing crashes with NumPy/SciPy
   - Run `./setup-python-wntr.sh` to create a proper virtual environment
   - Or manually set `PYTHON_PATH` in `.env` to a non-system Python with WNTR installed
   - See `docs/WNTR_PYTHON_SETUP.md` for detailed troubleshooting
2. **vis-network warnings**: Expected due to peer dependency conflicts
3. **Database connection**: Ensure PostgreSQL connection and permissions are correct
4. **IPC timeout**: Increase timeout for large WNTR operations
5. **Module resolution errors**: Run `./build-electron-proper.sh` or `./build-complete.sh` to fix import paths
6. **Segmentation faults**: If app crashes with exit code 11, likely caused by hardware acceleration or native modules - hardware acceleration can be disabled via `ENABLE_HARDWARE_ACCELERATION=false`

### Debug Mode
- Set `NODE_ENV=development` for detailed logging
- Use Chrome DevTools for frontend debugging
- Check Electron main process console for backend errors

## Build System Notes

The project uses a custom build system to handle TypeScript compilation and module resolution:
- `build-electron.js` - TypeScript compilation helper
- `build-electron-proper.sh` - Main build script for Electron
- `build-complete.sh` - Full build pipeline for all components
- `fix-imports.js` - Utility for correcting import paths in compiled files
- Build output is organized in `dist-electron/` maintaining proper structure for module resolution

### Electron Builder Configuration
- **App ID**: `com.boorie.app`
- **Output**: `dist-electron` directory
- **Platforms**: 
  - macOS: DMG installer
  - Windows: NSIS installer
  - Linux: AppImage
- **Resources**: Icons for all platforms in `resources/` directory

## Working with Git

### Branches
- **Main branch**: `main` (use for PRs)
- **Feature branches**: Use descriptive names like `feature/hydraulic-ai-transformation`

### Common Git Operations
- Always check the current branch status before making changes
- Commit messages should be descriptive and follow conventional commit format
- Use feature branches for new development
- Create PRs to merge changes into main branch
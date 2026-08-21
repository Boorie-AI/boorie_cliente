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

### 🚀 Latest Release - v1.19.0

| Platform | Architecture | Download |
|----------|-------------|----------|
| 🍎 **macOS** | ARM64 (M1/M2/M3) | [Boorie-1.19.0-arm64.dmg](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.19.0/Boorie-1.19.0-arm64.dmg) |
| 🪟 **Windows** | x64 | [Boorie-Setup-1.19.0.exe](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.19.0/Boorie-Setup-1.19.0.exe) |
| 🐧 **Linux** | x64 | [Boorie-1.19.0.AppImage](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.19.0/Boorie-1.19.0.AppImage) |

### 📝 What's New

- **v1.19.0**: Boorie now recommends how to spend less on pumping, and every figure comes from a simulation. Ask «how can I reduce the pumping energy?» and it proposes concrete measures, simulating each one on your network before giving you a number — so what you see is what it really saves, not an estimate. In the test network: taking pump 335 out of the peak-price hours saves 77.4 kWh and 19.49 USD a day, without leaving anyone without water. Every saving cites the simulation that backs it, stored in the project history. It also tells you what it costs to run a pump away from its best efficiency point — not as an estimate: the same network is simulated with that pump at the best point of its curve and subtracted (155.9 kWh a day in the test network, 46%), labelled «requires new equipment» so it is not confused with shifting a schedule. Measures that do **not** work are shown too, with their figure: stopping pumping during expensive hours sounds good and in some networks consumes more, because the tanks drain and have to be recovered afterwards. And a fault affecting the previous version's scenarios is fixed: in a network whose automation drives the pumping, stopping a pump had no effect —its own control started it again— and the scenario reported no impact. If you ran a pump outage on v1.18.0 and got no impact, run it again. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.19.0).
- **v1.18.0**: Service-interruption scenarios, and what pumping costs you. You can now pose what happens if something fails —pipe break, pump out of service, loss of control of the automation, a fire's demand surge, drought at the source— and get how many people it leaves without water. Ask the chat in plain language: «how many customers lose service if the pumps' control is lost for 4 hours?» and Boorie proposes the scenario, shows it in full and waits for your confirmation: **nothing is simulated until you approve it**. The figures come from the simulation, not from the model: the answer cites the run that backs it and the numbers match running the engine by hand, to the decimal. Impact is measured against your network without the event, so the deficit it already carried is not blamed on the scenario. On energy: consumption and cost per pump, hours running, power, and the split between peak and off-peak hours according to your project's tariff. Boorie also tells you which pump works away from its best efficiency point, using the efficiency curve your own file declares —in the test network, three pumps at 37.5% when their curve gives 70%, with flow 66.7% below the optimum. And you can check whether a measure really saves: the network is simulated with it and subtracted. Stopping pumping during the expensive hours saved 118.8 kWh and 33.80 USD in one network and **consumed 48.8 kWh more** in another, because the tanks drained and had to be recovered — the measure rejects itself, with its own figure. Every saving comes with what it costs the service. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.18.0).
- **v1.17.1**: The chat answers from what is indexed again, instead of saying there is nothing. If you asked about your simulations and Boorie replied «no data», that is fixed: searching the project's knowledge took longer than the chat was willing to wait, so the answer came back without a single source even though they were indexed. The search now takes a sixth of the time and the chat cites the documents each figure comes from. The Wisdom Center search no longer claims it found nothing when it did: if the drafting does not finish in time it says so and lists the sources it located. The knowledge selector's «Max Results» finally does something — it used to move without changing anything — and it now ships at 3, which is what a machine without a dedicated graphics card reviews in reasonable time. The security check on retrieved content works again: it always ran out of time, a minute per query checking nothing, and it also rejected documents that did answer the question. And Boorie now waits as long as answering takes: up to three minutes for the sources and eight for the full answer, instead of cutting off just before having it. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.17.1).
- **v1.17.0**: Boorie picks the model that answers you and stops asking. The model dropdown is gone from the chat: answers are always written by the model Boorie has fixed for hydraulic engineering, so you can no longer end up asking an unvalidated one without knowing — the dropdown used to offer NVIDIA's whole catalogue, models that were not even Nemotron among them. Two roles, each with its model: one reasons over what is retrieved from the knowledge base and writes the answer; a faster one rephrases your question and decides which documents are worth using, the task that repeats for every fragment and where the waiting shows. If the main model is unavailable the auxiliary answers and the reply says so, instead of leaving you with nothing and no explanation. The model name no longer appears under each answer — it stays in the log, where it is needed. And a first install downloads 2.7 GB instead of 24 GB: the model shipped before could not answer on a machine without a dedicated graphics card — measured, it took some 45 minutes for an answer that now takes two and a half. Settings → AI still holds your keys and each provider's catalogue, and now says that ticking models there does not change who answers in the chat. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.17.0).
- **v1.16.0**: Each project can have its own thresholds. The simulation indexing settings can now be set per project, not just for the whole of Boorie: in Settings → General you choose whether you are editing the general ones or those of the active project — useful when a project follows a different regulation or is in a fine-tuning stage. A project inherits until you touch it: while you change nothing in its scope it follows the general settings, so if tomorrow you change the minimum pressure for everyone, that project changes too. The moment you touch something it keeps its own, and the screen says so. «Back to inherited» undoes that split. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.16.0).
- **v1.15.1**: Fixes a fault that left networks unreachable in real installations. If Boorie would not let you open or list a project's networks, that is resolved. Installations were missing three columns the app had assumed since v1.6.0, so any screen touching networks failed. **Your data was never lost**: the networks, their versions and their simulations were still stored — the app simply could not read them, and opening this version repairs them. It affected fresh installs and upgrades from before v1.6.0; if you never saw the error, there is nothing to do. The guardrails tab can list its recorded violations again. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.15.1).
- **v1.15.0**: Now you can ask Boorie what the last simulation found. When a run finishes, Boorie writes and indexes into the project's knowledge base a summary of the execution, its statistics, the elements outside their thresholds and what changed since the previous run. Ask the chat "what problems did the last simulation find?" and it answers with the real anomalies of that run —which node, what pressure, for how many hours— citing the simulation they come from. Reservoirs and tanks are no longer judged on pressure, which by definition they do not have: the report used to open by denouncing the very source the network draws from. The thresholds are yours: pressure between 14 and 70 m and a maximum velocity of 3 m/s by default —the values in common use— adjustable because the regulatory reference varies by country. The simulation never waits for the indexing: if it fails, the run is still valid, the network history says how it went and you retry from there. Pruning a network version takes its indexed documents with it, so the knowledge base does not accumulate answers about networks that no longer exist. And the agent cites indexed knowledge again: semantic search had been silently returning nothing and the grader was discarding valid documents — four faults that masked one another. A question that used to take seven minutes to end in "I found nothing" is now answered in two or three, with its sources. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.15.0).
- **v1.14.0**: A client's documents stay inside their project. The Wisdom Center now distinguishes two scopes: **general** —regulations, best practices, the catalogue, shared across all your projects— and **project**, the internal documents of that client. You choose where to search: general only, project only, or both. A document belonging to one project no longer appears in another project's searches, in any mode — which is what could not be guaranteed before, when everything lived in a single space with no notion of project. From inside a project you still see the general regulations, which is what must never be lost: inheritance runs one way only. Every document states where it comes from, so a citation from a standard is never confused with a client's internal file. And uploading into a project's scope is now an explicit decision, taken only if you selected that scope — an internal document ending up visible to everyone cannot be the result of not touching a dropdown. Your existing documents land in the general scope, which is what they are, with nothing lost and nothing reindexed. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.14.0).

- **v1.13.0**: Your network has a history, and you can go back to any point in it. Re-importing a corrected `.inp` no longer destroys what was there: Boorie freezes the previous state and keeps it in the history, where before it simply refused to save if a network with that name already existed. Every network now has a version history — save a version with a note on what changed, mark it as a milestone so it is never pruned, compare it with the previous one (it tells you which nodes and pipes were added, removed or modified) and restore any of them; restoring saves the current state first, so going back never costs you today's work. Project-wide snapshots answer «how was this in the March delivery?», recording which version of each network was current and protecting them from automatic cleanup. Every simulation is now tied to the network version it ran on, and you can compare two runs: how far pressures, flows and velocities moved, and which elements changed most. You can export a version —or a whole snapshot— to a file and open it in another Boorie installation; the package is verified on import, so if it arrived truncated or someone edited it, nothing is imported. And history cleanup is configurable in Settings → General: milestones, anything held by a snapshot and the most recent version are always kept. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.13.0).

- **v1.12.0**: The simulation clock is your model's clock, and you choose what you look at. If your model reports every 15 minutes, the clock advances 15 minutes per step — before it added a fixed hour, so it ran four times faster than the simulation, and the date it showed (a Thursday in October, in Australian time) came from no data at all. It now tells you the moment, the step, how often the model reports and how long it lasts, all read from your `.inp` and from WNTR's results; with no start time declared in the `.inp` it shows elapsed time (`+04:15:00`) instead of faking a time of day. Dragging the bar now repaints the map — before it changed the clock and left the colours on the first step — and a single-step simulation no longer shows a player that goes nowhere. You can colour the network by pressure, demand, flow or velocity, with a legend that states your network's real range at that step instead of a fixed maximum that saturated as soon as the network fell outside it; and you can switch the network on and off by element type — junctions, tanks, reservoirs, pipes, pumps and valves, each with its count — which is what lets you look at just the pumps, or at the layout without the cloud of service connections. Finally: pressing «Simulations» with no loaded network now tells you one is needed and gives you the import button, and «Open» in the project list actually opens the project. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.12.0).

- **v1.11.0**: One viewer, and a network you can see even when nobody knows where it is. Your network can now be shown as a **schematic** even when it cannot be placed on the map: a network with no coordinates, or with a system nobody has declared, is no longer left with no view at all — the map's notice offers to show it as a schematic, with its tanks, reservoirs and pumps, and you can click a node or a pipe for its data. If your `.inp` carries drawing coordinates instead of real ones — the kind that run from 19 to 335 rather than around a million — Boorie says so, instead of inviting you to declare an EPSG that would plant your network on another continent without a word. Every map setting now lives in a single panel — view, base map, labels, opacity, node size, link width and symbology — where before they were spread across three places and most of them reached nothing: opacity, the two pressure switches, the ranges and «place your network by clicking the map» all did nothing at all. Satellite view is back: it had been switched off for every machine while the message claimed it was «not compatible with your system», without ever looking at the system. Changing the base map no longer wipes your network off it, the viewer's button row is no longer clipped when the window is maximised, and «Open» in the project list actually opens the project. Under the hood, ten viewers nobody used —about 4,700 lines— are retired, leaving one documented as canonical. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.11.0).
- **v1.10.0**: Your network sits on the map where **you** say it does, not where Boorie imagines. Boorie no longer guesses your network's coordinate system — it asks. A new selector lets you declare the EPSG (all 120 UTM zones, Colombia's MAGNA-SIRGAS, Spain's ETRS89 and ED50, Mexico's ITRF2008, or any code you type) and shows you where the centre of the network will land before you accept. A network with no declared system is no longer drawn in an invented place: the map tells you it is missing and gives you the button — before, any network that did not fit the ranges it was programmed with ended up painted in the Colombian Caribbean without a word. Changing the EPSG repositions the network instantly, without reloading the `.inp`, and Boorie warns you if the reprojected network falls outside your project's country, which is how you catch a wrong zone before working on a false location. The coordinates in your `.inp` are never touched: reprojection exists only to draw the map. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.10.0).
- **v1.9.0**: Boorie now starts from your projects, and everything that belongs to a project hangs from it. The menu is organised in three blocks — what belongs to the active project, the tools that work without one, and system settings — instead of a flat list where «WNTR Network», which goes nowhere without a project, sat at the same level as «Settings». The name of the project you are working on is always visible in the menu, with its network, its simulations and its chat underneath; with no active project those items are gone and the menu says so. «Projects» always shows your list with the active one marked — before, with a project open, that screen showed the same thing as «WNTR Network» and there was no way back to the list to switch projects without closing the current one first. General chat and project chat are now two separate entries, each listing its own conversations, so a conversation is tied to the project only when you start it from the project chat. And opening Boorie with no active project lands you in Projects instead of a screen that needs one; with a project, it still opens where you left off. See the [full release notes](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.9.0).
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
1. Download `Boorie-1.19.0.AppImage` from the link above
2. Make it executable: `chmod +x Boorie-1.19.0.AppImage`
3. Run: `./Boorie-1.19.0.AppImage`

#### Windows
1. Download `Boorie-Setup-1.19.0.exe` from the link above
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
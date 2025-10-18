# Quick Start Guide

Welcome to Boorie! This guide will help you get started with the advanced AI desktop client for hydraulic engineers in just a few minutes.

## 🚀 First Launch

### 1. Launch Boorie
- **macOS**: Open Applications folder and double-click Boorie.app
- **Windows**: Double-click Boorie.exe
- **Linux**: Run `./boorie` from the installation directory

### 2. Initial Setup Wizard
On first launch, Boorie will guide you through the setup process:

1. **Welcome Screen**: Introduction to Boorie's features
2. **Language Selection**: Choose your preferred language (EN/ES/CA)
3. **AI Provider Setup**: Configure your AI providers (optional)
4. **WNTR Configuration**: Set up Python environment for hydraulic analysis
5. **Analytics Consent**: Choose your privacy preferences

## 🤖 Configure AI Providers

### Quick Setup
1. Click **Settings** in the top-right corner
2. Navigate to **AI Providers** tab
3. Choose your preferred provider:

#### OpenAI (Recommended for beginners)
```
API Key: sk-your-openai-api-key
Model: gpt-4-turbo-preview
```

#### Anthropic Claude (Best for technical writing)
```
API Key: sk-ant-your-anthropic-key
Model: claude-3-sonnet-20240229
```

#### Google Gemini (Good for multimodal analysis)
```
API Key: your-google-api-key
Model: gemini-pro
```

#### OpenRouter (Access to multiple models)
```
API Key: sk-or-your-openrouter-key
Model: anthropic/claude-3-sonnet
```

#### Ollama (Local AI, privacy-focused)
```
URL: http://localhost:11434
Model: llama2 (or any local model)
```

### Test AI Connection
1. Click **Test Connection** next to your configured provider
2. You should see a green checkmark ✅ if successful
3. If it fails, verify your API key and network connection

## 🌊 Your First Hydraulic Project

### 1. Create a New Project
1. Click **New Project** on the main dashboard
2. Fill in project details:
   - **Name**: My First Water Network
   - **Type**: Water Distribution System
   - **Location**: Your city/region
   - **Description**: Learning Boorie basics

3. Click **Create Project**

### 2. Import a Sample Network
Boorie includes sample EPANET files for learning:

1. Click **Import Network** in your project
2. Navigate to `test-files/` folder in the installation
3. Select `simple-network.inp` or `mexico-city-network.inp`
4. Click **Open**

### 3. Visualize the Network
After importing:
1. The network will appear in the **Network Viewer**
2. Use mouse to:
   - **Pan**: Click and drag
   - **Zoom**: Mouse wheel or pinch gesture
   - **Select**: Click on nodes or pipes
3. Try different view modes:
   - **Topology View**: Schematic layout
   - **Geographic View**: Map-based (if coordinates available)

## 🧮 Run Your First Analysis

### 1. Basic Hydraulic Simulation
1. Click **Analysis** → **Hydraulic Simulation**
2. Configure simulation settings:
   - **Duration**: 24 hours (default)
   - **Time Step**: 1 hour
   - **Solver**: EPANET (default)
3. Click **Run Simulation**

### 2. View Results
After simulation completes:
1. **Results Panel** opens automatically
2. Explore different result types:
   - **Pressure**: Node pressure values
   - **Flow**: Pipe flow rates
   - **Velocity**: Flow velocities
   - **Head Loss**: Friction losses

### 3. Export Results
1. Click **Export** in the Results panel
2. Choose format:
   - **JSON**: For further analysis
   - **CSV**: For spreadsheet applications
   - **PDF**: For reports

## 💬 Chat with AI About Your Network

### 1. Open AI Chat
1. Click the **Chat** icon in the left sidebar
2. Select your configured AI provider
3. Start a conversation about your hydraulic project

### 2. Sample Questions to Try
```
Analyze the pressure distribution in this network
```

```
What are the potential issues with pipe P-101?
```

```
Suggest improvements for the pump efficiency
```

```
Generate a summary report for this analysis
```

### 3. Context-Aware Responses
Boorie automatically provides context about:
- Current network data
- Recent simulation results
- Project specifications
- Regional standards (if configured)

## 🔧 Basic Calculations

### 1. Pipe Sizing Calculator
1. Navigate to **Tools** → **Hydraulic Calculator**
2. Select **Pipe Sizing**
3. Enter parameters:
   - **Flow Rate**: 100 L/s
   - **Velocity Limit**: 2.0 m/s
   - **Material**: PVC
4. Click **Calculate**
5. Review recommended pipe diameter

### 2. Pump Selection
1. Select **Pump Selection** calculator
2. Enter system requirements:
   - **Flow Rate**: 150 L/s
   - **Head**: 50 m
   - **Efficiency**: 80%
3. View pump curve and power requirements

### 3. Tank Sizing
1. Choose **Tank Volume** calculator
2. Specify demand patterns and storage requirements
3. Get optimized tank dimensions

## 📊 Project Management

### 1. Add Documents
1. Go to **Project** → **Documents**
2. Click **Upload Document**
3. Add relevant files:
   - Technical specifications
   - Design drawings
   - Regulatory documents
   - Photos

### 2. Team Collaboration
1. Navigate to **Project** → **Team**
2. Add team members with email addresses
3. Set permissions:
   - **Viewer**: Read-only access
   - **Editor**: Can modify project
   - **Admin**: Full project control

### 3. Version Control
1. All changes are automatically tracked
2. View project history in **Project** → **History**
3. Restore previous versions if needed

## 🌍 Customization

### 1. Language Settings
1. Go to **Settings** → **General**
2. Select your preferred language:
   - **English**: International standards
   - **Español**: Latin American standards
   - **Català**: European standards

### 2. Regional Standards
1. Navigate to **Settings** → **Standards**
2. Choose your region:
   - **Mexico**: NOM standards
   - **Colombia**: Technical regulations
   - **Spain**: UNE standards
   - **International**: ISO standards

### 3. Theme and Display
1. **Settings** → **Appearance**
2. Choose theme:
   - **Light**: Default professional theme
   - **Dark**: Reduced eye strain
   - **Auto**: Follows system preference

## 🔍 Troubleshooting Quick Fixes

### Common Issues

#### AI Provider Not Responding
1. Check internet connection
2. Verify API key is correct
3. Check provider service status
4. Try a different provider

#### WNTR Analysis Fails
1. Verify Python environment: `./check-python-wntr.js`
2. Check network file format
3. Look for invalid node/pipe data
4. Try with a sample file first

#### Network Not Displaying
1. Check file format (must be .inp)
2. Verify coordinate data exists
3. Try zooming out (network might be very small/large)
4. Check for import errors in the console

#### Performance Issues
1. Close unnecessary applications
2. Check available RAM (4GB minimum)
3. Reduce network size for testing
4. Disable unnecessary features temporarily

### Getting Help
- 📚 [Full Documentation](Home.md)
- 🐛 [Report Issues](https://github.com/Boorie-AI/boorie_cliente/issues)
- 💬 [Community Chat](https://discord.gg/boorie)
- 📧 [Email Support](mailto:support@boorie.com)

## 🎯 Next Steps

### Explore Advanced Features
1. **[WNTR Integration](WNTR-Integration.md)**: Deep dive into water network analysis
2. **[AI Integration](AI-Integration.md)**: Advanced AI workflows
3. **[Project Management](Project-Management.md)**: Complex project handling

### Learn Hydraulic Engineering with Boorie
1. **[Engineering Calculations](Engineering-Calculations.md)**: Formula reference
2. **[Regional Standards](Regional-Standards.md)**: Compliance guidelines
3. **[Best Practices](Best-Practices.md)**: Professional workflows

### Join the Community
1. **[Contributing](Contributing.md)**: Help improve Boorie
2. **[Discussions](https://github.com/Boorie-AI/boorie_cliente/discussions)**: Ask questions
3. **[Discord](https://discord.gg/boorie)**: Real-time community support

---

**Congratulations!** 🎉 You've completed the quick start guide. You're now ready to use Boorie for professional hydraulic engineering projects.

**Estimated completion time**: 15-30 minutes

**What you've learned**:
- ✅ Basic Boorie navigation
- ✅ AI provider configuration  
- ✅ Project creation and management
- ✅ Network import and visualization
- ✅ Hydraulic simulation basics
- ✅ AI-powered analysis
- ✅ Basic troubleshooting
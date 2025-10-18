# Troubleshooting Guide

## 🔍 Overview

This comprehensive troubleshooting guide helps resolve common issues with Boorie. Issues are organized by category with step-by-step solutions.

## 🚀 Application Issues

### 1. Application Won't Start

#### **Symptoms**
- Application crashes on startup
- Error messages during launch
- Window doesn't appear

#### **Solutions**

**Check System Requirements**
```bash
# Verify Node.js version
node --version  # Should be 16.x or higher

# Check available memory
free -h  # Linux
vm_stat  # macOS
```

**Clear Application Cache**
```bash
# Remove cache directories
rm -rf ~/.boorie/cache
rm -rf ~/.boorie/logs

# On Windows
del /q "%APPDATA%\Boorie\cache\*"
```

**Run in Debug Mode**
```bash
# Enable debug logging
boorie --debug --log-level=debug

# Check console output for errors
tail -f ~/.boorie/logs/main.log
```

**Reset Configuration**
```bash
# Backup current config
cp ~/.boorie/config.json ~/.boorie/config.json.backup

# Reset to defaults
rm ~/.boorie/config.json
```

### 2. Performance Issues

#### **Symptoms**
- Slow application response
- High CPU/memory usage
- Freezing during operations

#### **Solutions**

**Monitor Resource Usage**
```bash
# Check process resources
ps aux | grep boorie
top -p $(pgrep boorie)

# On Windows
tasklist | findstr boorie
```

**Optimize Settings**
```json
{
  "performance": {
    "reduceAnimations": true,
    "limitSimultaneousOperations": 2,
    "backgroundProcessing": false,
    "memoryLimit": "2GB"
  }
}
```

**Clear Temporary Files**
```bash
# Clean temp directories
rm -rf /tmp/wntr-*
rm -rf ~/.boorie/temp/*

# Clear database vacuum
npm run db:vacuum
```

### 3. Window Display Issues

#### **Symptoms**
- Blank/white screen
- Missing UI elements
- Scaling problems

#### **Solutions**

**Disable Hardware Acceleration**
```bash
boorie --disable-gpu --disable-software-rasterizer
```

**Reset Window State**
```javascript
// In developer console (Ctrl+Shift+I)
localStorage.removeItem('window-state');
location.reload();
```

**Check Display Settings**
```bash
# Verify display configuration
xrandr  # Linux
system_profiler SPDisplaysDataType  # macOS
```

## 🤖 AI Provider Issues

### 1. API Connection Failures

#### **Symptoms**
- "Failed to connect to AI provider"
- Timeout errors
- Authentication failures

#### **Solutions**

**Verify API Keys**
```bash
# Test OpenAI connection
curl -H "Authorization: Bearer sk-your-key" \
  https://api.openai.com/v1/models

# Test Anthropic connection  
curl -H "x-api-key: sk-ant-your-key" \
  https://api.anthropic.com/v1/messages
```

**Check Network Connectivity**
```bash
# Test internet connection
ping api.openai.com
nslookup api.anthropic.com

# Check proxy settings
curl -I --proxy http://proxy:8080 https://api.openai.com
```

**Update Configuration**
```json
{
  "ai": {
    "timeout": 60000,
    "retries": 5,
    "fallbackProvider": "anthropic",
    "proxy": {
      "enabled": false,
      "host": "proxy.company.com",
      "port": 8080
    }
  }
}
```

### 2. Poor Response Quality

#### **Symptoms**
- Irrelevant answers
- Calculation errors
- Incomplete responses

#### **Solutions**

**Optimize Prompts**
```typescript
// Provide more context
const prompt = `
As a hydraulic engineer working on a water distribution system in Mexico:
- Network has 150 nodes and 200 pipes
- Design pressure: 20-50 m
- Flow rates: 50-300 L/s
- Following NOM-127-SSA1 standards

Question: ${userQuestion}
`;
```

**Adjust Model Parameters**
```json
{
  "temperature": 0.1,     // More precise
  "maxTokens": 4000,      // Longer responses  
  "topP": 0.8,           // Focused sampling
  "presencePenalty": 0.1  // Reduce repetition
}
```

**Switch Models**
```typescript
// For calculations: Use GPT-4 or Claude Sonnet
// For creative tasks: Use GPT-3.5-turbo
// For code: Use Claude or CodeLlama
```

### 3. Rate Limiting Issues

#### **Symptoms**
- "Rate limit exceeded" errors
- Slow response times
- Request rejections

#### **Solutions**

**Implement Request Queuing**
```typescript
const rateLimiter = {
  requests: [],
  maxPerMinute: 60,
  
  async addRequest(request) {
    if (this.requests.length >= this.maxPerMinute) {
      await this.wait(60000);
    }
    return this.execute(request);
  }
};
```

**Use Multiple Providers**
```json
{
  "providers": [
    {"name": "openai", "priority": 1, "limit": 100},
    {"name": "anthropic", "priority": 2, "limit": 50},
    {"name": "openrouter", "priority": 3, "limit": 200}
  ]
}
```

## 🐍 Python/WNTR Issues

### 1. Python Environment Problems

#### **Symptoms**
- "Python not found" errors
- Import errors for WNTR
- Version compatibility issues

#### **Solutions**

**Verify Python Installation**
```bash
# Check Python version
python --version
python3 --version

# Check WNTR installation
python -c "import wntr; print(wntr.__version__)"

# List installed packages
pip list | grep -E "(numpy|scipy|pandas|networkx|wntr)"
```

**Recreate Virtual Environment**
```bash
# Remove existing environment
rm -rf venv-wntr

# Create new environment
python3 -m venv venv-wntr
source venv-wntr/bin/activate

# Install dependencies
pip install --upgrade pip
pip install numpy>=1.20 scipy>=1.7 pandas>=1.3 networkx>=2.6 matplotlib>=3.4 wntr>=0.5.0
```

**Update Environment Path**
```bash
# Find Python path
which python

# Update .env file
echo "PYTHON_PATH=$(which python)" > .env
```

### 2. WNTR Simulation Failures

#### **Symptoms**
- Simulation timeouts
- Convergence errors
- Memory errors

#### **Solutions**

**Check Network File**
```python
import wntr

# Validate network file
try:
    wn = wntr.network.WaterNetworkModel('network.inp')
    print(f"Nodes: {len(wn.junction_name_list)}")
    print(f"Pipes: {len(wn.pipe_name_list)}")
except Exception as e:
    print(f"Network error: {e}")
```

**Optimize Simulation Parameters**
```python
# Adjust solver settings
wn.options.time.duration = 24 * 3600  # 24 hours
wn.options.time.hydraulic_timestep = 3600  # 1 hour
wn.options.hydraulic.accuracy = 0.001
wn.options.hydraulic.trials = 100
wn.options.hydraulic.checkfreq = 2
```

**Handle Large Networks**
```python
# Simplify network for analysis
def simplify_network(wn, min_diameter=100):
    """Remove small pipes to reduce complexity"""
    pipes_to_remove = []
    for pipe_name in wn.pipe_name_list:
        pipe = wn.get_link(pipe_name)
        if pipe.diameter * 1000 < min_diameter:  # Convert to mm
            pipes_to_remove.append(pipe_name)
    
    for pipe_name in pipes_to_remove:
        wn.remove_link(pipe_name)
    
    return wn
```

### 3. Memory and Performance Issues

#### **Symptoms**
- Out of memory errors
- Slow simulation times
- Process crashes

#### **Solutions**

**Increase Memory Limits**
```bash
# Set memory environment variables
export PYTHONMALLOC=malloc
export OMP_NUM_THREADS=4

# Limit WNTR memory usage
export WNTR_MAX_MEMORY=4096  # MB
```

**Optimize Network Size**
```python
def reduce_network_complexity(wn):
    """Reduce network complexity for faster simulation"""
    
    # Remove unnecessary nodes
    small_demands = []
    for junction_name in wn.junction_name_list:
        junction = wn.get_node(junction_name)
        total_demand = sum([d.base_value for d in junction.demand_timeseries_list])
        if total_demand < 0.001:  # Very small demands
            small_demands.append(junction_name)
    
    # Merge small pipes
    short_pipes = []
    for pipe_name in wn.pipe_name_list:
        pipe = wn.get_link(pipe_name)
        if pipe.length < 10:  # Very short pipes
            short_pipes.append(pipe_name)
    
    return wn
```

**Use Parallel Processing**
```python
import multiprocessing as mp

def run_parallel_simulation(networks):
    """Run multiple networks in parallel"""
    with mp.Pool(processes=mp.cpu_count()) as pool:
        results = pool.map(simulate_network, networks)
    return results
```

## 💾 Database Issues

### 1. Database Connection Failures

#### **Symptoms**
- "Database locked" errors
- Connection timeouts
- Corruption warnings

#### **Solutions**

**Check Database File**
```bash
# Verify database exists and permissions
ls -la prisma/hydraulic.db
sqlite3 prisma/hydraulic.db ".tables"

# Check database integrity
sqlite3 prisma/hydraulic.db "PRAGMA integrity_check;"
```

**Fix Database Locks**
```bash
# Kill locked processes
lsof prisma/hydraulic.db
kill -9 <PID>

# Remove lock files
rm -f prisma/hydraulic.db-wal
rm -f prisma/hydraulic.db-shm
```

**Repair Database**
```bash
# Backup current database
cp prisma/hydraulic.db prisma/hydraulic.db.backup

# Vacuum database
sqlite3 prisma/hydraulic.db "VACUUM;"

# Regenerate if needed
npm run db:push --force-reset
```

### 2. Migration Failures

#### **Symptoms**
- Schema mismatch errors
- Migration conflicts
- Data loss warnings

#### **Solutions**

**Reset Database Schema**
```bash
# Backup data first
npm run db:backup

# Reset schema
npx prisma db push --force-reset

# Restore data
npm run db:restore
```

**Manual Migration**
```sql
-- Check current schema
.schema

-- Add missing columns
ALTER TABLE HydraulicProject ADD COLUMN new_field TEXT;

-- Update data types
-- (SQLite limitations may require table recreation)
```

### 3. Performance Issues

#### **Symptoms**
- Slow queries
- High disk usage
- Memory leaks

#### **Solutions**

**Optimize Database**
```sql
-- Create indexes
CREATE INDEX idx_project_created ON HydraulicProject(createdAt);
CREATE INDEX idx_calculation_project ON HydraulicCalculation(projectId);

-- Analyze query plans
EXPLAIN QUERY PLAN SELECT * FROM HydraulicProject WHERE userId = ?;
```

**Clean Old Data**
```sql
-- Remove old calculations
DELETE FROM HydraulicCalculation 
WHERE createdAt < datetime('now', '-30 days');

-- Vacuum to reclaim space
VACUUM;
```

## 🗂️ File Import/Export Issues

### 1. EPANET File Problems

#### **Symptoms**
- Parse errors
- Missing data
- Format incompatibility

#### **Solutions**

**Validate File Format**
```bash
# Check file encoding
file network.inp
head -n 10 network.inp

# Verify EPANET format
grep -E "\[(JUNCTIONS|PIPES|RESERVOIRS)\]" network.inp
```

**Fix Common Issues**
```python
def fix_epanet_file(filename):
    """Fix common EPANET file issues"""
    with open(filename, 'r') as f:
        content = f.read()
    
    # Fix line endings
    content = content.replace('\r\n', '\n')
    
    # Remove empty lines in sections
    lines = content.split('\n')
    fixed_lines = []
    in_section = False
    
    for line in lines:
        if line.startswith('[') and line.endswith(']'):
            in_section = True
            fixed_lines.append(line)
        elif in_section and line.strip() == '':
            continue  # Skip empty lines in sections
        else:
            fixed_lines.append(line)
    
    with open(filename + '.fixed', 'w') as f:
        f.write('\n'.join(fixed_lines))
```

**Handle Coordinate Issues**
```python
def add_coordinates(wn):
    """Add coordinates to nodes without them"""
    import networkx as nx
    
    # Get network graph
    G = wn.get_graph()
    
    # Generate layout for nodes without coordinates
    pos = nx.spring_layout(G, k=1000, iterations=50)
    
    for node_name in wn.junction_name_list:
        node = wn.get_node(node_name)
        if node.coordinates is None or node.coordinates == (0, 0):
            if node_name in pos:
                x, y = pos[node_name]
                node.coordinates = (x, y)
```

### 2. Export Problems

#### **Symptoms**
- Incomplete exports
- Format errors
- Missing data

#### **Solutions**

**Verify Export Data**
```typescript
const validateExport = (data: any, format: string) => {
  switch (format) {
    case 'json':
      return JSON.parse(JSON.stringify(data));
    case 'csv':
      return data.every(row => Object.keys(row).length > 0);
    case 'epanet':
      return data.includes('[JUNCTIONS]') && data.includes('[PIPES]');
  }
};
```

**Handle Large Exports**
```typescript
const exportLargeData = async (data: any[], filename: string) => {
  const chunkSize = 1000;
  const stream = fs.createWriteStream(filename);
  
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const csvChunk = chunk.map(row => Object.values(row).join(',')).join('\n');
    stream.write(csvChunk + '\n');
    
    // Allow other operations
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  stream.end();
};
```

## 🌐 Network and Connectivity

### 1. Internet Connection Issues

#### **Symptoms**
- API timeouts
- Update failures
- Sync problems

#### **Solutions**

**Test Connectivity**
```bash
# Basic connectivity
ping 8.8.8.8
nslookup google.com

# Test specific endpoints
curl -I https://api.openai.com
curl -I https://api.anthropic.com
```

**Configure Proxy**
```json
{
  "proxy": {
    "enabled": true,
    "host": "proxy.company.com",
    "port": 8080,
    "auth": {
      "username": "user",
      "password": "pass"
    },
    "bypass": ["localhost", "127.0.0.1"]
  }
}
```

### 2. Firewall Issues

#### **Symptoms**
- Blocked connections
- Port access denied
- SSL/TLS errors

#### **Solutions**

**Check Required Ports**
```bash
# AI Provider APIs
443 (HTTPS) - api.openai.com, api.anthropic.com
80 (HTTP) - fallback connections

# Ollama Local
11434 - localhost Ollama server

# Mapbox
443 - api.mapbox.com
```

**Configure Firewall Rules**
```bash
# Linux (iptables)
sudo iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT

# macOS (pfctl)
echo "pass out proto tcp from any to any port 443" | sudo pfctl -f -

# Windows (netsh)
netsh advfirewall firewall add rule name="Boorie HTTPS" dir=out action=allow protocol=TCP localport=443
```

## 🔧 Development Issues

### 1. Build Failures

#### **Symptoms**
- Compilation errors
- Missing dependencies
- Version conflicts

#### **Solutions**

**Clean Build Environment**
```bash
# Clean all caches
npm cache clean --force
rm -rf node_modules package-lock.json
rm -rf dist dist-electron

# Reinstall dependencies
npm install

# Rebuild native modules
npm run rebuild
```

**Fix TypeScript Errors**
```bash
# Update TypeScript
npm install -g typescript@latest

# Check configuration
npx tsc --noEmit

# Generate types
npm run db:generate
```

### 2. Hot Reload Issues

#### **Symptoms**
- Changes not reflected
- Development server crashes
- Memory leaks

#### **Solutions**

**Restart Development Server**
```bash
# Kill existing processes
pkill -f "vite\|electron"

# Clear temp files
rm -rf .vite/

# Restart development
npm run dev
```

**Configure File Watching**
```json
{
  "vite": {
    "server": {
      "watch": {
        "usePolling": true,
        "interval": 1000
      }
    }
  }
}
```

## 📋 Diagnostic Tools

### 1. Built-in Diagnostics

#### System Information
```typescript
// Get system info
const sysInfo = await window.electronAPI.system.getInfo();
console.log('Platform:', sysInfo.platform);
console.log('Memory:', sysInfo.memory);
console.log('CPU:', sysInfo.cpu);
```

#### Application Logs
```bash
# View application logs
tail -f ~/.boorie/logs/main.log
tail -f ~/.boorie/logs/renderer.log
tail -f ~/.boorie/logs/wntr.log
```

### 2. Debug Mode

Enable comprehensive debugging:

```bash
# Start with debug flags
DEBUG=* boorie --debug --log-level=debug

# Enable developer tools
boorie --enable-dev-tools

# Disable security (development only)
boorie --disable-web-security --ignore-certificate-errors
```

### 3. Performance Profiling

```typescript
// Profile performance
console.time('operation');
await performOperation();
console.timeEnd('operation');

// Memory usage
console.log('Memory:', process.memoryUsage());

// CPU profiling (development)
if (process.env.NODE_ENV === 'development') {
  const profiler = require('v8-profiler-next');
  profiler.startProfiling('operation');
  // ... code to profile
  const profile = profiler.stopProfiling();
  profile.export().pipe(fs.createWriteStream('profile.cpuprofile'));
}
```

## 🆘 Getting Help

### 1. Self-Help Resources
- 📚 [Documentation Wiki](Home.md)
- 🔍 [FAQ](FAQ.md)
- 🎯 [Quick Start Guide](Quick-Start.md)

### 2. Community Support
- 💬 [GitHub Discussions](https://github.com/Boorie-AI/boorie_cliente/discussions)
- 🐛 [Issue Tracker](https://github.com/Boorie-AI/boorie_cliente/issues)
- 📧 [Discord Community](https://discord.gg/boorie)

### 3. Professional Support
- 📞 Technical Support: support@boorie.com
- 🏢 Enterprise Support: enterprise@boorie.com
- 🎓 Training Services: training@boorie.com

### 4. Reporting Bugs

When reporting issues, include:

```
**Environment:**
- OS: [macOS/Windows/Linux version]
- Boorie Version: [x.y.z]
- Node.js: [version]
- Python: [version]

**Issue Description:**
[Clear description of the problem]

**Steps to Reproduce:**
1. [First step]
2. [Second step]
3. [Third step]

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Logs:**
[Relevant log entries]

**Screenshots:**
[If applicable]
```

---

**Remember**: Most issues can be resolved by following these troubleshooting steps. If problems persist, don't hesitate to reach out to the community or support team.
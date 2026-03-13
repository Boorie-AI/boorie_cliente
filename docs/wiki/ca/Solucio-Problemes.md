# Guia de Solució de Problemes

## Descripció General

Aquesta guia completa de solució de problemes ajuda a resoldre problemes comuns amb Boorie. Els problemes estan organitzats per categoria amb solucions pas a pas.

## Problemes de l'Aplicació

### 1. L'Aplicació No Inicia

#### **Símptomes**
- L'aplicació es tanca inesperadament en iniciar
- Missatges d'error durant el llançament
- La finestra no apareix

#### **Solucions**

**Verificar Requisits del Sistema**
```bash
# Verificar versió de Node.js
node --version  # Ha de ser 16.x o superior

# Verificar memòria disponible
free -h  # Linux
vm_stat  # macOS
```

**Netejar Caché de l'Aplicació**
```bash
# Eliminar directoris de caché
rm -rf ~/.boorie/cache
rm -rf ~/.boorie/logs

# A Windows
del /q "%APPDATA%\Boorie\cache\*"
```

**Executar en Mode de Depuració**
```bash
boorie --debug --log-level=debug
tail -f ~/.boorie/logs/main.log
```

**Restablir Configuració**
```bash
cp ~/.boorie/config.json ~/.boorie/config.json.backup
rm ~/.boorie/config.json
```

### 2. Problemes de Rendiment

#### **Símptomes**
- Resposta lenta de l'aplicació
- Alt ús de CPU/memòria
- Congelament durant operacions

#### **Solucions**

**Monitoritzar Ús de Recursos**
```bash
ps aux | grep boorie
top -p $(pgrep boorie)
```

**Optimitzar Ajustos**
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

**Netejar Arxius Temporals**
```bash
rm -rf /tmp/wntr-*
rm -rf ~/.boorie/temp/*
```

### 3. Problemes de Visualització de Finestra

#### **Solucions**

**Desactivar Acceleració per Hardware**
```bash
boorie --disable-gpu --disable-software-rasterizer
```

**Restablir Estat de Finestra**
```javascript
// A la consola de desenvolupament (Ctrl+Shift+I)
localStorage.removeItem('window-state');
location.reload();
```

## Problemes amb Proveïdors AI

### 1. Fallades de Connexió API

#### **Solucions**

**Verificar Claus API**
```bash
# Provar connexió OpenAI
curl -H "Authorization: Bearer sk-your-key" \
  https://api.openai.com/v1/models

# Provar connexió Anthropic
curl -H "x-api-key: sk-ant-your-key" \
  https://api.anthropic.com/v1/messages
```

**Verificar Connectivitat de Xarxa**
```bash
ping api.openai.com
nslookup api.anthropic.com
```

### 2. Qualitat de Resposta Deficient

**Optimitzar Prompts**
```typescript
const prompt = `
Com a enginyer hidràulic treballant en un sistema de distribució d'aigua:
- La xarxa té 150 nodes i 200 canonades
- Pressió de disseny: 20-50 m
- Cabals: 50-300 L/s
- Seguint estàndards NOM-127-SSA1

Pregunta: ${userQuestion}
`;
```

**Ajustar Paràmetres del Model**
```json
{
  "temperature": 0.1,
  "maxTokens": 4000,
  "topP": 0.8,
  "presencePenalty": 0.1
}
```

### 3. Problemes de Límit de Taxa

**Usar Múltiples Proveïdors**
```json
{
  "providers": [
    {"name": "openai", "priority": 1, "limit": 100},
    {"name": "anthropic", "priority": 2, "limit": 50},
    {"name": "openrouter", "priority": 3, "limit": 200}
  ]
}
```

## Problemes amb Python/WNTR

### 1. Problemes de l'Entorn Python

**Verificar Instal·lació de Python**
```bash
python --version
python3 --version
python -c "import wntr; print(wntr.__version__)"
pip list | grep -E "(numpy|scipy|pandas|networkx|wntr)"
```

**Recrear Entorn Virtual**
```bash
rm -rf venv-wntr
python3 -m venv venv-wntr
source venv-wntr/bin/activate
pip install --upgrade pip
pip install numpy>=1.20 scipy>=1.7 pandas>=1.3 networkx>=2.6 matplotlib>=3.4 wntr>=0.5.0
```

### 2. Fallades de Simulació WNTR

**Verificar Arxiu de Xarxa**
```python
import wntr

try:
    wn = wntr.network.WaterNetworkModel('network.inp')
    print(f"Nodes: {len(wn.junction_name_list)}")
    print(f"Canonades: {len(wn.pipe_name_list)}")
except Exception as e:
    print(f"Error de xarxa: {e}")
```

**Optimitzar Paràmetres de Simulació**
```python
wn.options.time.duration = 24 * 3600
wn.options.time.hydraulic_timestep = 3600
wn.options.hydraulic.accuracy = 0.001
wn.options.hydraulic.trials = 100
```

### 3. Problemes de Memòria i Rendiment

**Augmentar Límits de Memòria**
```bash
export PYTHONMALLOC=malloc
export OMP_NUM_THREADS=4
export WNTR_MAX_MEMORY=4096
```

## Problemes de Base de Dades

### 1. Fallades de Connexió a Base de Dades

**Verificar Arxiu de Base de Dades**
```bash
ls -la prisma/hydraulic.db
sqlite3 prisma/hydraulic.db ".tables"
sqlite3 prisma/hydraulic.db "PRAGMA integrity_check;"
```

**Corregir Bloquejos de Base de Dades**
```bash
lsof prisma/hydraulic.db
kill -9 <PID>
rm -f prisma/hydraulic.db-wal
rm -f prisma/hydraulic.db-shm
```

**Reparar Base de Dades**
```bash
cp prisma/hydraulic.db prisma/hydraulic.db.backup
sqlite3 prisma/hydraulic.db "VACUUM;"
```

## Problemes d'Importació/Exportació d'Arxius

### 1. Problemes amb Arxius EPANET

**Validar Format d'Arxiu**
```bash
file network.inp
head -n 10 network.inp
grep -E "\[(JUNCTIONS|PIPES|RESERVOIRS)\]" network.inp
```

## Problemes de Desenvolupament

### 1. Fallades de Compilació

**Netejar Entorn de Compilació**
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
rm -rf dist dist-electron
npm install
npm run rebuild
```

**Corregir Errors de TypeScript**
```bash
npm install -g typescript@latest
npx tsc --noEmit
npm run db:generate
```

### 2. Problemes de Recàrrega en Calent

**Reiniciar Servidor de Desenvolupament**
```bash
pkill -f "vite\|electron"
rm -rf .vite/
npm run dev
```

## Eines de Diagnòstic

### 1. Diagnòstics Integrats

#### Informació del Sistema
```typescript
const sysInfo = await window.electronAPI.system.getInfo();
console.log('Plataforma:', sysInfo.platform);
console.log('Memòria:', sysInfo.memory);
console.log('CPU:', sysInfo.cpu);
```

#### Registres de l'Aplicació
```bash
tail -f ~/.boorie/logs/main.log
tail -f ~/.boorie/logs/renderer.log
tail -f ~/.boorie/logs/wntr.log
```

### 2. Mode de Depuració

```bash
DEBUG=* boorie --debug --log-level=debug
boorie --enable-dev-tools
```

## Obtenir Ajuda

### 1. Recursos d'Autoajuda
- [Wiki de Documentació](Home.md)
- [FAQ](FAQ.md)
- [Guia d'Inici Ràpid](Inici-Rapid.md)

### 2. Suport de la Comunitat
- [Discussions a GitHub](https://github.com/Boorie-AI/boorie_cliente/discussions)
- [Seguiment de Problemes](https://github.com/Boorie-AI/boorie_cliente/issues)
- [Comunitat a Discord](https://discord.gg/boorie)

### 3. Suport Professional
- Suport Tècnic: support@boorie.com
- Suport Empresarial: enterprise@boorie.com
- Serveis de Formació: training@boorie.com

### 4. Reportar Errors

Quan reportis problemes, inclou:

```
**Entorn:**
- SO: [versió de macOS/Windows/Linux]
- Versió de Boorie: [x.y.z]
- Node.js: [versió]
- Python: [versió]

**Descripció del Problema:**
[Descripció clara del problema]

**Passos per Reproduir:**
1. [Primer pas]
2. [Segon pas]
3. [Tercer pas]

**Comportament Esperat:**
[Què hauria de succeir]

**Comportament Real:**
[Què succeeix realment]

**Registres:**
[Entrades de registre rellevants]

**Captures de Pantalla:**
[Si aplica]
```

---

**Recorda**: La majoria dels problemes poden resoldre's seguint aquests passos de solució de problemes. Si els problemes persisteixen, no dubtis a contactar la comunitat o l'equip de suport.

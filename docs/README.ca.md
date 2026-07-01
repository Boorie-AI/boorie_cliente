# Boorie - Client d'Escriptori AI Avançat per a Enginyers Hidràulics

![Logo de Boorie](resources/icon.png)

**Boorie** és un client d'escriptori AI especialitzat dissenyat específicament per a enginyers hidràulics. Construït amb tecnologies web modernes i integrat amb capacitats AI avançades, combina xat AI multiproveïdors amb eines especialitzades d'enginyeria hidràulica, integració WNTR per a anàlisi de xarxes d'aigua i funcions completes de gestió de projectes.

## 🎯 Característiques Principals

### 🤖 Integració AI Multiproveïdors
- **Proveïdors Suportats**: OpenAI, Anthropic Claude, Google Gemini, OpenRouter, Ollama
- **Context Especialitzat**: Experiència en el domini d'enginyeria hidràulica
- **Sistema RAG**: Recuperació de coneixement de documentació tècnica i regulacions
- **Respostes Conscients del Context**: Processament de consultes específiques d'enginyeria

### 🔧 Eines d'Enginyeria Hidràulica
- **Integració WNTR**: Anàlisi amb Water Network Tool for Resilience
- **Anàlisi de Xarxes**: Carregar i visualitzar fitxers EPANET (.inp)
- **Simulacions Hidràuliques**: Executar simulacions completes de sistemes d'aigua
- **Motor de Càlcul**: Dimensionat de canonades, selecció de bombes, càlculs de volum de dipòsits
- **Compliment Normatiu**: Suport per a múltiples estàndards regionals

### 📊 Analítiques Avançades
- **Microsoft Clarity**: Analítiques completes de comportament de l'usuari
- **Seguiment de Rendiment**: Seguiment especialitzat per a càlculs hidràulics
- **Monitoratge d'Errors**: Seguiment i informe d'errors en temps real
- **Perspectives d'Ús**: Analítiques detallades per a fluxos de treball d'enginyeria

### 🌐 Visualització de Xarxes
- **Diagrames Interactius**: Integració vis-network per a xarxes hidràuliques
- **Vistes Geogràfiques**: Integració Mapbox per a anàlisi espacial
- **Topologia de Xarxa**: Anàlisi de connectivitat i components
- **Actualitzacions en Temps Real**: Visualització dinàmica de resultats de simulació

### 🗂️ Gestió de Projectes
- **Projectes Hidràulics**: Crear i gestionar projectes d'enginyeria
- **Gestió de Documents**: Pujar i organitzar documents tècnics
- **Col·laboració en Equip**: Suport de projectes multiusuari
- **Control de Versions**: Seguiment de canvis i historial de projectes

## 📦 Descarregar i Instal·lar

### 🚀 Última Versió - v1.4.3

| Plataforma | Arquitectura | Descàrrega | Mida |
|------------|-------------|------------|------|
| 🍎 **macOS** | ARM64 (M1/M2/M3) | [Boorie-1.4.3-arm64.dmg](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.4.3/Boorie-1.4.3-arm64.dmg) | ~279 MB |
| 🪟 **Windows** | x64 | [Boorie.Setup.1.4.3.exe](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.4.3/Boorie.Setup.1.4.3.exe) | ~223 MB |
| 🐧 **Linux** | x64 | [Boorie-1.4.3.AppImage](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.4.3/Boorie-1.4.3.AppImage) | ~344 MB |

### 📝 Novetats a v1.4.3
- **Fix #15**: els projectes no apareixien al selector de projectes del Chat (un sol projecte amb dades corruptes buidava silenciosament tota la llista).
- **Fix #14**: documents del Wisdom Center encallats en "Not Indexed" a Windows (URL d'Ollama fixada a una IP de LAN en lloc de `localhost`).
- Refactorització del logger de backend i actualització de dependències.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.4.3).

📖 Documentació completa: [GitHub Wiki](https://github.com/Boorie-AI/boorie_cliente/wiki)

### Instruccions d'Instal·lació

#### macOS
1. Descarrega l'arxiu DMG de l'enllaç anterior
2. Obre l'arxiu DMG descarregat
3. Arrossega Boorie.app a la teva carpeta Aplicacions
4. Executa Boorie des d'Aplicacions

#### Linux
1. Descarrega `Boorie-1.4.3.AppImage` de l'enllaç anterior
2. Dona-li permisos d'execució: `chmod +x Boorie-1.4.3.AppImage`
3. Executa: `./Boorie-1.4.3.AppImage`

#### Windows
1. Descarrega `Boorie Setup 1.4.3.exe` de l'enllaç anterior
2. Executa l'instal·lador i segueix l'assistent
3. Inicia Boorie des del Menú Inici o l'accés directe de l'Escriptori

### 🔗 Totes les Versions
Veure totes les versions disponibles: [**GitHub Releases**](https://github.com/Boorie-AI/boorie_cliente/releases)

## 🛠️ Configuració de Desenvolupament

### Requisits Previs
- Node.js 18+ i npm
- Python 3.8+ amb pip
- Git

### Instal·lació

1. **Clonar el repositori**
   ```bash
   git clone https://github.com/your-username/boorie_cliente.git
   cd boorie_cliente
   ```

2. **Instal·lar dependències**
   ```bash
   npm install
   ```

3. **Configurar entorn Python per a WNTR**
   ```bash
   ./setup-python-wntr.sh
   ```

4. **Configurar variables d'entorn**
   ```bash
   cp .env.example .env
   # Editar .env amb la teva configuració
   ```

5. **Inicialitzar base de dades**
   ```bash
   npm run db:generate
   npm run db:push
   ```

6. **Iniciar entorn de desenvolupament**
   ```bash
   npm run dev
   ```

## 🛠️ Desenvolupament

### Scripts Disponibles

| Comanda | Descripció |
|---------|-------------|
| `npm run dev` | Iniciar entorn de desenvolupament complet |
| `npm run dev:vite` | Només frontend (http://localhost:3000) |
| `npm run dev:electron` | Només Electron |
| `npm run build` | Construir frontend i Electron |
| `npm run build:app` | Crear paquets distribuïbles |
| `npm run dist` | Crear paquets distribuïbles (DMG/NSIS/AppImage) |
| `npm run lint` | Executar verificacions ESLint |
| `npm run lint:fix` | Auto-corregir problemes ESLint |
| `npm run typecheck` | Verificació de tipus TypeScript |

### Comandes de Base de Dades

| Comanda | Descripció |
|---------|-------------|
| `npm run db:generate` | Generar client Prisma |
| `npm run db:push` | Enviar canvis d'esquema |
| `npm run db:migrate` | Executar migracions de base de dades |

### Comandes Python/WNTR

| Comanda | Descripció |
|---------|-------------|
| `./setup-python-wntr.sh` | Configuració inicial entorn WNTR |
| `./activate-wntr.sh` | Activar entorn WNTR |
| `./run-with-wntr.sh` | Executar comandes en entorn WNTR |
| `./check-python-wntr.js` | Verificar instal·lació WNTR |

## 🏗️ Arquitectura

### Stack Tecnològic
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **Gestió d'Estat**: Zustand + React Context
- **Components UI**: Primitius Radix UI
- **Backend**: Electron 28 + TypeScript + Prisma ORM
- **Base de Dades**: SQLite amb suport d'encriptació
- **Analítiques**: Integració Microsoft Clarity
- **Hidràulica**: Integració Python WNTR
- **Visualització**: vis-network + Mapbox
- **Build**: Vite + scripts de build Electron personalitzats

### Estructura del Projecte
```
boorie_cliente/
├── backend/              # Lògica de negoci backend
│   ├── models/           # Models de dades
│   └── services/         # Serveis principals
│       └── hydraulic/    # Serveis específics hidràulics
├── electron/             # Procés principal Electron
│   ├── handlers/         # Manejadors IPC per domini
│   └── services/         # Serveis del sistema
├── src/                  # Frontend React
│   ├── components/       # Components UI
│   │   ├── hydraulic/    # Components enginyeria hidràulica
│   │   └── ui/           # Components UI reutilitzables
│   ├── services/         # Serveis frontend
│   ├── stores/           # Gestió estat Zustand
│   └── types/            # Definicions TypeScript
├── prisma/               # Esquema base de dades
├── rag-knowledge/        # Base de coneixement hidràulic
│   ├── hydraulics/       # Documentació tècnica
│   ├── regulations/      # Estàndards regionals
│   └── best-practices/   # Guies d'indústria
└── venv-wntr/           # Entorn Python WNTR
```

## 🔧 Configuració

### Variables d'Entorn

Crear un fitxer `.env` al directori arrel:

```env
# Analítiques Microsoft Clarity
VITE_CLARITY_PROJECT_ID=el_teu_projecte_clarity_id
VITE_CLARITY_ENABLED=true

# Configuració Mapbox
VITE_MAPBOX_ACCESS_TOKEN=el_teu_token_mapbox
VITE_DEFAULT_MAP_LNG=-70.9
VITE_DEFAULT_MAP_LAT=42.35
VITE_DEFAULT_MAP_ZOOM=9

# Configuració Python
PYTHON_PATH=/ruta/a/python/amb/wntr

# Configuració OAuth (Opcional)
MS_CLIENT_ID=el_teu_microsoft_client_id
GOOGLE_CLIENT_ID=el_teu_google_client_id
GOOGLE_CLIENT_SECRET=el_teu_google_secret
```

### Configuració Proveïdors AI

Configura els teus proveïdors AI als ajustos de l'aplicació:

1. **OpenAI**: Requereix clau API
2. **Anthropic Claude**: Requereix clau API
3. **Google Gemini**: Requereix clau API
4. **OpenRouter**: Requereix clau API
5. **Ollama**: Requereix instal·lació local

## 🌊 Característiques d'Enginyeria Hidràulica

### Integració WNTR
- **Suport d'Arxius**: Importar/exportar arxius EPANET (.inp)
- **Tipus de Simulació**: Anàlisi hidràulic i de qualitat d'aigua
- **Anàlisi de Xarxa**: Topologia, connectivitat i anàlisi de components
- **Exportació de Resultats**: Format JSON amb dades completes

### Motor de Càlcul
- **Dimensionat de Canonades**: Equacions Darcy-Weisbach i Hazen-Williams
- **Anàlisi de Bombes**: Anàlisi de corbes i eines de selecció
- **Càlculs de Dipòsits**: Còmputs de volum i dimensionat
- **Pèrdua de Càrrega**: Càlculs complets de pèrdua per fricció

### Estàndards Regionals
- **Mèxic**: Normes NOM i regulacions
- **Colòmbia**: Estàndards tècnics i millors pràctiques
- **Espanya**: Normes UNE i regulacions
- **Internacional**: ISO i altres estàndards globals

## 📊 Analítiques i Monitoratge

### Integració Microsoft Clarity
- **Comportament de l'Usuari**: Seguiment complet d'interaccions
- **Mètriques de Rendiment**: Monitoratge de rendiment d'aplicació
- **Seguiment d'Errors**: Detecció i informe d'errors en temps real
- **Esdeveniments Personalitzats**: Seguiment especialitzat per a operacions hidràuliques

### Esdeveniments Rastrejats
- Càlculs i simulacions hidràuliques
- Operacions d'anàlisi WNTR
- Importacions i exportacions d'arxius
- Activitats de gestió de projectes
- Interaccions de xat AI
- Ocurrències d'errors i problemes del sistema

## 🔒 Característiques de Seguretat

- **Aïllament de Context**: Arquitectura Electron segura
- **Emmagatzematge Encriptat**: Encriptació de claus API i dades sensibles
- **Integració OAuth**: Autenticació segura amb proveïdors principals
- **Política de Seguretat de Contingut**: CSP estricta per a seguretat web
- **Seguretat IPC**: Comunicació inter-procés tipus-segura

## 🌍 Internacionalització

Suport per a múltiples idiomes:
- **Anglès** (predeterminat)
- **Espanyol (ES)**
- **Català (CA)**

La terminologia tècnica està localitzada per als estàndards d'enginyeria de cada regió.

## 🧪 Proves

### Arxius de Prova
- Arxius de prova WNTR a `test-files/`
- Guies de proves visuals incloses
- Xarxes d'exemple per a validació

### Executar Proves
```bash
# Proves de funcionalitat WNTR
python test-files/test-wntr-complete.py

# Amb entorn WNTR
./run-with-wntr.sh python test-files/test-wntr-complete.py
```

## 📦 Construcció i Distribució

### Build de Desenvolupament
```bash
npm run build
```

### Distribució de Producció
```bash
npm run dist
```

### Builds Específics per Plataforma
- **macOS**: Instal·lador DMG
- **Windows**: Instal·lador NSIS  
- **Linux**: AppImage

## 🤝 Contribuir

1. Fer fork del repositori
2. Crear branca de característica (`git checkout -b feature/caracteristica-increible`)
3. Commit de canvis (`git commit -m 'Afegir característica increïble'`)
4. Push a la branca (`git push origin feature/caracteristica-increible`)
5. Obrir Pull Request

### Guies de Desenvolupament
- Seguir millors pràctiques TypeScript
- Usar components UI existents de Radix UI
- Mantenir millors pràctiques de seguretat Electron
- Afegir proves per a nous càlculs hidràulics
- Actualitzar documentació per a noves característiques

## 📄 Llicència

Aquest projecte està llicenciat sota la Llicència MIT - veure l'arxiu [LICENSE](LICENSE) per a detalls.

## 🙏 Reconeixements

- **Equip WNTR**: Water Network Tool for Resilience
- **Equip Electron**: Aplicacions d'escriptori multiplataforma
- **Equip React**: Biblioteca d'interfície d'usuari
- **Comunitat d'Enginyeria Hidràulica**: Experiència del domini i retroalimentació

## 📞 Suport

Per a suport i preguntes:
- 📧 Email: support@boorie.com
- 💬 Discord: [Comunitat Boorie](https://discord.gg/boorie)
- 📖 Documentació: [GitHub Wiki](https://github.com/your-username/boorie_cliente/wiki)
- 🐛 Problemes: [GitHub Issues](https://github.com/your-username/boorie_cliente/issues)

## 📚 Documentació Addicional

### Wiki Multiidioma
- 🇺🇸 [English Documentation](docs/wiki/en/Home.md)
- 🇪🇸 [Documentación en Español](docs/wiki/es/Home.md)
- 🏴󠁥󠁳󠁣󠁴󠁿 [Documentació en Català](docs/wiki/ca/Home.md)

---

**Fet amb ❤️ per a Enginyers Hidràulics**
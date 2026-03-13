# Guia d'Instal·lació

## Requisits del Sistema

### Requisits Mínims
- **RAM**: 4 GB mínim, 8 GB recomanat
- **Emmagatzematge**: 2 GB d'espai lliure mínim
- **Xarxa**: Connexió a internet per a proveïdors AI i actualitzacions

### Requisits Específics per Plataforma

#### macOS
- **Versió**: macOS 10.15 (Catalina) o posterior
- **Arquitectura**: Intel x64 o Apple Silicon (M1/M2/M3)
- **Addicional**: Xcode Command Line Tools (per a desenvolupament)

#### Windows
- **Versió**: Windows 10 versió 1809 o posterior
- **Arquitectura**: x64 (64-bit)
- **Addicional**: Microsoft Visual C++ Redistributable

#### Linux
- **Distribucions**: Ubuntu 18.04+, Debian 10+, CentOS 8+, Fedora 32+
- **Arquitectura**: x64 (64-bit)
- **Dependències**: glibc 2.17+, GTK 3.0+

### Requisits de Python (per a WNTR)
- **Python**: 3.8, 3.9, 3.10 o 3.11
- **Paquets**: numpy, scipy, pandas, networkx, matplotlib, wntr

## Instal·lació Ràpida

### Opció 1: Descarregar Binaris Precompilats (Recomanat)

1. **Visita la Pàgina de Llançaments**
   - Ves a: [GitHub Releases](https://github.com/Boorie-AI/boorie_cliente/releases)
   - Descarrega la darrera versió per a la teva plataforma

2. **Instal·lar per a la Teva Plataforma**

   #### Instal·lació a macOS
   ```bash
   # Descarregar i instal·lar
   curl -L -o Boorie.dmg https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.0.0/Boorie-1.0.0-arm64.dmg
   open Boorie.dmg
   # Arrossega Boorie.app a la carpeta Aplicacions
   ```

   #### Instal·lació a Linux
   ```bash
   # Descarregar i extreure
   wget https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.0.0/boorie-linux.tar.gz
   tar -xzf boorie-linux.tar.gz
   cd boorie-linux
   ./boorie
   ```

   #### Instal·lació a Windows
   ```powershell
   # Descarregar i extreure
   # Descarrega des de la pàgina de llançaments
   # Extreu l'arxiu ZIP
   # Executa Boorie.exe
   ```

### Opció 2: Compilar des del Codi Font

1. **Clonar el Repositori**
   ```bash
   git clone https://github.com/Boorie-AI/boorie_cliente.git
   cd boorie_cliente
   ```

2. **Instal·lar Dependències**
   ```bash
   npm install
   ```

3. **Configurar Entorn Python**
   ```bash
   ./setup-python-wntr.sh  # macOS/Linux
   # o configuració manual per a Windows
   ```

4. **Configurar Entorn**
   ```bash
   cp .env.example .env
   # Edita .env amb la teva configuració
   ```

5. **Compilar i Executar**
   ```bash
   npm run build
   npm run dist
   ```

## Configuració de l'Entorn Python

### Configuració Automàtica (Recomanat)

#### macOS/Linux
```bash
# Executar l'script de configuració
./setup-python-wntr.sh

# Verificar la instal·lació
./check-python-wntr.js
```

#### Windows
```powershell
# Configuració manual requerida
python -m venv venv-wntr
venv-wntr\Scripts\activate
pip install numpy>=1.20 scipy>=1.7 pandas>=1.3 networkx>=2.6 matplotlib>=3.4 wntr>=0.5.0
```

### Configuració Manual

1. **Crear Entorn Virtual**
   ```bash
   python3 -m venv venv-wntr
   ```

2. **Activar Entorn**
   ```bash
   # macOS/Linux
   source venv-wntr/bin/activate

   # Windows
   venv-wntr\Scripts\activate
   ```

3. **Instal·lar WNTR i Dependències**
   ```bash
   pip install --upgrade pip
   pip install numpy>=1.20
   pip install scipy>=1.7
   pip install pandas>=1.3
   pip install networkx>=2.6
   pip install matplotlib>=3.4
   pip install wntr>=0.5.0
   ```

4. **Actualitzar Configuració de l'Entorn**
   ```bash
   echo "PYTHON_PATH=$(which python)" >> .env
   ```

## Configuració

### Variables d'Entorn

Crea un arxiu `.env` a l'arrel del projecte:

```env
# Configuració de Python
PYTHON_PATH=/path/to/your/venv-wntr/bin/python

# Claus API de Proveïdors AI
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_API_KEY=your_google_api_key
OPENROUTER_API_KEY=your_openrouter_api_key

# Analítiques Microsoft Clarity (Opcional)
VITE_CLARITY_PROJECT_ID=your_clarity_project_id
VITE_CLARITY_ENABLED=true

# Configuració de Mapbox (Opcional)
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_access_token
VITE_DEFAULT_MAP_LNG=-70.9
VITE_DEFAULT_MAP_LAT=42.35
VITE_DEFAULT_MAP_ZOOM=9

# Configuració OAuth (Opcional)
MS_CLIENT_ID=your_microsoft_client_id
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### Inicialització de la Base de Dades

```bash
# Generar client Prisma
npm run db:generate

# Inicialitzar base de dades
npm run db:push
```

## Verificació

### Provar la Instal·lació

1. **Iniciar Boorie**
   ```bash
   # Mode desenvolupament
   npm run dev

   # Compilació de producció
   ./dist-electron/Boorie  # Linux
   open ./dist-electron/Boorie.app  # macOS
   ```

2. **Provar Integració WNTR**
   ```bash
   ./run-with-wntr.sh python test-files/test-wntr-complete.py
   ```

3. **Provar Funcions Principals**
   - L'aplicació s'inicia correctament
   - Els proveïdors AI poden configurar-se
   - Els arxius EPANET poden importar-se
   - La visualització de xarxa funciona
   - Els projectes poden crear-se

## Solució de Problemes

### Problemes Comuns d'Instal·lació

#### Problema: npm install falla
```bash
# Solució 1: Netejar caché
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Solució 2: Usar registre diferent
npm install --registry https://registry.npmjs.org/
```

#### Problema: Python/WNTR no trobat
```bash
# Solució: Verificar ruta de Python
which python3
python3 -c "import sys; print(sys.path)"

# Actualitzar arxiu .env
echo "PYTHON_PATH=$(which python3)" >> .env
```

#### Problema: Electron no inicia
```bash
# Solució: Recompilar mòduls natius
npm run rebuild

# O recompilar mòduls específics
npx electron-rebuild
```

### Problemes Específics per Plataforma

#### macOS
- **Signatura de codi**: Instal·lar Xcode Command Line Tools
- **Permisos**: Atorgar permisos d'accessibilitat a Preferències del Sistema
- **Quarantena**: Eliminar atribut de quarantena: `xattr -d com.apple.quarantine Boorie.app`

#### Linux
- **Dependències**: Instal·lar biblioteques que falten
  ```bash
  # Ubuntu/Debian
  sudo apt-get install libgtk-3-0 libgbm1 libnss3 libasound2

  # CentOS/RHEL
  sudo yum install gtk3 libXrandr libXdamage
  ```

#### Windows
- **Antivirus**: Afegir Boorie a les excepcions de l'antivirus
- **Permisos**: Executar com a administrador si cal
- **Dependències**: Instal·lar Visual C++ Redistributable

## Actualitzacions

### Actualitzacions Automàtiques
Boorie inclou un actualitzador automàtic que busca noves versions:
- Les actualitzacions es descarreguen en segon pla
- Els usuaris són notificats quan hi ha actualitzacions disponibles
- Les actualitzacions poden instal·lar-se amb un clic

### Actualitzacions Manuals
1. Descarrega la darrera versió des de [Llançaments](https://github.com/Boorie-AI/boorie_cliente/releases)
2. Substitueix la instal·lació existent
3. Reinicia Boorie

---

**Propers Passos**: Després d'una instal·lació exitosa, continua amb [Inici Ràpid](Inici-Rapid.md) per començar a usar Boorie.

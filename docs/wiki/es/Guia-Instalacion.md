# Guía de Instalación

## Requisitos del Sistema

### Requisitos Mínimos
- **RAM**: 4 GB mínimo, 8 GB recomendado
- **Almacenamiento**: 2 GB de espacio libre mínimo
- **Red**: Conexión a internet para proveedores AI y actualizaciones

### Requisitos Específicos por Plataforma

#### macOS
- **Versión**: macOS 10.15 (Catalina) o posterior
- **Arquitectura**: Intel x64 o Apple Silicon (M1/M2/M3)
- **Adicional**: Xcode Command Line Tools (para desarrollo)

#### Windows
- **Versión**: Windows 10 versión 1809 o posterior
- **Arquitectura**: x64 (64-bit)
- **Adicional**: Microsoft Visual C++ Redistributable

#### Linux
- **Distribuciones**: Ubuntu 18.04+, Debian 10+, CentOS 8+, Fedora 32+
- **Arquitectura**: x64 (64-bit)
- **Dependencias**: glibc 2.17+, GTK 3.0+

### Requisitos de Python (para WNTR)
- **Python**: 3.8, 3.9, 3.10 o 3.11
- **Paquetes**: numpy, scipy, pandas, networkx, matplotlib, wntr

## Instalación Rápida

### Opción 1: Descargar Binarios Precompilados (Recomendado)

1. **Visita la Página de Lanzamientos**
   - Ve a: [GitHub Releases](https://github.com/Boorie-AI/boorie_cliente/releases)
   - Descarga la última versión para tu plataforma

2. **Instalar para Tu Plataforma**

   #### Instalación en macOS
   ```bash
   # Descargar e instalar
   curl -L -o Boorie.dmg https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.0.0/Boorie-1.0.0-arm64.dmg
   open Boorie.dmg
   # Arrastra Boorie.app a la carpeta Aplicaciones
   ```

   #### Instalación en Linux
   ```bash
   # Descargar y extraer
   wget https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.0.0/boorie-linux.tar.gz
   tar -xzf boorie-linux.tar.gz
   cd boorie-linux
   ./boorie
   ```

   #### Instalación en Windows
   ```powershell
   # Descargar y extraer
   # Descarga desde la página de lanzamientos
   # Extrae el archivo ZIP
   # Ejecuta Boorie.exe
   ```

### Opción 2: Compilar desde el Código Fuente

1. **Clonar el Repositorio**
   ```bash
   git clone https://github.com/Boorie-AI/boorie_cliente.git
   cd boorie_cliente
   ```

2. **Instalar Dependencias**
   ```bash
   npm install
   ```

3. **Configurar Entorno Python**
   ```bash
   ./setup-python-wntr.sh  # macOS/Linux
   # o configuración manual para Windows
   ```

4. **Configurar Entorno**
   ```bash
   cp .env.example .env
   # Edita .env con tu configuración
   ```

5. **Compilar y Ejecutar**
   ```bash
   npm run build
   npm run dist
   ```

## Configuración del Entorno Python

### Configuración Automática (Recomendado)

#### macOS/Linux
```bash
# Ejecutar el script de configuración
./setup-python-wntr.sh

# Verificar la instalación
./check-python-wntr.js
```

#### Windows
```powershell
# Configuración manual requerida
python -m venv venv-wntr
venv-wntr\Scripts\activate
pip install numpy>=1.20 scipy>=1.7 pandas>=1.3 networkx>=2.6 matplotlib>=3.4 wntr>=0.5.0
```

### Configuración Manual

1. **Crear Entorno Virtual**
   ```bash
   python3 -m venv venv-wntr
   ```

2. **Activar Entorno**
   ```bash
   # macOS/Linux
   source venv-wntr/bin/activate

   # Windows
   venv-wntr\Scripts\activate
   ```

3. **Instalar WNTR y Dependencias**
   ```bash
   pip install --upgrade pip
   pip install numpy>=1.20
   pip install scipy>=1.7
   pip install pandas>=1.3
   pip install networkx>=2.6
   pip install matplotlib>=3.4
   pip install wntr>=0.5.0
   ```

4. **Actualizar Configuración del Entorno**
   ```bash
   echo "PYTHON_PATH=$(which python)" >> .env
   ```

## Configuración

### Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
# Configuración de Python
PYTHON_PATH=/path/to/your/venv-wntr/bin/python

# Claves API de Proveedores AI
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_API_KEY=your_google_api_key
OPENROUTER_API_KEY=your_openrouter_api_key

# Analíticas Microsoft Clarity (Opcional)
VITE_CLARITY_PROJECT_ID=your_clarity_project_id
VITE_CLARITY_ENABLED=true

# Configuración de Mapbox (Opcional)
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_access_token
VITE_DEFAULT_MAP_LNG=-70.9
VITE_DEFAULT_MAP_LAT=42.35
VITE_DEFAULT_MAP_ZOOM=9

# Configuración OAuth (Opcional)
MS_CLIENT_ID=your_microsoft_client_id
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### Inicialización de la Base de Datos

```bash
# Generar cliente Prisma
npm run db:generate

# Inicializar base de datos
npm run db:push
```

## Verificación

### Probar la Instalación

1. **Iniciar Boorie**
   ```bash
   # Modo desarrollo
   npm run dev

   # Compilación de producción
   ./dist-electron/Boorie  # Linux
   open ./dist-electron/Boorie.app  # macOS
   ```

2. **Probar Integración WNTR**
   ```bash
   # Ejecutar pruebas WNTR
   ./run-with-wntr.sh python test-files/test-wntr-complete.py
   ```

3. **Probar Funciones Principales**
   - La aplicación se inicia correctamente
   - Los proveedores AI pueden configurarse
   - Los archivos EPANET pueden importarse
   - La visualización de red funciona
   - Los proyectos pueden crearse

### Problemas Comunes de Verificación

#### Problemas con Python/WNTR
```bash
# Verificar versión de Python
python --version

# Verificar instalación de WNTR
python -c "import wntr; print(wntr.__version__)"

# Reinstalar si es necesario
pip install --upgrade --force-reinstall wntr
```

#### Problemas con Node.js
```bash
# Verificar versión de Node.js
node --version
npm --version

# Limpiar caché y reinstalar
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

## Entorno de Desarrollo

### Configuración Adicional para Contribuidores

1. **Instalar Herramientas de Desarrollo**
   ```bash
   # ESLint y Prettier
   npm install -g eslint prettier

   # TypeScript
   npm install -g typescript
   ```

2. **Configurar Git Hooks**
   ```bash
   # Instalar husky para git hooks
   npm install --save-dev husky
   npx husky install
   ```

3. **Configurar IDE**
   - **VS Code**: Instalar extensiones recomendadas
   - **WebStorm**: Configurar TypeScript y ESLint
   - **Vim/Neovim**: Configurar LSP para TypeScript

### Scripts de Compilación

```bash
# Desarrollo
npm run dev              # Iniciar servidor de desarrollo
npm run dev:vite         # Solo frontend
npm run dev:electron     # Solo Electron

# Compilación
npm run build            # Compilar todo
npm run build:vite       # Compilar frontend
npm run build:electron   # Compilar backend Electron

# Distribución
npm run dist             # Crear paquetes distribuibles
npm run build:app        # Electron-builder

# Calidad
npm run lint             # ESLint
npm run lint:fix         # ESLint con corrección automática
npm run typecheck        # Verificación de tipos TypeScript
```

## Solución de Problemas

### Problemas Comunes de Instalación

#### Problema: npm install falla
```bash
# Solución 1: Limpiar caché
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Solución 2: Usar registro diferente
npm install --registry https://registry.npmjs.org/
```

#### Problema: Python/WNTR no encontrado
```bash
# Solución: Verificar ruta de Python
which python3
python3 -c "import sys; print(sys.path)"

# Actualizar archivo .env
echo "PYTHON_PATH=$(which python3)" >> .env
```

#### Problema: Electron no inicia
```bash
# Solución: Recompilar módulos nativos
npm run rebuild

# O recompilar módulos específicos
npx electron-rebuild
```

#### Problema: La compilación falla en Windows
```powershell
# Solución: Instalar Windows Build Tools
npm install --global windows-build-tools

# O usar Visual Studio
# Instalar Visual Studio con herramientas de desarrollo C++
```

### Problemas Específicos por Plataforma

#### macOS
- **Firma de código**: Instalar Xcode Command Line Tools
- **Permisos**: Otorgar permisos de accesibilidad en Preferencias del Sistema
- **Cuarentena**: Eliminar atributo de cuarentena: `xattr -d com.apple.quarantine Boorie.app`

#### Linux
- **Dependencias**: Instalar librerías faltantes
  ```bash
  # Ubuntu/Debian
  sudo apt-get install libgtk-3-0 libgbm1 libnss3 libasound2

  # CentOS/RHEL
  sudo yum install gtk3 libXrandr libXdamage
  ```

#### Windows
- **Antivirus**: Añadir Boorie a las excepciones del antivirus
- **Permisos**: Ejecutar como administrador si es necesario
- **Dependencias**: Instalar Visual C++ Redistributable

### Obtener Ayuda

1. **Consultar Documentación**
   - [Wiki de Inicio](Home.md)
   - [FAQ](FAQ.md)
   - [Solución de Problemas](Solucion-Problemas.md)

2. **Buscar Problemas**
   - [GitHub Issues](https://github.com/Boorie-AI/boorie_cliente/issues)
   - [Discusiones](https://github.com/Boorie-AI/boorie_cliente/discussions)

3. **Contactar Soporte**
   - Discord: [Comunidad Boorie](https://discord.gg/boorie)
   - Email: support@boorie.com

## Actualizaciones

### Actualizaciones Automáticas
Boorie incluye un actualizador automático que busca nuevas versiones:
- Las actualizaciones se descargan en segundo plano
- Los usuarios son notificados cuando hay actualizaciones disponibles
- Las actualizaciones pueden instalarse con un clic

### Actualizaciones Manuales
1. Descarga la última versión desde [Lanzamientos](https://github.com/Boorie-AI/boorie_cliente/releases)
2. Reemplaza la instalación existente
3. Reinicia Boorie

### Actualizaciones de Desarrollo
```bash
# Actualizar dependencias
npm update

# Actualizar a la última rama main
git pull origin main
npm install
npm run build
```

---

**Próximos Pasos**: Después de una instalación exitosa, continúa con [Inicio Rápido](Inicio-Rapido.md) para comenzar a usar Boorie.

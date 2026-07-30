import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

let cachedPythonPath: string | null = null

/** Nombre del venv que gestiona el propio Boorie (SetupWizard / setup.handler). */
const MANAGED_VENV_DIR = 'venv-wntr'
/** Fichero donde persistimos la ruta del Python elegido, dentro de userData. */
const PYTHON_CONFIG_FILE = 'python-path.json'

/**
 * Directorio userData de Electron. Se resuelve de forma perezosa porque este
 * módulo también se carga desde tests y desde scripts fuera de Electron.
 */
function getUserDataDir(): string | null {
  if (process.env.BOORIE_USER_DATA) return process.env.BOORIE_USER_DATA
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron')
    if (app && typeof app.getPath === 'function') return app.getPath('userData')
  } catch {
    // fuera de Electron (tests, scripts) — no hay userData
  }
  return null
}

/**
 * Ruta del venv gestionado por Boorie. En la app instalada vive en userData
 * porque el directorio de instalación no es escribible.
 */
export function getManagedVenvDir(): string | null {
  const userData = getUserDataDir()
  return userData ? path.join(userData, MANAGED_VENV_DIR) : null
}

function venvPythonCandidates(venvDir: string): string[] {
  return [
    path.join(venvDir, 'Scripts', 'python.exe'), // Windows
    path.join(venvDir, 'bin', 'python'),         // macOS / Linux
    path.join(venvDir, 'bin', 'python3'),
  ]
}

function getPythonConfigFile(): string | null {
  const userData = getUserDataDir()
  return userData ? path.join(userData, PYTHON_CONFIG_FILE) : null
}

/**
 * Persiste la ruta del intérprete que Boorie debe usar. Sin esto la ruta del
 * venv recién creado sólo vivía en `process.env.PYTHON_PATH` y se perdía al
 * cerrar la app: al siguiente arranque WNTR volvía a "no instalado".
 */
export function savePythonPath(pythonPath: string): void {
  const configFile = getPythonConfigFile()
  if (!configFile) return
  try {
    fs.mkdirSync(path.dirname(configFile), { recursive: true })
    fs.writeFileSync(configFile, JSON.stringify({ pythonPath }, null, 2), 'utf-8')
    console.log(`[PythonDetector] Saved Python path to ${configFile}: ${pythonPath}`)
  } catch (error) {
    console.warn('[PythonDetector] Could not persist Python path:', error)
  }
}

function readSavedPythonPath(): string | null {
  const configFile = getPythonConfigFile()
  if (!configFile) return null
  try {
    if (!fs.existsSync(configFile)) return null
    const parsed = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
    return typeof parsed?.pythonPath === 'string' && parsed.pythonPath.length > 0
      ? parsed.pythonPath
      : null
  } catch {
    return null
  }
}

/**
 * Intérpretes "gestionados": el guardado en configuración y los venv que
 * Boorie crea (userData en producción, raíz del repo en desarrollo).
 */
function getManagedPythonCandidates(): string[] {
  const candidates: string[] = []

  const saved = readSavedPythonPath()
  if (saved) candidates.push(saved)

  const managedVenv = getManagedVenvDir()
  if (managedVenv) candidates.push(...venvPythonCandidates(managedVenv))

  // Dev: el repo tiene su propio venv-wntr
  candidates.push(...venvPythonCandidates(path.join(process.cwd(), MANAGED_VENV_DIR)))

  return candidates
}

/**
 * Shared Python path detection utility.
 * Finds the best available Python installation with WNTR support.
 * Caches the result so detection only runs once per app session.
 */
export function findPythonPath(): string {
  if (cachedPythonPath) {
    return cachedPythonPath
  }

  // 1. Use environment variable if set
  if (process.env.PYTHON_PATH) {
    console.log(`[PythonDetector] Using PYTHON_PATH env: ${process.env.PYTHON_PATH}`)
    cachedPythonPath = process.env.PYTHON_PATH
    return cachedPythonPath
  }

  // 2. Intérpretes gestionados por Boorie (ruta persistida + venv-wntr).
  //    Si uno tiene WNTR es el ganador: es el entorno que la propia app
  //    preparó y el que contiene también milvus-lite/langchain.
  let managedFallback: string | null = null
  for (const candidate of getManagedPythonCandidates()) {
    if (!fs.existsSync(candidate)) continue
    if (testPythonHasWntr(candidate)) {
      console.log(`[PythonDetector] Found managed Python with WNTR: ${candidate}`)
      cachedPythonPath = candidate
      return cachedPythonPath
    }
    if (!managedFallback && testPythonIsReal(candidate)) {
      // Venv a medio preparar: sólo lo usaremos si no aparece nada mejor.
      managedFallback = candidate
    }
  }

  // 3. Platform-specific detection
  let detected: { path: string; hasWntr: boolean }
  if (process.platform === 'darwin') {
    detected = findPythonMacOS()
  } else if (process.platform === 'win32') {
    detected = findPythonWindows()
  } else {
    detected = findPythonLinux()
  }

  if (!detected.hasWntr && managedFallback) {
    console.log(`[PythonDetector] Falling back to managed venv Python: ${managedFallback}`)
    cachedPythonPath = managedFallback
    return cachedPythonPath
  }

  cachedPythonPath = detected.path
  return cachedPythonPath
}

function findPythonMacOS(): { path: string; hasWntr: boolean } {
  const possiblePaths = [
    `${process.env.HOME}/repositorio/uruguay_wihisper/venv/bin/python3`,
    `${process.env.HOME}/venv/bin/python3`,
    `${process.env.HOME}/.venv/bin/python3`,
    './venv/bin/python3',
    '../venv/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    `${process.env.HOME}/.pyenv/shims/python3`,
    '/opt/miniconda3/bin/python3',
    '/opt/anaconda3/bin/python3',
    `${process.env.HOME}/miniconda3/bin/python3`,
    `${process.env.HOME}/anaconda3/bin/python3`,
  ]

  for (const pythonPath of possiblePaths) {
    if (fs.existsSync(pythonPath)) {
      if (testPythonHasWntr(pythonPath)) {
        console.log(`[PythonDetector] Found Python with WNTR on macOS: ${pythonPath}`)
        return { path: pythonPath, hasWntr: true }
      }
    }
  }

  console.warn('[PythonDetector] No Python with WNTR found on macOS, using fallback')
  return { path: 'python3', hasWntr: false }
}

function findPythonWindows(): { path: string; hasWntr: boolean } {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const versions = ['313', '312', '311', '310', '39']

  const possiblePaths = [
    // Common virtual environment locations
    path.join(process.cwd(), 'venv-wntr', 'Scripts', 'python.exe'),
    path.join(process.cwd(), 'venv', 'Scripts', 'python.exe'),
    path.join(process.cwd(), '.venv', 'Scripts', 'python.exe'),
    // Python.org installer, instalación por usuario
    ...versions.map((v) =>
      path.join(home, 'AppData', 'Local', 'Programs', 'Python', `Python${v}`, 'python.exe')
    ),
    // Python.org installer, instalación para todos los usuarios
    ...versions.map((v) => path.join(programFiles, `Python${v}`, 'python.exe')),
    // Anaconda / Miniconda
    path.join(home, 'Anaconda3', 'python.exe'),
    path.join(home, 'Miniconda3', 'python.exe'),
    path.join('C:', 'Anaconda3', 'python.exe'),
    path.join('C:', 'Miniconda3', 'python.exe'),
    // Chocolatey
    ...versions.map((v) => path.join('C:', `Python${v}`, 'python.exe')),
    // pyenv-win
    path.join(home, '.pyenv', 'pyenv-win', 'shims', 'python.exe'),
    path.join(home, '.pyenv', 'pyenv-win', 'shims', 'python3.exe'),
  ]

  let realPythonWithoutWntr: string | null = null

  for (const pythonPath of possiblePaths) {
    if (fs.existsSync(pythonPath)) {
      console.log(`[PythonDetector] Found Python on Windows: ${pythonPath}`)
      // On Windows we first check if it's a real Python (not MS Store redirect)
      if (testPythonIsReal(pythonPath)) {
        if (testPythonHasWntr(pythonPath)) {
          console.log(`[PythonDetector] Python has WNTR: ${pythonPath}`)
          return { path: pythonPath, hasWntr: true }
        }
        // Even without WNTR, a real Python is better than the MS Store alias
        console.log(`[PythonDetector] Python found (no WNTR): ${pythonPath}`)
        if (!realPythonWithoutWntr) realPythonWithoutWntr = pythonPath
      }
    }
  }

  // Try 'python' command directly (may work if Python is in PATH and not MS Store alias)
  if (testPythonIsReal('python')) {
    if (testPythonHasWntr('python')) {
      console.log('[PythonDetector] Using "python" from PATH (has WNTR)')
      return { path: 'python', hasWntr: true }
    }
    if (!realPythonWithoutWntr) realPythonWithoutWntr = 'python'
  }

  if (realPythonWithoutWntr) {
    console.warn(`[PythonDetector] Python without WNTR on Windows: ${realPythonWithoutWntr}`)
    return { path: realPythonWithoutWntr, hasWntr: false }
  }

  console.warn('[PythonDetector] No Python installation found on Windows')
  console.warn('[PythonDetector] Please install Python from python.org and set PYTHON_PATH in .env')
  return { path: 'python', hasWntr: false }
}

function findPythonLinux(): { path: string; hasWntr: boolean } {
  const possiblePaths = [
    `${process.env.HOME}/venv/bin/python3`,
    `${process.env.HOME}/.venv/bin/python3`,
    './venv/bin/python3',
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    `${process.env.HOME}/.pyenv/shims/python3`,
    `${process.env.HOME}/miniconda3/bin/python3`,
    `${process.env.HOME}/anaconda3/bin/python3`,
  ]

  for (const pythonPath of possiblePaths) {
    if (fs.existsSync(pythonPath)) {
      if (testPythonHasWntr(pythonPath)) {
        console.log(`[PythonDetector] Found Python with WNTR on Linux: ${pythonPath}`)
        return { path: pythonPath, hasWntr: true }
      }
    }
  }

  console.warn('[PythonDetector] No Python with WNTR found on Linux, using fallback')
  return { path: 'python3', hasWntr: false }
}

/**
 * Test if a Python path is a real installation (not the Windows MS Store redirect)
 */
function testPythonIsReal(pythonPath: string): boolean {
  try {
    const result = execSync(`"${pythonPath}" --version`, {
      stdio: 'pipe',
      timeout: 5000,
      windowsHide: true,
    })
    const version = result.toString().trim()
    console.log(`[PythonDetector] Python version: ${version}`)
    return version.startsWith('Python ')
  } catch {
    return false
  }
}

/**
 * Test if a Python installation has WNTR and NumPy
 */
function testPythonHasWntr(pythonPath: string): boolean {
  try {
    execSync(`"${pythonPath}" -c "import wntr; import numpy"`, {
      stdio: 'pipe',
      timeout: 10000,
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Reset the cached path (useful if user changes PYTHON_PATH at runtime)
 */
export function resetPythonPathCache(): void {
  cachedPythonPath = null
}

/**
 * Get a detailed status report of the Python/WNTR environment.
 * Used by the UI to show dependency status and guide the user.
 */
export function getPythonStatus(): {
  pythonFound: boolean
  pythonPath: string
  wntrAvailable: boolean
  pythonVersion: string | null
  platform: string
  managedVenvPath: string | null
  instructions: string | null
} {
  const pythonPath = findPythonPath()
  const isReal = testPythonIsReal(pythonPath)
  const hasWntr = isReal ? testPythonHasWntr(pythonPath) : false
  const managedVenvPath = getManagedVenvDir()

  let pythonVersion: string | null = null
  if (isReal) {
    try {
      const result = execSync(`"${pythonPath}" --version`, { stdio: 'pipe', timeout: 5000, windowsHide: true })
      pythonVersion = result.toString().trim()
    } catch { /* ignore */ }
  }

  let instructions: string | null = null
  if (!isReal) {
    if (process.platform === 'win32') {
      instructions = 'Python is not installed. Download it from python.org/downloads (3.10 or newer), check "Add Python to PATH" during installation, then restart Boorie and let the setup assistant install the dependencies.'
    } else if (process.platform === 'darwin') {
      instructions = 'Python is not installed. Run: brew install python@3.11 — then restart Boorie and let the setup assistant install the dependencies.'
    } else {
      instructions = 'Python is not installed. Run: sudo apt install python3 python3-pip python3-venv — then restart Boorie and let the setup assistant install the dependencies.'
    }
  } else if (!hasWntr) {
    instructions = 'Python is installed but WNTR is missing in the environment Boorie uses. Open Settings → General → "Preparar dependencias" to let Boorie install it, or run manually:\n' +
      `  "${pythonPath}" -m pip install wntr`
  }

  return {
    pythonFound: isReal,
    pythonPath,
    wntrAvailable: hasWntr,
    pythonVersion,
    platform: process.platform,
    managedVenvPath,
    instructions,
  }
}

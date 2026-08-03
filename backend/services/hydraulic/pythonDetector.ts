import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

let cachedPythonPath: string | null = null

/** Nombre del venv que gestiona el propio Boorie (SetupWizard / setup.handler). */
const MANAGED_VENV_DIR = 'venv-wntr'
/** Fichero donde persistimos la ruta del Python elegido, dentro de userData. */
const PYTHON_CONFIG_FILE = 'python-path.json'

/**
 * Módulos que los servicios Python de Boorie importan en tiempo de ejecución.
 * Comprobar sólo `wntr` era insuficiente: un venv a medio instalar importaba
 * wntr pero reventaba luego con ModuleNotFoundError, y además desplazaba a la
 * instalación buena que el usuario ya tenía en su sistema.
 */
const WNTR_RUNTIME_MODULES = ['wntr', 'numpy', 'scipy', 'pandas', 'networkx']

export type PythonSource = 'user' | 'auto'

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
 * Persiste la ruta del intérprete que Boorie debe usar.
 *
 * `source: 'user'` marca una ruta elegida a mano en Ajustes → General: gana a
 * la autodetección, porque el usuario sabe mejor que la heurística dónde tiene
 * su entorno (conda, venv propio, instalación fuera de las rutas habituales).
 * `source: 'auto'` es la que guarda el asistente tras crear su venv.
 */
export function savePythonPath(pythonPath: string, source: PythonSource = 'auto'): void {
  const configFile = getPythonConfigFile()
  if (!configFile) return
  try {
    fs.mkdirSync(path.dirname(configFile), { recursive: true })
    fs.writeFileSync(configFile, JSON.stringify({ pythonPath, source }, null, 2), 'utf-8')
    console.log(`[PythonDetector] Saved Python path (${source}) to ${configFile}: ${pythonPath}`)
  } catch (error) {
    console.warn('[PythonDetector] Could not persist Python path:', error)
  }
}

/** Borra la ruta fijada a mano y devuelve a Boorie a la autodetección. */
export function clearUserPythonPath(): void {
  const configFile = getPythonConfigFile()
  if (!configFile) return
  try {
    if (fs.existsSync(configFile)) fs.rmSync(configFile)
  } catch (error) {
    console.warn('[PythonDetector] Could not clear Python path:', error)
  }
}

function readSavedPythonPath(): { pythonPath: string; source: PythonSource } | null {
  const configFile = getPythonConfigFile()
  if (!configFile) return null
  try {
    if (!fs.existsSync(configFile)) return null
    const parsed = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
    if (typeof parsed?.pythonPath !== 'string' || parsed.pythonPath.length === 0) return null
    return { pythonPath: parsed.pythonPath, source: parsed.source === 'user' ? 'user' : 'auto' }
  } catch {
    return null
  }
}

export function getUserPythonPath(): string | null {
  const saved = readSavedPythonPath()
  return saved?.source === 'user' ? saved.pythonPath : null
}

/**
 * Venv que gestiona Boorie: el guardado por el asistente y los venv-wntr de
 * userData (producción) o del repo (desarrollo).
 */
function getManagedPythonCandidates(): string[] {
  const candidates: string[] = []

  const saved = readSavedPythonPath()
  if (saved?.source === 'auto') candidates.push(saved.pythonPath)

  const managedVenv = getManagedVenvDir()
  if (managedVenv) candidates.push(...venvPythonCandidates(managedVenv))

  // Dev: el repo tiene su propio venv-wntr
  candidates.push(...venvPythonCandidates(path.join(process.cwd(), MANAGED_VENV_DIR)))

  return candidates
}

/**
 * Resuelve el intérprete de Python para WNTR.
 *
 * Orden: PYTHON_PATH → ruta fijada por el usuario en Ajustes → Python del
 * sistema con el stack completo → venv de Boorie con el stack completo →
 * cualquier intérprete real como último recurso.
 *
 * El sistema va por delante del venv gestionado a propósito: si el usuario ya
 * tiene WNTR instalado, Boorie no debe apartarlo en favor de un entorno propio
 * que quizá esté incompleto. El venv sigue cubriendo a quien no tiene nada,
 * que es el caso que arreglamos originalmente.
 */
export function findPythonPath(): string {
  if (cachedPythonPath) {
    return cachedPythonPath
  }

  // 1. Variable de entorno: override explícito, gana siempre
  if (process.env.PYTHON_PATH) {
    console.log(`[PythonDetector] Using PYTHON_PATH env: ${process.env.PYTHON_PATH}`)
    cachedPythonPath = process.env.PYTHON_PATH
    return cachedPythonPath
  }

  // 2. Ruta elegida a mano en Ajustes → General
  const userPath = getUserPythonPath()
  if (userPath && (fs.existsSync(userPath) || testPythonIsReal(userPath))) {
    console.log(`[PythonDetector] Using user-configured Python: ${userPath}`)
    cachedPythonPath = userPath
    return cachedPythonPath
  }

  // 3. Python del sistema, con el stack completo de WNTR
  const detected = detectSystemPython()
  if (detected.hasWntr) {
    cachedPythonPath = detected.path
    return cachedPythonPath
  }

  // 4. Venv gestionado por Boorie, con el stack completo
  let managedFallback: string | null = null
  for (const candidate of getManagedPythonCandidates()) {
    if (!fs.existsSync(candidate)) continue
    if (testPythonHasWntr(candidate)) {
      console.log(`[PythonDetector] Found managed Python with WNTR: ${candidate}`)
      cachedPythonPath = candidate
      return cachedPythonPath
    }
    if (!managedFallback && testPythonIsReal(candidate)) {
      managedFallback = candidate
    }
  }

  // 5. Nada tiene el stack completo: preferimos un intérprete real a un nombre suelto
  if (managedFallback) {
    console.warn(`[PythonDetector] No complete WNTR environment; falling back to ${managedFallback}`)
    cachedPythonPath = managedFallback
    return cachedPythonPath
  }

  cachedPythonPath = detected.path
  return cachedPythonPath
}

/**
 * Intérprete para el servidor embebido de Milvus Lite. Es el venv gestionado,
 * no el del sistema: `milvus_lite` sólo lo instala el asistente de Boorie y el
 * Python del usuario casi nunca lo tiene (issues #19/#20/#21).
 */
export function findPythonForMilvus(): string {
  for (const candidate of getManagedPythonCandidates()) {
    if (!fs.existsSync(candidate)) continue
    if (testPythonHasModules(candidate, ['milvus_lite'])) {
      console.log(`[PythonDetector] Milvus interpreter: ${candidate}`)
      return candidate
    }
  }
  return findPythonPath()
}

function detectSystemPython(): { path: string; hasWntr: boolean } {
  if (process.platform === 'darwin') return findPythonMacOS()
  if (process.platform === 'win32') return findPythonWindows()
  return findPythonLinux()
}

function findPythonMacOS(): { path: string; hasWntr: boolean } {
  const possiblePaths = [
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

  return pickFirstWithWntr(possiblePaths, 'python3', 'macOS')
}

function findPythonWindows(): { path: string; hasWntr: boolean } {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const versions = ['313', '312', '311', '310', '39']

  const possiblePaths = [
    // Entornos virtuales junto al proyecto (desarrollo)
    path.join(process.cwd(), 'venv', 'Scripts', 'python.exe'),
    path.join(process.cwd(), '.venv', 'Scripts', 'python.exe'),
    // Python.org, instalación por usuario y para todos los usuarios
    ...versions.map((v) =>
      path.join(home, 'AppData', 'Local', 'Programs', 'Python', `Python${v}`, 'python.exe')
    ),
    ...versions.map((v) => path.join(programFiles, `Python${v}`, 'python.exe')),
    // Anaconda / Miniconda
    path.join(home, 'Anaconda3', 'python.exe'),
    path.join(home, 'Miniconda3', 'python.exe'),
    path.join('C:\\', 'Anaconda3', 'python.exe'),
    path.join('C:\\', 'Miniconda3', 'python.exe'),
    // Chocolatey
    ...versions.map((v) => path.join('C:\\', `Python${v}`, 'python.exe')),
    // pyenv-win
    path.join(home, '.pyenv', 'pyenv-win', 'shims', 'python.exe'),
    path.join(home, '.pyenv', 'pyenv-win', 'shims', 'python3.exe'),
  ]

  // En Windows `python` puede ser el alias de Microsoft Store, que no ejecuta
  // nada: por eso se comprueba con testPythonIsReal antes de aceptarlo.
  return pickFirstWithWntr(possiblePaths, 'python', 'Windows', ['python', 'python3'])
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

  return pickFirstWithWntr(possiblePaths, 'python3', 'Linux', ['python3'])
}

/**
 * Recorre rutas concretas y, después, comandos que dependen del PATH. Devuelve
 * el primero con el stack de WNTR completo; si no hay ninguno, el primer
 * intérprete real que haya encontrado, y como último recurso `fallback`.
 */
function pickFirstWithWntr(
  possiblePaths: string[],
  fallback: string,
  platformName: string,
  pathCommands: string[] = [],
): { path: string; hasWntr: boolean } {
  let realWithoutWntr: string | null = null

  for (const pythonPath of possiblePaths) {
    if (!fs.existsSync(pythonPath)) continue
    if (testPythonHasWntr(pythonPath)) {
      console.log(`[PythonDetector] Found system Python with WNTR on ${platformName}: ${pythonPath}`)
      return { path: pythonPath, hasWntr: true }
    }
    if (!realWithoutWntr && testPythonIsReal(pythonPath)) realWithoutWntr = pythonPath
  }

  for (const command of pathCommands) {
    if (!testPythonIsReal(command)) continue
    if (testPythonHasWntr(command)) {
      console.log(`[PythonDetector] Found "${command}" in PATH with WNTR on ${platformName}`)
      return { path: command, hasWntr: true }
    }
    if (!realWithoutWntr) realWithoutWntr = command
  }

  if (realWithoutWntr) {
    console.warn(`[PythonDetector] Python without complete WNTR stack on ${platformName}: ${realWithoutWntr}`)
    return { path: realWithoutWntr, hasWntr: false }
  }

  console.warn(`[PythonDetector] No Python found on ${platformName}, using fallback "${fallback}"`)
  return { path: fallback, hasWntr: false }
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
    return result.toString().trim().startsWith('Python ')
  } catch {
    return false
  }
}

function testPythonHasModules(pythonPath: string, modules: string[]): boolean {
  try {
    execSync(`"${pythonPath}" -c "import ${modules.join(', ')}"`, {
      stdio: 'pipe',
      timeout: 30000,
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

/** ¿Tiene este intérprete todo lo que los servicios WNTR necesitan? */
function testPythonHasWntr(pythonPath: string): boolean {
  return testPythonHasModules(pythonPath, WNTR_RUNTIME_MODULES)
}

/** Lista de módulos del stack que faltan; `null` si el intérprete no arranca. */
export function getMissingWntrModules(pythonPath: string): string[] | null {
  if (!testPythonIsReal(pythonPath)) return null
  return WNTR_RUNTIME_MODULES.filter((m) => !testPythonHasModules(pythonPath, [m]))
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
  userConfigured: boolean
  missingModules: string[]
  instructions: string | null
} {
  const pythonPath = findPythonPath()
  const missing = getMissingWntrModules(pythonPath)
  const isReal = missing !== null
  const hasWntr = isReal && missing.length === 0
  const userConfigured = getUserPythonPath() === pythonPath && !!getUserPythonPath()

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
      instructions = 'Python is not installed. Download it from python.org/downloads (3.10 or newer), check "Add Python to PATH" during installation, then restart Boorie and let the setup assistant install the dependencies. If you already have Python in a custom location (conda, your own venv), set its path in Settings → General → Python.'
    } else if (process.platform === 'darwin') {
      instructions = 'Python is not installed. Run: brew install python@3.11 — then restart Boorie and let the setup assistant install the dependencies.'
    } else {
      instructions = 'Python is not installed. Run: sudo apt install python3 python3-pip python3-venv — then restart Boorie and let the setup assistant install the dependencies.'
    }
  } else if (!hasWntr) {
    instructions = `Python works but these modules are missing: ${missing.join(', ')}.\n` +
      'Open Settings → General → "Preparar dependencias" to let Boorie install them, point Boorie at another interpreter in Settings → General → Python, or run manually:\n' +
      `  "${pythonPath}" -m pip install ${missing.join(' ')}`
  }

  return {
    pythonFound: isReal,
    pythonPath,
    wntrAvailable: hasWntr,
    pythonVersion,
    platform: process.platform,
    managedVenvPath: getManagedVenvDir(),
    userConfigured,
    missingModules: missing ?? WNTR_RUNTIME_MODULES,
    instructions,
  }
}

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

let cachedPythonPath: string | null = null

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

  // 2. Check for venv-wntr in the app directory (works in dev and packaged)
  const appVenvPaths = [
    path.join(process.cwd(), 'venv-wntr', 'bin', 'python3'),
    path.join(process.cwd(), 'venv-wntr', 'Scripts', 'python.exe'),
  ]
  for (const venvPath of appVenvPaths) {
    if (fs.existsSync(venvPath)) {
      if (testPythonHasWntr(venvPath)) {
        cachedPythonPath = venvPath
        return cachedPythonPath
      }
    }
  }

  // 3. Platform-specific detection
  if (process.platform === 'darwin') {
    cachedPythonPath = findPythonMacOS()
  } else if (process.platform === 'win32') {
    cachedPythonPath = findPythonWindows()
  } else {
    cachedPythonPath = findPythonLinux()
  }

  return cachedPythonPath
}

function findPythonMacOS(): string {
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
        return pythonPath
      }
    }
  }

  console.warn('[PythonDetector] No Python with WNTR found on macOS, using fallback')
  return 'python3'
}

function findPythonWindows(): string {
  const home = process.env.USERPROFILE || process.env.HOME || ''

  const possiblePaths = [
    // Common virtual environment locations
    path.join(process.cwd(), 'venv-wntr', 'Scripts', 'python.exe'),
    path.join(process.cwd(), 'venv', 'Scripts', 'python.exe'),
    path.join(process.cwd(), '.venv', 'Scripts', 'python.exe'),
    // Python.org installer default locations
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python39', 'python.exe'),
    // Anaconda / Miniconda
    path.join(home, 'Anaconda3', 'python.exe'),
    path.join(home, 'Miniconda3', 'python.exe'),
    path.join('C:', 'Anaconda3', 'python.exe'),
    path.join('C:', 'Miniconda3', 'python.exe'),
    // Chocolatey
    path.join('C:', 'Python313', 'python.exe'),
    path.join('C:', 'Python312', 'python.exe'),
    path.join('C:', 'Python311', 'python.exe'),
    // pyenv-win
    path.join(home, '.pyenv', 'pyenv-win', 'shims', 'python.exe'),
    path.join(home, '.pyenv', 'pyenv-win', 'shims', 'python3.exe'),
  ]

  for (const pythonPath of possiblePaths) {
    if (fs.existsSync(pythonPath)) {
      console.log(`[PythonDetector] Found Python on Windows: ${pythonPath}`)
      // On Windows we first check if it's a real Python (not MS Store redirect)
      if (testPythonIsReal(pythonPath)) {
        if (testPythonHasWntr(pythonPath)) {
          console.log(`[PythonDetector] Python has WNTR: ${pythonPath}`)
          return pythonPath
        }
        // Even without WNTR, a real Python is better than the MS Store alias
        console.log(`[PythonDetector] Python found (no WNTR): ${pythonPath}`)
      }
    }
  }

  // Try 'python' command directly (may work if Python is in PATH and not MS Store alias)
  if (testPythonIsReal('python')) {
    console.log('[PythonDetector] Using "python" from PATH')
    return 'python'
  }

  console.warn('[PythonDetector] No Python installation found on Windows')
  console.warn('[PythonDetector] Please install Python from python.org and set PYTHON_PATH in .env')
  return 'python'
}

function findPythonLinux(): string {
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
        return pythonPath
      }
    }
  }

  console.warn('[PythonDetector] No Python with WNTR found on Linux, using fallback')
  return 'python3'
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
  instructions: string | null
} {
  const pythonPath = findPythonPath()
  const isReal = testPythonIsReal(pythonPath)
  const hasWntr = isReal ? testPythonHasWntr(pythonPath) : false

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
      instructions = 'Python is not installed. Download it from python.org/downloads and check "Add Python to PATH" during installation. Then run: pip install wntr'
    } else if (process.platform === 'darwin') {
      instructions = 'Python is not installed. Run: brew install python@3.11 && pip3 install wntr'
    } else {
      instructions = 'Python is not installed. Run: sudo apt install python3 python3-pip && pip3 install wntr'
    }
  } else if (!hasWntr) {
    instructions = 'Python is installed but WNTR is missing. Run: pip install wntr'
  }

  return {
    pythonFound: isReal,
    pythonPath,
    wntrAvailable: hasWntr,
    pythonVersion,
    platform: process.platform,
    instructions,
  }
}

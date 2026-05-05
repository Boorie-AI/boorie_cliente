import { ipcMain, BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

/**
 * Setup handler — instala/repara las dependencias Python que Boorie necesita
 * (NeMo Guardrails, Milvus Lite, LangChain) sin que el usuario tenga que
 * tocar terminal. Se ejecuta en el primer arranque y bajo demanda desde
 * Settings → Guardrails si algo se rompe.
 *
 * Estrategia:
 *   1. Detecta un Python 3.9+ del sistema.
 *   2. Crea (o reutiliza) `venv-wntr/` en la carpeta de userData (writable
 *      en producción) o en el repo en dev.
 *   3. Hace `pip install` de los paquetes necesarios uno por uno con
 *      streaming de progreso via IPC `setup:progress`.
 *   4. Verifica con `import` que cada paquete carga.
 */

const REQUIRED_PACKAGES: { name: string; pip: string; importName: string }[] = [
  { name: 'numpy',                          pip: 'numpy>=1.20',                            importName: 'numpy' },
  { name: 'scipy',                          pip: 'scipy>=1.7',                             importName: 'scipy' },
  { name: 'pandas',                         pip: 'pandas>=1.3',                            importName: 'pandas' },
  { name: 'networkx',                       pip: 'networkx>=2.6',                          importName: 'networkx' },
  { name: 'wntr',                           pip: 'wntr>=0.5.0',                            importName: 'wntr' },
  { name: 'milvus-lite',                    pip: 'milvus-lite>=2.5.1',                     importName: 'milvus_lite' },
  { name: 'langchain-ollama',               pip: 'langchain-ollama>=0.2.0',                importName: 'langchain_ollama' },
  { name: 'langchain-nvidia-ai-endpoints',  pip: 'langchain-nvidia-ai-endpoints>=0.3.0',   importName: 'langchain_nvidia_ai_endpoints' },
  { name: 'nemoguardrails',                 pip: 'nemoguardrails>=0.10.0',                 importName: 'nemoguardrails' },
]

interface SetupStatus {
  ready: boolean
  pythonPath: string | null
  pythonVersion: string | null
  venvPath: string
  missing: string[]
  message?: string
}

function getVenvDir(userDataDir: string, repoRoot: string): string {
  // En dev, el repo tiene venv-wntr; reutilizamos.
  const repoVenv = path.join(repoRoot, 'venv-wntr')
  if (fs.existsSync(path.join(repoVenv, 'bin', 'python'))) return repoVenv
  if (fs.existsSync(path.join(repoVenv, 'Scripts', 'python.exe'))) return repoVenv
  // En producción, dentro de userData (writable después de la instalación).
  return path.join(userDataDir, 'venv-wntr')
}

function getVenvPython(venvDir: string): string {
  const unixPath = path.join(venvDir, 'bin', 'python')
  const winPath = path.join(venvDir, 'Scripts', 'python.exe')
  if (fs.existsSync(unixPath)) return unixPath
  if (fs.existsSync(winPath)) return winPath
  // Sin crear todavía — devolvemos el path esperado para crearlo después.
  return process.platform === 'win32' ? winPath : unixPath
}

async function findSystemPython(): Promise<{ path: string; version: string } | null> {
  const candidates: string[] = []

  if (process.platform === 'win32') {
    candidates.push('python', 'python3', 'py')
    const userPython = path.join(
      os.homedir(),
      'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'
    )
    candidates.push(userPython)
  } else {
    candidates.push(
      '/opt/homebrew/bin/python3.11',
      '/opt/homebrew/bin/python3.10',
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3.11',
      '/usr/local/bin/python3.10',
      '/usr/local/bin/python3',
      '/usr/bin/python3',
      'python3',
    )
  }

  for (const candidate of candidates) {
    try {
      const version = await new Promise<string | null>((resolve) => {
        const p = spawn(candidate, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
        let out = ''
        p.stdout.on('data', (d) => (out += d.toString()))
        p.stderr.on('data', (d) => (out += d.toString()))
        p.on('close', (code) => resolve(code === 0 ? out.trim() : null))
        p.on('error', () => resolve(null))
      })
      if (version && /Python 3\.(9|10|11|12|13)/.test(version)) {
        return { path: candidate, version }
      }
    } catch {
      // try next
    }
  }

  return null
}

function emitProgress(window: BrowserWindow | null, payload: any) {
  try {
    if (window && !window.isDestroyed()) {
      window.webContents.send('setup:progress', payload)
    }
  } catch { /* ignore */ }
}

async function checkPackagesInstalled(pythonPath: string): Promise<string[]> {
  const missing: string[] = []
  for (const pkg of REQUIRED_PACKAGES) {
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn(pythonPath, ['-c', `import ${pkg.importName}`], {
        stdio: ['ignore', 'ignore', 'ignore'],
      })
      p.on('close', (code) => resolve(code === 0))
      p.on('error', () => resolve(false))
    })
    if (!ok) missing.push(pkg.name)
  }
  return missing
}

async function createVenv(systemPython: string, venvDir: string, window: BrowserWindow | null): Promise<boolean> {
  emitProgress(window, { stage: 'venv', message: 'Creando entorno Python (venv-wntr)…' })
  return new Promise((resolve) => {
    const p = spawn(systemPython, ['-m', 'venv', venvDir], { stdio: ['ignore', 'pipe', 'pipe'] })
    p.stdout.on('data', (d) => emitProgress(window, { stage: 'venv', log: d.toString() }))
    p.stderr.on('data', (d) => emitProgress(window, { stage: 'venv', log: d.toString() }))
    p.on('close', (code) => resolve(code === 0))
    p.on('error', () => resolve(false))
  })
}

async function pipInstall(
  pythonPath: string,
  spec: string,
  window: BrowserWindow | null,
  current: number,
  total: number,
): Promise<boolean> {
  emitProgress(window, {
    stage: 'install',
    current,
    total,
    package: spec,
    message: `Instalando ${spec} (${current}/${total})…`,
  })
  return new Promise((resolve) => {
    const p = spawn(pythonPath, ['-m', 'pip', 'install', '--upgrade', spec], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    p.stdout.on('data', (d) => {
      const line = d.toString().trim()
      if (line) emitProgress(window, { stage: 'install', log: line })
    })
    p.stderr.on('data', (d) => {
      const line = d.toString().trim()
      if (line) emitProgress(window, { stage: 'install', log: line })
    })
    p.on('close', (code) => resolve(code === 0))
    p.on('error', () => resolve(false))
  })
}

export function registerSetupHandlers(getMainWindow: () => BrowserWindow | null, userDataDir: string, repoRoot: string) {
  ipcMain.handle('setup:status', async (): Promise<SetupStatus> => {
    const venvDir = getVenvDir(userDataDir, repoRoot)
    const venvPython = getVenvPython(venvDir)
    const venvExists = fs.existsSync(venvPython)

    if (!venvExists) {
      const sys = await findSystemPython()
      return {
        ready: false,
        pythonPath: sys?.path ?? null,
        pythonVersion: sys?.version ?? null,
        venvPath: venvDir,
        missing: REQUIRED_PACKAGES.map((p) => p.name),
        message: sys
          ? 'venv no creado todavía. Boorie puede crearlo automáticamente.'
          : 'Python 3.9+ no encontrado. Instálalo desde python.org y reinicia Boorie.',
      }
    }

    const missing = await checkPackagesInstalled(venvPython)
    return {
      ready: missing.length === 0,
      pythonPath: venvPython,
      pythonVersion: 'venv',
      venvPath: venvDir,
      missing,
      message: missing.length === 0
        ? 'Todo listo.'
        : `Faltan ${missing.length} paquete${missing.length === 1 ? '' : 's'} Python.`,
    }
  })

  ipcMain.handle('setup:install', async () => {
    const window = getMainWindow()
    const venvDir = getVenvDir(userDataDir, repoRoot)
    let venvPython = getVenvPython(venvDir)

    // Step 1 — create venv if missing
    if (!fs.existsSync(venvPython)) {
      const sys = await findSystemPython()
      if (!sys) {
        emitProgress(window, {
          stage: 'error',
          message: 'No se encontró Python 3.9+ en el sistema. Instálalo desde python.org y reinicia Boorie.',
        })
        return { success: false, error: 'python-not-found' }
      }
      const ok = await createVenv(sys.path, venvDir, window)
      if (!ok) {
        emitProgress(window, { stage: 'error', message: 'No se pudo crear el entorno Python.' })
        return { success: false, error: 'venv-creation-failed' }
      }
      venvPython = getVenvPython(venvDir)
    }

    // Step 2 — upgrade pip
    emitProgress(window, { stage: 'pip', message: 'Actualizando pip…' })
    await new Promise<void>((resolve) => {
      const p = spawn(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      p.stdout.on('data', (d) => emitProgress(window, { stage: 'pip', log: d.toString() }))
      p.stderr.on('data', (d) => emitProgress(window, { stage: 'pip', log: d.toString() }))
      p.on('close', () => resolve())
      p.on('error', () => resolve())
    })

    // Step 3 — install required packages
    const missing = await checkPackagesInstalled(venvPython)
    const total = missing.length
    let i = 0
    for (const name of missing) {
      i += 1
      const pkg = REQUIRED_PACKAGES.find((p) => p.name === name)
      if (!pkg) continue
      const ok = await pipInstall(venvPython, pkg.pip, window, i, total)
      if (!ok) {
        emitProgress(window, {
          stage: 'error',
          message: `Falló instalación de ${pkg.name}. Revisa los logs y reintenta.`,
        })
        return { success: false, error: `install-failed:${pkg.name}` }
      }
    }

    // Step 4 — verify
    const stillMissing = await checkPackagesInstalled(venvPython)
    if (stillMissing.length > 0) {
      emitProgress(window, {
        stage: 'error',
        message: `Tras la instalación, siguen faltando: ${stillMissing.join(', ')}.`,
      })
      return { success: false, error: 'verification-failed', missing: stillMissing }
    }

    emitProgress(window, {
      stage: 'done',
      message: '¡Listo! Boorie está preparado para usar guardrails y RAG.',
    })

    // Update PYTHON_PATH in process so wrappers pick the new venv on next call.
    process.env.PYTHON_PATH = venvPython

    return { success: true, pythonPath: venvPython }
  })
}

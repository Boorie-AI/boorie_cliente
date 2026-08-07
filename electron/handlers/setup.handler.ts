import { ipcMain, BrowserWindow, app, dialog } from 'electron'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { startMilvusServer } from '../services/milvusProcess'
import {
  resetPythonPathCache,
  savePythonPath,
  clearUserPythonPath,
  getUserPythonPath,
  getMissingWntrModules,
  findPythonPath,
} from '../../backend/services/hydraulic/pythonDetector'

/**
 * Setup handler — instala/repara las dependencias Python que Boorie necesita
 * (NeMo Guardrails, Milvus Lite, LangChain) sin que el usuario tenga que
 * tocar terminal. Se ejecuta en el primer arranque y bajo demanda desde
 * Settings → Guardrails si algo se rompe.
 *
 * Estrategia:
 *   1. Detecta un Python del sistema en el rango soportado (3.10 – 3.13).
 *   2. Crea (o reutiliza) `venv-wntr/` en la carpeta de userData (writable
 *      en producción) o en el repo en dev.
 *   3. Hace `pip install` de los paquetes necesarios uno por uno con
 *      streaming de progreso via IPC `setup:progress`.
 *   4. Verifica con `import` que cada paquete carga.
 */

// `optional: true` marca paquetes cuyo fallo de instalación no debe bloquear
// el resto del setup: Milvus/WNTR/RAG dependen solo de los paquetes "core".
// nemoguardrails es opcional (moderación) y no debe poder dejar Milvus
// inutilizable si su instalación falla — ver issue #21/#19.
// milvus-lite también es opcional: las ruedas 2.5.x sólo existen para Linux y
// macOS y la 3.x (pura Python) exige Python >= 3.10, así que en Windows con
// Python 3.9 pip no encuentra candidato y el setup abortaba justo después de
// instalar wntr, dejando el entorno marcado como "no listo" para siempre.
// Sin Milvus el RAG degrada, pero WNTR debe seguir funcionando.
// `wntr` va PRIMERO a propósito: declara numpy>=2.2.6, pandas>=2.0, scipy,
// networkx y matplotlib, así que dejar que pip resuelva su árbol de una vez
// evita el escenario que rompió a un tester — instalar antes `numpy>=1.20`
// dejaba numpy 1.x, pip daba el wntr por instalado y luego `import wntr`
// fallaba. matplotlib está en la lista porque wntr lo importa al cargarse:
// sin verificarlo, un fallo suyo se manifestaba como "wntr no instalado".
const REQUIRED_PACKAGES: {
  name: string
  pip: string
  importName: string
  optional?: boolean
  /** Paquetes del mismo grupo se instalan en una única orden de pip. */
  group?: string
}[] = [
  { name: 'wntr',                           pip: 'wntr>=0.5.0',                            importName: 'wntr' },
  { name: 'numpy',                          pip: 'numpy>=1.20',                            importName: 'numpy' },
  { name: 'scipy',                          pip: 'scipy>=1.7',                             importName: 'scipy' },
  { name: 'pandas',                         pip: 'pandas>=1.3',                            importName: 'pandas' },
  { name: 'networkx',                       pip: 'networkx>=2.6',                          importName: 'networkx' },
  { name: 'matplotlib',                     pip: 'matplotlib>=3.4',                        importName: 'matplotlib' },
  { name: 'milvus-lite',                    pip: 'milvus-lite>=2.5.1',                     importName: 'milvus_lite', optional: true },
  // milvus-lite 3.x NO declara pymilvus entre sus dependencias, pero su
  // adaptador gRPC hace `from pymilvus.grpc_gen import milvus_pb2_grpc`. Sin
  // él, `import milvus_lite` funciona y el servidor muere al arrancar: el RAG
  // se queda con 0 chunks y el panel informa "100% documents not indexed".
  { name: 'pymilvus',                       pip: 'pymilvus>=2.4',                          importName: 'pymilvus', optional: true },
  // Se instalan juntos y son opcionales. Juntos porque langchain-ollama exige
  // langchain-core>=1.2.21 y langchain-nvidia-ai-endpoints >=1.4.7:
  // instalándolos uno a uno pip deja un langchain_core que no satisface a
  // ambos y el import falla con "cannot import name 'content'" / "'ModelProfile'".
  // Opcionales porque sólo alimentan guardrails y el proveedor NVIDIA: ni WNTR
  // ni el indexado de Milvus dependen de ellos, y su fallo no debe dejar el
  // asistente en estado de error permanente.
  { name: 'langchain-ollama',               pip: 'langchain-ollama>=0.2.0',                importName: 'langchain_ollama', optional: true, group: 'langchain' },
  { name: 'langchain-nvidia-ai-endpoints',  pip: 'langchain-nvidia-ai-endpoints>=0.3.0',   importName: 'langchain_nvidia_ai_endpoints', optional: true, group: 'langchain' },
  { name: 'nemoguardrails',                 pip: 'nemoguardrails>=0.10.0',                 importName: 'nemoguardrails', optional: true },
]

/** Paquetes sin los que Milvus Lite no puede servir y el RAG no indexa. */
const MILVUS_PACKAGE_NAMES = ['milvus-lite', 'pymilvus']

function isOptionalPackage(name: string): boolean {
  return REQUIRED_PACKAGES.find((p) => p.name === name)?.optional === true
}

interface SetupStatus {
  ready: boolean
  pythonPath: string | null
  pythonVersion: string | null
  venvPath: string
  missing: string[]
  optionalMissing: string[]
  /** Motivo por el que cada paquete no carga; vacío si el venv no existe. */
  problems?: { name: string; error: string }[]
  /** El venv está fuera de 3.10–3.13: pip nunca podrá completar Milvus ahí. */
  venvPythonUnsupported?: boolean
  /** Hay un intérprete del rango soportado con el que recrear el venv. */
  canRecreateVenv?: boolean
  message?: string
}

/** Instrucción única para "instala un Python del rango soportado". */
const INSTALL_PYTHON_HINT =
  'Instala Python 3.13 desde python.org/downloads (marca "Add python.exe to PATH"), ' +
  'reinicia Boorie y vuelve a pulsar "Instalar dependencias". La 3.14 todavía no sirve: ' +
  'WNTR no publica paquete para ella.'

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

interface SystemPython {
  path: string
  /** Argumentos previos a `-m` (el lanzador `py` de Windows necesita `-3`). */
  args: string[]
  version: string
}

// Rango soportado: 3.10 – 3.13.
//   - Por abajo: Milvus Lite y el stack RAG exigen >= 3.10, y en 3.9 pip no
//     podía resolver milvus-lite.
//   - Por arriba: wntr 1.5 no publica rueda para cp314 en Windows (sí para
//     cp313) y nemoguardrails declara python <3.14. Un venv sobre 3.14 deja
//     WNTR ininstalable, que es lo que le ocurrió a un cliente con Anaconda
//     3.14.6: pip "terminaba" y el import seguía fallando.
const SUPPORTED_PYTHON = /Python 3\.(1[0-3])(\.|\s|$)/

async function findSystemPython(): Promise<SystemPython | null> {
  const candidates: { cmd: string; args: string[] }[] = []

  // Override explícito: si el usuario fijó PYTHON_PATH, manda.
  if (process.env.PYTHON_PATH) candidates.push({ cmd: process.env.PYTHON_PATH, args: [] })

  if (process.platform === 'win32') {
    const versions = ['313', '312', '311', '310']
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'

    // Primero versiones concretas soportadas y sólo al final los comandos
    // genéricos: en un equipo con Anaconda, `python` resuelve a la versión que
    // tenga instalada (3.14 en el caso que investigamos) y se llevaba la
    // elección aunque hubiera un 3.13 perfectamente válido al lado.
    for (const v of versions) {
      candidates.push({
        cmd: path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', `Python${v}`, 'python.exe'),
        args: [],
      })
      candidates.push({ cmd: path.join(programFiles, `Python${v}`, 'python.exe'), args: [] })
      candidates.push({ cmd: path.join('C:\\', `Python${v}`, 'python.exe'), args: [] })
      // Lanzador oficial con versión explícita
      candidates.push({ cmd: 'py', args: [`-3.${v.slice(1)}`] })
    }
    candidates.push({ cmd: 'python', args: [] })
    candidates.push({ cmd: 'python3', args: [] })
    candidates.push({ cmd: 'py', args: ['-3'] })
  } else {
    // Igual que en Windows: versiones concretas primero, genéricos al final,
    // para que un python3 que apunte a 3.14 no se lleve la elección.
    for (const p of [
      '/opt/homebrew/bin/python3.13',
      '/opt/homebrew/bin/python3.12',
      '/opt/homebrew/bin/python3.11',
      '/opt/homebrew/bin/python3.10',
      '/usr/local/bin/python3.13',
      '/usr/local/bin/python3.12',
      '/usr/local/bin/python3.11',
      '/usr/local/bin/python3.10',
      '/usr/bin/python3.13',
      '/usr/bin/python3.12',
      '/usr/bin/python3.11',
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3',
      '/usr/bin/python3',
      'python3',
    ]) {
      candidates.push({ cmd: p, args: [] })
    }
  }

  for (const candidate of candidates) {
    try {
      const version = await new Promise<string | null>((resolve) => {
        const p = spawn(candidate.cmd, [...candidate.args, '--version'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
        let out = ''
        p.stdout.on('data', (d) => (out += d.toString()))
        p.stderr.on('data', (d) => (out += d.toString()))
        p.on('close', (code) => resolve(code === 0 ? out.trim() : null))
        p.on('error', () => resolve(null))
      })
      if (version && SUPPORTED_PYTHON.test(version)) {
        return { path: candidate.cmd, args: candidate.args, version }
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

interface PackageProblem {
  name: string
  /** Última línea significativa del traceback: por qué falla el import. */
  error: string
}

/**
 * Comprueba qué paquetes no cargan y **conserva el motivo**. Antes se
 * descartaba el stderr, así que un `import wntr` que fallaba por matplotlib o
 * por una DLL de Windows se reportaba como un opaco "verification-failed" y no
 * había forma de diagnosticarlo desde el equipo del usuario.
 */
async function checkPackagesInstalled(pythonPath: string): Promise<PackageProblem[]> {
  const problems: PackageProblem[] = []
  for (const pkg of REQUIRED_PACKAGES) {
    const result = await new Promise<{ ok: boolean; stderr: string }>((resolve) => {
      const p = spawn(pythonPath, ['-c', `import ${pkg.importName}`], {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      })
      let stderr = ''
      p.stderr?.on('data', (d) => (stderr += d.toString()))
      p.on('close', (code) => resolve({ ok: code === 0, stderr }))
      p.on('error', (err) => resolve({ ok: false, stderr: err.message }))
    })
    if (!result.ok) {
      const lines = result.stderr.trim().split('\n').filter((l) => l.trim().length > 0)
      const relevant = lines.reverse().find((l) => /Error|Exception/.test(l)) || lines[0] || 'import failed'
      problems.push({ name: pkg.name, error: relevant.trim() })
      appendSetupLog(`[check] ${pkg.name}: ${relevant.trim()}\n${result.stderr}`)
    }
  }
  return problems
}

function missingNames(problems: PackageProblem[]): string[] {
  return problems.map((p) => p.name)
}

/** Versión del intérprete, para saber si un venv reutilizado es demasiado viejo. */
async function getPythonVersion(pythonPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const p = spawn(pythonPath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    p.stdout.on('data', (d) => (out += d.toString()))
    p.stderr.on('data', (d) => (out += d.toString()))
    p.on('close', (code) => resolve(code === 0 ? out.trim() : null))
    p.on('error', () => resolve(null))
  })
}

/** Fichero de log del setup, para que un incidente se pueda diagnosticar. */
let setupLogFile: string | null = null

function appendSetupLog(text: string): void {
  if (!setupLogFile) return
  try {
    fs.mkdirSync(path.dirname(setupLogFile), { recursive: true })
    fs.appendFileSync(setupLogFile, `${text}\n`, 'utf-8')
  } catch { /* el log no debe romper el setup */ }
}

async function createVenv(
  systemPython: SystemPython,
  venvDir: string,
  window: BrowserWindow | null,
  extraArgs: string[] = [],
): Promise<boolean> {
  emitProgress(window, { stage: 'venv', message: 'Creando entorno Python (venv-wntr)…' })
  return new Promise((resolve) => {
    const p = spawn(systemPython.path, [...systemPython.args, '-m', 'venv', ...extraArgs, venvDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    p.stdout.on('data', (d) => emitProgress(window, { stage: 'venv', log: d.toString() }))
    p.stderr.on('data', (d) => emitProgress(window, { stage: 'venv', log: d.toString() }))
    p.on('close', (code) => resolve(code === 0))
    p.on('error', () => resolve(false))
  })
}

async function pipInstall(
  pythonPath: string,
  specs: string[],
  window: BrowserWindow | null,
  current: number,
  total: number,
): Promise<boolean> {
  const spec = specs.join(' ')
  emitProgress(window, {
    stage: 'install',
    current,
    total,
    package: spec,
    message: `Instalando ${spec} (${current}/${total})…`,
  })
  return new Promise((resolve) => {
    // Varios specs en una sola invocación: pip resuelve sus restricciones
    // conjuntamente en lugar de dejar versiones incompatibles entre sí.
    const p = spawn(pythonPath, ['-m', 'pip', 'install', '--upgrade', ...specs], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    p.stdout.on('data', (d) => {
      const line = d.toString().trim()
      if (line) {
        emitProgress(window, { stage: 'install', log: line })
        appendSetupLog(`[pip ${spec}] ${line}`)
      }
    })
    p.stderr.on('data', (d) => {
      const line = d.toString().trim()
      if (line) {
        emitProgress(window, { stage: 'install', log: line })
        appendSetupLog(`[pip ${spec}] ${line}`)
      }
    })
    p.on('close', (code) => {
      appendSetupLog(`[pip ${spec}] exit=${code}`)
      resolve(code === 0)
    })
    p.on('error', () => resolve(false))
  })
}

export function registerSetupHandlers(getMainWindow: () => BrowserWindow | null, userDataDir: string, repoRoot: string) {
  setupLogFile = path.join(userDataDir, 'logs', 'setup-python.log')

  ipcMain.handle('setup:status', async (): Promise<SetupStatus> => {
    const venvDir = getVenvDir(userDataDir, repoRoot)
    const venvPython = getVenvPython(venvDir)
    const venvExists = fs.existsSync(venvPython)

    // El intérprete que WNTR usará de verdad puede ser el del sistema: si ya
    // tiene el stack completo, el asistente no tiene nada que hacer y no debe
    // aparecer. Antes sólo se medía el venv, así que el wizard insistía aunque
    // el usuario tuviera su propia instalación funcionando.
    const effectivePython = findPythonPath()
    const effectiveMissing = getMissingWntrModules(effectivePython)
    const effectiveReady = effectiveMissing !== null && effectiveMissing.length === 0

    if (!venvExists) {
      const sys = await findSystemPython()
      const allNames = REQUIRED_PACKAGES.map((p) => p.name)
      return {
        // Sin venv no hay Milvus, y sin Milvus el RAG queda sin indexar. Se
        // avisa aunque WNTR ya funcione: la degradación silenciosa del RAG es
        // justo el fallo que reportó un cliente ("100% documents not indexed").
        ready: false,
        pythonPath: effectiveReady ? effectivePython : (sys?.path ?? null),
        pythonVersion: sys?.version ?? null,
        venvPath: venvDir,
        missing: allNames.filter((n) => !isOptionalPackage(n)),
        optionalMissing: allNames.filter((n) => isOptionalPackage(n)),
        message: effectiveReady
          ? `WNTR ya funciona con ${effectivePython}. Falta preparar el entorno de Milvus/RAG para poder indexar documentos.`
          : sys
            ? 'venv no creado todavía. Boorie puede crearlo automáticamente.'
            : `No se encontró un Python compatible (3.10 – 3.13). ${INSTALL_PYTHON_HINT}`,
      }
    }

    const problems = await checkPackagesInstalled(venvPython)
    const venvVersion = await getPythonVersion(venvPython)
    const missing = missingNames(problems).filter((n) => !isOptionalPackage(n))
    const optionalMissing = missingNames(problems).filter((n) => isOptionalPackage(n))
    const venvReady = missing.length === 0
    // Milvus es "opcional" para no bloquear WNTR si su instalación falla, pero
    // su ausencia sí debe seguir avisando: sin él no se indexa nada.
    const milvusMissing = missingNames(problems).filter((n) => MILVUS_PACKAGE_NAMES.includes(n))

    // Un venv heredado fuera de 3.10–3.13 no puede completarse nunca: milvus-lite
    // sólo publica ruedas Linux/macOS hasta la 2.5.x y la 3.x —la única instalable
    // en Windows— exige Python >= 3.10. Sin decirlo, el asistente reaparecía en
    // cada arranque pidiendo paquetes que pip no puede resolver, sin pista alguna
    // de que el problema era la versión del intérprete (caso de un cliente con un
    // venv de 3.9 creado por una versión anterior de Boorie).
    if (venvVersion && !SUPPORTED_PYTHON.test(venvVersion) && (missing.length > 0 || milvusMissing.length > 0)) {
      const sys = await findSystemPython()
      return {
        ready: false,
        pythonPath: venvPython,
        pythonVersion: venvVersion,
        venvPath: venvDir,
        missing: milvusMissing.length > 0 ? milvusMissing : missing,
        optionalMissing,
        problems,
        venvPythonUnsupported: true,
        canRecreateVenv: sys !== null,
        message: sys
          ? `El entorno de Boorie está sobre ${venvVersion}, y milvus-lite/WNTR necesitan Python 3.10 – 3.13. ` +
            `Pulsa "Instalar dependencias": el entorno se recreará con ${sys.version} y el anterior se conservará por si acaso.`
          : `El entorno de Boorie está sobre ${venvVersion} y no hay ningún Python 3.10 – 3.13 en este equipo, ` +
            `así que pip no puede instalar milvus-lite (sus versiones para Windows exigen 3.10+). ${INSTALL_PYTHON_HINT}`,
      }
    }

    if ((venvReady || effectiveReady) && milvusMissing.length > 0) {
      return {
        ready: false,
        pythonPath: venvPython,   // los problemas listados vienen del venv
        pythonVersion: venvVersion,
        venvPath: venvDir,
        missing: milvusMissing,
        optionalMissing: optionalMissing.filter((n) => !milvusMissing.includes(n)),
        problems: problems.filter((p) => milvusMissing.includes(p.name)),
        message: `WNTR funciona, pero falta ${milvusMissing.join(' y ')} para el indexado RAG: ` +
          'sin ellos Milvus no arranca y los documentos quedan sin indexar.',
      }
    }

    return {
      ready: venvReady || effectiveReady,
      pythonPath: venvReady ? venvPython : (effectiveReady ? effectivePython : venvPython),
      pythonVersion: venvVersion,
      venvPath: venvDir,
      missing: venvReady || effectiveReady ? [] : missing,
      optionalMissing,
      problems,
      message: venvReady
        ? (optionalMissing.length === 0
          ? 'Todo listo.'
          : `Todo listo (guardrails opcional no disponible: ${optionalMissing.join(', ')}).`)
        : effectiveReady
          ? `WNTR está disponible en ${effectivePython}. El entorno propio de Boorie está incompleto (${missing.join(', ')}), pero no es necesario.`
          : `Faltan ${missing.length} paquete${missing.length === 1 ? '' : 's'} Python: ` +
            problems.filter((p) => !isOptionalPackage(p.name)).map((p) => `${p.name} (${p.error})`).join('; '),
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
          message: `No se encontró un Python compatible (3.10 – 3.13) en el sistema. ${INSTALL_PYTHON_HINT}`,
        })
        return { success: false, error: 'python-not-found' }
      }
      const ok = await createVenv(sys, venvDir, window)
      if (!ok) {
        emitProgress(window, { stage: 'error', message: 'No se pudo crear el entorno Python.' })
        return { success: false, error: 'venv-creation-failed' }
      }
      venvPython = getVenvPython(venvDir)
    }

    // Un venv heredado puede estar fuera del rango soportado: hecho con 3.9
    // (lo aceptábamos antes) o con 3.14 (donde wntr no tiene rueda para
    // Windows). En ambos casos pip "instala" y el import falla después, así que
    // lo apartamos y creamos uno nuevo con un intérprete del rango 3.10–3.13.
    const existingVersion = await getPythonVersion(venvPython)
    if (existingVersion && !SUPPORTED_PYTHON.test(existingVersion)) {
      const sys = await findSystemPython()
      if (sys) {
        const archived = `${venvDir}-old-${Date.now()}`
        emitProgress(window, {
          stage: 'venv',
          message: `El entorno de Boorie usa ${existingVersion}; se recreará con ${sys.version}. El anterior se conserva en ${archived}.`,
        })
        appendSetupLog(`[recreate] ${existingVersion} -> ${sys.version}; archivado en ${archived}`)

        // Si no se puede apartar (antivirus, un python del venv aún vivo…) hay
        // que vaciarlo con `--clear`: crear encima dejaría el site-packages de
        // 3.9 con un intérprete nuevo, que es peor que no tocar nada.
        let archivedOk = true
        try {
          fs.renameSync(venvDir, archived)
        } catch (error) {
          archivedOk = false
          appendSetupLog(`[recreate] no se pudo apartar el venv, se recreará con --clear: ${String(error)}`)
          emitProgress(window, {
            stage: 'venv',
            message: 'No se pudo conservar el entorno anterior; se vaciará y recreará.',
          })
        }

        if (!(await createVenv(sys, venvDir, window, archivedOk ? [] : ['--clear']))) {
          emitProgress(window, {
            stage: 'error',
            message: 'No se pudo recrear el entorno Python. Cierra Boorie, borra la carpeta ' +
              `${venvDir} y vuelve a intentarlo.`,
          })
          return { success: false, error: 'venv-recreation-failed', venvPath: venvDir }
        }
        venvPython = getVenvPython(venvDir)
      } else {
        // Se continúa (WNTR puede seguir funcionando en el venv viejo), pero hay
        // que decir que Milvus/RAG no van a completarse aquí: pip no tiene
        // candidato de milvus-lite para Windows por debajo de 3.10.
        emitProgress(window, {
          stage: 'warning',
          message: `El entorno de Boorie usa ${existingVersion}, fuera del rango que WNTR y Milvus soportan ` +
            `(3.10 – 3.13), y no hay otro intérprete instalado: el indexado RAG seguirá sin funcionar. ${INSTALL_PYTHON_HINT}`,
        })
      }
    }

    // El venv ya existe (o se acaba de crear): fijamos PYTHON_PATH ya mismo
    // para que WNTR/Milvus puedan usarlo aunque un paquete opcional falle
    // más abajo y el setup termine en estado parcial.
    process.env.PYTHON_PATH = venvPython
    // …y lo persistimos en userData: PYTHON_PATH sólo vive en memoria, así que
    // sin esto el siguiente arranque volvía a "Python/WNTR no instalado".
    savePythonPath(venvPython)
    resetPythonPathCache()

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

    // Step 3 — install required packages. Un paquete opcional (nemoguardrails)
    // que falle se registra y se salta, pero no aborta el setup: Milvus/WNTR
    // no dependen de él y deben quedar operativos igualmente (issue #21).
    const missing = missingNames(await checkPackagesInstalled(venvPython))
    const total = missing.length
    let i = 0
    const failedOptional: string[] = []
    const doneGroups = new Set<string>()
    for (const name of missing) {
      i += 1
      const pkg = REQUIRED_PACKAGES.find((p) => p.name === name)
      if (!pkg) continue

      // Los paquetes de un grupo van en una sola orden de pip para que el
      // resolutor vea todas sus restricciones a la vez.
      if (pkg.group) {
        if (doneGroups.has(pkg.group)) continue
        doneGroups.add(pkg.group)
        const specs = REQUIRED_PACKAGES.filter((p) => p.group === pkg.group && missing.includes(p.name))
        const okGroup = await pipInstall(venvPython, specs.map((p) => p.pip), window, i, total)
        if (!okGroup) {
          failedOptional.push(...specs.filter((p) => p.optional).map((p) => p.name))
          emitProgress(window, {
            stage: 'warning',
            message: `No se pudo instalar el grupo ${pkg.group} (${specs.map((p) => p.name).join(', ')}). ` +
              'Se continúa: WNTR y el indexado de Milvus no dependen de él.',
          })
        }
        continue
      }

      const ok = await pipInstall(venvPython, [pkg.pip], window, i, total)
      if (!ok) {
        if (pkg.optional) {
          failedOptional.push(pkg.name)
          emitProgress(window, {
            stage: 'warning',
            message: `${pkg.name} (opcional) no se pudo instalar. Se continúa sin él; el resto de funciones (RAG/Milvus/WNTR) no se ven afectadas.`,
          })
          continue
        }
        emitProgress(window, {
          stage: 'error',
          message: `Falló instalación de ${pkg.name}. Revisa los logs y reintenta.`,
        })
        return { success: false, error: `install-failed:${pkg.name}` }
      }
    }

    // Step 4 — verify (solo paquetes core; los opcionales fallidos ya se reportaron arriba)
    const stillFailing = (await checkPackagesInstalled(venvPython)).filter((p) => !isOptionalPackage(p.name))
    if (stillFailing.length > 0) {
      // pip puede terminar con éxito y el import fallar igualmente (una DLL de
      // Windows que no carga, una dependencia incompatible…). Reportamos el
      // motivo real en lugar de un "verification-failed" que no dice nada.
      const detail = stillFailing.map((p) => `${p.name}: ${p.error}`).join('\n')
      const venvVersion = await getPythonVersion(venvPython)
      appendSetupLog(`[verify] venv=${venvPython} (${venvVersion ?? 'versión desconocida'})\n${detail}`)
      emitProgress(window, {
        stage: 'error',
        message: `pip terminó, pero estos paquetes siguen sin cargar:\n${detail}\n\n` +
          `Intérprete: ${venvPython} (${venvVersion ?? 'versión desconocida'})\n` +
          `Detalle completo en: ${setupLogFile}`,
      })
      return {
        success: false,
        error: 'verification-failed',
        missing: missingNames(stillFailing),
        problems: stillFailing,
        pythonPath: venvPython,
        pythonVersion: venvVersion,
        logFile: setupLogFile,
      }
    }

    emitProgress(window, {
      stage: 'done',
      message: failedOptional.length === 0
        ? '¡Listo! Boorie está preparado para usar guardrails y RAG.'
        : `¡Listo! RAG/Milvus/WNTR operativos. Guardrails no disponible (${failedOptional.join(', ')} falló al instalar).`,
    })

    // El venv recién instalado tiene milvus-lite: reiniciamos el servidor
    // embebido apuntando a él (pudo haber arrancado antes con el Python del
    // sistema, sin milvus-lite, si este era el primer arranque).
    resetPythonPathCache()
    try {
      const milvusDataDir = path.join(app.getPath('userData'), 'data')
      startMilvusServer(venvPython, milvusDataDir)
    } catch {
      // non-fatal — MilvusService will just stay "unavailable" and RAG degrades gracefully
    }

    return { success: true, pythonPath: venvPython, optionalFailed: failedOptional }
  })

  // --- Selección manual del intérprete de Python ---------------------------
  // Escape para quien ya tiene su propio entorno (conda, venv propio, ruta no
  // estándar): la autodetección es una heurística y no puede cubrirlo todo.

  function describePython(pythonPath: string) {
    const missing = getMissingWntrModules(pythonPath)
    return {
      pythonPath,
      usable: missing !== null,
      wntrReady: missing !== null && missing.length === 0,
      missingModules: missing ?? [],
    }
  }

  ipcMain.handle('setup:get-python', async () => {
    const configured = getUserPythonPath()
    return {
      success: true,
      configured,
      effective: describePython(findPythonPath()),
    }
  })

  ipcMain.handle('setup:set-python', async (_event, rawPath: string) => {
    const pythonPath = (rawPath || '').trim()
    if (!pythonPath) return { success: false, error: 'empty-path' }

    const missing = getMissingWntrModules(pythonPath)
    if (missing === null) {
      return {
        success: false,
        error: 'not-a-python',
        message: 'Esa ruta no ejecuta Python. Indica el ejecutable completo (python.exe en Windows).',
      }
    }

    savePythonPath(pythonPath, 'user')
    resetPythonPathCache()
    return {
      success: true,
      pythonPath,
      wntrReady: missing.length === 0,
      missingModules: missing,
      message: missing.length === 0
        ? 'Intérprete configurado. WNTR está disponible.'
        : `Intérprete configurado, pero le faltan módulos: ${missing.join(', ')}.`,
    }
  })

  ipcMain.handle('setup:clear-python', async () => {
    clearUserPythonPath()
    resetPythonPathCache()
    return { success: true, effective: describePython(findPythonPath()) }
  })

  ipcMain.handle('setup:browse-python', async () => {
    const window = getMainWindow()
    const filters = process.platform === 'win32'
      ? [{ name: 'Python', extensions: ['exe'] }]
      : [{ name: 'Todos los archivos', extensions: ['*'] }]
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openFile'], filters })
      : await dialog.showOpenDialog({ properties: ['openFile'], filters })
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true }
    return { success: true, path: result.filePaths[0] }
  })
}

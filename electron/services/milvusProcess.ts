import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import log from 'electron-log'

/**
 * Owns the lifecycle of the embedded Milvus Lite server process
 * (`scripts/start_milvus.py`). Nothing previously spawned this script outside
 * of the dev-only `scripts/dev-runner.js`, so the packaged app never had a
 * running Milvus instance — `MilvusService.ensureConnection()` always failed
 * and cached itself as "unavailable" (root cause of issues #19/#20/#21).
 */

export const PLAZO_PARADA_MS = 10_000
export const ESPERA_RELANZAR_MS = 5_000
export const MAX_RELANZAMIENTOS = 2

let milvusProcess: ChildProcess | null = null
let relanzamiento: ReturnType<typeof setTimeout> | null = null
let relanzamientos = 0
let alArrancar: (() => void) | null = null

/**
 * Se llama cada vez que se lanza un Milvus nuevo. Escucha en otro puerto, y
 * quien siguiera conectado al anterior fallaría hasta reiniciar Boorie.
 */
export function alArrancarMilvus(cb: () => void): void {
  alArrancar = cb
}

function resolveScriptPath(): string {
  const resourcesPath = (process as any).resourcesPath as string | undefined
  if (resourcesPath) {
    const prodPath = path.join(resourcesPath, 'scripts', 'start_milvus.py')
    if (fs.existsSync(prodPath)) return prodPath
  }
  return path.join(process.cwd(), 'scripts', 'start_milvus.py')
}

export async function startMilvusServer(pythonPath: string, dataDir: string): Promise<void> {
  const scriptPath = resolveScriptPath()
  if (!fs.existsSync(scriptPath)) {
    log.warn(`[Milvus] start_milvus.py not found at ${scriptPath}, skipping`)
    return
  }

  // Esperar a que el anterior suelte la base: dos procesos sobre el mismo
  // directorio no pueden abrirla a la vez.
  await stopMilvusServer()

  // Un Milvus terminado a la fuerza deja su puerto escrito, y el cliente
  // intentaría conectar ahí antes de que el nuevo publique el suyo.
  try {
    fs.rmSync(path.join(dataDir, 'boorie-milvus', 'port'), { force: true })
  } catch {
    // Si no se puede borrar, el cliente reintenta hasta leer el puerto nuevo.
  }

  // A electron-log y no a la consola: en la app instalada la consola no se
  // guarda, y sin esto un Milvus que no arranca no deja rastro en main.log.
  log.info(`[Milvus] Starting Milvus Lite: ${pythonPath} ${scriptPath} (data dir: ${dataDir})`)
  const child = spawn(pythonPath, [scriptPath], {
    stdio: 'pipe',
    env: { ...process.env, BOORIE_DATA_DIR: dataDir, BOORIE_MILVUS_PARAR_CON_STDIN: '1' },
  })
  milvusProcess = child
  alArrancar?.()

  child.stdout?.on('data', (d) => log.info(`[Milvus] ${d.toString().trim()}`))
  child.stderr?.on('data', (d) => log.info(`[Milvus] ${d.toString().trim()}`))
  // Sin esto, escribir en la entrada de un proceso que ya murió tumba el main con EPIPE.
  child.stdin?.on('error', () => {})
  child.on('exit', (code, signal) => {
    if (milvusProcess === child) {
      log.warn(`[Milvus] process exited with code ${code}${signal ? ` (signal ${signal})` : ''}`)
      milvusProcess = null
      programarRelanzamiento(pythonPath, dataDir)
    } else {
      log.info(`[Milvus] process stopped (code ${code}${signal ? `, signal ${signal}` : ''})`)
    }
  })
  child.on('error', (err) => {
    log.warn(`[Milvus] failed to start process: ${err.message}`)
    if (milvusProcess === child) milvusProcess = null
  })
}

/**
 * Sin relanzarlo, una caída dejaba la sesión entera sin documentación. El tope
 * es porque si cae al cargar sus datos volverá a caer, y no tiene sentido
 * repetirlo sin fin.
 */
function programarRelanzamiento(pythonPath: string, dataDir: string): void {
  if (relanzamientos >= MAX_RELANZAMIENTOS) {
    log.warn(`[Milvus] se ha caído ${relanzamientos + 1} veces: no se relanza más hasta reiniciar Boorie`)
    return
  }
  relanzamientos += 1
  log.info(`[Milvus] se relanza en ${ESPERA_RELANZAR_MS / 1000} s (intento ${relanzamientos} de ${MAX_RELANZAMIENTOS})`)
  relanzamiento = setTimeout(() => {
    relanzamiento = null
    startMilvusServer(pythonPath, dataDir).catch((error) =>
      log.warn(`[Milvus] no se pudo relanzar: ${(error as Error).message}`)
    )
  }, ESPERA_RELANZAR_MS)
}

export function stopMilvusServer(): Promise<void> {
  if (relanzamiento) {
    clearTimeout(relanzamiento)
    relanzamiento = null
  }
  const child = milvusProcess
  milvusProcess = null
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve()

  return new Promise((resolve) => {
    const forzar = setTimeout(() => {
      log.warn(`[Milvus] no paró en ${PLAZO_PARADA_MS / 1000} s: se termina a la fuerza`)
      child.kill()
    }, PLAZO_PARADA_MS)
    child.once('exit', () => {
      clearTimeout(forzar)
      resolve()
    })
    // Cerrarle la entrada es la orden de parar. kill() en Windows es
    // TerminateProcess: Milvus no llega a cerrar su WAL y, con milvus-lite
    // anterior a la 3.2.0, el siguiente arranque abortaba al leerlo.
    child.stdin?.end()
  })
}

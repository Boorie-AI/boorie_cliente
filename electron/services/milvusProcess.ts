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

let milvusProcess: ChildProcess | null = null

function resolveScriptPath(): string {
  const resourcesPath = (process as any).resourcesPath as string | undefined
  if (resourcesPath) {
    const prodPath = path.join(resourcesPath, 'scripts', 'start_milvus.py')
    if (fs.existsSync(prodPath)) return prodPath
  }
  return path.join(process.cwd(), 'scripts', 'start_milvus.py')
}

export function startMilvusServer(pythonPath: string, dataDir: string): void {
  const scriptPath = resolveScriptPath()
  if (!fs.existsSync(scriptPath)) {
    log.warn(`[Milvus] start_milvus.py not found at ${scriptPath}, skipping`)
    return
  }

  stopMilvusServer()

  // A electron-log y no a la consola: en la app instalada la consola no se
  // guarda, y sin esto un Milvus que no arranca no deja rastro en main.log.
  log.info(`[Milvus] Starting Milvus Lite: ${pythonPath} ${scriptPath} (data dir: ${dataDir})`)
  const child = spawn(pythonPath, [scriptPath], {
    stdio: 'pipe',
    env: { ...process.env, BOORIE_DATA_DIR: dataDir },
  })
  milvusProcess = child

  child.stdout?.on('data', (d) => log.info(`[Milvus] ${d.toString().trim()}`))
  child.stderr?.on('data', (d) => log.info(`[Milvus] ${d.toString().trim()}`))
  child.on('exit', (code, signal) => {
    if (milvusProcess === child) {
      log.warn(`[Milvus] process exited with code ${code}${signal ? ` (signal ${signal})` : ''}`)
      milvusProcess = null
    } else {
      log.info(`[Milvus] process stopped (code ${code}${signal ? `, signal ${signal}` : ''})`)
    }
  })
  child.on('error', (err) => {
    log.warn(`[Milvus] failed to start process: ${err.message}`)
    if (milvusProcess === child) milvusProcess = null
  })
}

export function stopMilvusServer(): void {
  if (milvusProcess && !milvusProcess.killed) {
    milvusProcess.kill()
  }
  milvusProcess = null
}

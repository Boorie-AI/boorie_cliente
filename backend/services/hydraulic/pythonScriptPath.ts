import * as path from 'path'
import * as fs from 'fs'

let cachedApp: any = null
function getElectronApp(): any {
  if (cachedApp !== null) return cachedApp
  try {
    cachedApp = require('electron').app || false
  } catch {
    cachedApp = false
  }
  return cachedApp
}

function isPackagedApp(): boolean {
  const app = getElectronApp()
  if (app) return Boolean(app.isPackaged)
  return !process.defaultApp && Boolean(process.resourcesPath) && !process.resourcesPath!.includes('node_modules')
}

export function resolvePythonScriptPath(scriptName: string): string {
  const app = getElectronApp()
  const candidates: string[] = []

  if (isPackagedApp() && process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'backend', 'services', 'hydraulic', scriptName))
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'backend', 'services', 'hydraulic', scriptName))
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'services', 'hydraulic', scriptName))
  }

  candidates.push(path.join(__dirname, scriptName))
  candidates.push(path.join(process.cwd(), 'backend', 'services', 'hydraulic', scriptName))
  candidates.push(path.join(__dirname, '..', '..', '..', 'backend', 'services', 'hydraulic', scriptName))
  if (app && typeof app.getAppPath === 'function') {
    candidates.push(path.join(app.getAppPath(), 'backend', 'services', 'hydraulic', scriptName))
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      // ignore
    }
  }

  return candidates[0]
}

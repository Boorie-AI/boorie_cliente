try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config()
} catch (e) {
  console.log('dotenv not loaded:', e)
}

// polyfill crypto for Node.js environments that expect global.crypto (Node 19+)
if (typeof global !== 'undefined' && !global.crypto) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    global.crypto = crypto.webcrypto || crypto;
    console.log('Global crypto polyfill applied successfully');
  } catch (err) {
    console.error('Failed to polyfill global.crypto:', err);
  }
}

// Configure Prisma environment BEFORE any imports
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electronModule = require('electron');
  // Use multiple checks for packaged app detection
  const appInstance = electronModule.app;
  const isPackaged = appInstance ? appInstance.isPackaged : (!process.defaultApp && (process.resourcesPath && !process.resourcesPath.includes('node_modules')));

  if (!isPackaged) {
    // Development mode - no special configuration needed
    console.log('Running in development mode');
  } else {
    // Production mode - configure Prisma paths
    // Production mode - configure Prisma paths
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs')
    const resourcesPath = process.resourcesPath

    // Set environment variables for Prisma
    process.env.PRISMA_CLIENT_RUNTIME_LIBRARY = path.join(resourcesPath, '@prisma/client/runtime/library.js')

    // Platform-specific query engine
    let queryEnginePath: string
    if (process.platform === 'darwin') {
      const queryEngineLib = process.arch === 'arm64'
        ? 'libquery_engine-darwin-arm64.dylib.node'
        : 'libquery_engine-darwin.dylib.node'
      queryEnginePath = path.join(resourcesPath, '.prisma/client', queryEngineLib)
    } else if (process.platform === 'win32') {
      queryEnginePath = path.join(resourcesPath, '.prisma/client/query_engine-windows.dll.node')
    } else {
      /*
       * Aquí estaba fijado el motor de musl, que es la libc de Alpine, así que
       * el AppImage se quedaba sin base de datos en cualquier Linux normal: el
       * .so no se puede cargar y Prisma no llega a arrancar. Se elige entre los
       * motores que ya viajan en el paquete, en el orden que corresponde a la
       * libc de la máquina, y se comprueba cargándolos: si el primero no entra
       * se pasa al siguiente, que es lo que ninguna detección sola garantiza.
       */
      const conGlibc = !!(process.report?.getReport() as { header?: { glibcVersionRuntime?: string } })?.header?.glibcVersionRuntime
      const glibc = [
        'libquery_engine-debian-openssl-3.0.x.so.node',
        'libquery_engine-debian-openssl-1.1.x.so.node',
        'libquery_engine-rhel-openssl-3.0.x.so.node',
        'libquery_engine-rhel-openssl-1.1.x.so.node',
      ]
      const musl = ['libquery_engine-linux-musl.so.node', 'libquery_engine-linux-musl-openssl-3.0.x.so.node']
      const candidatos = conGlibc ? [...glibc, ...musl] : [...musl, ...glibc]

      const cargable = (ruta: string): boolean => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require(ruta)
          return true
        } catch {
          return false
        }
      }

      const rutas = candidatos.map(nombre => path.join(resourcesPath, '.prisma/client', nombre))
      // Si no carga ninguno se deja el que exista: el error de Prisma nombrando
      // el motor concreto dice más que un PRISMA_QUERY_ENGINE_LIBRARY a medias.
      queryEnginePath = rutas.find(ruta => fs.existsSync(ruta) && cargable(ruta))
        ?? rutas.find(ruta => fs.existsSync(ruta))
        ?? rutas[0]
      console.log(`Prisma query engine for linux (glibc: ${conGlibc}): ${path.basename(queryEnginePath)}`)
    }

    /*
     * Explicitly set the engine type to 'library' to match the .node file we are loading.
     * This prevents Prisma from trying to look for a binary executable or getting confused.
     */
    process.env.PRISMA_CLIENT_ENGINE_TYPE = 'library'
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = queryEnginePath
    // PRISMA_QUERY_ENGINE_BINARY should only be set if using the binary engine, 
    // not the library engine (.node/.dylib). Setting it to a .node file is incorrect.
    // process.env.PRISMA_QUERY_ENGINE_BINARY = queryEnginePath

    // CRITICAL: Override module resolution BEFORE any imports
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Module = require('module')
    const originalResolveFilename = Module._resolveFilename

    Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options?: any) {
      // Intercept ALL @prisma/client requests
      if (request.startsWith('@prisma/client')) {
        let prismaPath: string

        if (request === '@prisma/client' || request === '@prisma/client/index.js') {
          // Main Prisma client
          prismaPath = path.join(resourcesPath, '@prisma/client/index.js')
        } else if (request === '@prisma/client/runtime/library.js' || request === '@prisma/client/runtime/library') {
          // Runtime library
          prismaPath = path.join(resourcesPath, '@prisma/client/runtime/library.js')
        } else if (request.startsWith('@prisma/client/')) {
          // Other @prisma/client requests
          const relativePath = request.substring('@prisma/client/'.length)
          prismaPath = path.join(resourcesPath, '@prisma/client', relativePath)
        } else {
          return originalResolveFilename.call(this, request, parent, isMain, options)
        }

        if (fs.existsSync(prismaPath)) {
          console.log(`Prisma module redirect: ${request} -> ${prismaPath}`)
          return prismaPath
        } else {
          console.error(`Prisma module not found: ${prismaPath}`)
          // Fall back to original resolution
          return originalResolveFilename.call(this, request, parent, isMain, options)
        }
      }

      // Intercept .prisma/client requests (required internally by @prisma/client/index.js)
      if (request.startsWith('.prisma/client')) {
        let prismaPath: string

        if (request === '.prisma/client/default' || request === '.prisma/client/default.js') {
          prismaPath = path.join(resourcesPath, '.prisma/client/default.js')
        } else if (request === '.prisma/client' || request === '.prisma/client/index.js') {
          prismaPath = path.join(resourcesPath, '.prisma/client/index.js')
        } else {
          const relativePath = request.substring('.prisma/client/'.length)
          prismaPath = path.join(resourcesPath, '.prisma/client', relativePath)
        }

        if (fs.existsSync(prismaPath)) {
          console.log(`Prisma module redirect: ${request} -> ${prismaPath}`)
          return prismaPath
        } else {
          console.error(`Prisma generated client not found: ${prismaPath}`)
          return originalResolveFilename.call(this, request, parent, isMain, options)
        }
      }

      return originalResolveFilename.call(this, request, parent, isMain, options)
    }

    console.log('Early Prisma configuration applied with module interception:', {
      runtimeLibrary: process.env.PRISMA_CLIENT_RUNTIME_LIBRARY,
      queryEngine: process.env.PRISMA_QUERY_ENGINE_LIBRARY,
      resourcesPath: resourcesPath
    })
  }
} catch (e) {
  console.error('Error in early config:', e);
}

import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'
// Import PrismaClient dynamically to avoid circular dependency issues
let PrismaClient: any

// Prisma configuration for Electron packaged applications
let globalPrismaClient: any | null = null

/**
 * Configure Prisma runtime paths for packaged applications
 */
function configurePrismaForPackagedApp() {
  const isDev = !app.isPackaged

  if (!isDev) {
    console.log('Prisma already configured early in packaged app mode')
    console.log('Environment variables:', {
      runtimeLibrary: process.env.PRISMA_CLIENT_RUNTIME_LIBRARY,
      queryEngine: process.env.PRISMA_QUERY_ENGINE_LIBRARY
    })
  }
}


/**
 * Initialize database path and ensure it exists
 */
function initializeDatabasePath(): string {
  const isDev = !app.isPackaged
  let databasePath: string

  if (isDev) {
    // Development: use the prisma folder in project root
    databasePath = path.join(process.cwd(), 'prisma', 'hydraulic.db')
  } else {
    // Production: use userData directory for writable database
    const userDataPath = app.getPath('userData')
    databasePath = path.join(userDataPath, 'hydraulic.db')

    // Ensure the directory exists
    const dbDir = path.dirname(databasePath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    /*
     * Aquí se copiaba `resources/prisma/hydraulic.db` como base inicial. El
     * paquete ya no la lleva —sólo el esquema— y es a propósito: la regla de
     * empaquetado se llevaba dentro cualquier .db del directorio, así que quien
     * generase el instalador en su máquina distribuía su propia base, con sus
     * proyectos y sus proveedores configurados, y encima se instalaba como base
     * de partida de quien lo abriera. Cada instalación arranca con la suya.
     */
  }

  return databasePath
}

/**
 * Initialize Prisma client with proper configuration for Electron
 */
async function initializePrisma(): Promise<any> {
  if (globalPrismaClient) {
    return globalPrismaClient
  }

  try {
    // Configure runtime paths first
    configurePrismaForPackagedApp()

    // Load PrismaClient directly from the actual generated client to bypass circular dependency
    try {
      // Try to load directly from the generated Prisma client
      // We look in multiple possible locations
      const possiblePaths = [
        path.join(__dirname, '..', '..', 'node_modules', '.prisma', 'client', 'index.js'), // Dev
        path.join(__dirname, 'node_modules', '.prisma', 'client', 'index.js'), // Fallback
        path.join(process.resourcesPath, '.prisma', 'client', 'index.js'), // Packaged (extraResources)
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.prisma', 'client', 'index.js') // Alternative packaged
      ]

      let loaded = false

      for (const actualPrismaPath of possiblePaths) {
        console.log('Attempting to load PrismaClient from:', actualPrismaPath)
        if (fs.existsSync(actualPrismaPath)) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const actualPrismaModule = require(actualPrismaPath)
          PrismaClient = actualPrismaModule.PrismaClient || actualPrismaModule.default?.PrismaClient
          if (PrismaClient) {
            console.log('PrismaClient loaded directly from:', actualPrismaPath)
            loaded = true
            break
          }
        }
      }

      if (!loaded) {
        // Fallback to the problematic @prisma/client module
        console.log('Direct paths not found, trying @prisma/client module resolution')
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const prismaModule = require('@prisma/client')
          console.log('@prisma/client exports:', Object.keys(prismaModule))
          PrismaClient = prismaModule.PrismaClient || prismaModule.default?.PrismaClient
        } catch (e) {
          console.error('Failed to require @prisma/client:', e)
        }
      }

      if (!PrismaClient) {
        throw new Error('PrismaClient not found in any location')
      }

      console.log('PrismaClient loaded successfully')
    } catch (loadError) {
      console.error('Failed to load PrismaClient:', loadError)
      throw new Error(`Cannot load PrismaClient: ${(loadError as Error).message}`)
    }

    // Initialize database path if not using a specific DATABASE_URL
    const databasePath = initializeDatabasePath()
    const databaseUrl = process.env.DATABASE_URL || `file:${databasePath}`

    console.log(`Using database at: ${databasePath}`)

    if (!databaseUrl) {
      throw new Error('DATABASE_URL or valid database path is required')
    }

    console.log(`Initializing Prisma with database: ${databaseUrl}`)

    // For packaged apps, we need to be extra careful with Prisma initialization
    if (app.isPackaged) {
      // In packaged mode, verify that all Prisma files exist
      const resourcesPath = process.resourcesPath
      const prismaRuntimePath = path.join(resourcesPath, '@prisma/client/runtime/library.js')
      const prismaIndexPath = path.join(resourcesPath, '@prisma/client/index.js')

      console.log('Verifying Prisma files in packaged app:')
      console.log(`  Runtime library exists: ${fs.existsSync(prismaRuntimePath)} (${prismaRuntimePath})`)
      console.log(`  Index file exists: ${fs.existsSync(prismaIndexPath)} (${prismaIndexPath})`)

      if (!fs.existsSync(prismaRuntimePath)) {
        throw new Error(`Prisma runtime library not found: ${prismaRuntimePath}`)
      }

      if (!fs.existsSync(prismaIndexPath)) {
        throw new Error(`Prisma index file not found: ${prismaIndexPath}`)
      }
    }

    // Create Prisma client with configuration
    globalPrismaClient = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      },
      log: app.isPackaged ? ['error'] : ['query', 'info', 'warn', 'error']
    })

    // Test the connection
    await globalPrismaClient.$connect()
    console.log('Prisma client connected successfully')

    // Run a simple test query to ensure everything works
    await globalPrismaClient.$queryRaw`SELECT 1 as test`
    console.log('Prisma client test query successful')

    return globalPrismaClient

  } catch (error) {
    console.error('Failed to initialize Prisma client:', error)
    console.error('Error details:', {
      message: (error as Error).message,
      stack: (error as Error).stack
    })

    // If we have a client, try to disconnect it
    if (globalPrismaClient) {
      try {
        await globalPrismaClient.$disconnect()
      } catch (disconnectError) {
        console.error('Failed to disconnect Prisma client after error:', disconnectError)
      }
      globalPrismaClient = null
    }

    throw error
  }
}

/**
 * Disconnect Prisma client
 */
async function disconnectPrisma(): Promise<void> {
  if (globalPrismaClient) {
    try {
      await globalPrismaClient.$disconnect()
      console.log('Prisma client disconnected successfully')
    } catch (error) {
      console.error('Error disconnecting Prisma client:', error)
    } finally {
      globalPrismaClient = null
    }
  }
}

// Configure hardware acceleration based on environment
// Hardware acceleration is needed for WebGL/Mapbox maps
// but can cause crashes on some systems
const ENABLE_HARDWARE_ACCELERATION = process.env.ENABLE_HARDWARE_ACCELERATION !== 'false'

if (!ENABLE_HARDWARE_ACCELERATION) {
  console.warn('Hardware acceleration disabled - WebGL/Mapbox maps may not work')
  app.disableHardwareAcceleration()
} else {
  console.log('Hardware acceleration enabled for WebGL support')
  // Enable additional GPU features for better WebGL support
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('enable-accelerated-2d-canvas')
}

// Import the new modular architecture
import { ServiceContainer } from '../backend/services'
import { HandlersManager } from './handlers'
import { appLogger } from '../backend/utils/logger'
import { findPythonForMilvus } from '../backend/services/hydraulic/pythonDetector'
import { startMilvusServer, stopMilvusServer } from './services/milvusProcess'
import { ensureProductionSchema } from './esquemaProduccion'

log.transports.file.level = 'info'
autoUpdater.logger = log

// Detect development mode by checking if we're not packaged
const isDev = !app.isPackaged


appLogger.info('Application starting', { isPackaged: app.isPackaged, isDev })

class AppUpdater {
  constructor() {
    appLogger.info('AppUpdater initialized')
    if (!isDev) {
      autoUpdater.checkForUpdatesAndNotify()
    }
  }
}

let mainWindow: BrowserWindow
let prisma: any
let services: ServiceContainer
let handlers: HandlersManager

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'Boorie',
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : undefined,
    autoHideMenuBar: true,
    icon: isDev ? path.join(__dirname, '../../resources/icon.png') : path.join(__dirname, '../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      // Add security and stability settings
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      // Enable WebGL for Mapbox
      webgl: true, // Required for Mapbox GL
      plugins: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    appLogger.info('Window ready to show')
    // Siempre maximizada al abrir; el width/height de arriba queda como el
    // tamaño al que vuelve el botón de restaurar. Hay que maximizar cuando
    // el gestor de ventanas ya ha mapeado la ventana: hacerlo antes (o en
    // el mismo tick del show) no le deja guardar el tamaño previo, y luego
    // unmaximize() se ignora y isMaximized() se queda en true para siempre.
    mainWindow.once('show', () => setTimeout(() => mainWindow.maximize(), 200))
    mainWindow.show()

    // FORCE ENABLE DEVTOOLS FOR DEBUGGING
    // mainWindow.webContents.openDevTools()
  })

  // Listen for window state changes
  // Add window lifecycle logging
  mainWindow.on('close', (_event) => {
    appLogger.warn('Window close event triggered', {
      isDestroyed: mainWindow.isDestroyed(),
      isVisible: mainWindow.isVisible(),
      isFocused: mainWindow.isFocused()
    })
  })

  mainWindow.on('closed', () => {
    appLogger.warn('Window closed event triggered')
    mainWindow = null
  })

  mainWindow.on('unresponsive', () => {
    appLogger.error('Window became unresponsive')
  })

  mainWindow.on('responsive', () => {
    appLogger.info('Window became responsive again')
  })

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', { isMaximized: true })
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', { isMaximized: false })
  })

  // Add web contents event logging
  mainWindow.webContents.on('did-finish-load', () => {
    appLogger.info('Web contents finished loading')
    console.log('Web contents finished loading successfully')

    // Check if the React app has mounted
    setTimeout(() => {
      mainWindow.webContents.executeJavaScript(`
        console.log('=== Debug Info ===');
        console.log('Document title:', document.title);
        console.log('Root element:', document.getElementById('root'));
        console.log('Root innerHTML length:', document.getElementById('root')?.innerHTML?.length || 0);
        console.log('Body innerHTML length:', document.body.innerHTML.length);
        console.log('All script tags:', document.querySelectorAll('script').length);
        console.log('All link tags:', document.querySelectorAll('link').length);
        console.log('React app mounted:', !!window.React || !!document.querySelector('[data-reactroot]') || document.getElementById('root')?.children.length > 0);
        document.getElementById('root')?.innerHTML?.length || 0;
      `).then(result => {
        console.log('React app root content length:', result)
      }).catch(err => {
        console.error('Failed to execute debug script:', err)
      })
    }, 2000)
  })

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    appLogger.error('Web contents failed to load: ' + errorDescription, new Error(`Code: ${errorCode}`))
    console.error(`Failed to load: ${validatedURL} - ${errorDescription} (Code: ${errorCode})`)
  })

  // Log resource loading issues
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`Resource failed to load: ${validatedURL} - ${errorDescription}`)
  })

  // Log console messages from the renderer
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Renderer console [${level}]:`, message)
    if (line) console.log(`  at line ${line} in ${sourceId}`)
  })

  // Listen for resource loading failures
  mainWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    console.log(`Resource request: ${details.url}`)
    callback({})
  })

  mainWindow.webContents.session.webRequest.onErrorOccurred((details) => {
    console.error(`Resource failed to load: ${details.url} - Error: ${details.error}`)
  })

  mainWindow.webContents.on('dom-ready', () => {
    console.log('DOM is ready')
    appLogger.info('DOM is ready')
  })

  mainWindow.webContents.on('did-start-loading', () => {
    console.log('Started loading web contents')
    appLogger.info('Started loading web contents')
  })

  mainWindow.webContents.on('did-stop-loading', () => {
    console.log('Stopped loading web contents')
    appLogger.info('Stopped loading web contents')
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    appLogger.error('Render process gone: ' + details.reason, new Error(`Exit code: ${details.exitCode}`))

    // Handle different exit codes
    if (details.exitCode === 11) {
      appLogger.error('Segmentation fault detected - likely a native module issue')

      // Notify renderer to disable satellite mode after crash
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('disable-satellite-mode', {
            reason: 'segmentation-fault',
            message: 'Satellite mode disabled due to system compatibility issues'
          })
        }
      }, 2000)

      // Show user a more helpful error message
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox(
          'Renderer Process Crashed',
          'The application encountered a critical error and needs to restart.\n\n' +
          'This is often caused by incompatible native modules or memory issues.\n\n' +
          'The app will attempt to reload in 3 seconds.'
        )

        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.reload()
          }
        }, 3000)
      }
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev) {
    const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000'
    console.log(`Loading development URL: ${devUrl}`)
    mainWindow.loadURL(devUrl)
  } else {
    // For packaged apps, the HTML file is at ../index.html relative to the electron main.js
    const htmlPath = path.join(__dirname, '../index.html')
    console.log(`Loading HTML from: ${htmlPath}`)
    console.log(`__dirname is: ${__dirname}`)
    console.log(`Resolved path exists: ${fs.existsSync(htmlPath)}`)

    mainWindow.loadFile(htmlPath)
  }

  appLogger.success('Main window created successfully')
}

async function initializeApplication(): Promise<void> {
  try {
    appLogger.info('Initializing application services')

    // BOORIE_DATA_DIR must be set before ANY service that might touch Milvus
    // gets constructed (ServiceContainer/HandlersManager below construct the
    // MilvusService singleton eagerly, which bakes in its connection address
    // at construction time). Setting it here, first thing, means
    // MilvusService.resolveAddress() always sees it instead of falling back
    // to process.cwd()-relative paths that can hold a stale port file from an
    // old dev run (issue #19/#21).
    const milvusDataDir = path.join(app.getPath('userData'), 'data')
    process.env.BOORIE_DATA_DIR = milvusDataDir

    // Check Python environment for WNTR
    try {
      // Skip Python environment check - handled by wntrWrapper
      appLogger.info('Python environment check delegated to wntrWrapper')
    } catch (error) {
      appLogger.error('Failed to check Python environment:', error as Error)
    }

    // Initialize database
    await initDatabase()

    // Initialize services with dependency injection
    services = new ServiceContainer(prisma)

    // Initialize services (async tasks like model checking)
    services.initialize().catch(err => {
      appLogger.error('Failed to initialize services async', err)
    })

    // Initialize IPC handlers
    handlers = new HandlersManager(services)

    // Setup basic IPC handlers that don't belong to services
    setupBasicIPCHandlers()

    // First-run / repair Python environment setup (guardrails, milvus, wntr)
    try {
      const { registerSetupHandlers } = await import('./handlers/setup.handler')
      registerSetupHandlers(
        () => mainWindow,
        app.getPath('userData'),
        app.getAppPath(),
      )
      appLogger.success('Setup handlers registered')
    } catch (error) {
      appLogger.warn('Setup handlers registration failed', error as Error)
    }

    // Start the embedded Milvus Lite server. Both this process and the
    // spawned Python script read/write under BOORIE_DATA_DIR (Resources/
    // isn't writable in the packaged app). Previously nothing spawned this
    // process outside of the dev-only dev-runner.js, so Milvus was never
    // running in the installed app (root cause of issues #19/#20/#21).
    try {
      // Milvus necesita el venv gestionado (el que tiene milvus_lite), no el
      // Python del sistema que WNTR puede estar usando.
      startMilvusServer(findPythonForMilvus(), milvusDataDir)
    } catch (error) {
      appLogger.warn('Failed to start embedded Milvus Lite server', error as Error)
    }

    // Agentic RAG handlers are now registered via HandlersManager
    // See electron/handlers/agenticRAG.handler.ts and electron/handlers/index.ts

    appLogger.success('Application services initialized successfully')
  } catch (error) {
    appLogger.error('Failed to initialize application services', error as Error)
    throw error
  }
}

async function initDatabase(): Promise<void> {
  try {
    appLogger.info('Initializing database')

    // In production, Prisma client should already be generated
    if (isDev) {
      // Generate Prisma client in development
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { execSync } = require('child_process')
      try {
        execSync('npx prisma generate', { stdio: 'inherit' })
      } catch (error) {
        appLogger.warn('Failed to generate Prisma client, assuming it exists', error as Error)
      }
    }

    // Initialize Prisma with the new configuration that handles packaged apps
    prisma = await initializePrisma()

    // Use Prisma db push to create/update database schema automatically
    if (isDev) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { execSync } = require('child_process')
      try {
        execSync('npx prisma db push', { stdio: 'inherit' })
      } catch (error) {
        appLogger.warn('Failed to push database schema, assuming it exists', error as Error)
      }
    } else {
      // Production: ensure all tables exist using CREATE TABLE IF NOT EXISTS
      // This handles the case where the packaged DB is outdated or empty
      try {
        await ensureProductionSchema(prisma)
        appLogger.info('Production database schema verified/updated')
      } catch (error) {
        appLogger.error('Failed to ensure production schema', error as Error)
      }
    }

    appLogger.success('Database initialized and connected successfully')
  } catch (error) {
    appLogger.error('Failed to initialize database', error as Error)
    throw error
  }
}

function setupBasicIPCHandlers(): void {
  appLogger.info('Setting up basic IPC handlers')

  // Basic app information handlers
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('get-platform', () => {
    return process.platform
  })

  // Window control handlers
  ipcMain.handle('minimize-window', () => {
    appLogger.info('IPC: minimize-window called')
    mainWindow?.minimize()
  })

  ipcMain.handle('maximize-window', () => {
    appLogger.info('IPC: maximize-window called')
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('close-window', () => {
    appLogger.info('IPC: close-window called')
    mainWindow?.close()
  })

  ipcMain.handle('is-maximized', () => {
    const maximized = mainWindow?.isMaximized() || false
    appLogger.info('IPC: is-maximized called', { maximized })
    return maximized
  })

  appLogger.success('Basic IPC handlers registered')
}

app.whenReady().then(async () => {
  try {
    app.setAppUserModelId('com.boorie.app')

    // Initialize all application services
    await initializeApplication()

    // Create the main window
    createWindow()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    new AppUpdater()

    appLogger.success('Application ready and running')

    // Add periodic status logging to debug window closing
    // let statusCounter = 0
    // const statusInterval = setInterval(() => {
    //   statusCounter++
    //   if (mainWindow && !mainWindow.isDestroyed()) {
    //     appLogger.info(`Status check ${statusCounter}`, {
    //       isVisible: mainWindow.isVisible(),
    //       isFocused: mainWindow.isFocused(),
    //       isMinimized: mainWindow.isMinimized(),
    //       isDestroyed: mainWindow.isDestroyed(),
    //       windowCount: BrowserWindow.getAllWindows().length
    //     })
    //   } else {
    //     appLogger.warn(`Status check ${statusCounter}: Window is destroyed or null`)
    //     clearInterval(statusInterval)
    //   }
    // }, 2000) // Log every 2 seconds

  } catch (error) {
    appLogger.error('Failed to start application', error as Error)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  appLogger.info('All windows closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  appLogger.info('Application shutting down')

  try {
    stopMilvusServer()

    // Cleanup handlers
    if (handlers) {
      handlers.cleanup()
    }

    // Cleanup services
    if (services) {
      await services.cleanup()
    }

    // Disconnect from database
    if (prisma) {
      await disconnectPrisma()
      appLogger.success('Database connection closed')
    }

    appLogger.success('Application shutdown completed')
  } catch (error) {
    appLogger.error('Error during application shutdown', error as Error)
  }
})

// Handle uncaught exceptions
process.on('uncaughtException', (error: any) => {
  // Handle EPIPE errors specifically
  if (error.code === 'EPIPE') {
    appLogger.warn('EPIPE error detected - a child process closed unexpectedly', error)
    // Don't show dialog for EPIPE errors as they're usually non-critical
    return
  }

  appLogger.error('Uncaught exception', error)
  // Don't quit immediately, just log the error
  // app.quit()

  // Show error dialog to user
  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showErrorBox('Application Error', `An error occurred: ${error.message}\n\nThe app will continue running.`)
  }
})

process.on('unhandledRejection', (reason, promise) => {
  appLogger.error('Unhandled promise rejection', reason as Error, { promise })
})

// Menu setup
const template: Electron.MenuItemConstructorOptions[] = [
  {
    label: 'File',
    submenu: [
      {
        label: 'New Chat',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          mainWindow.webContents.send('new-chat')
        }
      },
      { type: 'separator' },
      {
        label: 'Settings',
        accelerator: 'CmdOrCtrl+,',
        click: () => {
          mainWindow.webContents.send('open-settings')
        }
      },
      { type: 'separator' },
      { role: 'quit' }
    ]
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'close' }
    ]
  }
]

if (process.platform === 'darwin') {
  template.unshift({
    label: 'Boorie',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  })
}

const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)
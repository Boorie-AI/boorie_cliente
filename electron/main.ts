import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from 'electron'
import path from 'path'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'
import { PrismaClient } from '@prisma/client'

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
let prisma: PrismaClient
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
    mainWindow.show()

    if (isDev) {
      mainWindow.webContents.openDevTools()
    }
  })

  // Listen for window state changes
  // Add window lifecycle logging
  mainWindow.on('close', (event) => {
    appLogger.warn('Window close event triggered', { 
      isDestroyed: mainWindow.isDestroyed(),
      isVisible: mainWindow.isVisible(),
      isFocused: mainWindow.isFocused()
    })
  })

  mainWindow.on('closed', () => {
    appLogger.warn('Window closed event triggered')
    // @ts-ignore - mainWindow needs to be null after closing
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
  })

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    appLogger.error('Web contents failed to load: ' + errorDescription, new Error(`Code: ${errorCode}`))
  })

  mainWindow.webContents.on('crashed', (event, killed) => {
    appLogger.error('Web contents crashed', new Error(`Process killed: ${killed}`))
    
    // Attempt to recover from crash
    if (!killed) {
      appLogger.info('Attempting to reload after crash...')
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload()
        }
      }, 1000)
    }
  })

  mainWindow.webContents.on('render-process-gone', (event, details) => {
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
    mainWindow.loadURL('http://localhost:3000')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  appLogger.success('Main window created successfully')
}

async function initializeApplication(): Promise<void> {
  try {
    appLogger.info('Initializing application services')
    
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
    
    // Initialize IPC handlers
    handlers = new HandlersManager(services)
    
    // Setup basic IPC handlers that don't belong to services
    setupBasicIPCHandlers()
    
    appLogger.success('Application services initialized successfully')
  } catch (error) {
    appLogger.error('Failed to initialize application services', error as Error)
    throw error
  }
}

async function initDatabase(): Promise<void> {
  try {
    // Set the database URL to use the app's user data directory
    const dbPath = path.join(app.getPath('userData'), 'boorie.db')
    appLogger.info('Initializing database', { dbPath })

    // Set environment variable for Prisma
    process.env.DATABASE_URL = `file:${dbPath}`

    // In production, Prisma client should already be generated
    if (isDev) {
      // Generate Prisma client in development
      const { execSync } = require('child_process')
      try {
        execSync('npx prisma generate', { stdio: 'inherit' })
      } catch (error) {
        appLogger.warn('Failed to generate Prisma client, assuming it exists', error as Error)
      }
    }

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    })
    
    // Test the connection first
    await prisma.$connect()
    
    // Use Prisma db push to create/update database schema automatically
    if (isDev) {
      const { execSync } = require('child_process')
      try {
        execSync('npx prisma db push', { stdio: 'inherit' })
      } catch (error) {
        appLogger.warn('Failed to push database schema, assuming it exists', error as Error)
      }
    }
    
    appLogger.success('Database initialized and connected successfully', { dbPath })
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
    let statusCounter = 0
    const statusInterval = setInterval(() => {
      statusCounter++
      if (mainWindow && !mainWindow.isDestroyed()) {
        appLogger.info(`Status check ${statusCounter}`, {
          isVisible: mainWindow.isVisible(),
          isFocused: mainWindow.isFocused(),
          isMinimized: mainWindow.isMinimized(),
          isDestroyed: mainWindow.isDestroyed(),
          windowCount: BrowserWindow.getAllWindows().length
        })
      } else {
        appLogger.warn(`Status check ${statusCounter}: Window is destroyed or null`)
        clearInterval(statusInterval)
      }
    }, 2000) // Log every 2 seconds
    
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
      await prisma.$disconnect()
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
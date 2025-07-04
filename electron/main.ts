import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import path from 'path'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'
import { PrismaClient } from '@prisma/client'

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
    title: 'Xavi9',
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : undefined,
    autoHideMenuBar: true,
    icon: isDev ? path.join(__dirname, '../../resources/icon.png') : path.join(__dirname, '../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()

    if (isDev) {
      mainWindow.webContents.openDevTools()
    }
  })

  // Listen for window state changes
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', { isMaximized: true })
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', { isMaximized: false })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  appLogger.success('Main window created successfully')
}

async function initializeApplication(): Promise<void> {
  try {
    appLogger.info('Initializing application services')
    
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
    const dbPath = path.join(app.getPath('userData'), 'xavi9.db')
    appLogger.info('Initializing database', { dbPath })

    // Set environment variable for Prisma
    process.env.DATABASE_URL = `file:${dbPath}`

    // Generate Prisma client
    const { execSync } = require('child_process')
    execSync('npx prisma generate', { stdio: 'inherit' })

    prisma = new PrismaClient()
    
    // Test the connection first
    await prisma.$connect()
    
    // Use Prisma db push to create/update database schema automatically
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' })
    
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
    app.setAppUserModelId('com.xavi9.app')

    // Initialize all application services
    await initializeApplication()

    // Create the main window
    createWindow()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    new AppUpdater()
    
    appLogger.success('Application ready and running')
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
process.on('uncaughtException', (error) => {
  appLogger.error('Uncaught exception', error)
  app.quit()
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
    label: 'Xavi9',
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
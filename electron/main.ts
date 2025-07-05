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

    // Abrir DevTools temporalmente para debugging
    mainWindow.webContents.openDevTools()
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
    mainWindow.loadFile(path.join(__dirname, '../index.html'))
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

async function createDatabaseTables(): Promise<void> {
  try {
    // Create tables manually using raw SQL
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS Conversation (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        model TEXT NOT NULL,
        provider TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS Message (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        conversationId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT,
        FOREIGN KEY (conversationId) REFERENCES Conversation(id) ON DELETE CASCADE
      )
    `

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS AIProvider (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        apiKey TEXT,
        isActive BOOLEAN DEFAULT false,
        isConnected BOOLEAN DEFAULT false,
        lastTestResult TEXT,
        lastTestAt DATETIME,
        config TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS AIModel (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        providerId TEXT NOT NULL,
        modelId TEXT NOT NULL,
        modelName TEXT NOT NULL,
        isDefault BOOLEAN DEFAULT false,
        isSelected BOOLEAN DEFAULT false,
        isAvailable BOOLEAN DEFAULT true,
        description TEXT,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (providerId) REFERENCES AIProvider(id) ON DELETE CASCADE,
        UNIQUE (providerId, modelId)
      )
    `

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS AppSetting (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        category TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS KnowledgeBase (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL,
        description TEXT,
        embedModel TEXT,
        chunkSize INTEGER DEFAULT 500,
        chunkOverlap INTEGER DEFAULT 100,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS Document (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        knowledgeBaseId TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        size INTEGER NOT NULL,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (knowledgeBaseId) REFERENCES KnowledgeBase(id) ON DELETE CASCADE
      )
    `

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS DocumentChunk (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        documentId TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (documentId) REFERENCES Document(id) ON DELETE CASCADE
      )
    `

    appLogger.info('Database tables created successfully')
  } catch (error) {
    appLogger.error('Failed to create database tables', error as Error)
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

    // Initialize Prisma Client
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${dbPath}`
        }
      }
    })
    
    // Test the connection first
    await prisma.$connect()
    
    // Create database tables if they don't exist
    // This is a workaround for packaged apps where prisma CLI is not available
    try {
      // Test if tables exist by running a simple query
      await prisma.conversation.findFirst()
    } catch (error) {
      // If tables don't exist, create them manually
      appLogger.info('Creating database tables')
      await createDatabaseTables()
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

// App event handlers
app.whenReady().then(async () => {
  try {
    app.setAppUserModelId('com.xavi9.app')
    
    // Initialize the application first
    await initializeApplication()
    
    // Create the main window
    createWindow()
    
    // Set the main window in services that need it
    if (services) {
      services.setMainWindow(mainWindow)
    }
    
    appLogger.success('Application started successfully')
  } catch (error) {
    appLogger.error('Failed to start application', error as Error)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
    if (services) {
      services.setMainWindow(mainWindow)
    }
  }
})
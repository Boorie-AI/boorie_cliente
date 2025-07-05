import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import path from 'path'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'

// Set database URL before importing Prisma to ensure it uses the correct path
const userDataPath = app.getPath('userData')
const dbPath = path.join(userDataPath, 'xavi9.db')
process.env.DATABASE_URL = `file:${dbPath}`

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

    // Solo abrir DevTools en modo desarrollo
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
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        model TEXT NOT NULL,
        provider TEXT NOT NULL,
        selectedCollectionIds TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        conversationId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS ai_providers (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        apiKey TEXT,
        isActive BOOLEAN DEFAULT false,
        isConnected BOOLEAN DEFAULT false,
        lastTestResult TEXT,
        lastTestMessage TEXT,
        config TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS ai_models (
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
        FOREIGN KEY (providerId) REFERENCES ai_providers(id) ON DELETE CASCADE,
        UNIQUE (providerId, modelId)
      )
    `

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS app_settings (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        category TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Create RAG tables
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        chunkSize INTEGER NOT NULL DEFAULT 1024,
        overlap INTEGER NOT NULL DEFAULT 256,
        embeddingModel TEXT NOT NULL,
        modelProvider TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        filename TEXT NOT NULL,
        filepath TEXT,
        fileType TEXT NOT NULL,
        fileSize INTEGER NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        collectionId TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (collectionId) REFERENCES collections(id) ON DELETE CASCADE
      )
    `

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        content TEXT NOT NULL,
        embedding TEXT,
        metadata TEXT,
        startPos INTEGER,
        endPos INTEGER,
        documentId TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (documentId) REFERENCES documents(id) ON DELETE CASCADE
      )
    `

    // Create system_prompts table for custom prompts
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS system_prompts (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        description TEXT,
        isActive BOOLEAN DEFAULT true,
        isDefault BOOLEAN DEFAULT false,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
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
    // Import fs module
    const fs = require('fs')
    
    // Database path is already set in process.env.DATABASE_URL
    const dbPath = process.env.DATABASE_URL!.replace('file:', '')
    const userDataPath = path.dirname(dbPath)
    
    // Ensure the user data directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
      appLogger.info('Created user data directory', { userDataPath })
    }
    
    appLogger.info('Initializing database', { dbPath })

    // Initialize Prisma Client
    prisma = new PrismaClient({
      log: isDev ? ['query', 'info', 'warn', 'error'] : ['error']
    })
    
    // Test the connection first
    await prisma.$connect()
    
    // Check if tables exist with correct names
    const tables = await prisma.$queryRaw<Array<{name: string}>>`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'
    `
    
    const tableNames = tables.map(t => t.name)
    appLogger.info('Existing tables', { tableNames })
    
    // Check if we have old PascalCase tables
    const hasOldTables = tableNames.some(name => 
      ['Conversation', 'Message', 'AIProvider', 'AIModel', 'Collection', 'Document', 'DocumentChunk'].includes(name)
    )
    
    // Check if we have new snake_case tables
    const hasNewTables = tableNames.some(name => 
      ['conversations', 'messages', 'ai_providers', 'ai_models', 'collections', 'documents', 'document_chunks'].includes(name)
    )
    
    if (hasOldTables && !hasNewTables) {
      appLogger.warn('Found old PascalCase tables, need to recreate database with correct table names')
      // Drop all old tables
      await prisma.$executeRaw`DROP TABLE IF EXISTS Conversation`
      await prisma.$executeRaw`DROP TABLE IF EXISTS Message`
      await prisma.$executeRaw`DROP TABLE IF EXISTS AIProvider`
      await prisma.$executeRaw`DROP TABLE IF EXISTS AIModel`
      await prisma.$executeRaw`DROP TABLE IF EXISTS AppSetting`
      await prisma.$executeRaw`DROP TABLE IF EXISTS Collection`
      await prisma.$executeRaw`DROP TABLE IF EXISTS Document`
      await prisma.$executeRaw`DROP TABLE IF EXISTS DocumentChunk`
      appLogger.info('Dropped old tables, creating new tables with correct names')
      await createDatabaseTables()
    } else if (!hasNewTables) {
      // No tables exist, create them
      appLogger.info('No tables found, creating database tables')
      await createDatabaseTables()
    } else {
      appLogger.info('Database tables already exist with correct names')
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
  
  ipcMain.handle('get-database-path', () => {
    return process.env.DATABASE_URL?.replace('file:', '') || 'Unknown'
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
    submenu: isDev ? [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ] : [
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
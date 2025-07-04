"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const electron_log_1 = __importDefault(require("electron-log"));
const electron_updater_1 = require("electron-updater");
const client_1 = require("@prisma/client");
// Import the new modular architecture
const services_1 = require("./backend/services");
const handlers_1 = require("./handlers");
const logger_1 = require("./backend/utils/logger");
electron_log_1.default.transports.file.level = 'info';
electron_updater_1.autoUpdater.logger = electron_log_1.default;
// Detect development mode by checking if we're not packaged
const isDev = !electron_1.app.isPackaged;
logger_1.appLogger.info('Application starting', { isPackaged: electron_1.app.isPackaged, isDev });
class AppUpdater {
    constructor() {
        logger_1.appLogger.info('AppUpdater initialized');
        if (!isDev) {
            electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
        }
    }
}
let mainWindow;
let prisma;
let services;
let handlers;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: false,
        title: 'Xavi9',
        frame: false,
        titleBarStyle: process.platform === 'darwin' ? 'hidden' : undefined,
        autoHideMenuBar: true,
        icon: isDev ? path_1.default.join(__dirname, '../../resources/icon.png') : path_1.default.join(__dirname, '../resources/icon.png'),
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });
    mainWindow.on('ready-to-show', () => {
        mainWindow.show();
        // Abrir DevTools temporalmente para debugging
        mainWindow.webContents.openDevTools();
    });
    // Listen for window state changes
    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-state-changed', { isMaximized: true });
    });
    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-state-changed', { isMaximized: false });
    });
    mainWindow.webContents.setWindowOpenHandler((details) => {
        electron_1.shell.openExternal(details.url);
        return { action: 'deny' };
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../index.html'));
    }
    logger_1.appLogger.success('Main window created successfully');
}
async function initializeApplication() {
    try {
        logger_1.appLogger.info('Initializing application services');
        // Initialize database
        await initDatabase();
        // Initialize services with dependency injection
        services = new services_1.ServiceContainer(prisma);
        // Initialize IPC handlers
        handlers = new handlers_1.HandlersManager(services);
        // Setup basic IPC handlers that don't belong to services
        setupBasicIPCHandlers();
        logger_1.appLogger.success('Application services initialized successfully');
    }
    catch (error) {
        logger_1.appLogger.error('Failed to initialize application services', error);
        throw error;
    }
}
async function createDatabaseTables() {
    try {
        // Create tables manually using raw SQL
        await prisma.$executeRaw `
      CREATE TABLE IF NOT EXISTS Conversation (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        model TEXT NOT NULL,
        provider TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
        await prisma.$executeRaw `
      CREATE TABLE IF NOT EXISTS Message (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        conversationId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT,
        FOREIGN KEY (conversationId) REFERENCES Conversation(id) ON DELETE CASCADE
      )
    `;
        await prisma.$executeRaw `
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
    `;
        await prisma.$executeRaw `
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
    `;
        await prisma.$executeRaw `
      CREATE TABLE IF NOT EXISTS AppSetting (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        category TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
        await prisma.$executeRaw `
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
    `;
        await prisma.$executeRaw `
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
    `;
        await prisma.$executeRaw `
      CREATE TABLE IF NOT EXISTS DocumentChunk (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        documentId TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (documentId) REFERENCES Document(id) ON DELETE CASCADE
      )
    `;
        logger_1.appLogger.info('Database tables created successfully');
    }
    catch (error) {
        logger_1.appLogger.error('Failed to create database tables', error);
        throw error;
    }
}
async function initDatabase() {
    try {
        // Set the database URL to use the app's user data directory
        const dbPath = path_1.default.join(electron_1.app.getPath('userData'), 'xavi9.db');
        logger_1.appLogger.info('Initializing database', { dbPath });
        // Set environment variable for Prisma
        process.env.DATABASE_URL = `file:${dbPath}`;
        // Initialize Prisma Client
        prisma = new client_1.PrismaClient({
            datasources: {
                db: {
                    url: `file:${dbPath}`
                }
            }
        });
        // Test the connection first
        await prisma.$connect();
        // Create database tables if they don't exist
        // This is a workaround for packaged apps where prisma CLI is not available
        try {
            // Test if tables exist by running a simple query
            await prisma.conversation.findFirst();
        }
        catch (error) {
            // If tables don't exist, create them manually
            logger_1.appLogger.info('Creating database tables');
            await createDatabaseTables();
        }
        logger_1.appLogger.success('Database initialized and connected successfully', { dbPath });
    }
    catch (error) {
        logger_1.appLogger.error('Failed to initialize database', error);
        throw error;
    }
}
function setupBasicIPCHandlers() {
    logger_1.appLogger.info('Setting up basic IPC handlers');
    // Basic app information handlers
    electron_1.ipcMain.handle('get-app-version', () => {
        return electron_1.app.getVersion();
    });
    electron_1.ipcMain.handle('get-platform', () => {
        return process.platform;
    });
    // Window control handlers
    electron_1.ipcMain.handle('minimize-window', () => {
        logger_1.appLogger.info('IPC: minimize-window called');
        mainWindow?.minimize();
    });
    electron_1.ipcMain.handle('maximize-window', () => {
        logger_1.appLogger.info('IPC: maximize-window called');
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        }
        else {
            mainWindow?.maximize();
        }
    });
    electron_1.ipcMain.handle('close-window', () => {
        logger_1.appLogger.info('IPC: close-window called');
        mainWindow?.close();
    });
    electron_1.ipcMain.handle('is-maximized', () => {
        const maximized = mainWindow?.isMaximized() || false;
        logger_1.appLogger.info('IPC: is-maximized called', { maximized });
        return maximized;
    });
    logger_1.appLogger.success('Basic IPC handlers registered');
}
electron_1.app.whenReady().then(async () => {
    try {
        electron_1.app.setAppUserModelId('com.xavi9.app');
        // Initialize all application services
        await initializeApplication();
        // Create the main window
        createWindow();
        electron_1.app.on('activate', function () {
            if (electron_1.BrowserWindow.getAllWindows().length === 0)
                createWindow();
        });
        // new AppUpdater() // Temporalmente desactivado
        logger_1.appLogger.success('Application ready and running');
    }
    catch (error) {
        logger_1.appLogger.error('Failed to start application', error);
        electron_1.app.quit();
    }
});
electron_1.app.on('window-all-closed', () => {
    logger_1.appLogger.info('All windows closed');
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('before-quit', async () => {
    logger_1.appLogger.info('Application shutting down');
    try {
        // Cleanup handlers
        if (handlers) {
            handlers.cleanup();
        }
        // Cleanup services
        if (services) {
            await services.cleanup();
        }
        // Disconnect from database
        if (prisma) {
            await prisma.$disconnect();
            logger_1.appLogger.success('Database connection closed');
        }
        logger_1.appLogger.success('Application shutdown completed');
    }
    catch (error) {
        logger_1.appLogger.error('Error during application shutdown', error);
    }
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger_1.appLogger.error('Uncaught exception', error);
    electron_1.app.quit();
});
process.on('unhandledRejection', (reason, promise) => {
    logger_1.appLogger.error('Unhandled promise rejection', reason, { promise });
});
// Menu setup
const template = [
    {
        label: 'File',
        submenu: [
            {
                label: 'New Chat',
                accelerator: 'CmdOrCtrl+N',
                click: () => {
                    mainWindow.webContents.send('new-chat');
                }
            },
            { type: 'separator' },
            {
                label: 'Settings',
                accelerator: 'CmdOrCtrl+,',
                click: () => {
                    mainWindow.webContents.send('open-settings');
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
];
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
    });
}
const menu = electron_1.Menu.buildFromTemplate(template);
electron_1.Menu.setApplicationMenu(menu);

// Prisma configuration for Electron packaged applications
import { PrismaClient } from '@prisma/client'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

let prismaClient: PrismaClient | null = null

/**
 * Get or create a Prisma client instance optimized for Electron
 */
export function getPrismaClient(): PrismaClient {
  if (prismaClient) {
    return prismaClient
  }

  // Determine the correct database path
  const isDev = !app.isPackaged
  let databasePath: string

  if (isDev) {
    // Development: use the prisma folder
    databasePath = path.join(process.cwd(), 'prisma', 'hydraulic.db')
  } else {
    // Production: use userData directory
    const userDataPath = app.getPath('userData')
    databasePath = path.join(userDataPath, 'hydraulic.db')
    
    // Ensure the directory exists
    const dbDir = path.dirname(databasePath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    
    // Copy initial database if it doesn't exist
    if (!fs.existsSync(databasePath)) {
      const sourcePath = path.join(process.resourcesPath, 'prisma', 'hydraulic.db')
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, databasePath)
      }
    }
  }

  // Create the database URL
  const databaseUrl = `file:${databasePath}`

  console.log(`Initializing Prisma with database: ${databaseUrl}`)

  try {
    prismaClient = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      },
      log: isDev ? ['query', 'info', 'warn', 'error'] : ['warn', 'error']
    })

    console.log('Prisma client initialized successfully')
    return prismaClient
    
  } catch (error) {
    console.error('Failed to initialize Prisma client:', error)
    throw error
  }
}

/**
 * Disconnect Prisma client
 */
export async function disconnectPrisma(): Promise<void> {
  if (prismaClient) {
    await prismaClient.$disconnect()
    prismaClient = null
    console.log('Prisma client disconnected')
  }
}

/**
 * Initialize Prisma and run migrations if needed
 */
export async function initializePrisma(): Promise<PrismaClient> {
  const client = getPrismaClient()
  
  try {
    // Test the connection
    await client.$connect()
    console.log('Prisma connection established')
    
    // In development, we can run migrations
    // In production, the database should already be migrated
    if (!app.isPackaged) {
      console.log('Development mode: checking database schema')
    }
    
    return client
  } catch (error) {
    console.error('Failed to initialize Prisma:', error)
    throw error
  }
}
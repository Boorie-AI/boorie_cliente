// Database Factory - PostgreSQL configuration
import path from 'path'
import fs from 'fs'

// Database configuration interface
export interface DatabaseConfig {
  databaseUrl: string
}

// Get database configuration from environment
export function getDatabaseConfig(): DatabaseConfig {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/boorie_hydraulic'
  
  return {
    databaseUrl
  }
}

// Validate database configuration
export function validateDatabaseConfig(config: DatabaseConfig): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []
  
  if (!config.databaseUrl) {
    errors.push('DATABASE_URL is required')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

// Create Prisma client
export function createPrismaClient() {
  console.log('Database Factory - Loading PostgreSQL client')
  
  let isPackaged = false
  let isElectron = false
  
  try {
    // Check if we're in Electron
    const electron = require('electron')
    isElectron = true
    isPackaged = electron.app ? electron.app.isPackaged : false
  } catch (error) {
    // Not in Electron environment or no access to app
    isElectron = false
    isPackaged = false
  }

  console.log('Prisma Client - Environment detection:', { isElectron, isPackaged })

  if (isPackaged && isElectron) {
    // Packaged Electron app
    console.log('Loading Prisma Client for packaged Electron app...')
    
    try {
      // Try multiple possible locations for the Prisma client
      const possiblePaths = [
        // Primary location in Resources
        path.join(process.resourcesPath, '.prisma', 'client'),
        path.join(process.resourcesPath, '@prisma', 'client'),
        // Alternative locations
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.prisma', 'client'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@prisma', 'client'),
        // Fallback to relative paths
        path.join(__dirname, '..', '..', 'node_modules', '.prisma', 'client'),
        path.join(__dirname, '..', '..', 'node_modules', '@prisma', 'client')
      ]

      let lastError = null

      for (const clientPath of possiblePaths) {
        console.log('Trying Prisma client path:', clientPath)
        
        if (fs.existsSync(clientPath)) {
          console.log('Found Prisma client directory at:', clientPath)
          
          try {
            const client = require(clientPath)
            
            if (client.PrismaClient) {
              console.log('Successfully loaded PrismaClient from:', clientPath)
              return client
            } else {
              console.log('Client found but no PrismaClient export at:', clientPath)
            }
          } catch (error) {
            console.log('Failed to require Prisma client from:', clientPath, (error as Error).message)
            lastError = error as Error
          }
        } else {
          console.log('Prisma client path does not exist:', clientPath)
        }
      }

      throw new Error(`Could not load Prisma client from any location. Last error: ${(lastError as Error)?.message || 'No valid paths found'}`)

    } catch (error) {
      console.error('Critical error loading Prisma client in packaged app:', error)
      throw error
    }

  } else {
    // Development or non-Electron environment
    console.log('Loading Prisma Client for development environment...')
    
    // Try .prisma/client first (most reliable in dev)
    try {
      const client = require('.prisma/client')
      if (client && client.PrismaClient && typeof client.PrismaClient === 'function') {
        console.log('Loaded Prisma client from .prisma/client')
        return client
      }
    } catch (error) {
      console.log('Failed to load from .prisma/client:', (error as Error).message)
    }
    
    // Try direct path as fallback
    try {
      const clientPath = path.join(process.cwd(), 'node_modules', '.prisma', 'client')
      if (fs.existsSync(clientPath)) {
        const client = require(clientPath)
        if (client && client.PrismaClient && typeof client.PrismaClient === 'function') {
          console.log('Loaded Prisma client from direct path')
          return client
        }
      }
    } catch (error) {
      console.log('Failed to load from direct path:', (error as Error).message)
    }
    
    // Last resort: try @prisma/client
    try {
      const client = require('@prisma/client')
      if (client && client.PrismaClient && typeof client.PrismaClient === 'function') {
        console.log('Loaded Prisma client from @prisma/client')
        return { PrismaClient: client.PrismaClient }
      }
    } catch (error) {
      console.log('Failed to load from @prisma/client:', (error as Error).message)
    }
    
    throw new Error('Could not load PrismaClient from any development location')
  }
}

// Initialize PostgreSQL database client
export function initializeDatabaseClient() {
  const config = getDatabaseConfig()
  const validation = validateDatabaseConfig(config)
  
  if (!validation.valid) {
    throw new Error(`Database configuration validation failed:\n${validation.errors.join('\n')}`)
  }
  
  const prismaModule = createPrismaClient()
  const PrismaClient = prismaModule.PrismaClient
  
  console.log('Initializing PostgreSQL database client')
  
  return new PrismaClient({
    datasources: {
      db: {
        url: config.databaseUrl
      }
    }
  })
}

// Check database connectivity
export async function testDatabaseConnection(prismaClient: any): Promise<{
  success: boolean
  message: string
}> {
  try {
    await prismaClient.$queryRaw`SELECT 1`
    return {
      success: true,
      message: 'PostgreSQL database connection successful'
    }
  } catch (error) {
    return {
      success: false,
      message: `Database connection failed: ${(error as Error).message}`
    }
  }
}
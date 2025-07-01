// Backend Index - Main entry point for the backend architecture

export * from './models'
export * from './services'
export * from './utils/logger'
export * from './utils/validation'

// Re-export for convenience
export { ServiceContainer } from './services'
export { createLogger } from './utils/logger'
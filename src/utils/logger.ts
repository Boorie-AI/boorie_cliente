/* eslint-disable no-console */
// Frontend logger — gates noisy debug/info to development.
// warn/error always go through to console (and can be picked up by Clarity).
//
// Use:
//   import { logger } from '@/utils/logger'
//   logger.debug('message', data)   // dropped in production
//   logger.info('message', data)    // dropped in production
//   logger.warn('message', data)    // always
//   logger.error('message', error)  // always

const isDev =
  typeof import.meta !== 'undefined' &&
  (import.meta as ImportMeta & { env?: { DEV?: boolean; MODE?: string } }).env?.DEV === true

type LogArgs = unknown[]

export const logger = {
  debug(...args: LogArgs): void {
    if (isDev) console.log(...args)
  },
  info(...args: LogArgs): void {
    if (isDev) console.info(...args)
  },
  warn(...args: LogArgs): void {
    console.warn(...args)
  },
  error(...args: LogArgs): void {
    console.error(...args)
  },
}

// Calendar Cache Service - In-memory caching for performance optimization

import { databaseLogger } from '../../../backend/utils/logger'
import { CacheItem, CacheOptions } from './calendar.types'

export class CalendarCacheService {
  private cache: Map<string, CacheItem<any>> = new Map()
  private logger = databaseLogger
  private defaultTTL = 300000 // 5 minutes default TTL

  constructor() {
    this.logger.info('Calendar Cache Service initialized')
    
    // Clean up expired items every minute
    setInterval(() => {
      this.cleanup()
    }, 60000)
  }

  /**
   * Store data in cache
   */
  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    try {
      const now = Date.now()
      const item: CacheItem<T> = {
        data,
        timestamp: now,
        expiresAt: now + ttl
      }

      this.cache.set(key, item)
      this.logger.debug('Cache item stored', { key, ttl })

    } catch (error) {
      this.logger.error('Failed to store cache item', error as Error, { key })
    }
  }

  /**
   * Get data from cache
   */
  get<T>(key: string): T | null {
    try {
      const item = this.cache.get(key)
      
      if (!item) {
        this.logger.debug('Cache miss', { key })
        return null
      }

      // Check if expired
      if (this.isExpired(key)) {
        this.logger.debug('Cache item expired', { key })
        this.cache.delete(key)
        return null
      }

      this.logger.debug('Cache hit', { key })
      return item.data as T

    } catch (error) {
      this.logger.error('Failed to get cache item', error as Error, { key })
      return null
    }
  }

  /**
   * Check if cache item is expired
   */
  isExpired(key: string): boolean {
    const item = this.cache.get(key)
    if (!item) {
      return true
    }

    return Date.now() > item.expiresAt
  }

  /**
   * Remove specific cache item
   */
  delete(key: string): boolean {
    try {
      const deleted = this.cache.delete(key)
      this.logger.debug('Cache item deleted', { key, found: deleted })
      return deleted

    } catch (error) {
      this.logger.error('Failed to delete cache item', error as Error, { key })
      return false
    }
  }

  /**
   * Clear all cache items
   */
  clear(): void {
    try {
      const count = this.cache.size
      this.cache.clear()
      this.logger.info('Cache cleared', { itemsCleared: count })

    } catch (error) {
      this.logger.error('Failed to clear cache', error as Error)
    }
  }

  /**
   * Invalidate cache items matching a pattern
   */
  invalidatePattern(pattern: string): number {
    try {
      let invalidatedCount = 0
      const regex = new RegExp(pattern.replace('*', '.*'))

      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key)
          invalidatedCount++
        }
      }

      this.logger.debug('Cache pattern invalidated', { pattern, invalidatedCount })
      return invalidatedCount

    } catch (error) {
      this.logger.error('Failed to invalidate cache pattern', error as Error, { pattern })
      return 0
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalItems: number
    expiredItems: number
    memoryUsage: number
    hitRate?: number
  } {
    try {
      let expiredItems = 0
      const now = Date.now()

      for (const [key, item] of this.cache.entries()) {
        if (now > item.expiresAt) {
          expiredItems++
        }
      }

      // Rough memory usage estimation
      const memoryUsage = JSON.stringify([...this.cache.entries()]).length

      return {
        totalItems: this.cache.size,
        expiredItems,
        memoryUsage
      }

    } catch (error) {
      this.logger.error('Failed to get cache stats', error as Error)
      return {
        totalItems: 0,
        expiredItems: 0,
        memoryUsage: 0
      }
    }
  }

  /**
   * Get or set with factory function
   */
  async getOrSet<T>(
    key: string, 
    factory: () => Promise<T>, 
    options: CacheOptions = { ttl: this.defaultTTL }
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = this.get<T>(key)
      if (cached !== null) {
        return cached
      }

      // Not in cache, use factory to get data
      this.logger.debug('Cache miss, using factory', { key })
      const data = await factory()
      
      // Store in cache
      this.set(key, data, options.ttl)
      
      return data

    } catch (error) {
      this.logger.error('Failed to get or set cache item', error as Error, { key })
      throw error
    }
  }

  /**
   * Cleanup expired items
   */
  private cleanup(): void {
    try {
      let cleanedCount = 0
      const now = Date.now()

      for (const [key, item] of this.cache.entries()) {
        if (now > item.expiresAt) {
          this.cache.delete(key)
          cleanedCount++
        }
      }

      if (cleanedCount > 0) {
        this.logger.debug('Cache cleanup completed', { cleanedCount })
      }

    } catch (error) {
      this.logger.error('Cache cleanup failed', error as Error)
    }
  }

  /**
   * Create cache key for events
   */
  static createEventsKey(accountId: string, startDate: Date, endDate: Date): string {
    return `events_${accountId}_${startDate.toISOString()}_${endDate.toISOString()}`
  }

  /**
   * Create cache key for account info
   */
  static createAccountKey(accountId: string): string {
    return `account_${accountId}`
  }

  /**
   * Create cache key for calendars
   */
  static createCalendarsKey(accountId: string): string {
    return `calendars_${accountId}`
  }

  /**
   * Create cache key for single event
   */
  static createEventKey(accountId: string, eventId: string): string {
    return `event_${accountId}_${eventId}`
  }

  /**
   * Invalidate all events for an account
   */
  invalidateAccountEvents(accountId: string): number {
    return this.invalidatePattern(`events_${accountId}_*`)
  }

  /**
   * Invalidate account-specific cache
   */
  invalidateAccount(accountId: string): number {
    return this.invalidatePattern(`*_${accountId}_*`) + 
           this.invalidatePattern(`*_${accountId}`)
  }

  /**
   * Preload events for common date ranges
   */
  async preloadEvents<T>(
    accountId: string,
    eventsFetcher: (start: Date, end: Date) => Promise<T[]>,
    baseDate: Date = new Date()
  ): Promise<void> {
    try {
      this.logger.debug('Preloading events for account', { accountId })

      // Current month
      const currentMonth = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1)
      const nextMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1)
      
      // Next month
      const followingMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 2, 1)

      // Previous month
      const prevMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1)

      const preloadPromises = [
        this.getOrSet(
          CalendarCacheService.createEventsKey(accountId, prevMonth, currentMonth),
          () => eventsFetcher(prevMonth, currentMonth),
          { ttl: this.defaultTTL }
        ),
        this.getOrSet(
          CalendarCacheService.createEventsKey(accountId, currentMonth, nextMonth),
          () => eventsFetcher(currentMonth, nextMonth),
          { ttl: this.defaultTTL }
        ),
        this.getOrSet(
          CalendarCacheService.createEventsKey(accountId, nextMonth, followingMonth),
          () => eventsFetcher(nextMonth, followingMonth),
          { ttl: this.defaultTTL }
        )
      ]

      await Promise.all(preloadPromises)
      this.logger.success('Events preloaded for account', { accountId })

    } catch (error) {
      this.logger.error('Failed to preload events', error as Error, { accountId })
    }
  }

  /**
   * Destroy the cache service
   */
  destroy(): void {
    try {
      this.clear()
      this.logger.info('Calendar Cache Service destroyed')
    } catch (error) {
      this.logger.error('Failed to destroy cache service', error as Error)
    }
  }
}
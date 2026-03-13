/**
 * TECH-4: Critical Error Alert Service
 *
 * Tracks errors, detects patterns, and triggers desktop notifications
 * for critical issues. Stores error metrics for automated reporting.
 */

import { clarityService } from './clarity'

interface ErrorEntry {
  type: string
  message: string
  source: string
  timestamp: number
  severity: 'info' | 'warning' | 'error' | 'critical'
}

interface ErrorMetrics {
  totalErrors: number
  criticalErrors: number
  errorsByType: Record<string, number>
  errorsBySource: Record<string, number>
  recentErrors: ErrorEntry[]
  sessionStart: string
  lastError?: ErrorEntry
}

class ErrorAlertService {
  private errors: ErrorEntry[] = []
  private readonly MAX_STORED_ERRORS = 200
  private readonly CRITICAL_THRESHOLD = 5 // 5 errors of same type in window
  private readonly THRESHOLD_WINDOW_MS = 60_000 // 1 minute window
  private sessionStart = new Date().toISOString()
  private alertedPatterns = new Set<string>()

  /**
   * Track an error and check if it triggers a critical alert
   */
  trackError(
    type: string,
    message: string,
    source: string,
    severity: 'info' | 'warning' | 'error' | 'critical' = 'error'
  ): void {
    const entry: ErrorEntry = {
      type,
      message: message.substring(0, 500), // Limit message size
      source,
      timestamp: Date.now(),
      severity,
    }

    this.errors.push(entry)

    // Trim old errors
    if (this.errors.length > this.MAX_STORED_ERRORS) {
      this.errors = this.errors.slice(-this.MAX_STORED_ERRORS)
    }

    // Track in Clarity
    if (clarityService.isReady()) {
      clarityService.trackEvent('error_tracked', {
        error_type: type,
        severity,
        source,
      })
    }

    // Check for critical patterns
    this.checkCriticalPatterns(type, source)
  }

  /**
   * Detect repeated error patterns and trigger alerts
   */
  private checkCriticalPatterns(type: string, source: string): void {
    const now = Date.now()
    const windowStart = now - this.THRESHOLD_WINDOW_MS
    const patternKey = `${type}:${source}`

    // Count errors of this type in the time window
    const recentCount = this.errors.filter(
      e => e.type === type && e.source === source && e.timestamp >= windowStart
    ).length

    if (recentCount >= this.CRITICAL_THRESHOLD && !this.alertedPatterns.has(patternKey)) {
      this.alertedPatterns.add(patternKey)
      this.triggerCriticalAlert(type, source, recentCount)

      // Reset alert after 5 minutes to allow re-alerting
      setTimeout(() => {
        this.alertedPatterns.delete(patternKey)
      }, 5 * 60_000)
    }
  }

  /**
   * Send a desktop notification for critical errors
   */
  private triggerCriticalAlert(type: string, source: string, count: number): void {
    console.error(`[CRITICAL ALERT] ${count} "${type}" errors from "${source}" in the last minute`)

    // Track critical alert in Clarity
    if (clarityService.isReady()) {
      clarityService.trackEvent('critical_alert_triggered', {
        error_type: type,
        source,
        error_count: count,
        threshold: this.CRITICAL_THRESHOLD,
      })
    }

    // Send desktop notification via Electron
    if (window.electronAPI?.notifications?.show) {
      window.electronAPI.notifications.show(
        'Boorie - Critical Error Alert',
        `Detected ${count} repeated "${type}" errors from ${source}. Check the application logs.`,
        { urgency: 'critical' }
      )
    }
  }

  /**
   * Get current error metrics for reporting
   */
  getMetrics(): ErrorMetrics {
    const errorsByType: Record<string, number> = {}
    const errorsBySource: Record<string, number> = {}
    let criticalErrors = 0

    this.errors.forEach(e => {
      errorsByType[e.type] = (errorsByType[e.type] || 0) + 1
      errorsBySource[e.source] = (errorsBySource[e.source] || 0) + 1
      if (e.severity === 'critical') criticalErrors++
    })

    return {
      totalErrors: this.errors.length,
      criticalErrors,
      errorsByType,
      errorsBySource,
      recentErrors: this.errors.slice(-10),
      sessionStart: this.sessionStart,
      lastError: this.errors[this.errors.length - 1],
    }
  }

  /**
   * Generate a session error report (JSON)
   */
  generateReport(): string {
    const metrics = this.getMetrics()
    const report = {
      reportGeneratedAt: new Date().toISOString(),
      sessionStart: this.sessionStart,
      sessionDuration: `${Math.round((Date.now() - new Date(this.sessionStart).getTime()) / 60_000)} minutes`,
      summary: {
        totalErrors: metrics.totalErrors,
        criticalErrors: metrics.criticalErrors,
        uniqueErrorTypes: Object.keys(metrics.errorsByType).length,
        uniqueSources: Object.keys(metrics.errorsBySource).length,
      },
      errorsByType: Object.entries(metrics.errorsByType)
        .sort(([, a], [, b]) => b - a)
        .map(([type, count]) => ({ type, count })),
      errorsBySource: Object.entries(metrics.errorsBySource)
        .sort(([, a], [, b]) => b - a)
        .map(([source, count]) => ({ source, count })),
      recentErrors: metrics.recentErrors,
    }

    return JSON.stringify(report, null, 2)
  }

  /**
   * Clear all stored errors
   */
  clear(): void {
    this.errors = []
    this.alertedPatterns.clear()
  }
}

export const errorAlertService = new ErrorAlertService()

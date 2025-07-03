// Export Calendar Component - UI for exporting calendar events

import React, { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useCalendarStore } from '../../stores/calendarStore'
import CalendarExportService, { ExportOptions } from '../../services/calendarExport.service'
import '../../styles/components.css';
import '../../styles/modals.css';
import '../../styles/recurrence.css';

interface ExportCalendarProps {
  events: UnifiedCalendarEvent[]
  isOpen: boolean
  onClose: () => void
}

interface ExportPreviewProps {
  events: UnifiedCalendarEvent[]
  options: ExportOptions
}

export const ExportCalendar: React.FC<ExportCalendarProps> = ({
  events,
  isOpen,
  onClose
}) => {
  const { t } = useTranslation()
  const { connectedAccounts } = useCalendarStore()
  
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'ics',
    dateRange: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)    // 30 days from now
    },
    accounts: [],
    includeDetails: true,
    includeAttendees: true,
    includeOnlineMeetingLinks: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  })

  const [isExporting, setIsExporting] = useState(false)
  const [exportResult, setExportResult] = useState<any>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Filter events based on current options
  const filteredEvents = events.filter(event => {
    // Date range filter
    if (event.startTime < exportOptions.dateRange.start || event.startTime > exportOptions.dateRange.end) {
      return false
    }
    
    // Account filter
    if (exportOptions.accounts.length > 0 && !exportOptions.accounts.includes(event.accountId)) {
      return false
    }
    
    return true
  })

  const handleExport = useCallback(async () => {
    setIsExporting(true)
    setExportResult(null)

    try {
      const result = await CalendarExportService.exportEvents(events, exportOptions)
      
      if (result.success && result.data) {
        // Download the file
        CalendarExportService.downloadFile(result.data as Blob, result.filename)
        
        setExportResult({
          success: true,
          filename: result.filename,
          size: result.size,
          eventCount: filteredEvents.length
        })
      } else {
        setExportResult({
          success: false,
          error: result.error || 'Export failed'
        })
      }
    } catch (error) {
      setExportResult({
        success: false,
        error: error instanceof Error ? error.message : 'Export failed'
      })
    } finally {
      setIsExporting(false)
    }
  }, [events, exportOptions, filteredEvents.length])

  const updateOptions = useCallback((updates: Partial<ExportOptions>) => {
    setExportOptions(prev => ({ ...prev, ...updates }))
  }, [])

  const handleSelectAllAccounts = useCallback(() => {
    const allAccountIds = connectedAccounts.map(acc => acc.id)
    updateOptions({ accounts: allAccountIds })
  }, [connectedAccounts, updateOptions])

  const handleClearAccountSelection = useCallback(() => {
    updateOptions({ accounts: [] })
  }, [updateOptions])

  if (!isOpen) return null

  return (
    <div className="export-modal-overlay">
      <div className="export-modal">
        <div className="modal-header">
          <h2>{t('calendar.export.title')}</h2>
          <button onClick={onClose} className="close-btn">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-content">
          {/* Export Format Selection */}
          <div className="form-group">
            <label className="form-label">{t('calendar.export.format')}</label>
            <div className="format-options">
              {[
                { value: 'ics', label: t('calendar.export.formats.ics.label'), description: t('calendar.export.formats.ics.description') },
                { value: 'csv', label: t('calendar.export.formats.csv.label'), description: t('calendar.export.formats.csv.description') },
                { value: 'json', label: t('calendar.export.formats.json.label'), description: t('calendar.export.formats.json.description') },
                { value: 'pdf', label: t('calendar.export.formats.pdf.label'), description: t('calendar.export.formats.pdf.description') },
                { value: 'xlsx', label: t('calendar.export.formats.xlsx.label'), description: t('calendar.export.formats.xlsx.description') }
              ].map(format => (
                <label key={format.value} className="format-option">
                  <input
                    type="radio"
                    name="format"
                    value={format.value}
                    checked={exportOptions.format === format.value}
                    onChange={(e) => updateOptions({ format: e.target.value as any })}
                  />
                  <div className="format-info">
                    <span className="format-label">{format.label}</span>
                    <span className="format-description">{format.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Date Range Selection */}
          <div className="form-group">
            <label className="form-label">{t('calendar.export.dateRange')}</label>
            <div className="date-range-controls">
              <div className="quick-ranges">
                <button
                  onClick={() => updateOptions({
                    dateRange: {
                      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                      end: new Date()
                    }
                  })}
                  className="quick-range-btn"
                >
                  {t('calendar.export.last7Days')}
                </button>
                <button
                  onClick={() => updateOptions({
                    dateRange: {
                      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                      end: new Date()
                    }
                  })}
                  className="quick-range-btn"
                >
                  {t('calendar.export.last30Days')}
                </button>
                <button
                  onClick={() => updateOptions({
                    dateRange: {
                      start: new Date(),
                      end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                    }
                  })}
                  className="quick-range-btn"
                >
                  {t('calendar.export.next30Days')}
                </button>
              </div>
              
              <div className="date-inputs">
                <input
                  type="date"
                  value={exportOptions.dateRange.start.toISOString().split('T')[0]}
                  onChange={(e) => updateOptions({
                    dateRange: {
                      ...exportOptions.dateRange,
                      start: new Date(e.target.value)
                    }
                  })}
                  className="date-input"
                />
                <span>{t('calendar.export.to')}</span>
                <input
                  type="date"
                  value={exportOptions.dateRange.end.toISOString().split('T')[0]}
                  onChange={(e) => updateOptions({
                    dateRange: {
                      ...exportOptions.dateRange,
                      end: new Date(e.target.value)
                    }
                  })}
                  className="date-input"
                />
              </div>
            </div>
          </div>

          {/* Account Selection */}
          <div className="form-group">
            <label className="form-label">
              {t('calendar.export.accountsToExport')}
              <div className="account-controls">
                <button onClick={handleSelectAllAccounts} className="text-btn">{t('calendar.export.selectAll')}</button>
                <button onClick={handleClearAccountSelection} className="text-btn">{t('calendar.export.clear')}</button>
              </div>
            </label>
            <div className="account-list">
              {connectedAccounts.map(account => (
                <label key={account.id} className="account-option">
                  <input
                    type="checkbox"
                    checked={exportOptions.accounts.includes(account.id)}
                    onChange={(e) => {
                      const accounts = e.target.checked
                        ? [...exportOptions.accounts, account.id]
                        : exportOptions.accounts.filter(id => id !== account.id)
                      updateOptions({ accounts })
                    }}
                  />
                  <div className="account-info">
                    <span className="account-name">{account.name}</span>
                    <span className="account-email">{account.email}</span>
                    <span className={`provider-badge ${account.provider}`}>
                      {account.provider}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Export Options */}
          <div className="form-group">
            <label className="form-label">{t('calendar.export.options')}</label>
            <div className="export-options">
              <label className="option-checkbox">
                <input
                  type="checkbox"
                  checked={exportOptions.includeDetails}
                  onChange={(e) => updateOptions({ includeDetails: e.target.checked })}
                />
                <span>{t('calendar.export.includeDetails')}</span>
              </label>
              
              <label className="option-checkbox">
                <input
                  type="checkbox"
                  checked={exportOptions.includeAttendees}
                  onChange={(e) => updateOptions({ includeAttendees: e.target.checked })}
                />
                <span>{t('calendar.export.includeAttendees')}</span>
              </label>
              
              <label className="option-checkbox">
                <input
                  type="checkbox"
                  checked={exportOptions.includeOnlineMeetingLinks}
                  onChange={(e) => updateOptions({ includeOnlineMeetingLinks: e.target.checked })}
                />
                <span>{t('calendar.export.includeMeetingLinks')}</span>
              </label>
            </div>
          </div>

          {/* Export Preview */}
          <div className="form-group">
            <div className="export-summary">
              <div className="summary-stats">
                <div className="stat">
                  <span className="stat-number">{filteredEvents.length}</span>
                  <span className="stat-label">{t('calendar.export.eventsToExport')}</span>
                </div>
                <div className="stat">
                  <span className="stat-number">{exportOptions.accounts.length || connectedAccounts.length}</span>
                  <span className="stat-label">{t('calendar.export.accounts')}</span>
                </div>
                <div className="stat">
                  <span className="stat-number">
                    {Math.ceil((exportOptions.dateRange.end.getTime() - exportOptions.dateRange.start.getTime()) / (1000 * 60 * 60 * 24))}
                  </span>
                  <span className="stat-label">{t('calendar.export.days')}</span>
                </div>
              </div>
              
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="preview-toggle-btn"
              >
                {showPreview ? t('calendar.export.hidePreview') : t('calendar.export.showPreview')}
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${showPreview ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {showPreview && (
              <ExportPreview events={filteredEvents} options={exportOptions} />
            )}
          </div>

          {/* Export Result */}
          {exportResult && (
            <div className={`export-result ${exportResult.success ? 'success' : 'error'}`}>
              {exportResult.success ? (
                <div className="success-message">
                  <CheckIcon className="w-5 h-5" />
                  <div>
                    <p><strong>{t('calendar.export.successMessage')}</strong></p>
                    <p>{t('calendar.export.fileInfo', { filename: exportResult.filename, size: formatFileSize(exportResult.size) })}</p>
                    <p>{t('calendar.export.eventsExported', { count: exportResult.eventCount })}</p>
                  </div>
                </div>
              ) : (
                <div className="error-message">
                  <AlertIcon className="w-5 h-5" />
                  <div>
                    <p><strong>{t('calendar.export.errorMessage')}</strong></p>
                    <p>{exportResult.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">
            {t('calendar.export.cancel')}
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || filteredEvents.length === 0}
            className="btn btn-primary"
          >
            {isExporting ? (
              <>
                <LoadingSpinner size="sm" />
                {t('calendar.export.exporting')}
              </>
            ) : (
              <>
                <DownloadIcon className="w-4 h-4" />
                {t('calendar.export.exportEvents', { count: filteredEvents.length })}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Export Preview Component
const ExportPreview: React.FC<ExportPreviewProps> = ({ events, options }) => {
  const previewEvents = events.slice(0, 5) // Show first 5 events

  return (
    <div className="export-preview">
      <div className="preview-header">
        <h4>{t('calendar.export.previewTitle', { count: events.length })}</h4>
      </div>
      
      <div className="preview-events">
        {previewEvents.map(event => (
          <div key={event.id} className="preview-event">
            <div className="event-title">{event.title}</div>
            <div className="event-time">
              {event.startTime.toLocaleDateString()} at {event.startTime.toLocaleTimeString()}
            </div>
            {options.includeDetails && event.description && (
              <div className="event-description">{event.description}</div>
            )}
            {event.location && (
              <div className="event-location">📍 {event.location}</div>
            )}
            {options.includeOnlineMeetingLinks && event.hasOnlineMeeting && (
              <div className="event-meeting">🎥 Online Meeting</div>
            )}
            {options.includeAttendees && event.attendees && event.attendees.length > 0 && (
              <div className="event-attendees">
                👥 {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        ))}
        
        {events.length > 5 && (
          <div className="preview-more">
            {t('calendar.export.moreEvents', { count: events.length - 5 })}
          </div>
        )}
      </div>
    </div>
  )
}

// Utility Functions
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

// Loading Spinner Component
const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => (
  <div className={`loading-spinner ${size}`}>
    <div className="spinner"></div>
  </div>
)

// Icon Components
const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const AlertIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
  </svg>
)

const DownloadIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

export default ExportCalendar
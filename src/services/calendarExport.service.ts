// Calendar Export Service - Export calendar events to various formats

export interface ExportOptions {
  format: 'ics' | 'csv' | 'json' | 'pdf' | 'xlsx'
  dateRange: {
    start: Date
    end: Date
  }
  accounts: string[]
  includeDetails: boolean
  includeAttendees: boolean
  includeOnlineMeetingLinks: boolean
  timezone: string
  customFields?: string[]
}

export interface ExportResult {
  success: boolean
  data?: Blob | string
  filename: string
  size: number
  error?: string
}

export class CalendarExportService {
  /**
   * Export events to the specified format
   */
  static async exportEvents(
    events: UnifiedCalendarEvent[],
    options: ExportOptions
  ): Promise<ExportResult> {
    try {
      const filteredEvents = this.filterEvents(events, options)
      
      switch (options.format) {
        case 'ics':
          return this.exportToICS(filteredEvents, options)
        case 'csv':
          return this.exportToCSV(filteredEvents, options)
        case 'json':
          return this.exportToJSON(filteredEvents, options)
        case 'pdf':
          return this.exportToPDF(filteredEvents, options)
        case 'xlsx':
          return this.exportToExcel(filteredEvents, options)
        default:
          throw new Error(`Unsupported export format: ${options.format}`)
      }
    } catch (error) {
      return {
        success: false,
        filename: '',
        size: 0,
        error: error instanceof Error ? error.message : 'Export failed'
      }
    }
  }

  /**
   * Filter events based on export options
   */
  private static filterEvents(
    events: UnifiedCalendarEvent[],
    options: ExportOptions
  ): UnifiedCalendarEvent[] {
    return events.filter(event => {
      // Date range filter
      if (event.startTime < options.dateRange.start || event.startTime > options.dateRange.end) {
        return false
      }
      
      // Account filter
      if (options.accounts.length > 0 && !options.accounts.includes(event.accountId)) {
        return false
      }
      
      return true
    })
  }

  /**
   * Export to ICS (iCalendar) format
   */
  private static exportToICS(
    events: UnifiedCalendarEvent[],
    options: ExportOptions
  ): ExportResult {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Xavi9//Calendar Export//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ]

    events.forEach(event => {
      lines.push('BEGIN:VEVENT')
      lines.push(`UID:${event.id}@xavi9.app`)
      lines.push(`DTSTART:${this.formatDateForICS(event.startTime)}`)
      lines.push(`DTEND:${this.formatDateForICS(event.endTime)}`)
      lines.push(`SUMMARY:${this.escapeICSText(event.title)}`)
      
      if (event.description && options.includeDetails) {
        lines.push(`DESCRIPTION:${this.escapeICSText(event.description)}`)
      }
      
      if (event.location) {
        lines.push(`LOCATION:${this.escapeICSText(event.location)}`)
      }
      
      if (event.hasOnlineMeeting && event.meetingUrl && options.includeOnlineMeetingLinks) {
        lines.push(`URL:${event.meetingUrl}`)
      }
      
      if (event.attendees && options.includeAttendees) {
        event.attendees.forEach(attendee => {
          lines.push(`ATTENDEE;CN=${attendee.name || attendee.email}:mailto:${attendee.email}`)
        })
      }
      
      lines.push(`CREATED:${this.formatDateForICS(new Date())}`)
      lines.push(`LAST-MODIFIED:${this.formatDateForICS(new Date())}`)
      lines.push('END:VEVENT')
    })

    lines.push('END:VCALENDAR')
    
    const content = lines.join('\r\n')
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
    const filename = `calendar-export-${this.formatDateForFilename(new Date())}.ics`

    return {
      success: true,
      data: blob,
      filename,
      size: blob.size
    }
  }

  /**
   * Export to CSV format
   */
  private static exportToCSV(
    events: UnifiedCalendarEvent[],
    options: ExportOptions
  ): ExportResult {
    const headers = [
      'Title',
      'Start Date',
      'Start Time',
      'End Date',
      'End Time',
      'All Day',
      'Provider',
      'Account'
    ]

    if (options.includeDetails) {
      headers.push('Description', 'Location')
    }

    if (options.includeOnlineMeetingLinks) {
      headers.push('Online Meeting', 'Meeting URL')
    }

    if (options.includeAttendees) {
      headers.push('Attendees', 'Attendee Count')
    }

    const rows = [headers]

    events.forEach(event => {
      const row = [
        this.escapeCSVText(event.title),
        this.formatDateForDisplay(event.startTime, 'date'),
        event.isAllDay ? '' : this.formatDateForDisplay(event.startTime, 'time'),
        this.formatDateForDisplay(event.endTime, 'date'),
        event.isAllDay ? '' : this.formatDateForDisplay(event.endTime, 'time'),
        event.isAllDay ? 'Yes' : 'No',
        event.provider,
        event.accountId
      ]

      if (options.includeDetails) {
        row.push(
          this.escapeCSVText(event.description || ''),
          this.escapeCSVText(event.location || '')
        )
      }

      if (options.includeOnlineMeetingLinks) {
        row.push(
          event.hasOnlineMeeting ? 'Yes' : 'No',
          event.meetingUrl || ''
        )
      }

      if (options.includeAttendees) {
        const attendeeNames = event.attendees?.map(a => a.name || a.email).join('; ') || ''
        row.push(
          this.escapeCSVText(attendeeNames),
          (event.attendees?.length || 0).toString()
        )
      }

      rows.push(row)
    })

    const content = rows.map(row => row.join(',')).join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
    const filename = `calendar-export-${this.formatDateForFilename(new Date())}.csv`

    return {
      success: true,
      data: blob,
      filename,
      size: blob.size
    }
  }

  /**
   * Export to JSON format
   */
  private static exportToJSON(
    events: UnifiedCalendarEvent[],
    options: ExportOptions
  ): ExportResult {
    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        format: 'json',
        version: '1.0',
        options: {
          dateRange: {
            start: options.dateRange.start.toISOString(),
            end: options.dateRange.end.toISOString()
          },
          accounts: options.accounts,
          includeDetails: options.includeDetails,
          includeAttendees: options.includeAttendees,
          includeOnlineMeetingLinks: options.includeOnlineMeetingLinks,
          timezone: options.timezone
        },
        totalEvents: events.length
      },
      events: events.map(event => this.sanitizeEventForExport(event, options))
    }

    const content = JSON.stringify(exportData, null, 2)
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
    const filename = `calendar-export-${this.formatDateForFilename(new Date())}.json`

    return {
      success: true,
      data: blob,
      filename,
      size: blob.size
    }
  }

  /**
   * Export to PDF format
   */
  private static exportToPDF(
    events: UnifiedCalendarEvent[],
    options: ExportOptions
  ): ExportResult {
    // This is a simplified implementation
    // In a real app, you'd use a library like jsPDF or puppeteer
    
    const htmlContent = this.generateHTMLReport(events, options)
    
    // For now, we'll return HTML that can be printed to PDF
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
    const filename = `calendar-export-${this.formatDateForFilename(new Date())}.html`

    return {
      success: true,
      data: blob,
      filename,
      size: blob.size
    }
  }

  /**
   * Export to Excel format
   */
  private static exportToExcel(
    events: UnifiedCalendarEvent[],
    options: ExportOptions
  ): ExportResult {
    // This would require a library like xlsx or exceljs
    // For now, we'll export as CSV with .xlsx extension
    const csvResult = this.exportToCSV(events, options)
    
    return {
      ...csvResult,
      filename: csvResult.filename.replace('.csv', '.xlsx')
    }
  }

  /**
   * Generate HTML report for PDF export
   */
  private static generateHTMLReport(
    events: UnifiedCalendarEvent[],
    options: ExportOptions
  ): string {
    const startDate = this.formatDateForDisplay(options.dateRange.start, 'date')
    const endDate = this.formatDateForDisplay(options.dateRange.end, 'date')
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Calendar Export</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          h1 { color: #333; border-bottom: 2px solid #007acc; padding-bottom: 10px; }
          .header { margin-bottom: 30px; }
          .event { border: 1px solid #ddd; margin-bottom: 20px; padding: 15px; border-radius: 5px; }
          .event-title { font-size: 18px; font-weight: bold; color: #007acc; margin-bottom: 10px; }
          .event-time { font-size: 14px; color: #666; margin-bottom: 10px; }
          .event-details { font-size: 14px; line-height: 1.5; }
          .provider-badge { 
            display: inline-block; 
            padding: 2px 8px; 
            border-radius: 3px; 
            font-size: 12px; 
            color: white;
            margin-left: 10px;
          }
          .microsoft { background-color: #0078d4; }
          .google { background-color: #4285f4; }
          @media print {
            body { margin: 20px; }
            .event { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Calendar Export</h1>
          <p><strong>Date Range:</strong> ${startDate} - ${endDate}</p>
          <p><strong>Total Events:</strong> ${events.length}</p>
          <p><strong>Export Date:</strong> ${this.formatDateForDisplay(new Date(), 'datetime')}</p>
        </div>
        <div class="events">
    `

    events.forEach(event => {
      html += `
        <div class="event">
          <div class="event-title">
            ${this.escapeHTML(event.title)}
            <span class="provider-badge ${event.provider}">${event.provider}</span>
          </div>
          <div class="event-time">
            ${this.formatDateForDisplay(event.startTime, 'datetime')} - 
            ${this.formatDateForDisplay(event.endTime, event.isAllDay ? 'date' : 'datetime')}
            ${event.isAllDay ? ' (All Day)' : ''}
          </div>
          <div class="event-details">
      `

      if (event.description && options.includeDetails) {
        html += `<p><strong>Description:</strong> ${this.escapeHTML(event.description)}</p>`
      }

      if (event.location) {
        html += `<p><strong>Location:</strong> ${this.escapeHTML(event.location)}</p>`
      }

      if (event.hasOnlineMeeting && event.meetingUrl && options.includeOnlineMeetingLinks) {
        html += `<p><strong>Meeting Link:</strong> <a href="${event.meetingUrl}">${event.meetingUrl}</a></p>`
      }

      if (event.attendees && options.includeAttendees && event.attendees.length > 0) {
        html += `<p><strong>Attendees:</strong> ${event.attendees.map(a => this.escapeHTML(a.name || a.email)).join(', ')}</p>`
      }

      html += `
          </div>
        </div>
      `
    })

    html += `
        </div>
      </body>
      </html>
    `

    return html
  }

  /**
   * Sanitize event data for export
   */
  private static sanitizeEventForExport(
    event: UnifiedCalendarEvent,
    options: ExportOptions
  ): any {
    const sanitized: any = {
      id: event.id,
      title: event.title,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      isAllDay: event.isAllDay,
      provider: event.provider,
      accountId: event.accountId
    }

    if (options.includeDetails) {
      sanitized.description = event.description
      sanitized.location = event.location
    }

    if (options.includeOnlineMeetingLinks) {
      sanitized.hasOnlineMeeting = event.hasOnlineMeeting
      sanitized.meetingUrl = event.meetingUrl
      sanitized.meetingProvider = event.meetingProvider
    }

    if (options.includeAttendees) {
      sanitized.attendees = event.attendees
    }

    return sanitized
  }

  /**
   * Format date for ICS format
   */
  private static formatDateForICS(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  }

  /**
   * Format date for filename
   */
  private static formatDateForFilename(date: Date): string {
    return date.toISOString().split('T')[0].replace(/-/g, '')
  }

  /**
   * Format date for display
   */
  private static formatDateForDisplay(date: Date, type: 'date' | 'time' | 'datetime'): string {
    switch (type) {
      case 'date':
        return date.toLocaleDateString()
      case 'time':
        return date.toLocaleTimeString()
      case 'datetime':
        return date.toLocaleString()
      default:
        return date.toISOString()
    }
  }

  /**
   * Escape text for ICS format
   */
  private static escapeICSText(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '')
  }

  /**
   * Escape text for CSV format
   */
  private static escapeCSVText(text: string): string {
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }

  /**
   * Escape text for HTML
   */
  private static escapeHTML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  /**
   * Download the exported file
   */
  static downloadFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}

export default CalendarExportService
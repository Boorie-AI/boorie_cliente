// Recurrence Editor Component - Advanced recurring event configuration

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface RecurrencePattern {
  type: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  endDate?: string
  count?: number
  daysOfWeek?: number[]
  dayOfMonth?: number
  monthOfYear?: number
}

interface RecurrenceEditorProps {
  value: RecurrencePattern
  onChange: (pattern: RecurrencePattern) => void
  startDate: Date
}

const RecurrenceEditor: React.FC<RecurrenceEditorProps> = ({
  value,
  onChange,
  startDate
}) => {
  const { t } = useTranslation()
  const [endType, setEndType] = useState<'never' | 'on' | 'after'>('never')

  // Initialize end type based on value
  useEffect(() => {
    if (value.endDate) {
      setEndType('on')
    } else if (value.count) {
      setEndType('after')
    } else {
      setEndType('never')
    }
  }, [value])

  const handleTypeChange = (type: RecurrencePattern['type']) => {
    const newPattern: RecurrencePattern = {
      type,
      interval: 1
    }

    // Set defaults based on type
    if (type === 'weekly') {
      // Default to the same day of week as start date
      newPattern.daysOfWeek = [startDate.getDay()]
    } else if (type === 'monthly') {
      // Default to the same day of month
      newPattern.dayOfMonth = startDate.getDate()
    } else if (type === 'yearly') {
      // Default to the same month and day
      newPattern.dayOfMonth = startDate.getDate()
      newPattern.monthOfYear = startDate.getMonth() + 1
    }

    onChange(newPattern)
  }

  const handleIntervalChange = (interval: number) => {
    onChange({
      ...value,
      interval: Math.max(1, interval)
    })
  }

  const handleDaysOfWeekChange = (day: number, checked: boolean) => {
    const daysOfWeek = value.daysOfWeek || []
    let newDaysOfWeek: number[]

    if (checked) {
      newDaysOfWeek = [...daysOfWeek, day].sort()
    } else {
      newDaysOfWeek = daysOfWeek.filter(d => d !== day)
    }

    onChange({
      ...value,
      daysOfWeek: newDaysOfWeek.length > 0 ? newDaysOfWeek : [startDate.getDay()]
    })
  }

  const handleEndTypeChange = (type: 'never' | 'on' | 'after') => {
    setEndType(type)
    
    const newPattern = { ...value }
    
    // Clear existing end conditions
    delete newPattern.endDate
    delete newPattern.count

    // Set new end condition
    if (type === 'on') {
      const futureDate = new Date(startDate)
      futureDate.setMonth(futureDate.getMonth() + 6) // Default to 6 months
      newPattern.endDate = futureDate.toISOString().split('T')[0]
    } else if (type === 'after') {
      newPattern.count = 10 // Default to 10 occurrences
    }

    onChange(newPattern)
  }

  const handleEndDateChange = (dateStr: string) => {
    onChange({
      ...value,
      endDate: dateStr
    })
  }

  const handleCountChange = (count: number) => {
    onChange({
      ...value,
      count: Math.max(1, count)
    })
  }

  const getIntervalLabel = () => {
    const { type, interval } = value
    
    if (interval === 1) {
      switch (type) {
        case 'daily': return t('calendar.recurrence.day')
        case 'weekly': return t('calendar.recurrence.week')
        case 'monthly': return t('calendar.recurrence.month')
        case 'yearly': return t('calendar.recurrence.year')
        default: return ''
      }
    } else {
      switch (type) {
        case 'daily': return t('calendar.recurrence.days')
        case 'weekly': return t('calendar.recurrence.weeks')
        case 'monthly': return t('calendar.recurrence.months')
        case 'yearly': return t('calendar.recurrence.years')
        default: return ''
      }
    }
  }

  const getRecurrenceDescription = () => {
    if (value.type === 'none') return t('calendar.recurrence.doesNotRepeat')

    const { type, interval, daysOfWeek, endDate, count } = value
    const intervalLabel = getIntervalLabel()
    
    let description = ''

    // Frequency
    if (interval === 1) {
      switch (type) {
        case 'daily':
          description = t('calendar.recurrence.daily')
          break
        case 'weekly':
          if (daysOfWeek && daysOfWeek.length > 0) {
            const dayNames = [t('calendar.recurrence.sun'), t('calendar.recurrence.mon'), t('calendar.recurrence.tue'), t('calendar.recurrence.wed'), t('calendar.recurrence.thu'), t('calendar.recurrence.fri'), t('calendar.recurrence.sat')]
            const selectedDays = daysOfWeek.map(d => dayNames[d]).join(', ')
            description = t('calendar.recurrence.weeklyOn', { days: selectedDays })
          } else {
            description = t('calendar.recurrence.weekly')
          }
          break
        case 'monthly':
          description = t('calendar.recurrence.monthly')
          break
        case 'yearly':
          description = t('calendar.recurrence.yearly')
          break
      }
    } else {
      description = t('calendar.recurrence.every', { interval, label: intervalLabel })
    }

    // End condition
    if (endDate) {
      const endDateObj = new Date(endDate)
      description += ` ${t('calendar.recurrence.until', { date: endDateObj.toLocaleDateString() })}`
    } else if (count) {
      description += ` ${t('calendar.recurrence.forOccurrences', { count })}`
    }

    return description
  }

  if (value.type === 'none') {
    return (
      <div className="recurrence-editor">
        <div className="form-group">
          <label className="form-label">{t('calendar.recurrence.repeat')}</label>
          <select
            className="form-select"
            value={value.type}
            onChange={e => handleTypeChange(e.target.value as RecurrencePattern['type'])}
          >
            <option value="none">{t('calendar.recurrence.doesNotRepeat')}</option>
            <option value="daily">{t('calendar.recurrence.daily')}</option>
            <option value="weekly">{t('calendar.recurrence.weekly')}</option>
            <option value="monthly">{t('calendar.recurrence.monthly')}</option>
            <option value="yearly">{t('calendar.recurrence.yearly')}</option>
          </select>
        </div>
      </div>
    )
  }

  return (
    <div className="recurrence-editor">
      <div className="form-group">
        <label className="form-label">Repeat</label>
        <select
          className="form-select"
          value={value.type}
          onChange={e => handleTypeChange(e.target.value as RecurrencePattern['type'])}
        >
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>

      {/* Interval */}
      <div className="form-group">
        <label className="form-label">{t('calendar.recurrence.every')}</label>
        <div className="interval-input">
          <input
            type="number"
            className="form-input interval-number"
            min="1"
            max="99"
            value={value.interval}
            onChange={e => handleIntervalChange(parseInt(e.target.value) || 1)}
          />
          <span className="interval-label">{getIntervalLabel()}</span>
        </div>
      </div>

      {/* Days of week for weekly recurrence */}
      {value.type === 'weekly' && (
        <div className="form-group">
          <label className="form-label">{t('calendar.recurrence.repeatOn')}</label>
          <div className="days-of-week">
            {[t('calendar.recurrence.sun'), t('calendar.recurrence.mon'), t('calendar.recurrence.tue'), t('calendar.recurrence.wed'), t('calendar.recurrence.thu'), t('calendar.recurrence.fri'), t('calendar.recurrence.sat')].map((day, index) => (
              <label key={index} className="day-checkbox">
                <input
                  type="checkbox"
                  checked={value.daysOfWeek?.includes(index) || false}
                  onChange={e => handleDaysOfWeekChange(index, e.target.checked)}
                />
                <span className="day-label">{day}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* End condition */}
      <div className="form-group">
        <label className="form-label">{t('calendar.recurrence.ends')}</label>
        <div className="end-condition">
          <div className="end-type-options">
            <label className="end-option">
              <input
                type="radio"
                name="endType"
                value="never"
                checked={endType === 'never'}
                onChange={() => handleEndTypeChange('never')}
              />
              <span>{t('calendar.recurrence.never')}</span>
            </label>
            
            <label className="end-option">
              <input
                type="radio"
                name="endType"
                value="on"
                checked={endType === 'on'}
                onChange={() => handleEndTypeChange('on')}
              />
              <span>{t('calendar.recurrence.on')}</span>
              {endType === 'on' && (
                <input
                  type="date"
                  className="form-input end-date"
                  value={value.endDate || ''}
                  onChange={e => handleEndDateChange(e.target.value)}
                  min={new Date(startDate.getTime() + 86400000).toISOString().split('T')[0]} // Next day
                />
              )}
            </label>
            
            <label className="end-option">
              <input
                type="radio"
                name="endType"
                value="after"
                checked={endType === 'after'}
                onChange={() => handleEndTypeChange('after')}
              />
              <span>{t('calendar.recurrence.after')}</span>
              {endType === 'after' && (
                <div className="after-count">
                  <input
                    type="number"
                    className="form-input count-input"
                    min="1"
                    max="999"
                    value={value.count || 1}
                    onChange={e => handleCountChange(parseInt(e.target.value) || 1)}
                  />
                  <span>{t('calendar.recurrence.occurrences')}</span>
                </div>
              )}
            </label>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="recurrence-summary">
        <div className="summary-label">{t('calendar.recurrence.summary')}:</div>
        <div className="summary-text">{getRecurrenceDescription()}</div>
      </div>
    </div>
  )
}

export default RecurrenceEditor
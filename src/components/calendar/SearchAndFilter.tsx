// Search and Filter Component - Advanced search UI for calendar events

import React, { useState, useCallback, useRef, useEffect } from 'react'
import useEventSearch from '../../hooks/useEventSearch'
import '../../styles/components.css';
import '../../styles/modals.css';
import '../../styles/recurrence.css';

interface SearchAndFilterProps {
  onEventsFilter: (events: UnifiedCalendarEvent[]) => void
  className?: string
}

interface FilterPanelProps {
  isOpen: boolean
  onClose: () => void
}

export const SearchAndFilter: React.FC<SearchAndFilterProps> = ({
  onEventsFilter,
  className = ''
}) => {
  const [showFilters, setShowFilters] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const {
    filters,
    searchResults,
    isSearching,
    searchStats,
    updateFilters,
    clearFilters,
    quickFilters,
    searchHistory,
    applySavedSearch,
    smartSuggestions
  } = useEventSearch()

  // Update parent component with filtered events
  useEffect(() => {
    onEventsFilter(searchResults.events)
  }, [searchResults.events, onEventsFilter])

  const handleSearchChange = useCallback((value: string) => {
    updateFilters({ query: value })
  }, [updateFilters])

  const handleSuggestionClick = useCallback((suggestion: string) => {
    updateFilters({ query: suggestion })
    setShowSuggestions(false)
    searchInputRef.current?.focus()
  }, [updateFilters])

  const handleQuickFilter = useCallback((filterName: keyof typeof quickFilters) => {
    quickFilters[filterName]()
    setShowFilters(false)
  }, [quickFilters])

  return (
    <div className={`search-and-filter ${className}`}>
      {/* Search Bar */}
      <div className="search-bar">
        <div className="search-input-container">
          <SearchIcon className="search-icon" />
          
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search events, people, locations..."
            value={filters.query}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="search-input"
          />
          
          {filters.query && (
            <button
              onClick={() => updateFilters({ query: '' })}
              className="clear-search-btn"
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
          
          {isSearching && (
            <div className="search-loading">
              <LoadingSpinner size="sm" />
            </div>
          )}
        </div>

        {/* Search Suggestions */}
        {showSuggestions && (filters.query || smartSuggestions.length > 0) && (
          <div className="search-suggestions">
            {filters.query && (
              <div className="suggestions-section">
                <h4>Recent Searches</h4>
                {searchHistory
                  .filter(item => item.query.toLowerCase().includes(filters.query.toLowerCase()))
                  .slice(0, 3)
                  .map(item => (
                    <button
                      key={item.id}
                      onClick={() => applySavedSearch(item)}
                      className="suggestion-item recent"
                    >
                      <ClockIcon className="w-4 h-4" />
                      <span>{item.query}</span>
                      <span className="result-count">{item.resultCount} results</span>
                    </button>
                  ))}
              </div>
            )}
            
            {!filters.query && smartSuggestions.length > 0 && (
              <div className="suggestions-section">
                <h4>Suggestions</h4>
                {smartSuggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="suggestion-item smart"
                  >
                    <LightbulbIcon className="w-4 h-4" />
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`filter-toggle-btn ${showFilters ? 'active' : ''}`}
        >
          <FilterIcon className="w-4 h-4" />
          <span>Filters</span>
          {getActiveFilterCount() > 0 && (
            <span className="filter-count">{getActiveFilterCount()}</span>
          )}
        </button>
      </div>

      {/* Quick Filters */}
      <div className="quick-filters">
        <button onClick={() => handleQuickFilter('today')} className="quick-filter">
          Today
        </button>
        <button onClick={() => handleQuickFilter('thisWeek')} className="quick-filter">
          This Week
        </button>
        <button onClick={() => handleQuickFilter('onlineMeetings')} className="quick-filter">
          Online Meetings
        </button>
        <button onClick={() => handleQuickFilter('longMeetings')} className="quick-filter">
          Long Meetings
        </button>
        <button onClick={() => handleQuickFilter('morningEvents')} className="quick-filter">
          Morning Events
        </button>
      </div>

      {/* Search Results Summary */}
      {(filters.query || getActiveFilterCount() > 0) && (
        <div className="search-results-summary">
          <div className="results-info">
            <span className="results-count">
              {searchResults.filteredCount} of {searchResults.totalCount} events
            </span>
            <span className="search-time">
              ({searchResults.searchTime.toFixed(1)}ms)
            </span>
          </div>
          
          {getActiveFilterCount() > 0 && (
            <button onClick={clearFilters} className="clear-filters-btn">
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Advanced Filters Panel */}
      {showFilters && (
        <FilterPanel
          isOpen={showFilters}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  )

  function getActiveFilterCount(): number {
    let count = 0
    
    if (filters.dateRange.start || filters.dateRange.end) count++
    if (filters.providers.length > 0) count++
    if (filters.accounts.length > 0) count++
    if (filters.hasOnlineMeeting !== null) count++
    if (filters.meetingProvider && filters.meetingProvider.length > 0) count++
    if (!Object.values(filters.timeOfDay).every(v => v)) count++
    if (filters.duration.min !== null || filters.duration.max !== null) count++
    if (filters.attendees.hasAttendees !== null) count++
    if (filters.location.hasLocation !== null || filters.location.isOnline !== null) count++
    
    return count
  }
}

// Advanced Filter Panel
const FilterPanel: React.FC<FilterPanelProps> = ({ isOpen, onClose }) => {
  const { filters, updateFilters, searchResults } = useEventSearch()
  
  if (!isOpen) return null

  return (
    <div className="filter-panel">
      <div className="filter-panel-header">
        <h3>Advanced Filters</h3>
        <button onClick={onClose} className="close-btn">
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="filter-panel-content">
        {/* Date Range Filter */}
        <div className="filter-group">
          <label className="filter-label">Date Range</label>
          <div className="date-range-inputs">
            <input
              type="date"
              value={filters.dateRange.start?.toISOString().split('T')[0] || ''}
              onChange={(e) => updateFilters({
                dateRange: {
                  ...filters.dateRange,
                  start: e.target.value ? new Date(e.target.value) : null
                }
              })}
              className="date-input"
            />
            <span>to</span>
            <input
              type="date"
              value={filters.dateRange.end?.toISOString().split('T')[0] || ''}
              onChange={(e) => updateFilters({
                dateRange: {
                  ...filters.dateRange,
                  end: e.target.value ? new Date(e.target.value) : null
                }
              })}
              className="date-input"
            />
          </div>
        </div>

        {/* Provider Filter */}
        <div className="filter-group">
          <label className="filter-label">Providers</label>
          <div className="checkbox-group">
            {searchResults.facets.providers.map(({ name, count }) => (
              <label key={name} className="checkbox-item">
                <input
                  type="checkbox"
                  checked={filters.providers.includes(name as any)}
                  onChange={(e) => {
                    const providers = e.target.checked
                      ? [...filters.providers, name as any]
                      : filters.providers.filter(p => p !== name)
                    updateFilters({ providers })
                  }}
                />
                <span className="provider-name">{name}</span>
                <span className="count">({count})</span>
              </label>
            ))}
          </div>
        </div>

        {/* Accounts Filter */}
        <div className="filter-group">
          <label className="filter-label">Accounts</label>
          <div className="checkbox-group">
            {searchResults.facets.accounts.map(({ id, name, count }) => (
              <label key={id} className="checkbox-item">
                <input
                  type="checkbox"
                  checked={filters.accounts.includes(id)}
                  onChange={(e) => {
                    const accounts = e.target.checked
                      ? [...filters.accounts, id]
                      : filters.accounts.filter(a => a !== id)
                    updateFilters({ accounts })
                  }}
                />
                <span className="account-name">{name}</span>
                <span className="count">({count})</span>
              </label>
            ))}
          </div>
        </div>

        {/* Time of Day Filter */}
        <div className="filter-group">
          <label className="filter-label">Time of Day</label>
          <div className="checkbox-group">
            {Object.entries(filters.timeOfDay).map(([period, enabled]) => {
              const facet = searchResults.facets.timeOfDay.find(f => f.period === period)
              return (
                <label key={period} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => updateFilters({
                      timeOfDay: {
                        ...filters.timeOfDay,
                        [period]: e.target.checked
                      }
                    })}
                  />
                  <span className="period-name">{period}</span>
                  <span className="count">({facet?.count || 0})</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Duration Filter */}
        <div className="filter-group">
          <label className="filter-label">Duration (minutes)</label>
          <div className="range-inputs">
            <input
              type="number"
              placeholder="Min"
              value={filters.duration.min || ''}
              onChange={(e) => updateFilters({
                duration: {
                  ...filters.duration,
                  min: e.target.value ? parseInt(e.target.value) : null
                }
              })}
              className="range-input"
            />
            <span>to</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.duration.max || ''}
              onChange={(e) => updateFilters({
                duration: {
                  ...filters.duration,
                  max: e.target.value ? parseInt(e.target.value) : null
                }
              })}
              className="range-input"
            />
          </div>
        </div>

        {/* Meeting Type Filter */}
        <div className="filter-group">
          <label className="filter-label">Meeting Type</label>
          <div className="radio-group">
            <label className="radio-item">
              <input
                type="radio"
                name="hasOnlineMeeting"
                checked={filters.hasOnlineMeeting === null}
                onChange={() => updateFilters({ hasOnlineMeeting: null })}
              />
              <span>All meetings</span>
            </label>
            <label className="radio-item">
              <input
                type="radio"
                name="hasOnlineMeeting"
                checked={filters.hasOnlineMeeting === true}
                onChange={() => updateFilters({ hasOnlineMeeting: true })}
              />
              <span>Online meetings only</span>
            </label>
            <label className="radio-item">
              <input
                type="radio"
                name="hasOnlineMeeting"
                checked={filters.hasOnlineMeeting === false}
                onChange={() => updateFilters({ hasOnlineMeeting: false })}
              />
              <span>In-person meetings only</span>
            </label>
          </div>
        </div>

        {/* Attendees Filter */}
        <div className="filter-group">
          <label className="filter-label">Attendees</label>
          <div className="attendees-filters">
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={filters.attendees.hasAttendees === true}
                onChange={(e) => updateFilters({
                  attendees: {
                    ...filters.attendees,
                    hasAttendees: e.target.checked ? true : null
                  }
                })}
              />
              <span>Has attendees</span>
            </label>
            
            <div className="range-inputs">
              <input
                type="number"
                placeholder="Min attendees"
                value={filters.attendees.minAttendees || ''}
                onChange={(e) => updateFilters({
                  attendees: {
                    ...filters.attendees,
                    minAttendees: e.target.value ? parseInt(e.target.value) : null
                  }
                })}
                className="range-input"
              />
              <input
                type="number"
                placeholder="Max attendees"
                value={filters.attendees.maxAttendees || ''}
                onChange={(e) => updateFilters({
                  attendees: {
                    ...filters.attendees,
                    maxAttendees: e.target.value ? parseInt(e.target.value) : null
                  }
                })}
                className="range-input"
              />
            </div>
          </div>
        </div>

        {/* Location Filter */}
        <div className="filter-group">
          <label className="filter-label">Location</label>
          <div className="checkbox-group">
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={filters.location.hasLocation === true}
                onChange={(e) => updateFilters({
                  location: {
                    ...filters.location,
                    hasLocation: e.target.checked ? true : null
                  }
                })}
              />
              <span>Has location</span>
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={filters.location.isOnline === true}
                onChange={(e) => updateFilters({
                  location: {
                    ...filters.location,
                    isOnline: e.target.checked ? true : null
                  }
                })}
              />
              <span>Online location</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

// Loading Spinner Component
const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => (
  <div className={`loading-spinner ${size}`}>
    <div className="spinner"></div>
  </div>
)

// Icon Components
const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

const FilterIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z" />
  </svg>
)

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const ClockIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const LightbulbIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
)

export default SearchAndFilter
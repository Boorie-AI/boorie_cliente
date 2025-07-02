// Keyboard Shortcuts Help Component - Display available keyboard shortcuts

import React from 'react'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import '../../styles/components.css';
import '../../styles/modals.css';
import '../../styles/recurrence.css';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean
  onClose: () => void
}

interface ShortcutCategoryProps {
  title: string
  shortcuts: Array<{
    keys: string[]
    description: string
  }>
  formatShortcut: (keys: string[]) => string
}

export const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({
  isOpen,
  onClose
}) => {
  const { getShortcutsByCategory, formatShortcut } = useKeyboardShortcuts({})

  if (!isOpen) return null

  const shortcuts = getShortcutsByCategory()

  const categoryTitles = {
    navigation: 'Navigation',
    view: 'View Controls',
    event: 'Event Management',
    general: 'General Actions'
  }

  const categoryOrder = ['navigation', 'view', 'event', 'general']

  return (
    <div className="shortcuts-modal-overlay">
      <div className="shortcuts-modal">
        <div className="modal-header">
          <h2>Keyboard Shortcuts</h2>
          <button onClick={onClose} className="close-btn">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-content">
          <div className="shortcuts-intro">
            <p>Use these keyboard shortcuts to navigate and control your calendar more efficiently.</p>
            <div className="platform-note">
              <InfoIcon className="w-4 h-4" />
              <span>On Mac, use Cmd instead of Ctrl</span>
            </div>
          </div>

          <div className="shortcuts-grid">
            {categoryOrder.map(category => {
              const categoryShortcuts = shortcuts[category]
              if (!categoryShortcuts || categoryShortcuts.length === 0) return null

              return (
                <ShortcutCategory
                  key={category}
                  title={categoryTitles[category as keyof typeof categoryTitles]}
                  shortcuts={categoryShortcuts.map(s => ({
                    keys: s.keys,
                    description: s.description
                  }))}
                  formatShortcut={formatShortcut}
                />
              )
            })}
          </div>

          <div className="shortcuts-tips">
            <h3>Tips</h3>
            <ul>
              <li>Shortcuts work when the calendar is focused (not when typing in input fields)</li>
              <li>Use <kbd>?</kbd> to quickly open this help dialog</li>
              <li>Press <kbd>Esc</kbd> to close dialogs and cancel actions</li>
              <li>Arrow keys work differently depending on the current view</li>
              <li>Hold <kbd>Shift</kbd> with arrow keys for month navigation</li>
            </ul>
          </div>

          <div className="shortcuts-footer">
            <p>
              Missing a shortcut? <a href="#" className="feedback-link">Send feedback</a>
            </p>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="btn btn-primary">
            Got it!
          </button>
        </div>
      </div>
    </div>
  )
}

// Shortcut Category Component
const ShortcutCategory: React.FC<ShortcutCategoryProps> = ({
  title,
  shortcuts,
  formatShortcut
}) => (
  <div className="shortcut-category">
    <h3 className="category-title">{title}</h3>
    <div className="shortcuts-list">
      {shortcuts.map((shortcut, index) => (
        <div key={index} className="shortcut-item">
          <div className="shortcut-keys">
            {shortcut.keys.map((key, keyIndex) => (
              <React.Fragment key={keyIndex}>
                {keyIndex > 0 && <span className="key-separator">+</span>}
                <kbd className="shortcut-key">{formatKey(key)}</kbd>
              </React.Fragment>
            ))}
          </div>
          <div className="shortcut-description">{shortcut.description}</div>
        </div>
      ))}
    </div>
  </div>
)

// Enhanced Calendar Component with Keyboard Shortcuts
export const CalendarWithShortcuts: React.FC<{
  currentView: 'month' | 'week' | 'day'
  currentDate: Date
  selectedEvent: UnifiedCalendarEvent | null
  onViewChange: (view: 'month' | 'week' | 'day') => void
  onDateChange: (date: Date) => void
  onEventCreate: () => void
  onEventEdit: (event: UnifiedCalendarEvent) => void
  onEventDelete: (event: UnifiedCalendarEvent) => void
  onEventSelect: (event: UnifiedCalendarEvent | null) => void
  onSearchOpen: () => void
  onExportOpen: () => void
  onSidebarToggle: () => void
  onRefresh: () => void
  events: UnifiedCalendarEvent[]
}> = ({
  currentView,
  currentDate,
  selectedEvent,
  onViewChange,
  onDateChange,
  onEventCreate,
  onEventEdit,
  onEventDelete,
  onEventSelect,
  onSearchOpen,
  onExportOpen,
  onSidebarToggle,
  onRefresh,
  events
}) => {
  const [showShortcutsHelp, setShowShortcutsHelp] = React.useState(false)

  // Calculate navigation functions
  const goToToday = React.useCallback(() => {
    onDateChange(new Date())
  }, [onDateChange])

  const goToPrevious = React.useCallback(() => {
    const newDate = new Date(currentDate)
    switch (currentView) {
      case 'day':
        newDate.setDate(newDate.getDate() - 1)
        break
      case 'week':
        newDate.setDate(newDate.getDate() - 7)
        break
      case 'month':
        newDate.setMonth(newDate.getMonth() - 1)
        break
    }
    onDateChange(newDate)
  }, [currentDate, currentView, onDateChange])

  const goToNext = React.useCallback(() => {
    const newDate = new Date(currentDate)
    switch (currentView) {
      case 'day':
        newDate.setDate(newDate.getDate() + 1)
        break
      case 'week':
        newDate.setDate(newDate.getDate() + 7)
        break
      case 'month':
        newDate.setMonth(newDate.getMonth() + 1)
        break
    }
    onDateChange(newDate)
  }, [currentDate, currentView, onDateChange])

  const goToPreviousMonth = React.useCallback(() => {
    const newDate = new Date(currentDate)
    newDate.setMonth(newDate.getMonth() - 1)
    onDateChange(newDate)
  }, [currentDate, onDateChange])

  const goToNextMonth = React.useCallback(() => {
    const newDate = new Date(currentDate)
    newDate.setMonth(newDate.getMonth() + 1)
    onDateChange(newDate)
  }, [currentDate, onDateChange])

  const goToPreviousWeek = React.useCallback(() => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() - 7)
    onDateChange(newDate)
  }, [currentDate, onDateChange])

  const goToNextWeek = React.useCallback(() => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + 7)
    onDateChange(newDate)
  }, [currentDate, onDateChange])

  const goToPreviousDay = React.useCallback(() => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() - 1)
    onDateChange(newDate)
  }, [currentDate, onDateChange])

  const goToNextDay = React.useCallback(() => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + 1)
    onDateChange(newDate)
  }, [currentDate, onDateChange])

  // Event selection functions
  const selectNextEvent = React.useCallback(() => {
    if (!events.length) return

    const currentIndex = selectedEvent ? events.findIndex(e => e.id === selectedEvent.id) : -1
    const nextIndex = (currentIndex + 1) % events.length
    onEventSelect(events[nextIndex])
  }, [events, selectedEvent, onEventSelect])

  const selectPreviousEvent = React.useCallback(() => {
    if (!events.length) return

    const currentIndex = selectedEvent ? events.findIndex(e => e.id === selectedEvent.id) : -1
    const prevIndex = currentIndex <= 0 ? events.length - 1 : currentIndex - 1
    onEventSelect(events[prevIndex])
  }, [events, selectedEvent, onEventSelect])

  const editSelectedEvent = React.useCallback(() => {
    if (selectedEvent) {
      onEventEdit(selectedEvent)
    }
  }, [selectedEvent, onEventEdit])

  const deleteSelectedEvent = React.useCallback(() => {
    if (selectedEvent) {
      onEventDelete(selectedEvent)
    }
  }, [selectedEvent, onEventDelete])

  // Set up keyboard shortcuts
  useKeyboardShortcuts({
    goToToday,
    goToPrevious,
    goToNext,
    goToPreviousMonth,
    goToNextMonth,
    goToPreviousWeek,
    goToNextWeek,
    goToPreviousDay,
    goToNextDay,
    switchToMonth: () => onViewChange('month'),
    switchToWeek: () => onViewChange('week'),
    switchToDay: () => onViewChange('day'),
    createEvent: onEventCreate,
    editSelectedEvent,
    deleteSelectedEvent,
    selectNextEvent,
    selectPreviousEvent,
    openSearch: onSearchOpen,
    openExport: onExportOpen,
    toggleSidebar: onSidebarToggle,
    showShortcuts: () => setShowShortcutsHelp(true),
    refresh: onRefresh
  })

  return (
    <>
      {/* The actual calendar component would be rendered here */}
      <div className="calendar-with-shortcuts">
        {/* Calendar content */}
      </div>

      {/* Keyboard shortcuts help modal */}
      <KeyboardShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />

      {/* Floating shortcuts hint */}
      <div className="shortcuts-hint">
        <button
          onClick={() => setShowShortcutsHelp(true)}
          className="shortcuts-hint-btn"
          title="Keyboard shortcuts (Press ? to open)"
        >
          <KeyboardIcon className="w-4 h-4" />
          <span>?</span>
        </button>
      </div>
    </>
  )
}

// Utility function to format individual keys
function formatKey(key: string): string {
  const keyMap: Record<string, string> = {
    'Control': 'Ctrl',
    'Meta': '⌘',
    'Alt': 'Alt',
    'Shift': '⇧',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Enter': '⏎',
    'Backspace': '⌫',
    'Delete': 'Del',
    'Escape': 'Esc',
    'Tab': '⇥',
    ' ': 'Space',
    '/': '/',
    '?': '?'
  }

  return keyMap[key] || key.toUpperCase()
}

// Icon Components
const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const InfoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const KeyboardIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
)

export default KeyboardShortcutsHelp
// Keyboard Shortcuts Hook - Enhanced keyboard navigation for calendar

import React, { useEffect, useCallback, useRef } from 'react'

export interface KeyboardShortcut {
  keys: string[]
  description: string
  action: () => void
  category: 'navigation' | 'view' | 'event' | 'general'
  enabled?: boolean
  preventDefault?: boolean
}

export interface ShortcutHandlers {
  // Navigation
  goToToday: () => void
  goToPrevious: () => void
  goToNext: () => void
  goToPreviousMonth: () => void
  goToNextMonth: () => void
  goToPreviousWeek: () => void
  goToNextWeek: () => void
  goToPreviousDay: () => void
  goToNextDay: () => void
  
  // View switching
  switchToMonth: () => void
  switchToWeek: () => void
  switchToDay: () => void
  
  // Event actions
  createEvent: () => void
  editSelectedEvent: () => void
  deleteSelectedEvent: () => void
  selectNextEvent: () => void
  selectPreviousEvent: () => void
  
  // General actions
  openSearch: () => void
  openExport: () => void
  toggleSidebar: () => void
  showShortcuts: () => void
  refresh: () => void
}

export const useKeyboardShortcuts = (handlers: Partial<ShortcutHandlers>) => {
  const keyStateRef = useRef<Set<string>>(new Set())
  const isActiveRef = useRef(true)

  // Define all available shortcuts
  const shortcuts: KeyboardShortcut[] = [
    // Navigation shortcuts
    {
      keys: ['t'],
      description: 'Go to today',
      action: handlers.goToToday || (() => {}),
      category: 'navigation'
    },
    {
      keys: ['ArrowLeft'],
      description: 'Previous period',
      action: handlers.goToPrevious || (() => {}),
      category: 'navigation'
    },
    {
      keys: ['ArrowRight'],
      description: 'Next period',
      action: handlers.goToNext || (() => {}),
      category: 'navigation'
    },
    {
      keys: ['j'],
      description: 'Previous week',
      action: handlers.goToPreviousWeek || (() => {}),
      category: 'navigation'
    },
    {
      keys: ['k'],
      description: 'Next week',
      action: handlers.goToNextWeek || (() => {}),
      category: 'navigation'
    },
    {
      keys: ['h'],
      description: 'Previous day',
      action: handlers.goToPreviousDay || (() => {}),
      category: 'navigation'
    },
    {
      keys: ['l'],
      description: 'Next day',
      action: handlers.goToNextDay || (() => {}),
      category: 'navigation'
    },
    {
      keys: ['Shift', 'ArrowLeft'],
      description: 'Previous month',
      action: handlers.goToPreviousMonth || (() => {}),
      category: 'navigation'
    },
    {
      keys: ['Shift', 'ArrowRight'],
      description: 'Next month',
      action: handlers.goToNextMonth || (() => {}),
      category: 'navigation'
    },

    // View switching shortcuts
    {
      keys: ['m'],
      description: 'Switch to month view',
      action: handlers.switchToMonth || (() => {}),
      category: 'view'
    },
    {
      keys: ['w'],
      description: 'Switch to week view',
      action: handlers.switchToWeek || (() => {}),
      category: 'view'
    },
    {
      keys: ['d'],
      description: 'Switch to day view',
      action: handlers.switchToDay || (() => {}),
      category: 'view'
    },
    {
      keys: ['1'],
      description: 'Month view',
      action: handlers.switchToMonth || (() => {}),
      category: 'view'
    },
    {
      keys: ['2'],
      description: 'Week view',
      action: handlers.switchToWeek || (() => {}),
      category: 'view'
    },
    {
      keys: ['3'],
      description: 'Day view',
      action: handlers.switchToDay || (() => {}),
      category: 'view'
    },

    // Event shortcuts
    {
      keys: ['n'],
      description: 'Create new event',
      action: handlers.createEvent || (() => {}),
      category: 'event'
    },
    {
      keys: ['c'],
      description: 'Create new event',
      action: handlers.createEvent || (() => {}),
      category: 'event'
    },
    {
      keys: ['Enter'],
      description: 'Edit selected event',
      action: handlers.editSelectedEvent || (() => {}),
      category: 'event'
    },
    {
      keys: ['e'],
      description: 'Edit selected event',
      action: handlers.editSelectedEvent || (() => {}),
      category: 'event'
    },
    {
      keys: ['Delete'],
      description: 'Delete selected event',
      action: handlers.deleteSelectedEvent || (() => {}),
      category: 'event'
    },
    {
      keys: ['Backspace'],
      description: 'Delete selected event',
      action: handlers.deleteSelectedEvent || (() => {}),
      category: 'event'
    },
    {
      keys: ['ArrowUp'],
      description: 'Select previous event',
      action: handlers.selectPreviousEvent || (() => {}),
      category: 'event',
      preventDefault: true
    },
    {
      keys: ['ArrowDown'],
      description: 'Select next event',
      action: handlers.selectNextEvent || (() => {}),
      category: 'event',
      preventDefault: true
    },

    // General shortcuts
    {
      keys: ['/', 'Control', 'f'],
      description: 'Open search',
      action: handlers.openSearch || (() => {}),
      category: 'general'
    },
    {
      keys: ['Control', 'e'],
      description: 'Export calendar',
      action: handlers.openExport || (() => {}),
      category: 'general'
    },
    {
      keys: ['s'],
      description: 'Toggle sidebar',
      action: handlers.toggleSidebar || (() => {}),
      category: 'general'
    },
    {
      keys: ['?'],
      description: 'Show keyboard shortcuts',
      action: handlers.showShortcuts || (() => {}),
      category: 'general'
    },
    {
      keys: ['r'],
      description: 'Refresh calendar',
      action: handlers.refresh || (() => {}),
      category: 'general'
    },
    {
      keys: ['F5'],
      description: 'Refresh calendar',
      action: handlers.refresh || (() => {}),
      category: 'general',
      preventDefault: true
    }
  ]

  // Check if a key combination matches
  const matchesShortcut = useCallback((shortcut: KeyboardShortcut, pressedKeys: Set<string>): boolean => {
    if (shortcut.keys.length !== pressedKeys.size) {
      return false
    }

    return shortcut.keys.every(key => {
      // Normalize key names
      const normalizedKey = normalizeKey(key)
      return Array.from(pressedKeys).some(pressedKey => normalizeKey(pressedKey) === normalizedKey)
    })
  }, [])

  // Handle key down events
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isActiveRef.current) return

    // Don't handle shortcuts when user is typing in inputs
    if (isTypingContext(event.target as Element)) {
      return
    }

    const key = event.key
    keyStateRef.current.add(key)

    // Find matching shortcut
    const matchingShortcut = shortcuts.find(shortcut => 
      matchesShortcut(shortcut, keyStateRef.current) && shortcut.enabled !== false
    )

    if (matchingShortcut) {
      if (matchingShortcut.preventDefault !== false) {
        event.preventDefault()
      }
      event.stopPropagation()
      
      // Execute the action
      try {
        matchingShortcut.action()
      } catch (error) {
        console.error('Error executing keyboard shortcut:', error)
      }
    }
  }, [shortcuts, matchesShortcut])

  // Handle key up events
  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    keyStateRef.current.delete(event.key)
  }, [])

  // Clear all keys on window blur
  const handleWindowBlur = useCallback(() => {
    keyStateRef.current.clear()
  }, [])

  // Set up event listeners
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [handleKeyDown, handleKeyUp, handleWindowBlur])

  // Enable/disable shortcuts
  const setEnabled = useCallback((enabled: boolean) => {
    isActiveRef.current = enabled
  }, [])

  // Get shortcuts by category
  const getShortcutsByCategory = useCallback(() => {
    const categories = shortcuts.reduce((acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = []
      }
      acc[shortcut.category].push(shortcut)
      return acc
    }, {} as Record<string, KeyboardShortcut[]>)

    return categories
  }, [shortcuts])

  // Get formatted shortcut display
  const formatShortcut = useCallback((keys: string[]): string => {
    return keys
      .map(key => {
        // Map special keys to display names
        const keyMap: Record<string, string> = {
          'Control': 'Ctrl',
          'Meta': 'Cmd',
          'Alt': 'Alt',
          'Shift': 'Shift',
          'ArrowUp': '↑',
          'ArrowDown': '↓',
          'ArrowLeft': '←',
          'ArrowRight': '→',
          'Enter': '⏎',
          'Backspace': '⌫',
          'Delete': 'Del',
          'Escape': 'Esc',
          'Tab': '⇥',
          ' ': 'Space'
        }
        return keyMap[key] || key.toUpperCase()
      })
      .join('+')
  }, [])

  return {
    shortcuts,
    setEnabled,
    getShortcutsByCategory,
    formatShortcut,
    isEnabled: isActiveRef.current
  }
}

// Helper functions
function normalizeKey(key: string): string {
  // Normalize key names for comparison
  const keyMap: Record<string, string> = {
    'Ctrl': 'Control',
    'Cmd': 'Meta',
    'Left': 'ArrowLeft',
    'Right': 'ArrowRight',
    'Up': 'ArrowUp',
    'Down': 'ArrowDown',
    'Esc': 'Escape',
    'Del': 'Delete'
  }

  return keyMap[key] || key
}

function isTypingContext(element: Element): boolean {
  if (!element) return false

  const tagName = element.tagName.toLowerCase()
  const type = (element as HTMLInputElement).type?.toLowerCase()
  const contentEditable = (element as HTMLElement).contentEditable

  // Check if element is an input field
  const isInput = tagName === 'input' && (!type || [
    'text', 'email', 'password', 'search', 'tel', 'url', 'number'
  ].includes(type))

  const isTextarea = tagName === 'textarea'
  const isContentEditable = contentEditable === 'true'
  const isInEditor = element.closest('[contenteditable="true"]') !== null

  return isInput || isTextarea || isContentEditable || isInEditor
}

// Hook for displaying keyboard shortcuts help
export const useShortcutsHelp = () => {
  const [isVisible, setIsVisible] = React.useState(false)

  const show = useCallback(() => setIsVisible(true), [])
  const hide = useCallback(() => setIsVisible(false), [])
  const toggle = useCallback(() => setIsVisible(prev => !prev), [])

  return {
    isVisible,
    show,
    hide,
    toggle
  }
}

export default useKeyboardShortcuts
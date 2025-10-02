import { useState, useEffect } from 'react'
import { Minus, X, Maximize2, Minimize2 } from 'lucide-react'
import boorieIcon from '@/assets/boorie_icon_light.png'

export function CustomTopBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isHovered, setIsHovered] = useState<string | null>(null)

  useEffect(() => {
    // Check if window is maximized on mount
    const checkWindowState = async () => {
      try {
        const maximized = await window.electronAPI?.isMaximized?.()
        setIsMaximized(maximized || false)
      } catch (error) {
        console.error('Failed to check window state:', error)
      }
    }
    
    checkWindowState()

    // Listen for window state changes
    const handleWindowStateChange = (event: CustomEvent) => {
      setIsMaximized(event.detail.isMaximized)
    }

    window.addEventListener('window-state-changed', handleWindowStateChange as EventListener)
    
    return () => {
      window.removeEventListener('window-state-changed', handleWindowStateChange as EventListener)
    }
  }, [])

  const handleMinimize = async () => {
    try {
      console.log('Minimize button clicked')
      if (window.electronAPI && window.electronAPI.minimizeWindow) {
        await window.electronAPI.minimizeWindow()
        console.log('Window minimized successfully')
      } else {
        console.error('electronAPI.minimizeWindow not available')
      }
    } catch (error) {
      console.error('Failed to minimize window:', error)
    }
  }

  const handleMaximize = async () => {
    try {
      console.log('Maximize button clicked')
      if (window.electronAPI && window.electronAPI.maximizeWindow) {
        await window.electronAPI.maximizeWindow()
        console.log('Window maximize toggled successfully')
      } else {
        console.error('electronAPI.maximizeWindow not available')
      }
    } catch (error) {
      console.error('Failed to maximize window:', error)
    }
  }

  const handleClose = async () => {
    try {
      console.log('Close button clicked')
      if (window.electronAPI && window.electronAPI.closeWindow) {
        await window.electronAPI.closeWindow()
        console.log('Window close requested successfully')
      } else {
        console.error('electronAPI.closeWindow not available')
      }
    } catch (error) {
      console.error('Failed to close window:', error)
    }
  }

  const handleDoubleClick = () => {
    handleMaximize()
  }

  return (
    <div 
      className="flex items-center justify-between h-8 bg-gray-50 dark:bg-background  dark:border-gray-700 select-none w-full"
      style={{ 
        WebkitAppRegion: 'drag'
      } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
    >
      {/* Left side - App icon and title */}
      <div className="flex items-center px-3 space-x-2">
        <img 
          src={boorieIcon} 
          alt="Boorie" 
          className="w-4 h-4 object-contain"
        />

      </div>

      {/* Right side - Window controls */}
      <div 
        className="flex"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Minimize button */}
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            console.log('Minimize button click event fired')
            handleMinimize()
          }}
          onMouseEnter={() => setIsHovered('minimize')}
          onMouseLeave={() => setIsHovered(null)}
          className={`
            w-12 h-8 flex items-center justify-center transition-colors duration-150
            ${isHovered === 'minimize' 
              ? 'bg-gray-200 dark:bg-gray-700' 
              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
            }
          `}
          title="Minimize"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Minus className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>

        {/* Maximize/Restore button */}
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            console.log('Maximize button click event fired')
            handleMaximize()
          }}
          onMouseEnter={() => setIsHovered('maximize')}
          onMouseLeave={() => setIsHovered(null)}
          className={`
            w-12 h-8 flex items-center justify-center transition-colors duration-150
            ${isHovered === 'maximize' 
              ? 'bg-gray-200 dark:bg-gray-700' 
              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
            }
          `}
          title={isMaximized ? "Restore" : "Maximize"}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {isMaximized ? (
            <Minimize2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          ) : (
            <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          )}
        </button>

        {/* Close button */}
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            console.log('Close button click event fired')
            handleClose()
          }}
          onMouseEnter={() => setIsHovered('close')}
          onMouseLeave={() => setIsHovered(null)}
          className={`
            w-12 h-8 flex items-center justify-center transition-colors duration-150
            ${isHovered === 'close'
              ? 'bg-red-500 text-white'
              : 'hover:bg-red-500 hover:text-white'
            }
          `}
          title="Close"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
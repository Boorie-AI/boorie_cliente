import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChatLayout } from '@/components/chat/ChatLayout'
import { CustomTopBar } from '@/components/CustomTopBar'
import { ClarityDebugPanel } from '@/components/ClarityDebugPanel'
import { GlobalErrorTracker } from '@/components/GlobalErrorTracker'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/utils/cn'
import './i18n' // Initialize i18n

function App() {
  const { t } = useTranslation()
  const { initializeApp, isInitialized, theme } = useAppStore()

  useEffect(() => {
    initializeApp()
  }, [initializeApp])

  useEffect(() => {
    // Apply theme to document
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  if (!isInitialized) {
    return (
      <div className={cn(
        "flex items-center justify-center h-screen",
        "bg-gradient-to-br from-background via-background to-muted",
        "text-foreground"
      )}>
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto"></div>
            <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-primary/60 rounded-full animate-spin mx-auto animation-delay-75"></div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{t('app.initializing')}</h2>
            <p className="text-muted-foreground">{t('app.initializingDesc')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <GlobalErrorTracker />
      <CustomTopBar/>
      <div className="flex-1 min-h-0">
        <ChatLayout />
      </div>
      <ClarityDebugPanel />
    </div>
  )
}

export default App
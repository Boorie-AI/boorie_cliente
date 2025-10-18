import { useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useClarity } from '@/components/ClarityProvider'
import { Sidebar } from './Sidebar'
import { ChatArea } from './ChatArea'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { RAGPanel } from '@/components/rag/RAGPanel'
import { HydraulicProjectsPanel } from '@/components/hydraulic/HydraulicProjectsPanel'
import { HydraulicCalculator } from '@/components/hydraulic/HydraulicCalculator'
import { WNTRViewer } from '@/components/hydraulic/WNTRViewer'
import { cn } from '@/utils/cn'

export function ChatLayout() {
  const { currentView, sidebarCollapsed } = useAppStore()
  const { trackEvent, isReady } = useClarity()

  // Track view changes
  useEffect(() => {
    if (isReady) {
      trackEvent('view_changed', {
        view: currentView,
        sidebar_collapsed: sidebarCollapsed
      })
    }
  }, [currentView, sidebarCollapsed, trackEvent, isReady])

  const renderMainContent = () => {
    switch (currentView) {
      case 'chat':
        return <ChatArea />
      case 'settings':
        return <SettingsPanel />
      case 'rag':
        return <RAGPanel />
      case 'projects':
        return <HydraulicProjectsPanel />
      case 'calculator':
        return <HydraulicCalculator />
      case 'wntr':
        return <WNTRViewer />
      default:
        return <ChatArea />
    }
  }

  return (
    <div className="flex h-full w-full bg-background">
      <Sidebar />
      <div
        className={cn(
          "flex-1 flex flex-col transition-all duration-300 ease-in-out h-full min-h-0",
          "border-l border-border/50",
          sidebarCollapsed ? "ml-16" : "ml-64"
        )}
      >
        {renderMainContent()}
      </div>
    </div>
  )
}
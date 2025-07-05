import { useAppStore } from '@/stores/appStore'
import { Sidebar } from './Sidebar'
import { ChatArea } from './ChatArea'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { RAGPanel } from '@/components/rag/RAGPanel'
import { cn } from '@/utils/cn'

export function ChatLayout() {
  const { currentView, sidebarCollapsed } = useAppStore()

  const renderMainContent = () => {
    switch (currentView) {
      case 'chat':
        return <ChatArea />
      case 'settings':
        return <SettingsPanel />
      case 'rag':
        return <RAGPanel />
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